import os
import sys
import shutil
import subprocess
import glob
from PIL import Image

# --- CONFIGURATION MICROSOFT STORE ---
# Identifiants exacts fournis par le Microsoft Partner Center
IDENTITY_NAME = "Kyo.PicTone"
PUBLISHER_ID = "CN=704264E0-3184-4166-B52C-A1B4EEB5FA57"
PUBLISHER_DISPLAY_NAME = "Kyo_"
# -----------------------------------

def get_version():
    """Reads the version from version.txt"""
    version_file = "version.txt"
    if not os.path.exists(version_file):
        print(f"Error: {version_file} not found.")
        sys.exit(1)
    with open(version_file, "r", encoding="utf-8") as f:
        return f.read().strip()

def prepare_assets(build_dir):
    """Generates the required PNG assets from pictone.ico for the MSIX package"""
    assets_dir = os.path.join(build_dir, "Assets")
    os.makedirs(assets_dir, exist_ok=True)
    
    icon_path = "pictone.ico"
    if not os.path.exists(icon_path):
        print(f"Warning: {icon_path} not found. Using blank images for MSIX.")
        img = Image.new("RGBA", (500, 500), (0, 0, 0, 0))
    else:
        img = Image.open(icon_path)
        img = img.convert("RGBA")

    # Required sizes
    sizes = {
        "StoreLogo.png": (50, 50),
        "Square44x44Logo.png": (44, 44),
        "Square150x150Logo.png": (150, 150),
        "Square310x310Logo.png": (310, 310),
        "Wide310x150Logo.png": (310, 150),
        "SplashScreen.png": (620, 300)
    }

    print("Generating MSIX assets...")
    for name, size in sizes.items():
        # Using nearest/bilinear resizing or creating a background
        target = Image.new("RGBA", size, (12, 11, 16, 255)) # Dark background #0c0b10
        # Calculate aspect ratio preserving size for the icon
        icon_ratio = img.width / img.height
        target_ratio = size[0] / size[1]
        
        if target_ratio > icon_ratio:
            new_h = int(size[1] * 0.8) # 80% of height
            new_w = int(new_h * icon_ratio)
        else:
            new_w = int(size[0] * 0.8)
            new_h = int(new_w / icon_ratio)
            
        resized_icon = img.resize((new_w, new_h), Image.Resampling.LANCZOS)
        offset_x = (size[0] - new_w) // 2
        offset_y = (size[1] - new_h) // 2
        
        target.paste(resized_icon, (offset_x, offset_y), resized_icon)
        target.save(os.path.join(assets_dir, name))
        print(f"  -> Generated {name}")

def generate_manifest(build_dir, version):
    """Generates the AppxManifest.xml file"""
    # MSIX versions must be in x.y.z.0 format
    parts = version.split('.')
    while len(parts) < 4:
        parts.append("0")
    msix_version = ".".join(parts[:4])

    manifest_content = f"""<?xml version="1.0" encoding="utf-8"?>
<Package xmlns="http://schemas.microsoft.com/appx/manifest/foundation/windows10"
         xmlns:uap="http://schemas.microsoft.com/appx/manifest/uap/windows10"
         xmlns:rescap="http://schemas.microsoft.com/appx/manifest/foundation/windows10/restrictedcapabilities">
  
  <Identity Name="{IDENTITY_NAME}"
            Publisher="{PUBLISHER_ID}"
            Version="{msix_version}"
            ProcessorArchitecture="x64" />
            
  <Properties>
    <DisplayName>PicTone</DisplayName>
    <PublisherDisplayName>{PUBLISHER_DISPLAY_NAME}</PublisherDisplayName>
    <Description>Éditeur d'images local et performant</Description>
    <Logo>Assets\\StoreLogo.png</Logo>
  </Properties>
  
  <Resources>
    <Resource Language="fr-FR" />
  </Resources>
  
  <Dependencies>
    <TargetDeviceFamily Name="Windows.Desktop" MinVersion="10.0.17763.0" MaxVersionTested="10.0.19041.0" />
  </Dependencies>
  
  <Capabilities>
    <rescap:Capability Name="runFullTrust" />
  </Capabilities>
  
  <Applications>
    <Application Id="PicTone"
                 Executable="PicTone.exe"
                 EntryPoint="Windows.FullTrustApplication">
      <uap:VisualElements DisplayName="PicTone"
                          Description="Éditeur d'images local"
                          BackgroundColor="#0c0b10"
                          Square150x150Logo="Assets\\Square150x150Logo.png"
                          Square44x44Logo="Assets\\Square44x44Logo.png">
        <uap:DefaultTile Wide310x150Logo="Assets\\Wide310x150Logo.png" 
                         Square310x310Logo="Assets\\Square310x310Logo.png" />
        <uap:SplashScreen Image="Assets\\SplashScreen.png" />
      </uap:VisualElements>
    </Application>
  </Applications>
</Package>
"""
    manifest_path = os.path.join(build_dir, "AppxManifest.xml")
    with open(manifest_path, "w", encoding="utf-8") as f:
        f.write(manifest_content)
    print(f"Generated {manifest_path}")

