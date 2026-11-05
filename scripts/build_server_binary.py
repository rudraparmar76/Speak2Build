"""Build script to compile the Speak2Build backend into a standalone sidecar binary.

Usage:
    python scripts/build_server_binary.py

Outputs the compiled binary to `extension/bin/speak2build-server/`.
"""

import os
import subprocess
import sys
from pathlib import Path

ROOT_DIR = Path(__file__).resolve().parent.parent
BACKEND_DIR = ROOT_DIR / "backend"
DIST_DIR = ROOT_DIR / "extension" / "bin"
ENTRY_FILE = BACKEND_DIR / "server_entry.py"

VENV_PYTHON = (
    BACKEND_DIR / ".venv" / "Scripts" / "python.exe"
    if sys.platform == "win32"
    else BACKEND_DIR / ".venv" / "bin" / "python"
)

PYTHON_EXE = str(VENV_PYTHON) if VENV_PYTHON.is_file() else sys.executable


def main():
    print("[1/2] Checking PyInstaller...")
    check = subprocess.run(
        [PYTHON_EXE, "-m", "PyInstaller", "--version"],
        capture_output=True,
        text=True,
    )
    if check.returncode != 0:
        print("Installing PyInstaller in virtualenv...")
        subprocess.check_call([PYTHON_EXE, "-m", "pip", "install", "pyinstaller"])

    print(f"[2/2] Compiling {ENTRY_FILE} to {DIST_DIR}...")
    DIST_DIR.mkdir(parents=True, exist_ok=True)

    cmd = [
        PYTHON_EXE,
        "-m",
        "PyInstaller",
        "--name",
        "speak2build-server",
        "--onedir",
        "--noconfirm",
        "--clean",
        "--collect-all",
        "faster_whisper",
        "--collect-all",
        "sounddevice",
        "--collect-all",
        "uvicorn",
        "--distpath",
        str(DIST_DIR),
        str(ENTRY_FILE),
    ]

    subprocess.check_call(cmd, cwd=str(ROOT_DIR))
    print(f"\n[SUCCESS] Standalone backend binary created in {DIST_DIR / 'speak2build-server'}")


if __name__ == "__main__":
    main()
