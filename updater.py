"""Mise à jour automatique de PicTone via les Releases GitHub (stdlib uniquement).

- Windows : l'installeur de la release est téléchargé, son empreinte SHA256 est vérifiée,
  puis lancé en silencieux. Il remplace l'app installée, et PicTone est relancé.
- macOS : le .dmg est téléchargé et vérifié, puis monté ; l'app qu'il contient remplace
  l'ancienne (dans le dossier où elle se trouve), et PicTone est relancé.
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
SETUP_PATTERN = re.compile(r"PicTone_v\d+(?:\.\d+){0,3}_Windows\.exe")
MAC_PATTERN = re.compile(r"PicTone_v\d+(?:\.\d+){0,3}_macOS\.dmg")
SUMS_NAME = "SHA256SUMS.txt"
CREATE_NEW_PROCESS_GROUP = 0x00000200
CREATE_NO_WINDOW = 0x08000000

# Journal des vérifications (fourni par pictone.py) : LOGGER(message).
LOGGER = None


def _log(message):
    if LOGGER is not None:
        try:
            LOGGER(message)
        except Exception:
            pass


def _parse(version):
    """'v3.0.1' -> (3, 0, 1) ; None si la version est illisible."""
    match = re.fullmatch(r"v?(\d+(?:\.\d+){0,3})", (version or "").strip())
    return tuple(int(p) for p in match.group(1).split(".")) if match else None


def _open(url):
    request = urllib.request.Request(url, headers={"User-Agent": "PicTone-updater"})
    return urllib.request.urlopen(request, timeout=TIMEOUT)


def _is_frozen():
    return bool(getattr(sys, "frozen", False))


def can_self_update():
    """Mise à jour par installeur : Windows, application figée."""
    return sys.platform == "win32" and _is_frozen()


def app_bundle_path():
    """Chemin du .app contenant l'exécutable courant (macOS), sinon None."""
    exe = os.path.abspath(sys.executable)  # .../PicTone.app/Contents/MacOS/PicTone
    bundle = os.path.dirname(os.path.dirname(os.path.dirname(exe)))
    return bundle if bundle.endswith(".app") else None


def can_update_macos():
    return sys.platform == "darwin" and _is_frozen() and app_bundle_path() is not None


def check(current_version):
    """Renvoie {'available': False} ou les infos de la version plus récente.

    Vérifié sur Windows et macOS, uniquement dans l'app figée (PyInstaller).
    """
    none = {"available": False}
    _log(f"Vérification (version installée : {current_version}, plateforme : {sys.platform}, figée : {_is_frozen()})")
    current = _parse(current_version)
    if current is None or not _is_frozen():
        _log("Vérification ignorée : version illisible ou application non figée.")
        return none
    try:
        with _open(LATEST_URL) as response:
            release = json.load(response)
    except (OSError, ValueError) as exc:
        _log(f"Erreur réseau ou réponse invalide : {exc}")
        return none
    if not isinstance(release, dict):
        _log("Réponse GitHub inattendue (pas un objet JSON).")
        return none

    latest = _parse(release.get("tag_name"))
    if latest is None:
        _log(f"Tag de release illisible : {release.get('tag_name')!r}")
        return none
    if latest <= current:
        _log(f"À jour (dernière release : {'.'.join(map(str, latest))}).")
        return {"available": False, "up_to_date": True, "version": ".".join(map(str, latest))}

    assets = {
        a.get("name", ""): a.get("browser_download_url", "")
        for a in (release.get("assets") or [])
        if isinstance(a, dict)
    }
    pattern = MAC_PATTERN if sys.platform == "darwin" else SETUP_PATTERN
    setup = next((name for name in assets if pattern.fullmatch(name)), None)
    sums = assets.get(SUMS_NAME)
    if not setup or not sums:
        _log(f"Release {latest} sans fichier attendu. Fichiers : {sorted(assets)}")
        return none
    # Sécurité : on ne télécharge que depuis les releases du dépôt.
    if not (assets[setup].startswith(DOWNLOAD_PREFIX) and sums.startswith(DOWNLOAD_PREFIX)):
        _log("URL de téléchargement hors du dépôt : refusée.")
        return none
    _log(f"Mise à jour disponible : {'.'.join(map(str, latest))} ({setup}).")
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


def _download_verified(update, destination):
    expected = _expected_hash(update["sums_url"], update["exe_name"])
    _log(f"Téléchargement de {update['exe_name']}…")
    if _download(update["exe_url"], destination) != expected:
        _log("Empreinte SHA256 différente : téléchargement rejeté.")
        raise RuntimeError("Le fichier téléchargé est corrompu (empreinte SHA256 différente).")
    _log("Empreinte vérifiée.")


def _batch_encoding():
    return "mbcs" if sys.platform == "win32" else "utf-8"


def update_log_path():
    """update.log, au même endroit que le journal de PicTone (les scripts y écrivent aussi)."""
    if sys.platform == "win32":
        base = os.environ.get("LOCALAPPDATA") or os.path.expanduser("~")
        return os.path.join(base, "PicTone", "logs", "update.log")
    if sys.platform == "darwin":
        return os.path.join(os.path.expanduser("~"), "Library", "Logs", "PicTone", "update.log")
    return os.path.join(tempfile.gettempdir(), "PicTone", "update.log")