def find_makeappx():
    """Recherche dynamique de l'outil makeappx.exe dans le SDK Windows"""
    paths_to_check = [
        r"C:\Program Files (x86)\Windows Kits\10\App Certification Kit\makeappx.exe",
        r"C:\Program Files (x86)\Windows Kits\10\bin\*\x64\makeappx.exe",
        r"C:\Program Files\Windows Kits\10\bin\*\x64\makeappx.exe"
    ]
    for path in paths_to_check:
        matches = glob.glob(path)
        if matches:
            # On trie pour prendre la version la plus récente du SDK
            return sorted(matches)[-1]
    return None

def main():
    print("--- 1. Compilation de l'exécutable avec build_exe.py ---")
    try:
        subprocess.run([sys.executable, "build_exe.py"], check=True)
    except subprocess.CalledProcessError:
        print("Erreur lors de la compilation de l'exécutable.")
        sys.exit(1)

    version = get_version()
    exe_name = f"PicTone_v{version}.exe"
    exe_path = os.path.join("Executables", exe_name)

    if not os.path.exists(exe_path):
        print(f"Erreur : {exe_path} introuvable après la compilation.")
        sys.exit(1)

    print("\n--- 2. Préparation du dossier MSIX ---")
    build_dir = "MsixBuild"
    if os.path.exists(build_dir):
        shutil.rmtree(build_dir)
    os.makedirs(build_dir, exist_ok=True)

    # Copy executable to MsixBuild and rename it to generic PicTone.exe
    shutil.copy2(exe_path, os.path.join(build_dir, "PicTone.exe"))
    print(f"Copied {exe_name} to {build_dir}/PicTone.exe")

    prepare_assets(build_dir)
    generate_manifest(build_dir, version)

    print("\n--- 3. Package prêt à être généré ---")
    
    # Tentative de packaging automatique si makeappx est trouvé
    makeappx_path = find_makeappx()
    msix_output = f"Executables\\PicTone_v{version}.msix"
    
    if makeappx_path and os.path.exists(makeappx_path):
        print(f"L'outil 'makeappx' a été détecté ({makeappx_path}). Génération automatique du .msix en cours...")
        try:
            subprocess.run([
                makeappx_path, "pack", 
                "/d", build_dir, 
                "/p", msix_output,
                "/o" # Overwrite if exists
            ], check=True)
            print("\n" + "="*50)
            print("PACKAGING TERMINÉ AVEC SUCCÈS ! 🎉")
            print(f"Ton fichier est prêt ici : {msix_output}")
            print("="*50)
        except subprocess.CalledProcessError:
            print("Erreur lors de la génération du .msix par makeappx.")
    else:
        print(f"Le dossier '{build_dir}' contient tout le nécessaire pour le Microsoft Store.")
        print("Pour générer le fichier .msix final :")
        print("1. Utilisez l'outil 'makeappx' (du SDK Windows).")
        print(f"   Commande : makeappx pack /d {build_dir} /p {msix_output}")

if __name__ == "__main__":
    main()
