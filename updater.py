"""Mise à jour automatique de PicTone via les Releases GitHub (stdlib uniquement).

Windows uniquement : l'installeur de la dernière release est téléchargé, son empreinte
SHA256 est vérifiée, puis il est lancé en silencieux pour remplacer la version installée.
"""

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
SETUP_PATTERN = re.compile(r"PicTone_v\d+(?:\.\d+){0,3}\.exe")
SUMS_NAME = "SHA256SUMS.txt"
DETACHED_PROCESS = 0x00000008
CREATE_NEW_PROCESS_GROUP = 0x00000200
CREATE_NO_WINDOW = 0x08000000


def _parse(version):
    """'v3.0.1' -> (3, 0, 1) ; None si la version est illisible."""
    match = re.fullmatch(r"v?(\d+(?:\.\d+){0,3})", (version or "").strip())
    return tuple(int(p) for p in match.group(1).split(".")) if match else None


def _open(url):
    request = urllib.request.Request(url, headers={"User-Agent": "PicTone-updater"})
    return urllib.request.urlopen(request, timeout=TIMEOUT)


def can_self_update():
    return sys.platform == "win32" and bool(getattr(sys, "frozen", False))


def check(current_version):
    """Renvoie {'available': False} ou les infos de la version plus récente."""
    none = {"available": False}
    current = _parse(current_version)
    if current is None or not can_self_update():
        return none
    try:
        with _open(LATEST_URL) as response:
            release = json.load(response)
    except (OSError, ValueError):
        return none
    if not isinstance(release, dict):
        return none

    latest = _parse(release.get("tag_name"))
    if latest is None or latest <= current:
        return none

    assets = {
        a.get("name", ""): a.get("browser_download_url", "")
        for a in (release.get("assets") or [])
        if isinstance(a, dict)
    }
    setup = next((name for name in assets if SETUP_PATTERN.fullmatch(name)), None)
    sums = assets.get(SUMS_NAME)
    if not setup or not sums:
        return none
    # Sécurité : on ne télécharge que depuis les releases du dépôt.
    if not (assets[setup].startswith(DOWNLOAD_PREFIX) and sums.startswith(DOWNLOAD_PREFIX)):
        return none
    return {
        "available": True,
        "version": ".".join(map(str, latest)),
        "exe_name": setup,
        "exe_url": assets[setup],
        "sums_url": sums,
    }


def _expected_hash(sums_url, exe_name):
    """Lit SHA256SUMS.txt et renvoie l'empreinte (minuscules) de exe_name."""
    with _open(sums_url) as response:
        for line in response.read().decode("utf-8", "replace").splitlines():
            digest, _, name = line.strip().partition("  ")
            if name == exe_name:
                return digest.lower()
    raise RuntimeError(f"Empreinte introuvable pour {exe_name}.")


def _download(url, destination):
    """Télécharge url vers destination et renvoie le SHA256 du contenu."""
    sha = hashlib.sha256()
    with _open(url) as response, open(destination, "wb") as out:
        for chunk in iter(lambda: response.read(256 * 1024), b""):
            sha.update(chunk)
            out.write(chunk)
    return sha.hexdigest()


def _batch_encoding():
    return "mbcs" if sys.platform == "win32" else "utf-8"


def install(update):
    """Télécharge l'installeur, vérifie son empreinte, puis le lance en silencieux.

    Le script détaché attend la fermeture de cette app (l'installeur ne peut pas remplacer
    un exe ouvert), lance l'installeur dans le même dossier, puis relance PicTone.
    Lève une exception si le téléchargement ou la vérification échoue.
    """
    if not can_self_update():
        raise RuntimeError("La mise à jour automatique n'est disponible que dans l'application Windows.")

    current_exe = os.path.abspath(sys.executable)
    app_dir = os.path.dirname(current_exe)
    work_dir = tempfile.mkdtemp(prefix="PicTone_update_")
    setup = os.path.join(work_dir, update["exe_name"])

    expected = _expected_hash(update["sums_url"], update["exe_name"])
    if _download(update["exe_url"], setup) != expected:
        raise RuntimeError("Le fichier téléchargé est corrompu (empreinte SHA256 différente).")

    pid = os.getpid()
    lines = [
        "@echo off",
        ":wait",
        f'tasklist /FI "PID eq {pid}" | find "{pid}" >nul',
        "if errorlevel 1 goto run",
        "ping 127.0.0.1 -n 2 >nul",
        "goto wait",
        ":run",
        f'"{setup}" /VERYSILENT /SUPPRESSMSGBOXES /NORESTART /DIR="{app_dir}"',
        f'start "" "{current_exe}"',
        'del /f /q "%~f0" >nul 2>&1',
    ]
    script = os.path.join(work_dir, "apply_update.bat")
    with open(script, "w", encoding=_batch_encoding(), newline="\r\n") as f:
        f.write("\n".join(lines) + "\n")

    flags = DETACHED_PROCESS | CREATE_NEW_PROCESS_GROUP | CREATE_NO_WINDOW if sys.platform == "win32" else 0
    subprocess.Popen(["cmd", "/c", script], creationflags=flags, close_fds=True)
