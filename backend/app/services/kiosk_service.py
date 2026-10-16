"""
Kiosk and Fullscreen Browser Launcher Service
Supports automatic detection and launch of Chromium-based browsers (Chrome, Edge, Brave)
with --app, --kiosk-printing, and fullscreen display modes.
"""
import os
import sys
import shutil
import logging
import subprocess
import webbrowser
from typing import Optional, Tuple, Dict, Any, List

logger = logging.getLogger("uvicorn.error")

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
    kiosk_printing: bool = True
) -> List[str]:
    """
    Builds the command line arguments for launching a Chromium browser in POS application mode.
    """
    cmd = [
        browser_path,
        f"--app={url}",
        "--no-first-run",
        "--no-default-browser-check",
        "--disable-translate",
        "--disable-features=Translate",
    ]

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
    cmd = build_kiosk_command(
        browser_path=browser_path,
        url=url,
        window_mode=window_mode,
        kiosk_printing=kiosk_printing
    )

    logger.info(f"[KioskLauncher] Launching {browser_name} in {window_mode} mode: {' '.join(cmd)}")

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

        subprocess.Popen(cmd, **kwargs)

        return {
            "success": True,
            "browser": browser_name,
            "window_mode": window_mode,
            "kiosk_printing": kiosk_printing,
            "fallback": False,
            "message": f"Successfully launched {browser_name.title()} in {window_mode} mode with kiosk printing.",
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
