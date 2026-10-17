"""
Kiosk and Fullscreen Browser Launcher Service
Supports automatic detection and launch of Chromium-based browsers (Chrome, Edge, Brave)
with dedicated isolated profile, --app, --kiosk-printing, physical printer sticky destination,
and fullscreen display modes.
"""
import os
import re
import sys
import json
import shutil
import logging
import subprocess
import webbrowser
from pathlib import Path
from typing import Optional, Tuple, Dict, Any, List

from backend.app.core.config import settings

logger = logging.getLogger("uvicorn.error")

_active_kiosk_process: Optional[subprocess.Popen] = None

def terminate_kiosk_browser():
    """Cleanly terminates the launched kiosk browser process if active."""
    global _active_kiosk_process
    if _active_kiosk_process is not None:
        try:
            logger.info("[KioskLauncher] Terminating active kiosk browser process...")
            _active_kiosk_process.terminate()
            try:
                _active_kiosk_process.wait(timeout=2.0)
            except Exception:
                _active_kiosk_process.kill()
        except Exception as e:
            logger.warning(f"[KioskLauncher] Error terminating kiosk browser: {e}")
        finally:
            _active_kiosk_process = None

VIRTUAL_PDF_KEYWORDS = ["pdf", "xps", "onenote", "fax", "writer", "document writer"]

def is_virtual_pdf_printer(name: Optional[str]) -> bool:
    """Check if a printer name corresponds to a virtual print-to-file / PDF printer."""
    if not name:
        return False
    lower = name.lower()
    return any(kw in lower for kw in VIRTUAL_PDF_KEYWORDS)

def get_kiosk_profile_dir() -> Path:
    """Returns the dedicated user-data-dir for Stock Manager kiosk sessions."""
    profile_dir = Path(settings.DATA_DIR) / "kiosk_profile"
    profile_dir.mkdir(parents=True, exist_ok=True)
    return profile_dir

def resolve_physical_printer_for_kiosk() -> Optional[str]:
    """
    Finds the active physical printer to set as Chrome's default destination.
    Avoids virtual PDF printers so Chrome never prompts to 'Save as PDF'.
    """
    try:
        from backend.app.core.database import SessionLocal
        from backend.app.models.business import BusinessSettings
        db = SessionLocal()
        try:
            biz = db.query(BusinessSettings).first()
            if biz and biz.selected_thermal_printer:
                target = biz.selected_thermal_printer.strip()
                if target and not is_virtual_pdf_printer(target):
                    return target
        finally:
            db.close()
    except Exception:
        pass

    try:
        from backend.app.services.escpos_service import list_system_printers
        printers = list_system_printers(force_refresh=False)
        # 1. Prefer online thermal printer
        for p in printers:
            pname = p.get("name", "")
            if p.get("is_thermal") and not is_virtual_pdf_printer(pname) and p.get("is_online", True):
                return pname
        # 2. Any thermal printer
        for p in printers:
            pname = p.get("name", "")
            if p.get("is_thermal") and not is_virtual_pdf_printer(pname):
                return pname
        # 3. Default printer if not PDF
        for p in printers:
            pname = p.get("name", "")
            if p.get("is_default") and not is_virtual_pdf_printer(pname):
                return pname
        # 4. Any physical printer
        for p in printers:
            pname = p.get("name", "")
            if not is_virtual_pdf_printer(pname):
                return pname
    except Exception as e:
        logger.warning(f"[KioskLauncher] Could not enumerate printers for kiosk profile: {e}")

    return None

def configure_kiosk_print_preferences(
    profile_dir: Optional[Path] = None,
    explicit_printer: Optional[str] = None
) -> Optional[Path]:
    """
    Pre-seeds Chrome's sticky print preview settings in the kiosk profile.
    This guarantees:
    1. The destination printer is a physical printer, NEVER 'Save as PDF'.
    2. Header and footers (page numbers, date, URL) are disabled.
    3. CSS background graphics are enabled.
    4. Margins are set to minimum (0mm).
    """
    try:
        if profile_dir is None:
            profile_dir = get_kiosk_profile_dir()
        elif isinstance(profile_dir, str):
            profile_dir = Path(profile_dir)

        default_dir = profile_dir / "Default"
        default_dir.mkdir(parents=True, exist_ok=True)
        pref_file = default_dir / "Preferences"

        target_printer = explicit_printer if (explicit_printer and not is_virtual_pdf_printer(explicit_printer)) else resolve_physical_printer_for_kiosk()

        prefs: Dict[str, Any] = {}
        if pref_file.is_file():
            try:
                with open(pref_file, "r", encoding="utf-8", errors="ignore") as f:
                    prefs = json.load(f)
            except Exception:
                prefs = {}

        if not isinstance(prefs, dict):
            prefs = {}

        printing_section = prefs.get("printing", {})
        if not isinstance(printing_section, dict):
            printing_section = {}

        if target_printer:
            app_state = {
                "version": 2,
                "recentDestinations": [
                    {
                        "id": target_printer,
                        "origin": "local",
                        "account": "",
                        "capabilities": None,
                        "displayName": target_printer
                    }
                ],
                "isHeaderFooterEnabled": False,
                "isCssBackgroundEnabled": True,
                "mediaSize": {
                    "name": "CUSTOM",
                    "width_microns": 80000,
                    "height_microns": 297000,
                    "custom_display_name": "80mm"
                },
                "marginsType": 1,
                "isColorEnabled": False
            }
            printing_section["print_preview_sticky_settings"] = {
                "appState": json.dumps(app_state)
            }
            logger.info(f"[KioskLauncher] Pre-seeded Chromium print destination to physical printer: '{target_printer}'")

        prefs["printing"] = printing_section

        with open(pref_file, "w", encoding="utf-8") as f:
            json.dump(prefs, f, indent=2)

        return pref_file

    except Exception as e:
        logger.warning(f"[KioskLauncher] Failed to pre-seed print preferences: {e}")
        return None

