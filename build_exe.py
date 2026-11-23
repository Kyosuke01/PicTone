"""Compile PicTone pour l'OS courant, dans build_portable/.

- Windows : PicTone_vX.Y.Z.exe (exécutable portable, source de l'installeur).
- macOS   : PicTone_vX.Y.Z.app (application, packagée en .dmg par le workflow de release).

Usage : python build_exe.py
"""

import os
import shutil
import subprocess
import sys

from build_common import APP_NAME, ROOT, get_version, version_tuple

OUT_DIR = ROOT / "build_portable"
VERSION_INFO_FILE = ROOT / "file_version_info.txt"
ICNS_FILE = ROOT / "pictone.icns"


def version_info_text(version):
    """Ressource de version Windows (propriétés du fichier .exe)."""
    vt = version_tuple(version)
    return f"""# UTF-8
VSVersionInfo(
  ffi=FixedFileInfo(
    filevers={vt}, prodvers={vt},
    mask=0x3f, flags=0x0, OS=0x40004, fileType=0x1, subtype=0x0, date=(0, 0)
  ),
  kids=[
    StringFileInfo([StringTable('040904B0', [
      StringStruct('CompanyName', '{APP_NAME}'),
      StringStruct('FileDescription', "{APP_NAME} - Editeur d'images local"),
      StringStruct('FileVersion', '{version}'),
      StringStruct('InternalName', '{APP_NAME}'),
      StringStruct('LegalCopyright', 'Copyright (c) 2026 {APP_NAME}'),
      StringStruct('OriginalFilename', '{APP_NAME}_v{version}.exe'),
      StringStruct('ProductName', '{APP_NAME}'),
      StringStruct('ProductVersion', '{version}')])]),
    VarFileInfo([VarStruct('Translation', [1033, 1200])])
  ]
)
"""


def write_version_info(version):
    VERSION_INFO_FILE.write_text(version_info_text(version), encoding="utf-8")
    return VERSION_INFO_FILE


def make_icns(source, target):
    """Génère l'icône macOS (.icns) à partir du .ico."""
    from PIL import Image

    Image.open(source).convert("RGBA").save(target, format="ICNS")
    return target


def pyinstaller_command(name, platform=None, sep=None):
    """Commande PyInstaller pour la plateforme donnée (par défaut : l'OS courant)."""
    platform = sys.platform if platform is None else platform
    sep = os.pathsep if sep is None else sep
    data = ["--add-data", f"web{sep}web", "--add-data", f"version.txt{sep}."]
    base = [
        sys.executable, "-m", "PyInstaller", "--noconfirm",
        "--name", name, "--distpath", str(OUT_DIR), "--collect-all", "webview",
    ]
    if platform == "win32":
        return base + [
            "--noconsole", "--onefile", "--icon", "pictone.ico", *data,
            "--add-data", f"pictone.ico{sep}.",
            "--version-file", str(VERSION_INFO_FILE),
            "--hidden-import", "webview.platforms.winforms",
            "--hidden-import", "clr_loader",
            "--hidden-import", "pythonnet",
            "pictone.py",
        ]
    if platform == "darwin":
        return base + [
            "--windowed", "--onedir", "--icon", "pictone.icns", *data,
            "--hidden-import", "webview.platforms.cocoa",
            "--osx-bundle-identifier", "fr.kyo.pictone",
            "pictone.py",
        ]
    raise ValueError(f"Plateforme non prise en charge : {platform}")


def artifact_path(name, platform=None):
    platform = sys.platform if platform is None else platform
    return OUT_DIR / (f"{name}.app" if platform == "darwin" else f"{name}.exe")


def cleanup(name):
    VERSION_INFO_FILE.unlink(missing_ok=True)
    (ROOT / f"{name}.spec").unlink(missing_ok=True)
    shutil.rmtree(ROOT / "build", ignore_errors=True)


def main():
    version = get_version()
    name = f"{APP_NAME}_v{version}"
    os.chdir(ROOT)

    try:
        import PyInstaller  # noqa: F401
    except ImportError:
        sys.exit("PyInstaller est introuvable : pip install -r requirements.txt")

    OUT_DIR.mkdir(exist_ok=True)
    if sys.platform == "win32":
        write_version_info(version)
        subprocess.run(["taskkill", "/F", "/IM", f"{name}.exe"],
                       stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    elif sys.platform == "darwin":
        make_icns(ROOT / "pictone.ico", ICNS_FILE)

    try:
        subprocess.run(pyinstaller_command(name), check=True)
    except subprocess.CalledProcessError as e:
        sys.exit(f"Échec de PyInstaller (code {e.returncode}).")
    finally:
        cleanup(name)

    print(f"\nBuild terminé : {artifact_path(name)}")


if __name__ == "__main__":
    main()
