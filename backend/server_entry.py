"""Standalone entrypoint for Speak2Build frozen server binary.

Supports PyInstaller bundling with Windows multiprocessing freeze support
and configurable port via CLI arguments or environment variables.
"""

import argparse
import multiprocessing
import os
import sys

import uvicorn

# Ensure the backend directory is in sys.path when running from PyInstaller
base_dir = os.path.dirname(os.path.abspath(__file__))
if base_dir not in sys.path:
    sys.path.insert(0, base_dir)

from app.main import app


def parse_args():
    parser = argparse.ArgumentParser(description="Speak2Build Local Backend Service")
    parser.add_argument(
        "--host",
        default=os.getenv("SPEAK2BUILD_HOST", "127.0.0.1"),
        help="Host address to bind (default: 127.0.0.1)",
    )
    parser.add_argument(
        "--port",
        type=int,
        default=int(os.getenv("SPEAK2BUILD_PORT", "8000")),
        help="Port to listen on (default: 8000)",
    )
    return parser.parse_args()


if __name__ == "__main__":
    multiprocessing.freeze_support()
    args = parse_args()

    print(f"[Speak2Build] Starting server on http://{args.host}:{args.port}", flush=True)
    uvicorn.run(app, host=args.host, port=args.port, log_level="info")
