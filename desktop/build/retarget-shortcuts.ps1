# 1.0.x's shortcuts start its node.exe, which the 2.0 installer removes
# (installer.nsh, customInstall). The ones setup made are replaced by the new
# app's own, but copies the user made or pinned (the desktop, the Start
# menu's folders, the taskbar) are pointed at the new app instead. Read in
# as a script block, like stop-processes.ps1. From the environment:
#   FMSETUP_OLD   1.0.x's node.exe
#   FMSETUP_NEW   the new FileMinify.exe
#   FMSETUP_LIST  a file to list the changed shortcuts in (UTF-16LE, no BOM,
#                 one per line), for the installer to give them the app's
#                 AppUserModelID: without it a pinned one would stand apart
#                 from the running app on the taskbar
$ErrorActionPreference = 'Stop'
$old = "$env:FMSETUP_OLD"
$new = "$env:FMSETUP_NEW"
if (-not $old -or -not $new) { exit 1 }

$shell = New-Object -ComObject WScript.Shell
$roots = @(
  [Environment]::GetFolderPath('Desktop'),
  [Environment]::GetFolderPath('Programs'),
  # User Pinned\TaskBar and User Pinned\StartMenu
  (Join-Path $env:APPDATA 'Microsoft\Internet Explorer\Quick Launch')
)
$changed = New-Object System.Collections.ArrayList
foreach ($root in $roots) {
  if (-not $root -or -not (Test-Path -LiteralPath $root)) { continue }
  foreach ($file in @(Get-ChildItem -LiteralPath $root -Filter *.lnk -Recurse -Force -ErrorAction SilentlyContinue)) {
    try {
      $lnk = $shell.CreateShortcut($file.FullName)
      if (-not [string]::Equals($lnk.TargetPath, $old, [StringComparison]::OrdinalIgnoreCase)) { continue }
      $lnk.TargetPath = $new
      $lnk.Arguments = ''
      $lnk.WorkingDirectory = Split-Path -Parent $new
      $lnk.IconLocation = "$new,0"
      $lnk.Save()
      [void]$changed.Add($file.FullName)
    } catch { }
  }
}
if ($env:FMSETUP_LIST) {
  [IO.File]::WriteAllLines($env:FMSETUP_LIST, [string[]]$changed, (New-Object System.Text.UnicodeEncoding $false, $false))
}
exit 0
