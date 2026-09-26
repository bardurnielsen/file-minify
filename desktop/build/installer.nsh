; FileMinify's additions to electron-builder's NSIS installer (nsis.include in
; desktop/electron-builder.yml). Nothing here may ask a question: the
; installer runs with /S under winget and CI, and with no arguments when
; 1.0.3's in-app updater starts it. A MessageBox added here needs /SD.

; The 1.0.x (Inno Setup) install's uninstall key. Inno's own uninstaller is
; never run: its [UninstallDelete] removes %LOCALAPPDATA%\FileMinify, and with
; it settings.env and the logs.
!define FM_LEGACY_KEY "Software\Microsoft\Windows\CurrentVersion\Uninstall\{A714B514-AC38-41E4-932A-250B1C07E25C}_is1"

; Before anything is extracted: move a 1.0.x install out of the way, keeping
; what the user has in %LOCALAPPDATA%\FileMinify (settings.env, logs, temp).
; Every step may run again: a file still locked leaves the registry key in
; place, and the next install (or update) finishes the job. A 2.x install has
; neither the key nor launcher.js/unins000.exe, so updates skip all of it.
!macro customInit
  ; fmOldKey: "1" once a 1.0.x install is found (its key, or its files).
  Var /GLOBAL fmOld
  Var /GLOBAL fmOldKey
  Var /GLOBAL fmTries
  Push $0

  ; 1.0.3's updater starts setup from inside the old install folder (its
  ; working directory), which would keep that folder from being removed.
  InitPluginsDir
  SetOutPath $PLUGINSDIR

  StrCpy $fmOldKey ""
  ClearErrors
  EnumRegValue $0 HKCU "${FM_LEGACY_KEY}" 0
  ${IfNot} ${Errors}
    StrCpy $fmOldKey "1"
  ${EndIf}
  ClearErrors
  ReadRegStr $fmOld HKCU "${FM_LEGACY_KEY}" "InstallLocation"
  ${If} $fmOld == ""
    StrCpy $fmOld "$LOCALAPPDATA\Programs\FileMinify"
  ${EndIf}
  ${Do}
    StrCpy $0 $fmOld 1 -1
    ${If} $0 != "\"
      ${ExitDo}
    ${EndIf}
    StrCpy $fmOld $fmOld -1
  ${Loop}
  ClearErrors

  ${If} ${FileExists} "$fmOld\launcher.js"
  ${OrIf} ${FileExists} "$fmOld\unins000.exe"
    StrCpy $fmOldKey "1"
  ${EndIf}
  ; Never a drive's root: everything below deletes by name inside it.
  StrLen $0 $fmOld
  ${If} $fmOldKey == "1"
  ${AndIf} $0 > 3
    ; Stop the old app: its node.exe (by exact path), any bundled Ghostscript
    ; it started, and its window (Edge, with a profile of its own). The paths
    ; travel in the environment, so a quote in one needs no escaping.
    System::Call 'Kernel32::SetEnvironmentVariable(t "FM_OLD_NODE", t "$fmOld\node.exe")i'
    System::Call 'Kernel32::SetEnvironmentVariable(t "FM_OLD_TOOLS", t "$fmOld\tools\")i'
    nsExec::Exec `"$SYSDIR\WindowsPowerShell\v1.0\powershell.exe" -NoProfile -NonInteractive -ExecutionPolicy Bypass -Command "Get-CimInstance Win32_Process | Where-Object { ($$_.ExecutablePath -and ($$_.ExecutablePath -eq $$env:FM_OLD_NODE -or $$_.ExecutablePath.StartsWith($$env:FM_OLD_TOOLS, [StringComparison]::OrdinalIgnoreCase))) -or ($$_.Name -eq 'msedge.exe' -and $$_.CommandLine -match '--user-data-dir=.*\\FileMinify\\window(\x22|\s|$$)') } | Invoke-CimMethod -MethodName Terminate | Out-Null"`
    Pop $0

    ; A killed process lets go of its exe a moment later.
    StrCpy $fmTries 0
    ${Do}
      Delete "$fmOld\node.exe"
      ${IfNot} ${FileExists} "$fmOld\node.exe"
      ${OrIf} $fmTries >= 20
        ${ExitDo}
      ${EndIf}
      IntOp $fmTries $fmTries + 1
      Sleep 500
    ${Loop}

    ${IfNot} ${FileExists} "$fmOld\node.exe"
      ; Its own folders, then its files by name; nothing else in the folder.
      ; tools and magick only by what 1.0.x put there, since a user who
      ; installed it somewhere of their own may have folders of those names.
      ; Only if they look like 1.0.x's: a stale key could point at a reused folder.
      ${If} ${FileExists} "$fmOld\backend\server.js"
        RMDir /r "$fmOld\backend"
      ${EndIf}
      ${If} ${FileExists} "$fmOld\dist\index.html"
        RMDir /r "$fmOld\dist"
      ${EndIf}
      RMDir /r "$fmOld\tools\gs"
      RMDir "$fmOld\tools"
      Delete "$fmOld\magick\policy.xml"
      RMDir "$fmOld\magick"
      Delete "$fmOld\launcher.js"
      Delete "$fmOld\version.txt"
      Delete "$fmOld\fileminify.ico"
      Delete "$fmOld\LICENSE.txt"
      Delete "$fmOld\node-LICENSE.txt"
      Delete "$fmOld\unins000.exe"
      Delete "$fmOld\unins000.dat"
      RMDir "$fmOld"

      ; Its shortcuts. The new app's own are also named FileMinify.lnk, so
      ; those two go only while the new app isn't installed yet (an install
      ; over 2.x keeps its shortcuts rather than making new ones).
      SetShellVarContext current
      Delete "$SMPROGRAMS\FileMinify phone access.lnk"
      Delete "$SMPROGRAMS\FileMinify log folder.lnk"
      ${IfNot} ${FileExists} "$INSTDIR\${APP_EXECUTABLE_FILENAME}"
        Delete "$SMPROGRAMS\FileMinify.lnk"
        Delete "$DESKTOP\FileMinify.lnk"
      ${EndIf}

      ; The old window's Edge profile; Edge may take a moment to let go.
      StrCpy $fmTries 0
      ${Do}
        RMDir /r "$LOCALAPPDATA\FileMinify\window"
        ${IfNot} ${FileExists} "$LOCALAPPDATA\FileMinify\window\*.*"
        ${OrIf} $fmTries >= 10
          ${ExitDo}
        ${EndIf}
        IntOp $fmTries $fmTries + 1
        Sleep 500
      ${Loop}

      ; Last, so a failed run above is tried again next time.
      DeleteRegKey HKCU "${FM_LEGACY_KEY}"
    ${EndIf}
  ${EndIf}
  ClearErrors
  Pop $0