# ---------------------------------------------------------------------------
# Windows : installeur silencieux
# ---------------------------------------------------------------------------

def _clean_pyinstaller_env():
    """Environnement du script de mise à jour, sans l'état PyInstaller de l'instance en cours.

    Le bootloader --onefile laisse dans l'environnement (_PYI_APPLICATION_HOME_DIR, _PYI_ARCHIVE_FILE…)
    le dossier _MEIxxxx qu'il a extrait. Le nouvel exe, installé au même chemin, se croirait alors un
    sous-processus de l'ancienne instance et chercherait python311.dll dans ce dossier, supprimé à la sortie
    (« Failed to load Python DLL »). PYINSTALLER_RESET_ENVIRONMENT=1 force une instance indépendante.
    """
    env = {k: v for k, v in os.environ.items() if not k.startswith("_PYI_") and k != "_MEIPASS2"}
    env["PYINSTALLER_RESET_ENVIRONMENT"] = "1"
    return env


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
    _download_verified(update, setup)

    pid = os.getpid()
    # Exécutable PyInstaller en mode fichier unique : le processus réel (pid) est un enfant du
    # bootloader (ppid), qui nettoie son dossier temporaire _MEI à sa sortie. On attend les deux.
    ppid = os.getppid() if getattr(sys, "_MEIPASS", None) else None
    exe_name = os.path.basename(current_exe)
    log_file = update_log_path()
    installer_log = os.path.join(os.path.dirname(log_file), "installer.txt")
    _log(f"Installation Windows : exe={current_exe}, dossier={app_dir}, pid={pid}, "
         f"dossier PyInstaller={getattr(sys, '_MEIPASS', None)}")
    _log(f"Installeur téléchargé : {setup} ; journal de l'installeur : {installer_log}")
    lines = [
        "@echo off",
        f'set "LOG={log_file}"',
        f'echo [%DATE% %TIME%] script : attente de la fermeture de PicTone (pid {pid})>>"%LOG%"',
        "set /a TRIES=0",
        ":wait",
        # Sans fenêtre : tasklist/find s'exécutent dans la console cachée du script (aucun terminal visible).
        f'tasklist /FI "PID eq {pid}" /NH 2>nul | find "{pid}" >nul',
        "if errorlevel 1 goto " + ("waitparent" if ppid else "run"),
        "set /a TRIES+=1",
        "if %TRIES% GEQ 240 goto timeout",
        "ping 127.0.0.1 -n 2 -w 500 >nul",
        "goto wait",
        ":waitparent",
    ] + ([
        f'tasklist /FI "PID eq {ppid}" /NH 2>nul | find "{ppid}" >nul',
        "if errorlevel 1 goto run",
        "set /a TRIES+=1",
        "if %TRIES% GEQ 240 goto timeout",
        "ping 127.0.0.1 -n 2 -w 500 >nul",
        "goto waitparent",
    ] if ppid else []) + [
        ":timeout",
        f'echo [%DATE% %TIME%] script : PicTone toujours ouvert apres 120 s, abandon>>"%LOG%"',
        "goto cleanup",
        ":run",
        # Délai de sécurité : Windows libère les fichiers du bootloader après la sortie.
        "ping 127.0.0.1 -n 3 -w 1000 >nul",
        # Messages sans accents : cmd les écrit dans sa page de codes, pas en UTF-8.
        f'echo [%DATE% %TIME%] script : PicTone ferme, lancement de l\'installeur>>"%LOG%"',
        f'"{setup}" /VERYSILENT /SUPPRESSMSGBOXES /NORESTART /DIR="{app_dir}" /LOG="{installer_log}"',
        f'echo [%DATE% %TIME%] script : installeur termine, code retour %ERRORLEVEL%>>"%LOG%"',
        "set /a TRY=0",
        ":launch",
        "set /a TRY+=1",
        "set PYINSTALLER_RESET_ENVIRONMENT=1",
        f'start "" "{current_exe}"',
        # Vérifie que le processus existe ; sinon (ex. extraction _MEI perturbée par l'antivirus), on réessaie.
        "ping 127.0.0.1 -n 5 -w 1000 >nul",
        f'tasklist /FI "IMAGENAME eq {exe_name}" /NH 2>nul | find /I "{exe_name}" >nul',
        "if not errorlevel 1 goto launched",
        f'echo [%DATE% %TIME%] script : PicTone ne demarre pas (essai %TRY%)>>"%LOG%"',
        "if %TRY% GEQ 3 goto cleanup",
        "ping 127.0.0.1 -n 4 -w 1000 >nul",
        "goto launch",
        ":launched",
        f'echo [%DATE% %TIME%] script : processus PicTone detecte (essai %TRY%) - ne prouve pas un demarrage reussi>>"%LOG%"',
        ":cleanup",
        'del /f /q "%~f0" >nul 2>&1',
    ]
    script = os.path.join(work_dir, "apply_update.bat")
    with open(script, "w", encoding=_batch_encoding(), newline="\r\n") as f:
        f.write("\n".join(lines) + "\n")
    _log(f"Script de remplacement : {script}")

    # Pas de DETACHED_PROCESS : il donnerait une fenêtre console à chaque commande du script.
    flags = CREATE_NEW_PROCESS_GROUP | CREATE_NO_WINDOW if sys.platform == "win32" else 0
    subprocess.Popen(["cmd", "/c", script], creationflags=flags, close_fds=True, env=_clean_pyinstaller_env())
    _log("Installeur lancé : PicTone va se fermer puis redémarrer.")


