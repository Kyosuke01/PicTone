import os
import sys
import time
import json
import shutil
import socket
import subprocess
import webbrowser
import threading
import http.server
import socketserver
import mimetypes
import pystray
from PIL import Image



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
        try:
            base_path = sys._MEIPASS
        except AttributeError:
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

def get_exe_path():
    """Returns the path of the running .exe (or script in dev mode)."""
    if getattr(sys, 'frozen', False):
        return sys.executable
    return os.path.abspath(__file__)

def get_resource_path(relative_path):
    """Returns absolute path for a bundled resource (PyInstaller or dev)."""
    try:
        base_path = sys._MEIPASS
    except AttributeError:
        base_path = os.path.dirname(os.path.abspath(__file__))
    return os.path.join(base_path, relative_path)





# ---------------------------------------------------------------------------
# MIME types
# ---------------------------------------------------------------------------

mimetypes.init()
mimetypes.add_type("application/javascript", ".js")
mimetypes.add_type("text/css", ".css")
mimetypes.add_type("image/svg+xml", ".svg")


# ---------------------------------------------------------------------------
# HTTP server
# ---------------------------------------------------------------------------

def find_free_port():
    s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    s.bind(("127.0.0.1", 0))
    port = s.getsockname()[1]
    s.close()
    return port


class CustomHandler(http.server.SimpleHTTPRequestHandler):
    def log_message(self, format, *args):
        pass  # Silence HTTP logs

    def do_GET(self):
        if self.path == "/api/version":
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.send_header("Access-Control-Allow-Origin", "*")
            self.end_headers()
            self.wfile.write(f'{{"version": "{CURRENT_VERSION}"}}'.encode("utf-8"))
        else:
            super().do_GET()


# ---------------------------------------------------------------------------
# System tray
# ---------------------------------------------------------------------------

def setup_tray(port, server):
    try:
        icon_path = get_resource_path(os.path.join("web", "favicon.ico"))
        image = Image.open(icon_path)
    except Exception:
        image = Image.new("RGB", (64, 64), color=(0, 122, 204))

    def on_open(icon, item):
        webbrowser.open(f"http://127.0.0.1:{port}/")

    def on_exit(icon, item):
        icon.stop()
        threading.Thread(target=server.shutdown).start()
        os._exit(0)

    menu = pystray.Menu(
        pystray.MenuItem("Ouvrir PicTone", on_open, default=True),
        pystray.MenuItem("Quitter", on_exit),
    )
    icon = pystray.Icon("pictone", image, title="PicTone", menu=menu)
    icon.run()


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main():
    running_in_docker = os.environ.get("RUNNING_IN_DOCKER") == "true"

    if running_in_docker:
        host = "0.0.0.0"
        port = int(os.environ.get("PORT", 8000))
    else:
        host = "127.0.0.1"
        port = find_free_port()

    web_dir = get_resource_path("web")

    class SafeHandler(CustomHandler):
        def __init__(self, *args, **kwargs):
            super().__init__(*args, directory=web_dir, **kwargs)

    socketserver.TCPServer.allow_reuse_address = True
    server = socketserver.TCPServer((host, port), SafeHandler)

    if running_in_docker:
        print(f"PicTone est en cours d'exécution dans Docker.")
        print(f"Ouvrez votre navigateur sur : http://localhost:{port}")
        try:
            server.serve_forever()
        except KeyboardInterrupt:
            pass
        finally:
            server.server_close()
    else:
        server_thread = threading.Thread(target=server.serve_forever, daemon=True)
        server_thread.start()

        url = f"http://127.0.0.1:{port}/"
        threading.Thread(target=lambda: (time.sleep(0.5), webbrowser.open(url)), daemon=True).start()

        setup_tray(port, server)


if __name__ == "__main__":
    try:
        main()
    except Exception as e:
        import traceback
        log_error("CRASH IN __main__:\n" + traceback.format_exc())
