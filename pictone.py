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

def get_marker_path():
    """Returns the path of the install marker file in LOCALAPPDATA."""
    local = os.environ.get("LOCALAPPDATA", os.path.expanduser("~"))
    return os.path.join(local, "PicTone", ".installed")


# ---------------------------------------------------------------------------
# Desktop shortcut
# ---------------------------------------------------------------------------

def create_desktop_shortcut(exe_path, force=False):
    """Creates (or updates) the PicTone shortcut on the Desktop."""
    try:
        import win32com.client
        desktop = os.path.join(os.path.expanduser("~"), "Desktop")
        shortcut_path = os.path.join(desktop, "PicTone.lnk")
        if os.path.exists(shortcut_path) and not force:
            return
        shell = win32com.client.Dispatch("WScript.Shell")
        shortcut = shell.CreateShortcut(shortcut_path)
        shortcut.TargetPath = exe_path
        shortcut.WorkingDirectory = os.path.dirname(exe_path)
        shortcut.Description = "PicTone — Éditeur d'images local"
        shortcut.IconLocation = exe_path + ",0"
        shortcut.save()
    except Exception:
        pass


# ---------------------------------------------------------------------------
# Installer API (exposed to JS via pywebview)
# ---------------------------------------------------------------------------

class InstallerAPI:
    def __init__(self):
        self._window = None  # Set after webview window creation

    # ── Getters ──────────────────────────────────────────────────────────────

    def get_version(self):
        return CURRENT_VERSION

    def get_default_path(self):
        local = os.environ.get("LOCALAPPDATA", os.path.expanduser("~"))
        return local  # User picks the parent; installer always creates \PicTone inside


    def get_installed_info(self):
        marker = get_marker_path()
        if os.path.exists(marker):
            try:
                with open(marker, "r", encoding="utf-8") as f:
                    return json.load(f)
            except Exception:
                pass
        return None

    def get_installed_dir(self):
        """Returns the PARENT directory of the PicTone install folder (for the update field)."""
        info = self.get_installed_info()
        if info and "install_path" in info:
            pictone_dir = os.path.dirname(info["install_path"])  # e.g. AppData\Local\PicTone
            return os.path.dirname(pictone_dir)                  # e.g. AppData\Local
        return self.get_default_path()

    # ── Folder dialog ─────────────────────────────────────────────────────────

    def browse_folder(self):
        import webview
        result = self._window.create_file_dialog(webview.FOLDER_DIALOG)
        if result and len(result) > 0:
            return result[0]
        return None

    # ── Install ───────────────────────────────────────────────────────────────

    def install(self, parent_dir):
        try:
            current_exe = get_exe_path()
            exe_name = os.path.basename(current_exe)

            # Always install inside a 'PicTone' subfolder of the chosen parent
            install_dir = os.path.join(parent_dir, "PicTone")

            # Create installation directory structure
            os.makedirs(install_dir, exist_ok=True)
            os.makedirs(os.path.join(install_dir, "exports"), exist_ok=True)
            os.makedirs(os.path.join(install_dir, "logs"), exist_ok=True)

            # Copy the executable
            dest_exe = os.path.join(install_dir, exe_name)
            shutil.copy2(current_exe, dest_exe)

            # Write default config
            config = {
                "version": CURRENT_VERSION,
                "theme": "dark",
                "language": "fr",
                "export_folder": os.path.join(install_dir, "exports"),
            }
            with open(os.path.join(install_dir, "config.json"), "w", encoding="utf-8") as f:
                json.dump(config, f, indent=2, ensure_ascii=False)

            # Create desktop shortcut pointing to the installed copy
            create_desktop_shortcut(dest_exe, force=False)

            # Write install marker
            marker = get_marker_path()
            os.makedirs(os.path.dirname(marker), exist_ok=True)
            with open(marker, "w", encoding="utf-8") as f:
                json.dump({"version": CURRENT_VERSION, "install_path": dest_exe}, f)

            return {"success": True, "exe_path": dest_exe}
        except Exception as e:
            return {"success": False, "error": str(e)}

    # ── Update ────────────────────────────────────────────────────────────────

    def update(self, parent_dir):
        try:
            current_exe = get_exe_path()
            exe_name = os.path.basename(current_exe)

            old_info = self.get_installed_info()

            # Always update inside a 'PicTone' subfolder of the chosen parent
            install_dir = os.path.join(parent_dir, "PicTone")
            os.makedirs(install_dir, exist_ok=True)

            # Copy new exe
            dest_exe = os.path.join(install_dir, exe_name)
            shutil.copy2(current_exe, dest_exe)

            # Remove old exe if it differs
            if old_info and old_info.get("install_path") and old_info["install_path"] != dest_exe:
                old_exe = old_info["install_path"]
                if os.path.exists(old_exe):
                    try:
                        os.remove(old_exe)
                    except Exception:
                        pass

            # Update desktop shortcut
            create_desktop_shortcut(dest_exe, force=True)

            # Update install marker
            marker = get_marker_path()
            with open(marker, "w", encoding="utf-8") as f:
                json.dump({"version": CURRENT_VERSION, "install_path": dest_exe}, f)

            return {"success": True, "exe_path": dest_exe}
        except Exception as e:
            return {"success": False, "error": str(e)}

    # ── Actions ───────────────────────────────────────────────────────────────

    def launch_and_exit(self, exe_path):
        """Launch the installed exe and close the installer."""
        try:
            subprocess.Popen([exe_path])
        except Exception:
            pass
        self._window.destroy()
        os._exit(0)

    def cancel(self):
        """Close the installer without doing anything."""
        self._window.destroy()
        os._exit(0)


# ---------------------------------------------------------------------------
# Installer window (pywebview)
# ---------------------------------------------------------------------------

def run_installer_window():
    """Opens the installation wizard in a native WebView2 window."""
    try:
        import webview
    except Exception as e:
        import traceback
        log_error("Exception importing webview:\n" + traceback.format_exc())
        return  # pywebview unavailable — skip installer

    try:
        api = InstallerAPI()
        html_path = get_resource_path("installer.html")

        # Load HTML as string so relative paths are not an issue
        try:
            with open(html_path, "r", encoding="utf-8") as f:
                html_content = f.read()
        except Exception as e:
            log_error(f"Error loading installer HTML: {e}")
            return  # Can't load installer HTML — skip

        window = webview.create_window(
            "PicTone — Installation",
            html=html_content,
            js_api=api,
            width=520,
            height=480,
            resizable=False,
            frameless=True,
            background_color="#0c0b10",
            on_top=True,
        )
        api._window = window
        webview.start()
    except Exception as e:
        import traceback
        log_error("CRASH IN run_installer_window:\n" + traceback.format_exc())


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

    # Show installer wizard only when we are NOT already the installed exe.
    # This prevents the installed copy from re-triggering the installer on launch.
    if getattr(sys, "frozen", False) and not running_in_docker:
        marker = get_marker_path()
        is_installed_exe = False
        if os.path.exists(marker):
            try:
                with open(marker, "r", encoding="utf-8") as f:
                    info = json.load(f)
                installed_path = info.get("install_path", "")
                current_path = get_exe_path()
                is_installed_exe = (
                    os.path.normcase(os.path.abspath(installed_path))
                    == os.path.normcase(os.path.abspath(current_path))
                )
            except Exception:
                pass

        if not is_installed_exe:
            # We are the downloaded launcher → show installer / updater
            run_installer_window()
            # run_installer_window() calls os._exit() on completion;
            # execution only reaches here if pywebview was unavailable.

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