!macroend

; Per-user installs can fail to start the GPU process: the sandboxed GPU
; process (an AppContainer) can't read the app folder. Granting "ALL
; APPLICATION PACKAGES" read access fixes it (electron-builder PR #10242).
!macro customInstall
  nsExec::Exec `"$SYSDIR\icacls.exe" "$INSTDIR" /grant *S-1-15-2-1:(OI)(CI)(RX) /T /Q`
  Pop $0
!macroend

; A real uninstall removes FileMinify's data too (settings.env, logs, temp,
; Electron's own in app\) and electron-updater's download cache. An update
; runs the old uninstaller with --updated, and keeps all of it.
!macro customUnInstall
  ${ifNot} ${isUpdated}
    RMDir /r "$LOCALAPPDATA\FileMinify"
    RMDir /r "$LOCALAPPDATA\fileminify-app-updater"
    ; "Start with Windows" (desktop/main.cjs, LOGIN_ITEM: the value's name is
    ; fixed as FileMinify so it can be found here). An update keeps it.
    DeleteRegValue HKCU "Software\Microsoft\Windows\CurrentVersion\Run" "FileMinify"
    DeleteRegValue HKCU "Software\Microsoft\Windows\CurrentVersion\Explorer\StartupApproved\Run" "FileMinify"
  ${endIf}
!macroend
