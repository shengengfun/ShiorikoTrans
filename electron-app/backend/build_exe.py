#!/usr/bin/env python3
"""
Build script for packaging the FunASR backend into a standalone executable.
Uses PyInstaller to create a single-file executable that can be bundled with Electron.
"""

import os
import sys
import subprocess
import shutil
from pathlib import Path


def main():
    backend_dir = Path(__file__).parent
    server_py = backend_dir / "server.py"
    
    if not server_py.exists():
        print(f"Error: {server_py} not found")
        sys.exit(1)
    
    print("Building FunASR backend with PyInstaller...")
    
    # Build command
    cmd = [
        sys.executable, "-m", "PyInstaller",
        "--onefile",
        "--name", "funasr-server",
        "--distpath", str(backend_dir / "dist"),
        "--workpath", str(backend_dir / "build"),
        "--specpath", str(backend_dir),
        "--clean",
        "--add-data", f"{backend_dir}{os.pathsep}backend",
        str(server_py),
    ]
    
    print(f"Running: {' '.join(cmd)}")
    subprocess.run(cmd, check=True, cwd=str(backend_dir))
    
    # Copy the executable to the electron backend directory
    dist_exe = backend_dir / "dist" / "funasr-server"
    if sys.platform == "win32":
        dist_exe = dist_exe.with_suffix(".exe")
    
    if dist_exe.exists():
        print(f"Build successful! Executable created at: {dist_exe}")
        print("")
        print("To use with Electron, ensure this executable is in the electron-app/backend/ directory")
        print("or configure electron-builder.yml extraResources accordingly.")
    else:
        print(f"Error: Expected executable not found at {dist_exe}")
        sys.exit(1)


if __name__ == "__main__":
    main()
