"""Compile PicTone en un exécutable Windows autonome (PyInstaller).

Usage : python build_exe.py  ->  build_portable/PicTone_v<version>.exe (étape intermédiaire)
"""

import os
import shutil
import subprocess
import sys

from build_common import APP_NAME, ROOT, get_version, version_tuple

DIST_DIR = ROOT / "build_portable"  # intermédiaire : l'installeur est la seule sortie publiée
VERSION_INFO_FILE = ROOT / "file_version_info.txt"


def write_version_info(version):
    """Génère la ressource de version Windows (propriétés du .exe)."""
    vt = version_tuple(version)
    VERSION_INFO_FILE.write_text(
        f"""# UTF-8
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
""",
        encoding="utf-8",
    )


def pyinstaller_command(name):
    sep = os.pathsep  # ';' sous Windows, ':' ailleurs
    return [
        sys.executable, "-m", "PyInstaller",
        "--noconfirm", "--noconsole", "--onefile",
        "--name", name,
        "--icon", "pictone.ico",
        "--add-data", f"web{sep}web",
        "--add-data", f"version.txt{sep}.",
        "--add-data", f"pictone.ico{sep}.",  # icône de la fenêtre (chargée à l'exécution)
        "--version-file", str(VERSION_INFO_FILE),
        "--distpath", str(DIST_DIR),
        "--hidden-import", "webview.platforms.winforms",
        "--hidden-import", "clr_loader",
        "--hidden-import", "pythonnet",
        "--collect-all", "webview",
        "pictone.py",
    ]


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

    DIST_DIR.mkdir(exist_ok=True)
    if sys.platform == "win32":  # évite WinError 5 si l'exe tourne encore
        subprocess.run(["taskkill", "/F", "/IM", f"{name}.exe"],
                       stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)

    write_version_info(version)
    try:
        subprocess.run(pyinstaller_command(name), check=True)
    except subprocess.CalledProcessError as e:
        sys.exit(f"Échec de PyInstaller (code {e.returncode}).")
    finally:
        cleanup(name)

    print(f"\nBuild terminé : {DIST_DIR / (name + '.exe')}")


if __name__ == "__main__":
    main()