def get_installed_browsers() -> Dict[str, str]:
    """
    Detect all available Chromium-based browsers on the current operating system.
    Returns a dictionary mapping browser identifiers ('chrome', 'msedge', 'brave') to executable paths.
    """
    browsers: Dict[str, str] = {}

    if sys.platform == "win32":
        # Windows detection paths
        prog_files = os.environ.get("ProgramFiles", r"C:\Program Files")
        prog_files_x86 = os.environ.get("ProgramFiles(x86)", r"C:\Program Files (x86)")
        local_app_data = os.environ.get("LocalAppData", "")

        chrome_candidates = [
            os.path.join(prog_files, "Google", "Chrome", "Application", "chrome.exe"),
            os.path.join(prog_files_x86, "Google", "Chrome", "Application", "chrome.exe"),
            os.path.join(local_app_data, "Google", "Chrome", "Application", "chrome.exe") if local_app_data else None,
        ]
        for p in chrome_candidates:
            if p and os.path.isfile(p):
                browsers["chrome"] = p
                break

        edge_candidates = [
            os.path.join(prog_files_x86, "Microsoft", "Edge", "Application", "msedge.exe"),
            os.path.join(prog_files, "Microsoft", "Edge", "Application", "msedge.exe"),
            os.path.join(local_app_data, "Microsoft", "Edge", "Application", "msedge.exe") if local_app_data else None,
        ]
        for p in edge_candidates:
            if p and os.path.isfile(p):
                browsers["msedge"] = p
                break

        brave_candidates = [
            os.path.join(prog_files, "BraveSoftware", "Brave-Browser", "Application", "brave.exe"),
            os.path.join(prog_files_x86, "BraveSoftware", "Brave-Browser", "Application", "brave.exe"),
            os.path.join(local_app_data, "BraveSoftware", "Brave-Browser", "Application", "brave.exe") if local_app_data else None,
        ]
        for p in brave_candidates:
            if p and os.path.isfile(p):
                browsers["brave"] = p
                break

        # Check Windows Registry as fallback if not in standard folders
        try:
            import winreg
            registry_keys = [
                (r"SOFTWARE\Microsoft\Windows\CurrentVersion\App Paths\chrome.exe", "chrome"),
                (r"SOFTWARE\Microsoft\Windows\CurrentVersion\App Paths\msedge.exe", "msedge"),
            ]
            for subkey, key_name in registry_keys:
                if key_name not in browsers:
                    try:
                        with winreg.OpenKey(winreg.HKEY_LOCAL_MACHINE, subkey) as reg_key:
                            path, _ = winreg.QueryValueEx(reg_key, "")
                            if path and os.path.isfile(path):
                                browsers[key_name] = path
                    except Exception:
                        pass
        except Exception:
            pass

    elif sys.platform == "darwin":
        # macOS detection paths
        mac_chrome = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
        mac_edge = "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge"
        mac_brave = "/Applications/Brave Browser.app/Contents/MacOS/Brave Browser"

        if os.path.isfile(mac_chrome):
            browsers["chrome"] = mac_chrome
        if os.path.isfile(mac_edge):
            browsers["msedge"] = mac_edge
        if os.path.isfile(mac_brave):
            browsers["brave"] = mac_brave

    else:
        # Linux detection paths via shutil.which
        for bin_name, key in [
            ("google-chrome", "chrome"),
            ("google-chrome-stable", "chrome"),
            ("chromium-browser", "chrome"),
            ("chromium", "chrome"),
            ("microsoft-edge", "msedge"),
            ("microsoft-edge-stable", "msedge"),
            ("brave-browser", "brave"),
        ]:
            if key not in browsers:
                w = shutil.which(bin_name)
                if w:
                    browsers[key] = w

    return browsers

