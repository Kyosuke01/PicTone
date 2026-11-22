"""Mise à jour automatique de PicTone via les Releases GitHub (stdlib uniquement)."""

import hashlib
import json
import os
import re
import subprocess
import sys
import tempfile
import urllib.request

REPO = "Kyosuke01/PicTone"
LATEST_URL = f"https://api.github.com/repos/{REPO}/releases/latest"
DOWNLOAD_PREFIX = f"https://github.com/{REPO}/releases/download/"
TIMEOUT = 10


def _parse(version):
    """'v3.0.1' -> (3, 0, 1) ; None si la version est illisible."""
    match = re.fullmatch(r"v?(\d+(?:\.\d+){0,3})", (version or "").strip())
    return tuple(int(p) for p in match.group(1).split(".")) if match else None


def _open(url):
    request = urllib.request.Request(url, headers={"User-Agent": "PicTone-updater"})
    return urllib.request.urlopen(request, timeout=TIMEOUT)


def can_self_update():
    return sys.platform == "win32" and getattr(sys, "frozen", False)


def check(current_version):
    """Renvoie {'available': bool, 'version': str, 'exe_url': str, 'sums_url': str}."""
    none = {"available": False}
    current = _parse(current_version)
    if current is None or not can_self_update():
        return none
    try:
        with _open(LATEST_URL) as response:
            release = json.load(response)
    except (OSError, ValueError):
        return none

    latest = _parse(release.get("tag_name"))
    if latest is None or latest <= current:
        return none

    assets = {a.get("name", ""): a.get("browser_download_url", "") for a in release.get("assets", [])}
    exe = next((n for n in assets if re.fullmatch(r"PicTone_v[\d.]+\.exe", n)), None)
    sums = assets.get("SHA256SUMS.txt")
    if not exe or not sums:
        return none
    if not (assets[exe].startswith(DOWNLOAD_PREFIX) and sums.startswith(DOWNLOAD_PREFIX)):
        return none
    return {"available": True, "version": ".".join(map(str, latest)),
            "exe_name": exe, "exe_url": assets[exe], "sums_url": sums}


def _expected_hash(sums_url, exe_name):
    with _open(sums_url) as response:
        for line in response.read().decode("utf-8", "replace").splitlines():
            digest, _, name = line.strip().partition("  ")
            if name == exe_name:
                return digest.lower()
    raise RuntimeError(f"Empreinte introuvable pour {exe_name}.")


def _download(url, destination):
    sha = hashlib.sha256()
    with _open(url) as response, open(destination, "wb") as out:
        for chunk in iter(lambda: response.read(1024 * 256), b""):
            sha.update(chunk)
            out.write(chunk)
    return sha.hexdigest()


def install(update):
    """Télécharge, vérifie, puis lance un script qui remplace l'exe et relance l'app.

    Lève une exception en cas d'échec ; l'appelant doit fermer l'application si tout va bien.
    """
    if not can_self_update():
        raise RuntimeError("La mise à jour automatique n'est disponible que dans l'application Windows.")

    current_exe = os.path.abspath(sys.executable)
    target_exe = os.path.join(os.path.dirname(current_exe), update["exe_name"])
    work_dir = tempfile.mkdtemp(prefix="PicTone_update_")
    downloaded = os.path.join(work_dir, update["exe_name"])

    expected = _expected_hash(update["sums_url"], update["exe_name"])
    if _download(update["exe_url"], downloaded) != expected:
        raise RuntimeError("Le fichier téléchargé est corrompu (empreinte SHA256 différente).")

    # Copie dans le dossier de l'app avant de quitter : si l'écriture est refusée, on le sait ici.
    staged = target_exe + ".new"
    with open(downloaded, "rb") as src, open(staged, "wb") as dst:
        dst.write(src.read())
    os.replace(staged, target_exe)

    script = os.path.join(work_dir, "apply_update.bat")
    with open(script, "w", encoding="mbcs", newline="\r\n") as f:
        f.write(
            "@echo off\n"
            "set PYINSTALLER_RESET_ENVIRONMENT=1\n"
            ":wait\n"
            "ping 127.0.0.1 -n 2 >nul\n"
            f'if /I not "{current_exe}"=="{target_exe}" del /f /q "{current_exe}" >nul 2>&1\n'
            f'if /I not "{current_exe}"=="{target_exe}" if exist "{current_exe}" goto wait\n'
            f'start "" "{target_exe}"\n'
            'del /f /q "%~f0" >nul 2>&1\n'
        )
    subprocess.Popen(
        ["cmd", "/c", script],
        creationflags=0x00000008 | 0x00000200 | 0x08000000,  # DETACHED | NEW_GROUP | NO_WINDOW
        close_fds=True,
    )
