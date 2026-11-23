; Installeur Windows de PicTone (Inno Setup 6).
; Installation par utilisateur : aucun droit administrateur requis (sauf si l'utilisateur
; choisit un dossier protégé), ce qui permet à la mise à jour automatique de remplacer
; l'exécutable en place.
;
; Compilation : ISCC.exe /DAppVersion=3.1.0 installer\PicTone.iss
; Prérequis : python build_exe.py (produit build_portable\PicTone_v<version>.exe)

#ifndef AppVersion
  #define AppVersion "0.0.0"
#endif
#define AppName "PicTone"
#define SourceExe "..\build_portable\PicTone_v" + AppVersion + "_Windows.exe"

[Setup]
AppId={{5E1D7A0C-2B9F-4C3E-8A6D-19F4B7C2E085}
AppName={#AppName}
AppVersion={#AppVersion}
AppVerName={#AppName} {#AppVersion}
AppPublisher=Kyo_
AppPublisherURL=https://github.com/Kyosuke01/PicTone
AppSupportURL=https://github.com/Kyosuke01/PicTone/issues
AppUpdatesURL=https://github.com/Kyosuke01/PicTone/releases
AppComments=Éditeur d'images local et performant
VersionInfoVersion={#AppVersion}
VersionInfoProductName={#AppName}
VersionInfoDescription=Installeur de PicTone

; Emplacement : par défaut dans le profil utilisateur, modifiable dans l'assistant
DefaultDirName={autopf}\{#AppName}
PrivilegesRequired=lowest
PrivilegesRequiredOverridesAllowed=dialog
UsePreviousAppDir=yes
UsePreviousGroup=yes
UsePreviousTasks=yes
DisableDirPage=no
DisableProgramGroupPage=no
DefaultGroupName={#AppName}
AllowNoIcons=yes

ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible
MinVersion=10.0.17763

; Assistant : interface sobre aux couleurs de l'application
WizardStyle=modern
WizardImageFile=wizard_large.bmp
WizardSmallImageFile=wizard_small.bmp
WizardImageStretch=no
SetupIconFile=..\pictone.ico
UninstallDisplayIcon={app}\PicTone.exe
UninstallDisplayName={#AppName}

; Fichiers de sortie
OutputDir=..\release
OutputBaseFilename=PicTone_v{#AppVersion}_Windows
Compression=lzma2/max
SolidCompression=yes

; Gestion des instances en cours et des mises à jour
CloseApplications=yes
CloseApplicationsFilter=PicTone.exe
RestartApplications=no
SetupMutex=PicToneSetupMutex

[Languages]
Name: "french"; MessagesFile: "compiler:Languages\French.isl"

[Messages]
french.SetupWindowTitle=Installation de PicTone - %1
french.WelcomeLabel1=Bienvenue dans l'assistant d'installation de PicTone
french.WelcomeLabel2=Cet assistant va installer PicTone %1 sur votre ordinateur.%n%nPicTone est un éditeur d'images local : le traitement se fait entièrement sur votre machine.%n%nIl est recommandé de fermer les autres applications avant de continuer.
french.FinishedHeadingLabel=PicTone est installé
french.FinishedLabel=L'installation est terminée. Vous pouvez lancer PicTone depuis le menu Démarrer ou le Bureau.

[Tasks]
Name: "desktopicon"; Description: "Créer un raccourci sur le Bureau"; GroupDescription: "Raccourcis :"; Flags: unchecked
Name: "startmenu"; Description: "Ajouter au menu Démarrer"; GroupDescription: "Raccourcis :"

[Files]
Source: "{#SourceExe}"; DestDir: "{app}"; DestName: "PicTone.exe"; Flags: ignoreversion

[Icons]
Name: "{group}\{#AppName}"; Filename: "{app}\PicTone.exe"; IconFilename: "{app}\PicTone.exe"; Tasks: startmenu
Name: "{group}\Désinstaller {#AppName}"; Filename: "{uninstallexe}"; Tasks: startmenu
Name: "{autodesktop}\{#AppName}"; Filename: "{app}\PicTone.exe"; IconFilename: "{app}\PicTone.exe"; Tasks: desktopicon

[Run]
Filename: "{app}\PicTone.exe"; Description: "Lancer {#AppName} maintenant"; Flags: nowait postinstall skipifsilent