# ---------------------------------------------------------------------------
# macOS : remplacement du .app par celui du .dmg
# ---------------------------------------------------------------------------

def stage_macos_app(update, work_dir):
    """Télécharge et vérifie le .dmg, copie son PicTone.app dans work_dir et renvoie son chemin."""
    dmg = os.path.join(work_dir, update["exe_name"])
    _download_verified(update, dmg)

    mount = os.path.join(work_dir, "volume")
    os.makedirs(mount)
    subprocess.run(
        ["hdiutil", "attach", "-nobrowse", "-readonly", "-noverify", "-noautoopen", "-mountpoint", mount, dmg],
        check=True, capture_output=True,
    )
    try:
        source = os.path.join(mount, "PicTone.app")
        if not os.path.isdir(source):
            raise RuntimeError("Le .dmg ne contient pas PicTone.app.")
        staged = os.path.join(work_dir, "PicTone.app")
        subprocess.run(["ditto", source, staged], check=True)
    finally:
        subprocess.run(["hdiutil", "detach", mount, "-quiet"], check=False, capture_output=True)
    _log("Nouvelle version copiée et prête.")
    return staged


def install_macos(update):
    """Remplace l'app par la nouvelle version, puis la relance (sans passer par GitHub).

    Un script détaché attend la fermeture de cette app, remplace le .app (avec retour
    arrière en cas d'échec), relance PicTone puis supprime les fichiers temporaires.
    """
    if not can_update_macos():
        raise RuntimeError("La mise à jour automatique n'est disponible que dans l'application Mac.")
    app = app_bundle_path()
    parent = os.path.dirname(app)
    if not os.access(parent, os.W_OK):
        raise RuntimeError(f"PicTone ne peut pas être remplacé dans {parent}. Place-le dans Applications.")

    work = tempfile.mkdtemp(prefix="PicTone_update_")
    staged = stage_macos_app(update, work)
    backup = os.path.join(work, "previous.app")
    script = os.path.join(work, "apply_update.sh")
    log_file = update_log_path()
    pid = os.getpid()
    _log(f"Installation macOS : app={app}, pid={pid}, nouvelle version préparée={staged}")
    _log(f"Script de remplacement : {script} ; journal : {log_file}")
    with open(script, "w", encoding="utf-8") as f:
        f.write(
            "#!/bin/sh\n"
            # Le script survit à la fermeture de l'app : il ignore les signaux de session et journalise
            # chaque étape (update.log), pour qu'un échec soit visible.
            "trap '' HUP INT TERM\n"
            f'LOG="{log_file}"\n'
            'log() { mkdir -p "$(dirname "$LOG")" 2>/dev/null; echo "[$(date \'+%Y-%m-%d %H:%M:%S\')] script : $1" >> "$LOG"; }\n'
            f'log "démarrage, attente de la fermeture de PicTone (pid {pid})"\n'
            "waited=0\n"
            f"while kill -0 {pid} 2>/dev/null; do\n"
            "  sleep 0.2\n"  # sondage toutes les 200 ms : la relance suit la fermeture de PicTone de très près
            "  waited=$((waited + 1))\n"
            '  if [ "$waited" -ge 600 ]; then log "PicTone est toujours ouvert après 120 s : abandon"; exit 1; fi\n'
            "done\n"
            'log "PicTone fermé après $((waited / 5)) s environ, remplacement de l\'application"\n'
            f'if mv "{app}" "{backup}" 2>>"$LOG"; then\n'
            '  log "ancienne version mise de côté"\n'
            f'  if ditto "{staged}" "{app}" 2>>"$LOG"; then\n'
            '    log "nouvelle version installée"\n'
            "  else\n"
            '    log "échec de la copie : restauration de l\'ancienne version"\n'
            f'    rm -rf "{app}"\n'
            f'    mv "{backup}" "{app}" 2>>"$LOG"\n'
            "  fi\n"
            "else\n"
            '  log "échec : ancienne version impossible à déplacer"\n'
            "fi\n"
            f'if open "{app}" 2>>"$LOG"; then log "relance de PicTone demandée"; else log "échec de la relance"; fi\n'
            f'rm -rf "{work}"\n'
        )
    os.chmod(script, 0o700)
    subprocess.Popen(
        ["/bin/sh", script], start_new_session=True, close_fds=True,
        stdin=subprocess.DEVNULL, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
    )
    _log("Remplacement lancé : PicTone va redémarrer.")
