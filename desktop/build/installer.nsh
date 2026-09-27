; FileMinify's additions to electron-builder's NSIS installer (nsis.include in
; desktop/electron-builder.yml). Nothing here may ask a question: the
; installer runs with /S under winget and CI, and with no arguments when
; 1.0.3's in-app updater starts it. A MessageBox added here needs /SD.
; makensis runs with -WX: a warning fails the build.

; The 1.0.x (Inno Setup) install's uninstall key. Inno's own uninstaller is
; never run: its [UninstallDelete] removes %LOCALAPPDATA%\FileMinify, and with
; it settings.env and the logs (and now 2.0's data too).
!define FM_LEGACY_KEY "Software\Microsoft\Windows\CurrentVersion\Uninstall\{A714B514-AC38-41E4-932A-250B1C07E25C}_is1"

; The PowerShell scripts beside this file (desktop/build/*.ps1), unpacked to
; the installer's temp folder. Their paths and settings travel in FMSETUP_*
; environment variables, so a quote in a path (C:\Users\O'Brien) needs no
; escaping; each is cleared again after use (the app is started from here).
!macro fmExtract SCRIPT
  InitPluginsDir
  File "/oname=$PLUGINSDIR\${SCRIPT}" "${BUILD_RESOURCES_DIR}\${SCRIPT}"
!macroend

; The value goes through a register, so the System plug-in never parses it.
!macro fmSetEnv NAME VALUE
  Push $1
  StrCpy $1 "${VALUE}"
  System::Call 'Kernel32::SetEnvironmentVariable(t "${NAME}", t r1)i'
  Pop $1
!macroend

!macro fmClearEnv
  !insertmacro fmUnsetEnv FMSETUP_PS1
  !insertmacro fmUnsetEnv FMSETUP_EXE
  !insertmacro fmUnsetEnv FMSETUP_UNDER
  !insertmacro fmUnsetEnv FMSETUP_EDGE
  !insertmacro fmUnsetEnv FMSETUP_WAIT
  !insertmacro fmUnsetEnv FMSETUP_SPARE
  !insertmacro fmUnsetEnv FMSETUP_CHECK
  !insertmacro fmUnsetEnv FMSETUP_OLD
  !insertmacro fmUnsetEnv FMSETUP_NEW
  !insertmacro fmUnsetEnv FMSETUP_LIST
!macroend

!macro fmUnsetEnv NAME
  System::Call 'Kernel32::SetEnvironmentVariable(t "${NAME}", p 0)i'
!macroend

; Runs an unpacked script and leaves its exit code (or "error") on the stack.
; Read in as a script block rather than run with -File: no execution policy
; applies to that, not even one set by Group Policy, which -ExecutionPolicy
; can't override.
!macro fmRunScript SCRIPT
  !insertmacro fmSetEnv FMSETUP_PS1 "$PLUGINSDIR\${SCRIPT}"
  nsExec::Exec `"$SYSDIR\WindowsPowerShell\v1.0\powershell.exe" -NoProfile -NonInteractive -ExecutionPolicy Bypass -Command "& ([scriptblock]::Create([IO.File]::ReadAllText($$env:FMSETUP_PS1)))"`
!macroend

; Replaces electron-builder's check for a running app, in the installer and
; the uninstaller alike. Its own put $INSTDIR inside a single-quoted
; PowerShell string, which a quote in the path (C:\Users\O'Brien) broke. An
; update (--updated: electron-updater's quitAndInstall) first gives the app
; up to 8 s to quit by itself, as it is already doing: shutting its server
; down and stopping the tools it started. Then whatever still runs from the
; install folder is stopped, with the tools it started, sparing this
; process (the uninstaller can run from there). Never asks.
!macro customCheckAppRunning
  Push $0
  !insertmacro fmExtract stop-processes.ps1
  System::Call 'Kernel32::GetCurrentProcessId()i.r0'
  !insertmacro fmSetEnv FMSETUP_SPARE "$0"
  !insertmacro fmSetEnv FMSETUP_UNDER "$INSTDIR\"
  ${If} ${isUpdated}
    !insertmacro fmSetEnv FMSETUP_WAIT "8"
  ${EndIf}
  !insertmacro fmRunScript stop-processes.ps1
  Pop $0
  !insertmacro fmClearEnv
  ${If} $0 != 0
    ; No PowerShell (or one that is blocked), or something would not stop:
    ; by name, then. Never /T: electron-updater's setup is the app's child.
    DetailPrint `Stopping ${APP_EXECUTABLE_FILENAME} by name ($0).`
    nsExec::Exec `"$SYSDIR\taskkill.exe" /F /IM "${APP_EXECUTABLE_FILENAME}"`
    Pop $0
    Sleep 1000
  ${EndIf}
  Pop $0
!macroend

; What electron-builder does when the previous version's uninstaller fails,
; with /SD added: its own MessageBox had none, so it stopped a silent install
; (winget, CI) at a dialog nobody could see.
!macro customUnInstallCheck
  ${If} ${Errors}
    DetailPrint `Uninstall was not successful. Not able to launch uninstaller!`
  ${ElseIf} $R0 != 0
    MessageBox MB_OK|MB_ICONEXCLAMATION "$(uninstallFailed): $R0" /SD IDOK
    DetailPrint `Uninstall was not successful. Uninstaller error code: $R0.`
    SetErrorLevel 2
    Quit
  ${EndIf}
!macroend

; Before anything is extracted: move a 1.0.x install out of the way, keeping
; what the user has in %LOCALAPPDATA%\FileMinify (settings.env, logs, temp).
; Every step may run again: a file still locked leaves the registry key in
; place, and the next install (or update) finishes the job. A 2.x install has
; neither the key nor launcher.js/unins000.exe, so updates skip all of it.
!macro customInit
  ; 1.0.x's folder; "1" once a 1.0.x install is found (by its key or its
  ; files), and whether that includes the key.
  Var /GLOBAL fmOld
  Var /GLOBAL fmFound
  Var /GLOBAL fmHasKey
  ; For customInstall: "0" when a 1.0.x user had no desktop shortcut (so the
  ; new one goes again), "1" to start FileMinify again after a silent install.
  Var /GLOBAL fmDesktop
  Var /GLOBAL fmRestart
  Var /GLOBAL fmTries
  Push $0

  ; 1.0.3's updater starts setup from inside the old install folder (its
  ; working directory), which would keep that folder from being removed.
  InitPluginsDir
  SetOutPath $PLUGINSDIR
  !insertmacro fmExtract stop-processes.ps1

  StrCpy $fmFound ""
  StrCpy $fmHasKey ""
  StrCpy $fmDesktop ""
  StrCpy $fmRestart ""
  ClearErrors
  EnumRegValue $0 HKCU "${FM_LEGACY_KEY}" 0
  ${IfNot} ${Errors}
    StrCpy $fmFound "1"
    StrCpy $fmHasKey "1"
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
    StrCpy $fmFound "1"
  ${EndIf}
  ; Never a drive's root: everything below deletes by name inside it.
  StrLen $0 $fmOld
  ${If} $0 <= 3
    StrCpy $fmFound ""
  ${EndIf}

  ; A 1.0.x user keeps their choice of desktop icon; the new app's shortcut
  ; has the same name, so only while the new app isn't installed yet.
  SetShellVarContext current
  ${If} $fmFound == "1"
  ${AndIfNot} ${FileExists} "$INSTDIR\${APP_EXECUTABLE_FILENAME}"
    StrCpy $fmDesktop "0"
    ${If} ${FileExists} "$DESKTOP\FileMinify.lnk"
      StrCpy $fmDesktop "1"
    ${EndIf}
  ${EndIf}

  ; A silent install (winget upgrade) stops a running FileMinify, 2.x or
  ; 1.0.x, and would leave it stopped: note it, before anything is stopped,
  ; and customInstall starts the new one (in the tray). Not for --force-run,
  ; which electron-builder starts itself, nor an update, whose app chose.
  ${If} ${Silent}
  ${AndIfNot} ${isForceRun}
  ${AndIfNot} ${isUpdated}
    ${If} $fmFound == "1"
      !insertmacro fmSetEnv FMSETUP_EXE "$INSTDIR\${APP_EXECUTABLE_FILENAME}|$fmOld\node.exe"
    ${Else}
      !insertmacro fmSetEnv FMSETUP_EXE "$INSTDIR\${APP_EXECUTABLE_FILENAME}"
    ${EndIf}
    !insertmacro fmSetEnv FMSETUP_CHECK "1"
    !insertmacro fmRunScript stop-processes.ps1
    Pop $0
    !insertmacro fmClearEnv
    ${If} $0 == 0
      StrCpy $fmRestart "1"
    ${EndIf}
  ${EndIf}

  ${If} $fmFound == "1"
    ; Stop the old app: its node.exe (by exact path), the tools it started,
    ; its bundled Ghostscript, and its window (Edge, with a profile of its
    ; own). Not the rest of its tree: when 1.0.3's updater started this
    ; setup, setup is one of node.exe's children.
    System::Call 'Kernel32::GetCurrentProcessId()i.r0'
    !insertmacro fmSetEnv FMSETUP_SPARE "$0"
    !insertmacro fmSetEnv FMSETUP_EXE "$fmOld\node.exe"
    !insertmacro fmSetEnv FMSETUP_UNDER "$fmOld\tools\gs\"
    !insertmacro fmSetEnv FMSETUP_EDGE "1"
    !insertmacro fmRunScript stop-processes.ps1
    Pop $0
    !insertmacro fmClearEnv

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

    ; Start-menu entries only 1.0.x had, whatever else happens: both would
    ; start (or show) the old app beside the new one.
    Delete "$SMPROGRAMS\FileMinify phone access.lnk"
    Delete "$SMPROGRAMS\FileMinify log folder.lnk"

    ${If} ${FileExists} "$fmOld\node.exe"
      ; Half done: node.exe is still held (an antivirus scan, a PowerShell
      ; that policy blocks, so nothing was stopped). The key stays, so the
      ; next install tries again, but it no longer shows in Apps & Features,
      ; and Inno's uninstaller goes: run, it would delete
      ; %LOCALAPPDATA%\FileMinify, now 2.0's data.
      ${If} $fmHasKey == "1"
        WriteRegDWORD HKCU "${FM_LEGACY_KEY}" "SystemComponent" 1
      ${EndIf}
      Delete "$fmOld\unins000.exe"
      Delete "$fmOld\unins000.dat"
    ${Else}
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

      ; Its other shortcuts. The new app's own are also named FileMinify.lnk,
      ; so those two go only while the new app isn't installed yet (an
      ; install over 2.x keeps its shortcuts rather than making new ones).
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

; After the files and shortcuts are in place.
!macro customInstall
  Push $0
  Push $1
  Push $2
  Push $3

  ; Per-user installs can fail to start the GPU process: the sandboxed GPU
  ; process (an AppContainer) can't read the app folder. Granting "ALL
  ; APPLICATION PACKAGES" read access fixes it (electron-builder PR #10242).
  nsExec::Exec `"$SYSDIR\icacls.exe" "$INSTDIR" /grant *S-1-15-2-1:(OI)(CI)(RX) /T /Q`
  Pop $0

  ; electron-updater keeps the blockmap of the installed version beside its
  ; copy of the installer, for the next differential download. Installed any
  ; other way (winget, by hand) that blockmap is an older version's: the next
  ; update's blocks would fail their sha512 and it would download everything.
  ; Without it the old blockmap is fetched from the release instead. (The
  ; folder is electron-updater's, named after the package: fileminify-app.)
  ${IfNot} ${isUpdated}
    Delete "$LOCALAPPDATA\fileminify-app-updater\current.blockmap"
  ${EndIf}

  ; 1.0.3's updater downloaded setup to %TEMP%\FileMinify-update-<random>
  ; and never removed it. Not the folder this setup runs from, compared in
  ; short form: %TEMP% often is (C:\Users\RUNNER~1\...).
  GetFullPathName /SHORT $1 "$EXEDIR"
  ClearErrors
  FindFirst $0 $2 "$TEMP\FileMinify-update-*"
  ${DoWhile} $2 != ""
    ${If} ${FileExists} "$TEMP\$2\*.*"
      GetFullPathName /SHORT $3 "$TEMP\$2"
      ${If} $3 != $1
        RMDir /r "$TEMP\$2"
      ${EndIf}
    ${EndIf}
    FindNext $0 $2
  ${Loop}
  FindClose $0
  ClearErrors

  ${If} $fmFound == "1"
    ; A 1.0.x user who had no desktop shortcut gets none now either.
    ${If} $fmDesktop == "0"
      Delete "$newDesktopLink"
      System::Call 'Shell32::SHChangeNotify(i 0x8000000, i 0, i 0, i 0)'
    ${EndIf}

    ; Shortcuts to 1.0.x's node.exe that the user copied or pinned now start
    ; the new app, with its AppUserModelID so a pinned one and the running
    ; app share a taskbar button.
    !insertmacro fmExtract retarget-shortcuts.ps1
    !insertmacro fmSetEnv FMSETUP_OLD "$fmOld\node.exe"
    !insertmacro fmSetEnv FMSETUP_NEW "$appExe"
    !insertmacro fmSetEnv FMSETUP_LIST "$PLUGINSDIR\retargeted.txt"
    !insertmacro fmRunScript retarget-shortcuts.ps1
    Pop $0
    !insertmacro fmClearEnv
    ClearErrors
    FileOpen $0 "$PLUGINSDIR\retargeted.txt" r
    ${IfNot} ${Errors}
      ${Do}
        ClearErrors
        FileReadUTF16LE $0 $1
        ${If} ${Errors}
          ${ExitDo}
        ${EndIf}
        ${Do}
          StrCpy $2 $1 1 -1
          ${If} $2 != "$\r"
          ${AndIf} $2 != "$\n"
            ${ExitDo}
          ${EndIf}
          StrCpy $1 $1 -1
        ${Loop}
        ${If} $1 != ""
          WinShell::SetLnkAUMI "$1" "${APP_ID}"
        ${EndIf}
      ${Loop}
      FileClose $0
    ${EndIf}
    ClearErrors
  ${EndIf}

  ; A silent install stopped a running FileMinify (customInit): start the new
  ; one, in the tray (--hidden), as the user's login item does.
  ${If} $fmRestart == "1"
    ${StdUtils.ExecShellAsUser} $0 "$appExe" "open" "--hidden"
  ${EndIf}

  Pop $3
  Pop $2
  Pop $1
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
