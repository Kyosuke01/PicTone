import os
import sys
import re
import shutil
import subprocess

def get_version():
    """Reads the version from version.txt"""
    version_file = "version.txt"
    if not os.path.exists(version_file):
        print(f"Error: {version_file} not found. Please create it with the version (e.g. 2.0.0)")
        sys.exit(1)
    with open(version_file, "r", encoding="utf-8") as f:
        return f.read().strip()

def sync_versions(version):
    """Synchronizes version across files: web/index.html"""
    print(f"Syncing version {version} in project files...")
    
    # Update web/index.html
    html_path = os.path.join("web", "index.html")
    if os.path.exists(html_path):
        with open(html_path, "r", encoding="utf-8") as f:
            content = f.read()
            
        # Replace <span id="current-version-text">...</span>
        new_content = re.sub(
            r'<span id="current-version-text">[^<]+</span>',
            f'<span id="current-version-text">{version}</span>',
            content
        )
        if content != new_content:
            with open(html_path, "w", encoding="utf-8", newline="\n") as f:
                f.write(new_content)
            print(f"  -> Updated version in {html_path}")
        else:
            print(f"  -> Version already up-to-date in {html_path}")
    else:
        print(f"  -> Warning: {html_path} not found!")

def parse_version_tuple(version_str):
    """Converts '2.0.0' to (2, 0, 0, 0) for Windows file version info"""
    parts = []
    for part in version_str.split('.'):
        # Extract digits
        digits = re.findall(r'\d+', part)
        if digits:
            parts.append(int(digits[0]))
        else:
            parts.append(0)
            
    while len(parts) < 4:
        parts.append(0)
    return tuple(parts[:4])

def generate_version_info(version_str):
    """Generates the file_version_info.txt content for PyInstaller"""
    version_tuple = parse_version_tuple(version_str)
    
    info_content = f"""# UTF-8
# VSVersionInfo struct details for Windows file properties
VSVersionInfo(
  ffi=FixedFileInfo(
    filevers={version_tuple},
    prodvers={version_tuple},
    mask=0x3f,
    flags=0x0,
    OS=0x40004,
    fileType=0x1,
    subtype=0x0,
    date=(0, 0)
  ),
  kids=[
    StringFileInfo(
      [
      StringTable(
        '040904B0',
        [StringStruct('CompanyName', 'PicTone'),
         StringStruct('FileDescription', 'PicTone - Editeur d\\'images local'),
         StringStruct('FileVersion', '{version_str}'),
         StringStruct('InternalName', 'PicTone'),
         StringStruct('LegalCopyright', 'Copyright (c) 2026 PicTone'),
         StringStruct('OriginalFilename', 'PicTone_v{version_str}.exe'),
         StringStruct('ProductName', 'PicTone'),
         StringStruct('ProductVersion', '{version_str}')])
      ]), 
    VarFileInfo([VarStruct('Translation', [1033, 1200])])
  ]
)
"""
    info_file = "file_version_info.txt"
    with open(info_file, "w", encoding="utf-8") as f:
        f.write(info_content)
    print(f"Generated temporary version info file: {info_file}")
    return info_file

def find_pyinstaller():
    """Finds a Python interpreter or executable that has PyInstaller installed"""
    # 1. Try active interpreter
    try:
        import PyInstaller
        return sys.executable
    except ImportError:
        pass
        
    # 2. Try the known Python 3.11 path on this machine
    py311_path = r"C:\Users\aussa\AppData\Local\Programs\Python\Python311\python.exe"
    if os.path.exists(py311_path):
        try:
            # Verify if pyinstaller is importable with Python 3.11
            result = subprocess.run(
                [py311_path, "-c", "import PyInstaller"],
                capture_output=True,
                text=True
            )
            if result.returncode == 0:
                print(f"Using PyInstaller from Python 3.11 environment: {py311_path}")
                return py311_path
        except Exception:
            pass
            
    # 3. Fallback to 'pyinstaller' in system PATH
    pyinstaller_cmd = shutil.which("pyinstaller")
    if pyinstaller_cmd:
        print("Using system 'pyinstaller' command from PATH")
        return "pyinstaller"
        
    return None

def build():
    version = get_version()
    sync_versions(version)
    
    version_info_file = generate_version_info(version)
    
    py_exec = find_pyinstaller()
    if not py_exec:
        print("\nError: PyInstaller could not be found.")
        print("Please install PyInstaller in your Python environment:")
        print("    pip install pyinstaller pystray Pillow")
        # Cleanup
        if os.path.exists(version_info_file):
            os.remove(version_info_file)
        sys.exit(1)
        
    # Prepare PyInstaller command
    output_name = f"PicTone_v{version}"
    
    # Terminate running instances to prevent WinError 5 PermissionError during compilation
    if sys.platform == "win32":
        try:
            exe_name = f"{output_name}.exe"
            print(f"Terminating any running instances of {exe_name}...")
            subprocess.run(["taskkill", "/F", "/IM", exe_name], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        except Exception as e:
            print(f"Warning: Could not terminate existing instances: {e}")

    # Ensure Executables folder exists
    os.makedirs("Executables", exist_ok=True)
    
    # Hidden imports needed for win32com (desktop shortcut creation)
    win32_hidden = [
        "--hidden-import", "win32com",
        "--hidden-import", "win32com.client",
        "--hidden-import", "win32com.shell",
        "--hidden-import", "pywintypes",
        "--hidden-import", "pythoncom",
    ]

    if py_exec == "pyinstaller":
        cmd = [
            "pyinstaller",
            "--noconsole",
            "--onefile",
            "--icon=pictone.ico",
            "--add-data", "web;web",
            "--add-data", "version.txt;.",
            "--distpath", "Executables",
            "--version-file", version_info_file,
            "-n", output_name,
            *win32_hidden,
            "pictone.py"
        ]
    else:
        cmd = [
            py_exec, "-m", "PyInstaller",
            "--noconsole",
            "--onefile",
            "--icon=pictone.ico",
            "--add-data", "web;web",
            "--add-data", "version.txt;.",
            "--distpath", "Executables",
            "--version-file", version_info_file,
            "-n", output_name,
            *win32_hidden,
            "pictone.py"
        ]
        
    print(f"\nRunning build command:\n{' '.join(cmd)}\n")
    
    try:
        # Run the compilation process
        result = subprocess.run(cmd, check=True)
        if result.returncode == 0:
            print("\n" + "="*50)
            print("BUILD COMPLETED SUCCESSFULLY!")
            print(f"Output binary: Executables/{output_name}.exe")
            print("="*50)
    except subprocess.CalledProcessError as e:
        print(f"\nError: PyInstaller build failed with exit code {e.returncode}")
    finally:
        # Clean up temporary/intermediate files
        print("\nCleaning up temporary build files...")
        if os.path.exists(version_info_file):
            os.remove(version_info_file)
            print(f"Removed {version_info_file}")
            
        spec_file = f"{output_name}.spec"
        if os.path.exists(spec_file):
            os.remove(spec_file)
            print(f"Removed {spec_file}")
            
        build_dir = "build"
        if os.path.exists(build_dir):
            shutil.rmtree(build_dir)
            print(f"Removed {build_dir}/ directory")
            
        print("Cleanup done!")

if __name__ == "__main__":
    build()
