"""PicTone — éditeur d'images local (pywebview + WebView2)."""

import base64
import os
import sys
import tempfile
import time
import traceback

import updater

APP_NAME = "PicTone"


# ---------------------------------------------------------------------------
# Chemins et version
# ---------------------------------------------------------------------------

def resource_path(*parts):
    """Chemin absolu d'une ressource embarquée (PyInstaller) ou du dépôt (dev)."""
    base = getattr(sys, "_MEIPASS", None) or os.path.dirname(os.path.abspath(__file__))
    return os.path.join(base, *parts)


def load_version():
    """Lit version.txt (embarqué ou local). Renvoie 'unknown' en cas d'échec."""
    try:
        with open(resource_path("version.txt"), "r", encoding="utf-8") as f:
            return f.read().strip() or "unknown"
    except OSError:
        return "unknown"


CURRENT_VERSION = load_version()


# ---------------------------------------------------------------------------
# Journalisation et affichage des erreurs
# ---------------------------------------------------------------------------

def _log_candidates():
    local = os.environ.get("LOCALAPPDATA")
    if local:
        yield os.path.join(local, APP_NAME, "logs")
    yield os.path.join(tempfile.gettempdir(), APP_NAME)


def log_error(msg):
    """Écrit dans crash_log.txt et renvoie le chemin du fichier (ou None)."""
    line = f"[{time.strftime('%Y-%m-%d %H:%M:%S')}] v{CURRENT_VERSION}\n{msg}\n"
    for directory in _log_candidates():
        try:
            os.makedirs(directory, exist_ok=True)
            path = os.path.join(directory, "crash_log.txt")
            with open(path, "a", encoding="utf-8") as f:
                f.write(line)
            return path
        except OSError:
            continue
    return None


def show_error(message):
    """Affiche une boîte de dialogue native (l'exe n'a pas de console)."""
    try:
        if sys.platform == "win32":
            import ctypes
            ctypes.windll.user32.MessageBoxW(0, message, APP_NAME, 0x10)  # MB_ICONERROR
            return
    except Exception:
        pass
    print(message, file=sys.stderr)


def report_crash(exc_text):
    log_path = log_error(exc_text)
    where = f"\n\nDétails : {log_path}" if log_path else ""
    show_error(f"{APP_NAME} a rencontré une erreur et doit se fermer.{where}")


# ---------------------------------------------------------------------------
# WebView2
# ---------------------------------------------------------------------------

WEBVIEW2_DOWNLOAD_URL = "https://go.microsoft.com/fwlink/p/?LinkId=2124703"
_WEBVIEW2_GUID = "{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}"


def is_webview2_installed():
    """Vérifie la présence du runtime WebView2 (toujours True hors Windows)."""
    if sys.platform != "win32":
        return True
    try:
        import winreg
    except ImportError:
        return True
    keys = (
        (winreg.HKEY_LOCAL_MACHINE, rf"SOFTWARE\WOW6432Node\Microsoft\EdgeUpdate\Clients\{_WEBVIEW2_GUID}"),
        (winreg.HKEY_LOCAL_MACHINE, rf"SOFTWARE\Microsoft\EdgeUpdate\Clients\{_WEBVIEW2_GUID}"),
        (winreg.HKEY_CURRENT_USER, rf"Software\Microsoft\EdgeUpdate\Clients\{_WEBVIEW2_GUID}"),
    )
    for hive, key in keys:
        try:
            with winreg.OpenKey(hive, key) as handle:
                version, _ = winreg.QueryValueEx(handle, "pv")
                if version and version != "0.0.0.0":
                    return True
        except OSError:
            continue
    return False


# ---------------------------------------------------------------------------
# API exposée au JavaScript (window.pywebview.api.*)
# ---------------------------------------------------------------------------

class PicToneAPI:
    def __init__(self):
        self.window = None
        self._update = {"available": False}

    def get_version(self):
        return CURRENT_VERSION

    def check_update(self):
        """Renvoie {'available': bool, 'version': str} (jamais d'exception)."""
        try:
            self._update = updater.check(CURRENT_VERSION)
        except Exception:
            log_error("Vérification de mise à jour :\n" + traceback.format_exc())
            self._update = {"available": False}
        return {"available": self._update["available"], "version": self._update.get("version", "")}

    def install_update(self):
        """Installe la mise à jour trouvée, puis ferme l'app (le script la relance)."""
        if not getattr(self, "_update", {}).get("available"):
            return {"ok": False, "error": "Aucune mise à jour disponible."}
        try:
            updater.install(self._update)
        except Exception as exc:
            log_error("Installation de mise à jour :\n" + traceback.format_exc())
            return {"ok": False, "error": str(exc)}
        if self.window is not None:
            self.window.destroy()
        return {"ok": True}

    def save_file(self, data_url, filename):
        """Ouvre la boîte « Enregistrer sous » et écrit l'image décodée."""
        if self.window is None:
            return False

        import webview

        ext = filename.rsplit(".", 1)[-1].lower() if "." in filename else "png"
        if ext == "jpg":
            ext = "jpeg"
        file_types = (f"Fichier {ext.upper()} (*.{ext})", "Tous les fichiers (*.*)")

        save_dialog = getattr(getattr(webview, "FileDialog", None), "SAVE", None)
        if save_dialog is None:
            save_dialog = webview.SAVE_DIALOG

        try:
            target = self.window.create_file_dialog(
                dialog_type=save_dialog, save_filename=filename, file_types=file_types
            )
            if isinstance(target, (list, tuple)):
                target = target[0] if target else None
            if not target:
                return False  # annulé par l'utilisateur

            _, encoded = data_url.split(",", 1)
            with open(target, "wb") as f:
                f.write(base64.b64decode(encoded))
            return True
        except Exception:
            log_error("Erreur lors de l'enregistrement :\n" + traceback.format_exc())
            return False


# ---------------------------------------------------------------------------
# Point d'entrée
# ---------------------------------------------------------------------------

def main():
    if not is_webview2_installed():
        show_error(
            "Le runtime Microsoft Edge WebView2 est requis pour lancer PicTone.\n\n"
            f"Installez-le depuis :\n{WEBVIEW2_DOWNLOAD_URL}"
        )
        return 1

    import webview

    api = PicToneAPI()
    api.window = webview.create_window(
        title=f"{APP_NAME}  —  v{CURRENT_VERSION}",
        url=resource_path("web", "index.html"),
        js_api=api,
        width=1300,
        height=820,
        min_size=(960, 640),
        resizable=True,
    )

    # http_server=True : évite les restrictions file:// de WebView2.
    # L'icône n'est passée que si le fichier existe (sinon WinForms plante).
    start_kwargs = {"http_server": True, "private_mode": False}
    icon_path = resource_path("pictone.ico")
    if os.path.isfile(icon_path):
        start_kwargs["icon"] = icon_path

    webview.start(**start_kwargs)
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except SystemExit:
        raise
    except BaseException:
        report_crash(traceback.format_exc())
        sys.exit(1)
