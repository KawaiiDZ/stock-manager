; =====================================================================
; Inno Setup Script for Stock Manager (Offline Edition)
; Produces a single, professional Setup.exe installer for Windows.
; =====================================================================

#define MyAppName "Stock Manager"
#define MyAppVersion "2.0.0"
#define MyAppPublisher "StockFlow"
#define MyAppURL "http://127.0.0.1:8000"
#define MyAppExeName "StockManager.exe"

[Setup]
; Unique App ID for updates and uninstallation
AppId={{D37E61A2-82BC-4F8A-B8B7-91B6B2F57A88}
AppName={#MyAppName}
AppVersion={#MyAppVersion}
AppPublisher={#MyAppPublisher}
AppPublisherURL={#MyAppURL}
AppSupportURL={#MyAppURL}
AppUpdatesURL={#MyAppURL}
DefaultDirName={autopf}\{#MyAppName}
DefaultGroupName={#MyAppName}
AllowNoIcons=yes
OutputDir=Output
OutputBaseFilename=StockManager_Setup
SetupIconFile=app_icon.ico
Compression=lzma2/ultra64
SolidCompression=yes
WizardStyle=modern
; Allows seamless install without UAC admin prompt by default, while supporting system-wide if desired
PrivilegesRequired=lowest
PrivilegesRequiredOverridesAllowed=dialog
DisableProgramGroupPage=yes
UninstallDisplayIcon={app}\{#MyAppExeName}

[Languages]
Name: "english"; MessagesFile: "compiler:Default.isl"

[Tasks]
Name: "desktopicon"; Description: "{cm:CreateDesktopIcon}"; GroupDescription: "{cm:AdditionalIcons}"; Flags: unchecked

[Files]
; All files compiled by PyInstaller in dist\StockManager
Source: "dist\StockManager\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs
; Include icon file
Source: "app_icon.ico"; DestDir: "{app}"; Flags: ignoreversion

[Icons]
Name: "{autoprograms}\{#MyAppName}\{#MyAppName}"; Filename: "{app}\{#MyAppExeName}"; IconFilename: "{app}\app_icon.ico"
Name: "{autoprograms}\{#MyAppName}\Uninstall {#MyAppName}"; Filename: "{uninstallexe}"
Name: "{autodesktop}\{#MyAppName}"; Filename: "{app}\{#MyAppExeName}"; IconFilename: "{app}\app_icon.ico"; Tasks: desktopicon

[Run]
Filename: "{app}\{#MyAppExeName}"; Description: "{cm:LaunchProgram,{#StringChange(MyAppName, '&', '&&')}}"; Flags: nowait postinstall skipifsilent

[UninstallDelete]
; Clean up temporary runtime caches if created
Type: filesandordirs; Name: "{app}\__pycache__"
