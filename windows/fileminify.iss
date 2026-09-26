; FileMinify for Windows. windows/build.sh stages the files in build\windows\app
; and passes /DAppVersion. Winget installs FFmpeg, ImageMagick, LibreOffice and
; the VC++ runtime beforehand as the package's dependencies; Ghostscript is
; bundled (tools\gs), since winget has no package for it.
#ifndef AppVersion
  #define AppVersion "0.0.0"
#endif

[Setup]
AppId={{A714B514-AC38-41E4-932A-250B1C07E25C}
AppName=FileMinify
AppVersion={#AppVersion}
AppPublisher=Bárður Nielsen
AppPublisherURL=https://github.com/bardurnielsen/file-minify
; Per user, in %LOCALAPPDATA%\Programs\FileMinify: no admin prompt for the app
; itself.
PrivilegesRequired=lowest
DefaultDirName={autopf}\FileMinify
DisableProgramGroupPage=yes
OutputDir=..\build\windows
OutputBaseFilename=FileMinify-Setup-{#AppVersion}
SetupIconFile=..\public\favicon.ico
UninstallDisplayIcon={app}\fileminify.ico
Compression=lzma2/max
SolidCompression=yes
WizardStyle=modern
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible
; An upgrade while FileMinify runs: stop it rather than leave files locked.
CloseApplications=force

[Tasks]
Name: desktopicon; Description: "{cm:CreateDesktopIcon}"; GroupDescription: "{cm:AdditionalIcons}"; Flags: unchecked
Name: lan; Description: "Let phones and other computers on this network use FileMinify (Windows will ask to let it through the firewall)"; Flags: unchecked

[InstallDelete]
; An upgrade replaces these whole, so nothing from an older version lingers.
Type: filesandordirs; Name: "{app}\backend"
Type: filesandordirs; Name: "{app}\dist"
Type: filesandordirs; Name: "{app}\tools"

[Files]
Source: "..\build\windows\app\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs

[Icons]
Name: "{autoprograms}\FileMinify"; Filename: "{app}\node.exe"; Parameters: """{app}\launcher.js"""; WorkingDir: "{app}"; IconFilename: "{app}\fileminify.ico"; Comment: "Compress, convert and merge files"; Flags: runminimized
Name: "{autoprograms}\FileMinify phone access"; Filename: "{app}\node.exe"; Parameters: """{app}\launcher.js"" --phone-access"; WorkingDir: "{app}"; IconFilename: "{app}\fileminify.ico"; Comment: "Let phones on this Wi-Fi use FileMinify, or stop them"; Flags: runminimized
Name: "{autodesktop}\FileMinify"; Filename: "{app}\node.exe"; Parameters: """{app}\launcher.js"""; WorkingDir: "{app}"; IconFilename: "{app}\fileminify.ico"; Comment: "Compress, convert and merge files"; Flags: runminimized; Tasks: desktopicon

[Run]
Filename: "{app}\node.exe"; Parameters: """{app}\launcher.js"""; WorkingDir: "{app}"; Description: "Start FileMinify"; Flags: postinstall nowait skipifsilent runminimized

[UninstallRun]
; A running FileMinify holds node.exe open, and its window (Edge, with a
; profile in {localappdata}\FileMinify\window) holds that profile; stop both so
; the files can go.
Filename: "powershell.exe"; Parameters: "-NoProfile -ExecutionPolicy Bypass -Command ""Get-Process node -ErrorAction SilentlyContinue | Where-Object {{ $_.Path -eq '{code:NodePathForPs}' } | Stop-Process -Force; Get-CimInstance Win32_Process | Where-Object {{ $_.Name -eq 'msedge.exe' -and $_.CommandLine -like '*\FileMinify\window*' } | Invoke-CimMethod -MethodName Terminate"""; Flags: runhidden; RunOnceId: "StopFileMinify"

[UninstallDelete]
; Temp files, the LibreOffice profile and settings.env.
Type: filesandordirs; Name: "{localappdata}\FileMinify"

[Code]
// settings.env is read by launcher.js, and users add their own lines to it
// (README). The installer owns only FM_HOST: every other line is kept. A
// silent upgrade (winget) reuses the previous run's task choices, so LAN
// access survives it too.
procedure CurStepChanged(CurStep: TSetupStep);
var
  Dir, FileName, Settings: String;
  Lines: TArrayOfString;
  I: Integer;
begin
  if CurStep = ssPostInstall then
  begin
    Dir := ExpandConstant('{localappdata}\FileMinify');
    ForceDirectories(Dir);
    FileName := Dir + '\settings.env';
    Settings := '';
    if LoadStringsFromFile(FileName, Lines) then
      for I := 0 to GetArrayLength(Lines) - 1 do
        if Pos('FM_HOST=', Trim(Lines[I])) <> 1 then
          Settings := Settings + Lines[I] + #13#10;
    if Settings = '' then
      Settings := '# FileMinify settings, one KEY=value per line. The installer manages FM_HOST.' + #13#10;
    if WizardIsTaskSelected('lan') then
      Settings := Settings + 'FM_HOST=0.0.0.0' + #13#10;
    SaveStringToFile(FileName, Settings, False);
  end;
end;

// {app}\node.exe inside a single-quoted PowerShell string: a quote in the
// path (C:\Users\O'Brien) is doubled so it stays one string.
function NodePathForPs(Param: String): String;
begin
  Result := ExpandConstant('{app}\node.exe');
  StringChangeEx(Result, '''', '''''', True);
end;
