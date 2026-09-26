; FileMinify for Windows. windows/build.sh stages the files in build\windows\app
; and passes /DAppVersion. Winget installs FFmpeg, ImageMagick, LibreOffice and
; the VC++ runtime beforehand as the package's dependencies; Ghostscript is
; bundled (tools\gs), since winget has no package for it. Run by hand (a
; downloaded .exe), setup offers to fetch whichever of those tools are missing,
; through winget, so a double-click is all it takes.
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
; Shown only when a tool is missing; never acted on in a silent install (see
; InstallMissingTools).
Name: tools; Description: "Download and install the tools FileMinify needs that are missing here (FFmpeg, ImageMagick, LibreOffice: up to about 650 MB). Windows asks for permission for some of them: answer Yes."; Check: ToolsMissing
Name: desktopicon; Description: "{cm:CreateDesktopIcon}"; GroupDescription: "{cm:AdditionalIcons}"; Flags: unchecked
Name: lan; Description: "Let phones and other computers on this network use FileMinify (Windows will ask to let it through the firewall)"; Flags: unchecked

[Dirs]
Name: "{localappdata}\FileMinify\logs"

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
; The log (backend/utils/logger.js), for someone helping the user remotely.
Name: "{autoprograms}\FileMinify log folder"; Filename: "{localappdata}\FileMinify\logs"; Comment: "FileMinify's log files, to send when something goes wrong"
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
// The tools FileMinify shells out to, found where their installers put them
// (backend/utils/tools.js searches the same places, and more).
function HasFFmpeg: Boolean;
begin
  Result := (FileSearch('ffmpeg.exe', GetEnv('PATH')) <> '') or
    FileExists(ExpandConstant('{localappdata}\Microsoft\WinGet\Links\ffmpeg.exe')) or
    FileExists(ExpandConstant('{commonpf64}\WinGet\Links\ffmpeg.exe'));
end;

function HasImageMagick: Boolean;
var
  FindRec: TFindRec;
begin
  Result := False;
  if FindFirst(ExpandConstant('{commonpf64}\ImageMagick-*'), FindRec) then
  try
    repeat
      Result := FileExists(ExpandConstant('{commonpf64}\') + FindRec.Name + '\magick.exe');
    until Result or not FindNext(FindRec);
  finally
    FindClose(FindRec);
  end;
end;

function HasLibreOffice: Boolean;
begin
  Result := FileExists(ExpandConstant('{commonpf64}\LibreOffice\program\soffice.exe'));
end;

// The bundled Ghostscript needs it.
function HasVCRuntime: Boolean;
begin
  Result := FileExists(ExpandConstant('{sys}\vcruntime140_1.dll')) and
    FileExists(ExpandConstant('{sys}\msvcp140.dll'));
end;

// Winget ids (or, with Names, readable names) of what is missing, space- or
// comma-separated; '' when nothing is.
function MissingTools(Names: Boolean): String;
begin
  Result := '';
  if not HasFFmpeg then
    if Names then Result := Result + 'FFmpeg, ' else Result := Result + 'Gyan.FFmpeg ';
  if not HasImageMagick then
    if Names then Result := Result + 'ImageMagick, ' else Result := Result + 'ImageMagick.ImageMagick ';
  if not HasLibreOffice then
    if Names then Result := Result + 'LibreOffice, ' else Result := Result + 'TheDocumentFoundation.LibreOffice ';
  if not HasVCRuntime then
    if Names then Result := Result + 'the Visual C++ runtime, ' else Result := Result + 'Microsoft.VCRedist.2015+.x64 ';
  if Names and (Result <> '') then
    Result := Copy(Result, 1, Length(Result) - 2);
end;

function ToolsMissing: Boolean;
begin
  Result := MissingTools(False) <> '';
end;

// One winget install per missing tool, in a console window the user can
// watch. Not in a silent install: that is winget installing FileMinify, and
// it has brought the tools already (a winget run inside winget's own install
// would only get in its way).
procedure InstallMissingTools;
var
  Winget, Ids, Id, Command, Missing: String;
  Space, ResultCode: Integer;
begin
  if WizardSilent or not WizardIsTaskSelected('tools') then Exit;
  Ids := MissingTools(False);
  if Ids = '' then Exit;
  Winget := ExpandConstant('{localappdata}\Microsoft\WindowsApps\winget.exe');
  if not FileExists(Winget) then
  begin
    MsgBox('FileMinify is installed, but its tools could not be fetched: this PC is missing ' +
      'Windows'' "App Installer". Install "App Installer" from the Microsoft Store, then run this setup again.',
      mbError, MB_OK);
    Exit;
  end;
  WizardForm.StatusLabel.Caption := 'Installing ' + MissingTools(True) +
    '. A window shows the progress; answer Yes when Windows asks for permission.';
  Command := '/c title Installing the tools FileMinify needs';
  while Ids <> '' do
  begin
    Space := Pos(' ', Ids);
    Id := Copy(Ids, 1, Space - 1);
    Delete(Ids, 1, Space);
    Command := Command + ' & echo. & echo Installing ' + Id + '... & "' + Winget +
      '" install --exact --id ' + Id + ' --accept-package-agreements --accept-source-agreements';
  end;
  Command := Command + ' & echo. & echo Done. This window closes by itself. & timeout /t 5 >nul';
  Exec(ExpandConstant('{cmd}'), Command, '', SW_SHOW, ewWaitUntilTerminated, ResultCode);
  Missing := MissingTools(True);
  if Missing <> '' then
    MsgBox('FileMinify is installed, but these tools are still missing: ' + Missing + '.' + #13#10#13#10 +
      'Some things will not work without them. Run this setup again to retry.', mbInformation, MB_OK);
end;

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
    InstallMissingTools;
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
