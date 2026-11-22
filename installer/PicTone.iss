; Installeur Windows de PicTone (Inno Setup 6).
; Installation par utilisateur : aucun droit administrateur requis, ce qui permet
; à la mise à jour automatique de remplacer l'exécutable en place.
;
; Compilation : ISCC.exe /DAppVersion=3.1.0 installer\PicTone.iss

#ifndef AppVersion
  #define AppVersion "0.0.0"
#endif
#define AppName "PicTone"
#define SourceExe "..\Executables\PicTone_v" + AppVersion + ".exe"

[Setup]
AppId={{5E1D7A0C-2B9F-4C3E-8A6D-19F4B7C2E085}
AppName={#AppName}
AppVersion={#AppVersion}
AppVerName={#AppName} {#AppVersion}
AppPublisher=Kyo_
AppPublisherURL=https://github.com/Kyosuke01/PicTone
DefaultDirName={autopf}\{#AppName}
DefaultGroupName={#AppName}
DisableProgramGroupPage=yes
PrivilegesRequired=lowest
PrivilegesRequiredOverridesAllowed=dialog
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible
OutputDir=..\Executables
OutputBaseFilename=PicTone_Setup_v{#AppVersion}
SetupIconFile=..\pictone.ico
UninstallDisplayIcon={app}\PicTone.exe
UninstallDisplayName={#AppName}
Compression=lzma2/max
SolidCompression=yes
WizardStyle=modern
CloseApplications=yes
RestartApplications=no
VersionInfoVersion={#AppVersion}
VersionInfoProductName={#AppName}

[Languages]
Name: "french"; MessagesFile: "compiler:Languages\French.isl"

[Tasks]
Name: "desktopicon"; Description: "Créer un raccourci sur le Bureau"; GroupDescription: "Raccourcis :"; Flags: unchecked

[Files]
Source: "{#SourceExe}"; DestDir: "{app}"; DestName: "PicTone.exe"; Flags: ignoreversion

[Icons]
Name: "{group}\{#AppName}"; Filename: "{app}\PicTone.exe"; IconFilename: "{app}\PicTone.exe"
Name: "{group}\Désinstaller {#AppName}"; Filename: "{uninstallexe}"
Name: "{autodesktop}\{#AppName}"; Filename: "{app}\PicTone.exe"; IconFilename: "{app}\PicTone.exe"; Tasks: desktopicon

[Run]
Filename: "{app}\PicTone.exe"; Description: "Lancer {#AppName}"; Flags: nowait postinstall skipifsilent