def find_browser_executable(preferred: str = "auto") -> Optional[Tuple[str, str]]:
    """
    Find best browser executable according to preferred selection.
    Returns (browser_name, executable_path) or None.
    """
    browsers = get_installed_browsers()
    if not browsers:
        return None

    pref = (preferred or "auto").lower()

    if pref in browsers:
        return pref, browsers[pref]

    # If preferred is "auto" or specific choice not installed, prioritize Chrome then Edge then Brave
    for candidate in ["chrome", "msedge", "brave"]:
        if candidate in browsers:
            return candidate, browsers[candidate]

    # Return any available Chromium browser
    first_key = next(iter(browsers))
    return first_key, browsers[first_key]

def build_kiosk_command(
    browser_path: str,
    url: str,
    window_mode: str = "fullscreen",
    kiosk_printing: bool = True,
    profile_dir: Optional[Path] = None,
) -> List[str]:
    """
    Builds the command line arguments for launching a Chromium browser in POS application mode.
    Includes --user-data-dir to guarantee process isolation and active --kiosk-printing.
    """
    cmd = [
        browser_path,
        f"--app={url}",
        "--no-first-run",
        "--no-default-browser-check",
        "--disable-translate",
        "--disable-features=Translate",
        "--disable-pinch",
        "--overscroll-history-navigation=0",
    ]

    if profile_dir:
        cmd.append(f"--user-data-dir={str(profile_dir)}")

    if kiosk_printing:
        cmd.append("--kiosk-printing")

    mode = (window_mode or "fullscreen").lower()
    if mode == "kiosk":
        cmd.append("--kiosk")
    elif mode == "maximized":
        cmd.append("--start-maximized")
    else:
        # Default: Fullscreen application window (F11 fullscreen)
        cmd.append("--start-fullscreen")

    return cmd

def launch_kiosk_browser(
    url: str,
    window_mode: str = "fullscreen",
    browser_choice: str = "auto",
    kiosk_printing: bool = True
) -> Dict[str, Any]:
    """
    Launches the application URL in a native Chromium Kiosk or Fullscreen application window.
    Ensures process isolation via --user-data-dir and pre-seeds physical printer preferences.
    Falls back gracefully to standard webbrowser.open if no Chromium browser is found.
    """
    if browser_choice == "system":
        logger.info("[KioskLauncher] Preferred browser is 'system'. Opening default system browser.")
        webbrowser.open(url)
        return {
            "success": True,
            "browser": "system",
            "fallback": False,
            "message": "Opened application in default system browser.",
        }

    browser_match = find_browser_executable(browser_choice)
    if not browser_match:
        logger.warning(
            f"[KioskLauncher] No Chromium-based browser found for choice '{browser_choice}'. Falling back to default system browser."
        )
        webbrowser.open(url)
        return {
            "success": True,
            "browser": "system_fallback",
            "fallback": True,
            "message": "No Chromium browser found. Opened application in default browser.",
        }

    browser_name, browser_path = browser_match

    # Configure dedicated isolated profile with physical printer destination
    profile_dir = get_kiosk_profile_dir()
    configure_kiosk_print_preferences(profile_dir)

    cmd = build_kiosk_command(
        browser_path=browser_path,
        url=url,
        window_mode=window_mode,
        kiosk_printing=kiosk_printing,
        profile_dir=profile_dir,
    )

    logger.info(f"[KioskLauncher] Launching {browser_name} in {window_mode} mode with isolated profile: {' '.join(cmd)}")

    try:
        kwargs: Dict[str, Any] = {
            "stdout": subprocess.DEVNULL,
            "stderr": subprocess.DEVNULL,
        }
        if sys.platform == "win32":
            # DETACHED_PROCESS (0x00000008) and CREATE_NEW_PROCESS_GROUP (0x00000200)
            kwargs["creationflags"] = 0x00000008 | 0x00000200
            kwargs["close_fds"] = True
        else:
            kwargs["start_new_session"] = True

        proc = subprocess.Popen(cmd, **kwargs)
        global _active_kiosk_process
        _active_kiosk_process = proc

        return {
            "success": True,
            "browser": browser_name,
            "window_mode": window_mode,
            "kiosk_printing": kiosk_printing,
            "profile_dir": str(profile_dir),
            "fallback": False,
            "message": f"Successfully launched {browser_name.title()} in {window_mode} mode with isolated kiosk profile and silent printing.",
        }
    except Exception as e:
        logger.error(f"[KioskLauncher] Failed to spawn browser process: {e}. Falling back to default browser.", exc_info=True)
        webbrowser.open(url)
        return {
            "success": False,
            "browser": browser_name,
            "fallback": True,
            "message": f"Could not launch {browser_name}: {e}. Opened default browser instead.",
        }
