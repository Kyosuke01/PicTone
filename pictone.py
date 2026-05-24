import os
import sys
import time
import socket
import webbrowser
import threading
import http.server
import socketserver
import mimetypes
import pystray
from PIL import Image

CURRENT_VERSION = "2.0.0"

# Fix potential MIME type issues on Windows machines
mimetypes.init()
mimetypes.add_type('application/javascript', '.js')
mimetypes.add_type('text/css', '.css')
mimetypes.add_type('image/svg+xml', '.svg')

# Find a free port
def find_free_port():
    s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    s.bind(('127.0.0.1', 0))
    port = s.getsockname()[1]
    s.close()
    return port

# Determine base path for resource files (supports PyInstaller bundle extraction path)
def get_resource_path(relative_path):
    try:
        # PyInstaller temp folder
        base_path = sys._MEIPASS
    except Exception:
        base_path = os.path.dirname(os.path.abspath(__file__))
    return os.path.join(base_path, relative_path)

class CustomHandler(http.server.SimpleHTTPRequestHandler):
    def log_message(self, format, *args):
        # Mute logging to keep stdout clean
        pass

    def do_GET(self):
        if self.path == '/api/version':
            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.send_header('Access-Control-Allow-Origin', '*')
            self.end_headers()
            self.wfile.write(f'{{"version": "{CURRENT_VERSION}"}}'.encode('utf-8'))
        else:
            # Fallback to serving static files
            super().do_GET()

def setup_tray(port, server):
    # Load favicon.ico from web folder
    try:
        icon_path = get_resource_path(os.path.join('web', 'favicon.ico'))
        image = Image.open(icon_path)
    except Exception:
        # Fallback to a solid blue square if icon fails to load
        image = Image.new('RGB', (64, 64), color=(0, 122, 204))

    def on_open(icon, item):
        url = f"http://127.0.0.1:{port}/"
        webbrowser.open(url)

    def on_exit(icon, item):
        icon.stop()
        # Shutdown server in a thread to prevent deadlock
        threading.Thread(target=server.shutdown).start()
        os._exit(0)

    menu = pystray.Menu(
        pystray.MenuItem('Ouvrir PicTone', on_open, default=True),
        pystray.MenuItem('Quitter', on_exit)
    )

    icon = pystray.Icon(
        "pictone",
        image,
        title="PicTone",
        menu=menu
    )
    
    icon.run()

def main():
    # Detect if running in Docker container
    running_in_docker = os.environ.get("RUNNING_IN_DOCKER") == "true"
    
    if running_in_docker:
        host = '0.0.0.0'
        port = int(os.environ.get("PORT", 8000))
    else:
        host = '127.0.0.1'
        port = find_free_port()
        
    web_dir = get_resource_path('web')
    
    # Configure custom handler to point to our static assets directory
    class SafeHandler(CustomHandler):
        def __init__(self, *args, **kwargs):
            super().__init__(*args, directory=web_dir, **kwargs)

    # Create the TCP server
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
        # Run HTTP server in a background thread
        server_thread = threading.Thread(target=server.serve_forever, daemon=True)
        server_thread.start()
        
        # Open browser automatically in a background thread
        url = f"http://127.0.0.1:{port}/"
        threading.Thread(target=lambda: (time.sleep(0.5), webbrowser.open(url)), daemon=True).start()
        
        # Start system tray icon (blocks main thread)
        setup_tray(port, server)

if __name__ == "__main__":
    main()
