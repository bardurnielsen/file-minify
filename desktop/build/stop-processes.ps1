# Stops FileMinify for its installer and uninstaller (installer.nsh), both
# 2.x (FileMinify.exe) and 1.0.x (node.exe, its Ghostscript and its Edge
# window). Windows PowerShell 5.1 reads it in from the installer's temp
# folder as a script block, which no execution policy (not even one set by
# Group Policy) applies to. What to stop comes in the environment, so a quote in a path
# (C:\Users\O'Brien) needs no escaping:
#   FMSETUP_EXE    programs, by exact path ('|' between several)
#   FMSETUP_UNDER  a folder, ending in '\': every program run from inside it
#   FMSETUP_EDGE   1: also 1.0.x's window, an Edge with the FileMinify\window
#                  profile
#   FMSETUP_WAIT   seconds to let them exit by themselves first
#   FMSETUP_SPARE  a process id never to stop (the installer itself)
#   FMSETUP_CHECK  1: stop nothing, only say whether any of them runs
# Also stopped: the tools they started (FFmpeg, ImageMagick, LibreOffice),
# found down the parent-process chain. Only those, never the whole tree: a
# setup started by 1.0.3's updater, and this script with it, is itself a
# child of the old node.exe, and electron-updater's setup a child of the app.
# Exit code: 0 once none of them runs, 2 if one would not stop (1 if the
# script itself failed, e.g. no WMI). With FMSETUP_CHECK: 0 if one runs,
# otherwise not 0.
$ErrorActionPreference = 'Stop'

$exact = @("$env:FMSETUP_EXE" -split '\|' | Where-Object { $_ })
$under = "$env:FMSETUP_UNDER"
$spare = @($PID)
if ($env:FMSETUP_SPARE) { $spare += [int]$env:FMSETUP_SPARE }
$wait = 0
if ($env:FMSETUP_WAIT) { $wait = [int]$env:FMSETUP_WAIT }
$tools = @('ffmpeg.exe', 'ffprobe.exe', 'magick.exe', 'soffice.exe', 'soffice.com', 'soffice.bin')
# launcher.js started Edge with --user-data-dir=<data>\FileMinify\window,
# quoted when the path has a space; Edge's own child processes repeat it.
$window = '--user-data-dir=.*\\FileMinify\\window("|\s|$)'

function Test-Mine($process) {
  $path = $process.ExecutablePath
  if (-not $path -or $spare -contains $process.ProcessId) { return $false }
  foreach ($e in $exact) {
    if ([string]::Equals($path, $e, [StringComparison]::OrdinalIgnoreCase)) { return $true }
  }
  return ($under -and $path.StartsWith($under, [StringComparison]::OrdinalIgnoreCase))
}

# @{ Main = the programs themselves; Extra = their tools and the old window }
function Find-Processes {
  $all = @(Get-CimInstance Win32_Process)
  $main = @($all | Where-Object { Test-Mine $_ })
  $extra = New-Object System.Collections.ArrayList
  $seen = @{}
  $queue = New-Object System.Collections.Queue
  foreach ($p in $main) { $seen[[string]$p.ProcessId] = $true; $queue.Enqueue($p) }
  while ($queue.Count) {
    $parent = $queue.Dequeue()
    foreach ($child in $all) {
      # A child started after its parent: process ids are reused.
      if ($child.ParentProcessId -ne $parent.ProcessId -or $seen[[string]$child.ProcessId] -or
          -not $child.CreationDate -or $child.CreationDate -lt $parent.CreationDate) { continue }
      $seen[[string]$child.ProcessId] = $true
      $queue.Enqueue($child)
      if ($tools -contains $child.Name -and $spare -notcontains $child.ProcessId) { [void]$extra.Add($child) }
    }
  }
  if ($env:FMSETUP_EDGE -eq '1') {
    foreach ($p in $all) {
      if ($p.Name -eq 'msedge.exe' -and $p.CommandLine -match $window) { [void]$extra.Add($p) }
    }
  }
  return @{ Main = $main; Extra = @($extra) }
}

$found = Find-Processes
if ($env:FMSETUP_CHECK -eq '1') {
  if ($found.Main.Count) { exit 0 } else { exit 1 }
}

# An update's app is already quitting (electron-updater's quitAndInstall):
# it shuts its server down and stops its tools itself, given the time.
$until = (Get-Date).AddSeconds($wait)
while ($found.Main.Count -and (Get-Date) -lt $until) {
  Start-Sleep -Milliseconds 500
  $found = Find-Processes
}

for ($try = 0; $try -lt 10; $try++) {
  $left = @($found.Main) + @($found.Extra)
  if (-not $left.Count) { exit 0 }
  foreach ($p in $left) {
    try { Invoke-CimMethod -InputObject $p -MethodName Terminate | Out-Null } catch { }
  }
  Start-Sleep -Milliseconds 500
  $found = Find-Processes
}
if ($found.Main.Count -or $found.Extra.Count) { exit 2 }
exit 0
