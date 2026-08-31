#!/usr/bin/env python3
"""
Master Desktop Application Launcher for Offline Stock Manager
Starts the local FastAPI backend, serves the React desktop UI, and opens the default window.
"""
import os
import sys
import time
import webbrowser
import threading
import uvicorn
from pathlib import Path

# Ensure root workspace is in sys.path
BASE_DIR = Path(__file__).resolve().parent
sys.path.insert(0, str(BASE_DIR))

from backend.app.core.config import settings

def open_browser():
    time.sleep(1.2)
    url = "http://127.0.0.1:8000"
    print(f"\n=======================================================")
    print(f"  Stock Manager (Offline Edition) is now LIVE at:")
    print(f"  --> {url}")
    print(f"  Press Ctrl+C to stop the application.")
    print(f"=======================================================\n")
    try:
        webbrowser.open(url)
    except Exception:
        pass

def main():
    print("Initializing Offline Stock Manager...")
    os.makedirs(settings.DATA_DIR, exist_ok=True)
    os.makedirs(settings.BACKUP_DIR, exist_ok=True)

    # Launch browser in a background thread
    threading.Thread(target=open_browser, daemon=True).start()

    # Start FastAPI server on port 8000
    uvicorn.run(
        "backend.app.main:app",
        host="127.0.0.1",
        port=8000,
        log_level="info",
        reload=False
    )

if __name__ == "__main__":
    main()
