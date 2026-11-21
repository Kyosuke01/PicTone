import os
import sys
import time
import base64
import webview  # type: ignore[import-untyped]


# ---------------------------------------------------------------------------
# Error Logging
# ---------------------------------------------------------------------------

def log_error(msg):
    """Writes error messages to a crash log in LOCALAPPDATA."""
    try:
        local = os.environ.get("LOCALAPPDATA", os.path.expanduser("~"))
        log_dir = os.path.join(local, "PicTone", "logs")
        os.makedirs(log_dir, exist_ok=True)
        log_file = os.path.join(log_dir, "crash_log.txt")
        with open(log_file, "a", encoding="utf-8") as f:
            f.write(f"[{time.strftime('%Y-%m-%d %H:%M:%S')}] {msg}\n")
    except Exception:
        pass


# ---------------------------------------------------------------------------
# Version
# ---------------------------------------------------------------------------

def load_version():
    """Reads the version from version.txt (bundled or in workspace)."""
    try:
        if hasattr(sys, "_MEIPASS"):
            base_path = getattr(sys, "_MEIPASS")
        else:
            base_path = os.path.dirname(os.path.abspath(__file__))
        version_path = os.path.join(base_path, "version.txt")
        if os.path.exists(version_path):
            with open(version_path, "r", encoding="utf-8") as f:
                return f.read().strip()
    except Exception:
        pass
    return "unknown"

CURRENT_VERSION = load_version()


# ---------------------------------------------------------------------------
# Paths
# ---------------------------------------------------------------------------

def get_resource_path(relative_path):
    """Returns absolute path for a bundled resource (PyInstaller or dev)."""
    if hasattr(sys, "_MEIPASS"):
        base_path = getattr(sys, "_MEIPASS")
    else:
        base_path = os.path.dirname(os.path.abspath(__file__))
    return os.path.join(base_path, relative_path)


# ---------------------------------------------------------------------------
# Python API exposed to JavaScript via pywebview
# ---------------------------------------------------------------------------

class PicToneAPI:
    """Methods callable from JavaScript via window.pywebview.api.<method>()"""

    def __init__(self):
        self.window = None

    def get_version(self):
        return CURRENT_VERSION

    def save_file(self, data_url, filename):
        if not self.window:
            return False
        
        # Determine file type filter based on extension
        file_ext = filename.split(".")[-1].lower() if "." in filename else "png"
        if file_ext == "jpg":
            file_ext = "jpeg"
        
        file_types = (f"Fichier {file_ext.upper()} (*.{file_ext})", "Tous les fichiers (*.*)")
        
        # Open native save file dialog
        file_path = self.window.create_file_dialog(
            dialog_type=webview.SAVE_DIALOG,
            save_filename=filename,
            file_types=file_types
        )
        
        if not file_path:
            # User cancelled the dialog
            return False

        if isinstance(file_path, (list, tuple)):
            if len(file_path) > 0:
                file_path = file_path[0]
            else:
                return False
            
        try:
            # Parse base64 data URL
            header, base64_data = data_url.split(",", 1)
            file_bytes = base64.b64decode(base64_data)
            
            # Write to selected file path
            with open(file_path, "wb") as f:
                f.write(file_bytes)
            return True
        except Exception as e:
            log_error(f"Error saving file via native dialog: {str(e)}")
            return False


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main():
    # Docker / headless mode kept for legacy CI compatibility
    running_in_docker = os.environ.get("RUNNING_IN_DOCKER") == "true"
    if running_in_docker:
        print("PicTone: mode Docker détecté — fenêtre native non disponible.")
        print("Utilisez l'image Docker pour un accès via navigateur.")
        return

    index_path = get_resource_path(os.path.join("web", "index.html"))

    api = PicToneAPI()

    icon_path = get_resource_path("pictone.ico")

    window = webview.create_window(
        title=f"PicTone  —  v{CURRENT_VERSION}",
        url=index_path,
        js_api=api,
        width=1300,
        height=820,
        min_size=(960, 640),
        resizable=True,
    )

    api.window = window

    # http_server=True est requis pour que WebView2 charge correctement
    # les fichiers locaux (CSS, JS, images) sans erreur de sécurité file://
    # icon= applique l'icône de la fenêtre native (barre de titre + barre des tâches)
    webview.start(http_server=True, private_mode=False, icon=icon_path)

    # Quand webview.start() retourne, la fenêtre a été fermée — on quitte proprement
    os._exit(0)


if __name__ == "__main__":
    try:
        main()
    except Exception as e:
        import traceback
        log_error("CRASH IN __main__:\n" + traceback.format_exc())
