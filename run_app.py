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
from pathlib import Path

# Ensure root workspace is in sys.path
BASE_DIR = Path(__file__).resolve().parent
sys.path.insert(0, str(BASE_DIR))
import socket
import urllib.request
import uvicorn
from backend.app.core.config import settings
from backend.app.main import app

from backend.app.services.network_service import get_local_lan_ip

DEFAULT_PORT = 8000

def is_stock_manager_already_running(port: int = DEFAULT_PORT) -> bool:
    """Check if Stock Manager is already active on the given port."""
    try:
        url = f"http://127.0.0.1:{port}/api/health"
        req = urllib.request.Request(url, headers={'User-Agent': 'StockManager-Launcher'})
        with urllib.request.urlopen(req, timeout=1.0) as resp:
            data = resp.read().decode('utf-8', errors='ignore')
            return "Offline Stock Manager" in data or '"status":"ok"' in data
    except Exception:
        return False

def find_available_port(start_port: int = DEFAULT_PORT, max_tries: int = 10) -> int:
    """Find the first available port if default port is occupied by another application."""
    for port in range(start_port, start_port + max_tries):
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
            try:
                s.bind(('0.0.0.0', port))
                return port
            except OSError:
                continue
    return start_port

def get_kiosk_launch_preferences():
    """Retrieve auto kiosk & window launch configuration from settings table."""
    try:
        from backend.app.core.database import SessionLocal
        from backend.app.models.business import BusinessSettings
        db = SessionLocal()
        try:
            biz = db.query(BusinessSettings).first()
            if biz:
                return {
                    "auto_launch_kiosk": bool(getattr(biz, "auto_launch_kiosk", False)),
                    "kiosk_window_mode": getattr(biz, "kiosk_window_mode", "fullscreen") or "fullscreen",
                    "kiosk_browser": getattr(biz, "kiosk_browser", "auto") or "auto",
                }
        finally:
            db.close()
    except Exception:
        pass
    return {"auto_launch_kiosk": False, "kiosk_window_mode": "fullscreen", "kiosk_browser": "auto"}

def open_browser(port: int = DEFAULT_PORT):
    time.sleep(1.2)
    local_url = f"http://127.0.0.1:{port}"
    lan_ip = get_local_lan_ip()
    lan_url = f"http://{lan_ip}:{port}"
    print(f"\n=======================================================")
    print(f"  Stock Manager (Offline Edition) is now LIVE!")
    print(f"  --> Local:   {local_url}")
    print(f"  --> Network: {lan_url} (for secondary terminals)")
    print(f"  Press Ctrl+C to stop the application.")
    print(f"=======================================================\n")
    try:
        prefs = get_kiosk_launch_preferences()
        if prefs.get("auto_launch_kiosk"):
            from backend.app.services.kiosk_service import launch_kiosk_browser
            mode = prefs.get("kiosk_window_mode", "fullscreen")
            browser = prefs.get("kiosk_browser", "auto")
            print(f"  [KIOSK LAUNCHER] Auto-launching in {mode.upper()} mode ({browser}) with --kiosk-printing...")
            res = launch_kiosk_browser(local_url, window_mode=mode, browser_choice=browser, kiosk_printing=True)
            if res.get("success") and not res.get("fallback"):
                return
            print(f"  [KIOSK LAUNCHER] Notice: {res.get('message')}")

        if sys.platform == "win32":
            try:
                os.startfile(local_url)
                return
            except Exception:
                pass
        webbrowser.open(local_url)
    except Exception as e:
        print(f"  [WARNING] Could not open browser automatically: {e}")

def main():
    print("Initializing Offline Stock Manager...")
    os.makedirs(settings.DATA_DIR, exist_ok=True)
    os.makedirs(settings.BACKUP_DIR, exist_ok=True)

    # 1. Prevent double-instance crash: if Stock Manager is already running, open browser and exit cleanly
    if is_stock_manager_already_running(DEFAULT_PORT):
        print(f"\n[INFO] Stock Manager is already running in the background.")
        print(f"Opening browser at http://127.0.0.1:{DEFAULT_PORT} ...")
        open_browser(DEFAULT_PORT)
        time.sleep(1.0)
        return

    # 2. Port conflict safety: if port 8000 is occupied by another app, find next free port
    active_port = find_available_port(DEFAULT_PORT)
    if active_port != DEFAULT_PORT:
        print(f"[INFO] Port {DEFAULT_PORT} is in use by another program. Switching to port {active_port}.")

    # 3. Launch browser in a background thread
    threading.Thread(target=open_browser, args=(active_port,), daemon=True).start()

    # 4. Start FastAPI server bound to 0.0.0.0 for LAN access
    uvicorn.run(
        app,
        host="0.0.0.0",
        port=active_port,
        log_level="info",
        reload=False
    )

if __name__ == "__main__":
    try:
        main()
    except Exception as e:
        print(f"\n[FATAL ERROR] An unexpected error occurred: {e}")
        import traceback
        traceback.print_exc()
        input("\nPress Enter to exit...")
