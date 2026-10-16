import base64
import io
import logging
import os
import platform
import re
import shutil
import subprocess
import time
from datetime import datetime
from typing import List, Dict, Any, Optional, Union

logger = logging.getLogger(__name__)

# ESC/POS Constants
ESC = b"\x1b"
GS = b"\x1d"

CMD_INIT = ESC + b"@"
CMD_ALIGN_LEFT = ESC + b"a\x00"
CMD_ALIGN_CENTER = ESC + b"a\x01"
CMD_ALIGN_RIGHT = ESC + b"a\x02"

CMD_BOLD_ON = ESC + b"E\x01"
CMD_BOLD_OFF = ESC + b"E\x00"

# Maximum Thermal Print Density & Heating Commands
CMD_DOUBLE_STRIKE_ON = ESC + b"G\x01"     # ESC G 1 (Double strike / double burn for maximum blackness)
CMD_DOUBLE_STRIKE_OFF = ESC + b"G\x00"    # ESC G 0
CMD_HEATING_MAX = ESC + b"7\x20\xff\x02"   # ESC 7 32 255 2 (Max heating burn time 2.55ms on POS-80/58)
CMD_DENSITY_MAX = b"\x12\x23\x1f"         # DC2 # 31 (Max density 31/31 for Xprinter/POS-80)
CMD_EPSON_DENSITY_MAX = GS + b"~\x01\x04" # GS ~ 1 4 (Epson/Star density +4)

CMD_DOUBLE_SIZE = GS + b"!\x11"
CMD_DOUBLE_WIDTH = GS + b"!\x20"
CMD_DOUBLE_HEIGHT = GS + b"!\x01"
CMD_NORMAL_SIZE = GS + b"!\x00"

CMD_CUT_FULL = GS + b"V\x41\x00"  # GS V 65 0 (feed and full cut)
CMD_CUT_PARTIAL = GS + b"V\x42\x00"  # GS V 66 0 (feed and partial cut)
# Star Micronics cut commands
CMD_STAR_CUT_PARTIAL = ESC + b"d\x02"  # ESC d 2
CMD_STAR_CUT_FULL = ESC + b"d\x00"     # ESC d 0

# Dual-pin cash drawer kick + Star BEL pulse (guarantees kick across all brands)
CMD_CASH_DRAWER_KICK_PIN2 = ESC + b"p\x00\x19\xfa"
CMD_CASH_DRAWER_KICK_PIN5 = ESC + b"p\x01\x19\xfa"
CMD_CASH_DRAWER_KICK = CMD_CASH_DRAWER_KICK_PIN2 + CMD_CASH_DRAWER_KICK_PIN5 + b"\x07"

# Hardware Buzzer & Beeper Commands (Epson, Xprinter, Rongta, Star, Generic POS)
CMD_BEEP_STANDARD = ESC + b"B\x01\x02"  # ESC B 1 2 (1 beep, 100ms duration)
CMD_BEEP_BELL = b"\x07"                 # ASCII BEL (single audible pulse)
CMD_BEEP = CMD_BEEP_STANDARD + CMD_BEEP_BELL

# Universal Code Page Select
CMD_CODEPAGE_CP1252 = ESC + b"t\x10"  # Select CP1252 (Windows Latin-1)
CMD_CODEPAGE_CP437 = ESC + b"t\x00"   # Select CP437 (USA Standard OEM)

# Column & Dot Geometry Profiles
COLUMN_WIDTH_MAP = {
    "80mm": 48,
    "80mm_compact": 42,
    "58mm": 32,
    "58mm_narrow": 30,
}

DOTS_PER_LINE_MAP = {
    "80mm": 576,        # 72 bytes/row
    "80mm_compact": 512, # 64 bytes/row
    "58mm": 384,        # 48 bytes/row
    "58mm_narrow": 360, # 45 bytes/row
}

LOGO_TARGET_DOTS_MAP = {
    "80mm": 224,        # 28 bytes wide
    "80mm_compact": 208, # 26 bytes wide
    "58mm": 160,        # 20 bytes wide
    "58mm_narrow": 144, # 18 bytes wide
}

# Exhaustive Catalog of Thermal Printer Brand & Model Signatures
THERMAL_SIGNATURES = [
    "pos", "escpo", "thermal", "receipt", "xprinter", "zijiang",
    "epson", "tm-", "t88", "t20", "t70", "t82", "m30",
    "star", "tsp", "micronics", "citizen", "ct-s", "ct-e",
    "bixolon", "srp-", "srp350", "srp330", "rongta", "rp80", "rp58", "rp32",
    "munbyn", "itpp", "gprinter", "gp-", "hoin", "hop-", "netum",
    "zj-", "posiflex", "aura", "sprt", "sp-pos", "black copper", "bc-",
    "seiko", "dpu", "custom", "vkp", "tg2480", "printercmd",
    "58mm", "80mm", "76mm", "direct thermal", "receipt printer"
]


_printer_cache: Dict[str, Any] = {
    "timestamp": 0.0,
    "platform": "",
    "printers": [],
}


def list_system_printers(force_refresh: bool = False, include_wmi: bool = False) -> List[Dict[str, Any]]:
    """
    Enumerates connected/configured printers on the host system (macOS / Linux / Windows).
    Identifies thermal receipt printers by name and connection URI.
    Uses in-memory 60-second caching for instant sub-millisecond lookups during high-speed checkout.
    """
    global _printer_cache
    now = time.time()
    sys_name = platform.system()
    is_pytest = bool(os.environ.get("PYTEST_CURRENT_TEST"))
    if not is_pytest and not force_refresh and (now - _printer_cache["timestamp"] < 60.0) and _printer_cache["platform"] == sys_name and _printer_cache["printers"]:
        return list(_printer_cache["printers"])

    printers = []

    if sys_name in ("Darwin", "Linux"):
        try:
            # Query CUPS for printers, default destination, and device URIs
            p = subprocess.run(["lpstat", "-p", "-d", "-v"], capture_output=True, text=True, check=True, timeout=5)
            lines = p.stdout.splitlines()
            dest = None
            device_map = {}
            printer_status = {}
            current_p = None

            for line in lines:
                if line.startswith("system default destination:"):
                    dest = line.split(":", 1)[1].strip()
                elif line.startswith("device for "):
                    parts = line[len("device for "):].split(":", 1)
                    if len(parts) == 2:
                        device_map[parts[0].strip()] = parts[1].strip()
                elif line.startswith((" ", "\t")) and current_p:
                    printer_status[current_p] += " " + line.strip()
                else:
                    m = re.match(r"^printer\s+(\S+)\s+(.*)$", line)
                    if m:
                        current_p = m.group(1)
                        printer_status[current_p] = m.group(2)

            for pname, status_str in printer_status.items():
                dev = device_map.get(pname, "")
                is_default = (pname == dest)
                search_str = f"{pname} {dev}".lower()
                is_thermal = any(k in search_str for k in THERMAL_SIGNATURES)
                stat_lower = status_str.lower()
                is_offline = any(w in stat_lower for w in ["offline", "not responding", "paused", "disabled", "stopped"])
                printers.append({
                    "name": pname,
                    "is_default": is_default,
                    "is_thermal": is_thermal,
                    "device_uri": dev,
                    "status": status_str,
                    "is_online": not is_offline,
                })
        except Exception as e:
            logger.warning(f"Could not list CUPS printers: {e}")

    elif sys_name == "Windows":
        discovered = {}
        default_p = ""

        # 1. Primary Win32 Print Spooler Enumeration (Level 2 & Level 4) - ultra-fast ~1ms
        try:
            import win32print
            try:
                default_p = win32print.GetDefaultPrinter() or ""
            except Exception:
                pass

            flags = win32print.PRINTER_ENUM_LOCAL | win32print.PRINTER_ENUM_CONNECTIONS
            # Try Level 2 (Detailed Spooler Info)
            try:
                raw_printers_l2 = win32print.EnumPrinters(flags, None, 2)
                for item in raw_printers_l2:
                    pname = str(item.get("pPrinterName", "")).strip()
                    if not pname:
                        continue
                    key = pname.lower()
                    port = str(item.get("pPortName", "")).strip()
                    status_flags = item.get("Status", 0)
                    attributes = item.get("Attributes", 0)
                    is_default = (pname == default_p)
                    search_str = f"{pname} {port}".lower()
                    is_thermal = any(k in search_str for k in THERMAL_SIGNATURES)
                    is_offline = bool(status_flags & 0x80) or bool(status_flags & 0x01) or bool(status_flags & 0x02) or bool(attributes & 0x00000400)
                    discovered[key] = {
                        "name": pname,
                        "is_default": is_default,
                        "is_thermal": is_thermal,
                        "device_uri": port,
                        "status": "Offline" if is_offline else "Ready",
                        "is_online": not is_offline,
                    }
            except Exception as e:
                logger.debug(f"win32print EnumPrinters Level 2 notice: {e}")

            # Try Level 4 (Fast Registry Enumeration of all local & connected devices)
            try:
                raw_printers_l4 = win32print.EnumPrinters(flags, None, 4)
                for item in raw_printers_l4:
                    pname = str(item.get("pPrinterName", "")).strip()
                    if not pname:
                        continue
                    key = pname.lower()
                    if key not in discovered:
                        is_default = (pname == default_p)
                        search_str = pname.lower()
                        is_thermal = any(k in search_str for k in THERMAL_SIGNATURES)
                        discovered[key] = {
                            "name": pname,
                            "is_default": is_default,
                            "is_thermal": is_thermal,
                            "device_uri": "",
                            "status": "Ready",
                            "is_online": True,
                        }
            except Exception as e:
                logger.debug(f"win32print EnumPrinters Level 4 notice: {e}")
        except ImportError:
            pass

        # 2. Windows Print Management API via PowerShell (Matches Windows 'Printers & scanners' 1:1)
        try:
            cmd = [
                "powershell",
                "-NoProfile",
                "-Command",
                "Get-Printer | Select-Object Name, PortName, Type, IsDefault, PrinterStatus, WorkOffline | ConvertTo-Json -Compress",
            ]
            p = subprocess.run(cmd, capture_output=True, text=True, timeout=5)
            if p.returncode == 0 and p.stdout.strip():
                import json
                data = json.loads(p.stdout.strip())
                if isinstance(data, dict):
                    data = [data]
                for item in data:
                    pname = str(item.get("Name", "")).strip()
                    if not pname:
                        continue
                    key = pname.lower()
                    is_def = bool(item.get("IsDefault", False))
                    port = str(item.get("PortName", "")).strip()
                    search_str = f"{pname} {port}".lower()
                    is_thermal = any(k in search_str for k in THERMAL_SIGNATURES)
                    work_offline = bool(item.get("WorkOffline", False))
                    raw_status = str(item.get("PrinterStatus", "")).lower()
                    is_offline = (
                        work_offline
                        or raw_status in ("2", "8", "13", "24")
                        or any(s in raw_status for s in ["offline", "error", "paused", "notavailable", "userintervention"])
                    )
                    status_text = "Offline" if is_offline else "Ready"

                    if key not in discovered:
                        discovered[key] = {
                            "name": pname,
                            "is_default": is_def or (pname == default_p),
                            "is_thermal": is_thermal,
                            "device_uri": port,
                            "status": status_text,
                            "is_online": not is_offline,
                        }
                    else:
                        if is_def:
                            discovered[key]["is_default"] = True
                        if port and not discovered[key].get("device_uri"):
                            discovered[key]["device_uri"] = port
        except Exception as e:
            logger.debug(f"PowerShell Get-Printer enumeration notice: {e}")

        # 3. Fallback: WMI Win32_Printer if still nothing discovered so far
        if not discovered:
            try:
                cmd_wmi = [
                    "powershell",
                    "-NoProfile",
                    "-Command",
                    "Get-CimInstance Win32_Printer | Select-Object Name, PortName, Default, WorkOffline | ConvertTo-Json -Compress",
                ]
                p_wmi = subprocess.run(cmd_wmi, capture_output=True, text=True, timeout=4)
                if p_wmi.returncode == 0 and p_wmi.stdout.strip():
                    import json
                    wmi_data = json.loads(p_wmi.stdout.strip())
                    if isinstance(wmi_data, dict):
                        wmi_data = [wmi_data]
                    for item in wmi_data:
                        pname = str(item.get("Name", "")).strip()
                        if not pname:
                            continue
                        key = pname.lower()
                        is_def = bool(item.get("Default", False))
                        port = str(item.get("PortName", "")).strip()
                        search_str = f"{pname} {port}".lower()
                        is_thermal = any(k in search_str for k in THERMAL_SIGNATURES)
                        work_offline = bool(item.get("WorkOffline", False))
                        discovered[key] = {
                            "name": pname,
                            "is_default": is_def,
                            "is_thermal": is_thermal,
                            "device_uri": port,
                            "status": "Offline" if work_offline else "Ready",
                            "is_online": not work_offline,
                        }
            except Exception as e:
                logger.warning(f"Could not list Windows printers via WMI: {e}")

        printers = list(discovered.values())

    _printer_cache = {
        "timestamp": time.time(),
        "platform": sys_name,
        "printers": list(printers),
    }
    return printers


def format_row(left: str, right: str, width: int = 48) -> str:
    """Formats a two-column row with left and right justification."""
    left = str(left)
    right = str(right)
    avail_left = width - len(right) - 1
    if avail_left <= 0:
        return f"{left}\n{right.rjust(width)}\n"

    if len(left) > avail_left:
        # Wrap left part
        return f"{left[:avail_left]} {right}\n{left[avail_left:]}\n"
    spaces = width - len(left) - len(right)
    return f"{left}{' ' * spaces}{right}\n"


def safe_escpos_text(text: Any) -> bytes:
    """
    Safely sanitizes and converts Unicode text to thermal printer-friendly byte stream.
    Normalizes currency signs, smart quotes, em-dashes, and special symbols to prevent
    UnicodeEncodeError or garbled characters on CP1252 / standard ESC/POS chipsets.
    """
    if text is None:
        return b""
    s = str(text)
    # Currency replacements
    s = s.replace("₨", "Rs.").replace("₹", "Rs.").replace("€", "EUR").replace("£", "GBP")
    s = s.replace("¥", "JPY").replace("₩", "KRW")
    # Smart quotes and typography
    s = s.replace("\u2018", "'").replace("\u2019", "'").replace("\u201c", '"').replace("\u201d", '"')
    s = s.replace("\u2013", "-").replace("\u2014", "--").replace("\u2026", "...")
    s = s.replace("\u2022", "*").replace("\u00b7", "*")
    s = s.replace("\u21b3", "-> ").replace("↳", "-> ")
    s = s.replace("\u00d7", "x").replace("×", "x")

    try:
        return s.encode("cp1252", errors="replace")
    except Exception:
        return s.encode("ascii", errors="replace")


def is_network_printer_target(target: Optional[str]) -> bool:
    """Checks if a printer destination is an IP address or network socket URL."""
    if not target:
        return False
    clean = target.strip()
    if clean.startswith(("tcp://", "socket://", "net://")):
        return True
    clean_host = re.sub(r"^(tcp|socket|net)://", "", clean).split("/")[0]
    host_part = clean_host.split(":")[0]
    parts = host_part.split(".")
    if len(parts) == 4 and all(p.isdigit() and 0 <= int(p) <= 255 for p in parts):
        return True
    return False


def resolve_target_printer(
    requested_name: Optional[str],
    available: List[Dict[str, Any]]
) -> tuple[Optional[str], Optional[Dict[str, Any]]]:
    """
    Intelligently resolves the target printer using a multi-tier fuzzy matching algorithm:
    0. Direct Network / TCP printer (IP:port)
    1. Exact case-sensitive match
    2. Case-insensitive exact match
    3. Alphanumeric slug match (ignores spaces, hyphens, underscores)
    4. Substring containment match (e.g. 'POS-80' matches 'POS-80 (Copy 1)')
    5. Fallback to first available online thermal printer, then system default
    """
    if requested_name:
        clean = requested_name.strip()
        if is_network_printer_target(clean):
            return clean, {
                "name": clean,
                "is_default": False,
                "is_thermal": True,
                "device_uri": clean,
                "status": "Ready (Network)",
                "is_online": True,
            }

    if not available:
        return requested_name, None

    if requested_name:
        clean = requested_name.strip()
        clean_lower = clean.lower()
        clean_slug = re.sub(r"[^a-z0-9]", "", clean_lower)

        # Tier 1: Exact match
        for p in available:
            if p.get("name") == clean:
                return p["name"], p

        # Tier 2: Case-insensitive match
        for p in available:
            if p.get("name", "").lower() == clean_lower:
                logger.info(f"Resolved printer '{clean}' via case-insensitive match -> '{p['name']}'")
                return p["name"], p

        # Tier 3: Alphanumeric slug match
        for p in available:
            p_slug = re.sub(r"[^a-z0-9]", "", p.get("name", "").lower())
            if p_slug and p_slug == clean_slug:
                logger.info(f"Resolved printer '{clean}' via slug match -> '{p['name']}'")
                return p["name"], p

        # Tier 4: Substring containment (e.g. "POS-80" in "POS-80 (Copy 1)")
        for p in available:
            p_name = p.get("name", "")
            p_lower = p_name.lower()
            if clean_lower in p_lower or (len(p_lower) >= 3 and p_lower in clean_lower):
                logger.info(f"Resolved printer '{clean}' via substring match -> '{p_name}'")
                return p_name, p

    # Tier 5: Fallback to detected thermal printer
    for p in available:
        if p.get("is_thermal") and p.get("is_online", True):
            logger.info(f"Fell back to online thermal printer -> '{p['name']}'")
            return p["name"], p

    for p in available:
        if p.get("is_thermal"):
            return p["name"], p

    # Fallback to system default
    for p in available:
        if p.get("is_default"):
            return p["name"], p

    # Last resort: first printer in list
    if available:
        return available[0]["name"], available[0]

    return requested_name, None


def image_to_escpos_raster(
    img_source: Optional[Union[str, bytes, Any]] = None,
    paper_width: str = "80mm",
) -> Optional[bytes]:
    """
    Converts a business/app logo into a high-fidelity 1-bit monochrome ESC/POS raster bit image (GS v 0).
    Automatically:
    - Decodes base64 data URIs or loads image files from disk (fallback to StokFlow bundled logo).
    - Pastes transparent RGBA layers cleanly over a pure white background.
    - Scales smoothly to thermal roll dot limits (320 dots max for 80mm, 224 dots max for 58mm).
    - Binarizes to sharp 1-bit black & white (0=white, 1=black in ESC/POS).
    - Mathematically zero-pads each row so the logo is 100% horizontally centered across any thermal printer model.
    """
    try:
        from PIL import Image
    except ImportError:
        logger.warning("Pillow not installed; skipping raster logo generation.")
        return None

    img = None
    try:
        if isinstance(img_source, Image.Image):
            img = img_source
        elif isinstance(img_source, str) and img_source.startswith("data:image/"):
            raw_data = base64.b64decode(img_source.split(",", 1)[1])
            img = Image.open(io.BytesIO(raw_data))
        elif isinstance(img_source, str) and os.path.exists(img_source):
            img = Image.open(img_source)
        elif isinstance(img_source, bytes) and len(img_source) > 0:
            img = Image.open(io.BytesIO(img_source))

        if img is None:
            # Fallback to default StokFlow receipt logo
            candidate_paths = [
                os.path.abspath("frontend/public/stokflow-receipt.png"),
                os.path.join(os.path.dirname(__file__), "../../../frontend/public/stokflow-receipt.png"),
                os.path.abspath("frontend/public/stokflow-logo.png"),
            ]
            for cp in candidate_paths:
                if os.path.exists(cp):
                    try:
                        img = Image.open(cp)
                        break
                    except Exception:
                        pass

        if img is None:
            return None

        # Determine paper dot limits & line byte width supporting all thermal models
        if "58" in paper_width:
            if "narrow" in paper_width:
                total_bytes_per_row = 30
                max_logo_w = 240
            else:
                total_bytes_per_row = 32
                max_logo_w = 256
        else:
            if "compact" in paper_width:
                total_bytes_per_row = 42
                max_logo_w = 336
            else:
                total_bytes_per_row = 48
                max_logo_w = 384

        orig_w, orig_h = img.size
        if orig_w <= 0 or orig_h <= 0:
            return None

        # Scale logo proportionally up to max_logo_w, maintaining strict 8-byte alignment (prevents tearing)
        target_dots_w = min(max_logo_w, orig_w) if orig_w >= 64 else max_logo_w
        target_dots_w = max(64, (target_dots_w // 8) * 8)
        scale = target_dots_w / orig_w
        new_w = target_dots_w
        new_h = max(1, int(orig_h * scale))

        # Resize smoothly
        resample_filter = getattr(Image, "Resampling", Image).LANCZOS
        img_resized = img.resize((new_w, new_h), resample=resample_filter)

        # Flatten transparency to white
        bg = Image.new("RGB", img_resized.size, (255, 255, 255))
        if img_resized.mode in ("RGBA", "LA") or (img_resized.mode == "P" and "transparency" in img_resized.info):
            img_rgba = img_resized.convert("RGBA")
            bg.paste(img_rgba, mask=img_rgba.split()[3])
        else:
            bg.paste(img_resized.convert("RGB"))

        # Convert to 1-bit B&W with smart threshold (185 separates black ink from subtle grey background)
        bw = bg.convert("L").point(lambda x: 0 if x < 185 else 255, "1")

        img_bytes_per_row = new_w // 8
        left_pad = max(0, (total_bytes_per_row - img_bytes_per_row) // 2)
        right_pad = max(0, total_bytes_per_row - img_bytes_per_row - left_pad)

        raw_img_bytes = bw.tobytes()

        # Emit logo in a single continuous GS v 0 block (no band slicing, preventing motor jitter / horizontal shear)
        chunk_data = bytearray()
        for r in range(new_h):
            r_slice = raw_img_bytes[r * img_bytes_per_row : (r + 1) * img_bytes_per_row]
            chunk_data.extend(b"\x00" * left_pad)
            for b in r_slice:
                chunk_data.append(~b & 0xFF)
            chunk_data.extend(b"\x00" * right_pad)

        xL = total_bytes_per_row & 0xFF
        xH = (total_bytes_per_row >> 8) & 0xFF
        yL = new_h & 0xFF
        yH = (new_h >> 8) & 0xFF

        # GS v 0 0 xL xH yL yH <chunk_data>
        header = bytes([0x1D, 0x76, 0x30, 0x00, xL, xH, yL, yH])
        return header + bytes(chunk_data)

    except Exception as ex:
        logger.warning(f"Failed to generate ESC/POS raster image logo: {ex}")
        return None


def raster_image_to_escpos(
    image_source: Optional[Union[str, bytes, Any]] = None,
    paper_width: str = "80mm",
    darkness: str = "normal",
    printer_profile: str = "standard_escpos",
    cut_mode: str = "partial",
    feed_lines: int = 4,
    kick_drawer: bool = False,
    beep_enabled: bool = True,
    compact_bitmap: Optional[str] = None,
    bitmap_width: Optional[int] = None,
    bitmap_height: Optional[int] = None,
) -> bytes:
    """
    Converts a complete receipt canvas/image (rendered client-side) into high-fidelity
    ESC/POS raster bit image commands (GS v 0).
    Delivers 100% exact visual parity with the browser preview modal:
    - TrueType proportional typography (Inter/Roboto/Helvetica)
    - Full 80mm roll width coverage (576 dots / 72 bytes per row)
    - Clean boxed cards, flexbox column alignments, and solid borders
    - Crisp vector Code-128 barcodes
    """
    clean_width = str(paper_width or "80mm").lower()
    if "58" in clean_width:
        target_dots_w = 360 if "narrow" in clean_width else 384
    else:
        target_dots_w = 512 if "compact" in clean_width else 576

    bytes_per_row = target_dots_w // 8

    # --- FAST-PATH 1: Pre-quantized 1-Bit Client Bitmap (0ms latency, single-block hardware speed) ---
    if compact_bitmap:
        try:
            raw_data = base64.b64decode(compact_bitmap)
            target_w = bitmap_width or target_dots_w
            bytes_row = target_w // 8
            total_h = bitmap_height or (len(raw_data) // bytes_row)
            if total_h <= 0:
                raise ValueError("Bitmap height cannot be zero.")

            # Guard against 100% blank white canvas (all bits 0)
            has_content = any(b != 0x00 for b in raw_data)
            if not has_content:
                raise ValueError("Receipt image is completely blank. Print aborted to prevent empty paper feed.")

            # Continuous hardware rastering: Use large band limit (2048 dots) to eliminate micro-stepping pauses
            band_h_limit = 2048
            raster_chunks = bytearray()
            for start_row in range(0, total_h, band_h_limit):
                chunk_h = min(band_h_limit, total_h - start_row)
                chunk_data = raw_data[start_row * bytes_row : (start_row + chunk_h) * bytes_row]

                xL = bytes_row & 0xFF
                xH = (bytes_row >> 8) & 0xFF
                yL = chunk_h & 0xFF
                yH = (chunk_h >> 8) & 0xFF
                header = bytes([0x1D, 0x76, 0x30, 0x00, xL, xH, yL, yH])
                raster_chunks.extend(header + chunk_data)

            profile = (printer_profile or "standard_escpos").lower()
            is_escpos = (profile != "generic_plain")

            payload = bytearray()
            if is_escpos:
                payload.extend(CMD_INIT)
                payload.extend(CMD_CODEPAGE_CP1252)
                if darkness in ("high", "maximum") and profile == "xprinter_enhanced":
                    payload.extend(CMD_HEATING_MAX)
                    payload.extend(CMD_DENSITY_MAX)
                if darkness in ("high", "maximum"):
                    payload.extend(CMD_DOUBLE_STRIKE_ON)

            if kick_drawer and is_escpos:
                payload.extend(CMD_CASH_DRAWER_KICK)

            payload.extend(raster_chunks)

            feed_count = max(2, min(8, feed_lines if feed_lines is not None else 4))
            payload.extend(b"\n" * feed_count)

            clean_cut = (cut_mode or "partial").lower()
            if clean_cut != "tear_only" and is_escpos:
                if profile == "star_line":
                    payload.extend(CMD_STAR_CUT_FULL if clean_cut == "full" else CMD_STAR_CUT_PARTIAL)
                else:
                    payload.extend(CMD_CUT_FULL if clean_cut == "full" else CMD_CUT_PARTIAL)

            if beep_enabled and is_escpos:
                payload.extend(CMD_BEEP)

            return bytes(payload)
        except Exception as e:
            logger.warning(f"Compact bitmap fast-path skipped due to: {e}, falling back to PIL image processing")

    # --- FAST-PATH 2: Standard Image processing with Pillow ---
    try:
        from PIL import Image
    except ImportError:
        raise RuntimeError("Pillow is required for thermal receipt raster printing.")

    img = None
    if isinstance(image_source, Image.Image):
        img = image_source
    elif isinstance(image_source, str) and image_source.startswith("data:image/"):
        raw_data = base64.b64decode(image_source.split(",", 1)[1])
        img = Image.open(io.BytesIO(raw_data))
    elif isinstance(image_source, str) and os.path.exists(image_source):
        img = Image.open(image_source)
    elif isinstance(image_source, bytes) and len(image_source) > 0:
        img = Image.open(io.BytesIO(image_source))
    elif isinstance(image_source, str) and len(image_source) > 50:
        try:
            raw_data = base64.b64decode(image_source)
            img = Image.open(io.BytesIO(raw_data))
        except Exception:
            pass

    if img is None:
        raise ValueError("Invalid or empty image data provided for thermal raster printing.")

    orig_w, orig_h = img.size
    if orig_w <= 0 or orig_h <= 0:
        raise ValueError("Image dimensions cannot be zero.")

    if orig_w == target_dots_w:
        # ⚡ Instant no-op when client already rendered at target width (576px / 384px)
        img_resized = img
        new_h = orig_h
    else:
        scale = target_dots_w / orig_w
        new_h = max(1, int(orig_h * scale))
        resample_filter = getattr(Image, "Resampling", Image).BILINEAR
        img_resized = img.resize((target_dots_w, new_h), resample=resample_filter)

    # Flatten transparency onto white background
    bg = Image.new("RGB", img_resized.size, (255, 255, 255))
    if img_resized.mode in ("RGBA", "LA") or (img_resized.mode == "P" and "transparency" in img_resized.info):
        img_rgba = img_resized.convert("RGBA")
        bg.paste(img_rgba, mask=img_rgba.split()[3])
    else:
        bg.paste(img_resized.convert("RGB"))

    # Convert to 1-bit B&W using threshold
    bw = bg.convert("L").point(lambda x: 0 if x < 195 else 255, "1")
    raw_img_bytes = bw.tobytes()

    # Guard against 100% blank white canvas to prevent runaway feeds
    has_content = any(b != 0xFF for b in raw_img_bytes)
    if not has_content:
        raise ValueError("Image data is 100% blank white. Raster print aborted to prevent empty paper feed.")

    band_h_limit = 2048
    raster_chunks = bytearray()

    for start_row in range(0, new_h, band_h_limit):
        chunk_h = min(band_h_limit, new_h - start_row)
        chunk_data = bytearray()
        for r in range(start_row, start_row + chunk_h):
            r_slice = raw_img_bytes[r * bytes_per_row : (r + 1) * bytes_per_row]
            for b in r_slice:
                chunk_data.append(~b & 0xFF)

        xL = bytes_per_row & 0xFF
        xH = (bytes_per_row >> 8) & 0xFF
        yL = chunk_h & 0xFF
        yH = (chunk_h >> 8) & 0xFF

        # GS v 0 0 xL xH yL yH <chunk_data>
        header = bytes([0x1D, 0x76, 0x30, 0x00, xL, xH, yL, yH])
        raster_chunks.extend(header + chunk_data)

    profile = (printer_profile or "standard_escpos").lower()
    is_escpos = (profile != "generic_plain")

    payload = bytearray()
    if is_escpos:
        payload.extend(CMD_INIT)
        payload.extend(CMD_CODEPAGE_CP1252)
        if darkness in ("high", "maximum") and profile == "xprinter_enhanced":
            payload.extend(CMD_HEATING_MAX)
            payload.extend(CMD_DENSITY_MAX)
        if darkness in ("high", "maximum"):
            payload.extend(CMD_DOUBLE_STRIKE_ON)

    if kick_drawer and is_escpos:
        payload.extend(CMD_CASH_DRAWER_KICK)

    payload.extend(raster_chunks)

    feed_count = max(2, min(8, feed_lines if feed_lines is not None else 4))
    payload.extend(b"\n" * feed_count)

    clean_cut = (cut_mode or "partial").lower()
    if clean_cut != "tear_only" and is_escpos:
        if profile == "star_line":
            payload.extend(CMD_STAR_CUT_FULL if clean_cut == "full" else CMD_STAR_CUT_PARTIAL)
        else:
            payload.extend(CMD_CUT_FULL if clean_cut == "full" else CMD_CUT_PARTIAL)

    if beep_enabled and is_escpos:
        payload.extend(CMD_BEEP)

    return bytes(payload)



def format_tabular_cols(
    item_name: str,
    qty: float,
    price: float,
    total: float,
    currency: str,
    col_width: int,
) -> str:
    """
    Formats an item row into an aligned multi-column table:
    80mm: ITEM (22) QTY (4) PRICE (9) TOTAL (10) -> 48 chars
    58mm: ITEM (11) QTY (3) PRICE (7) TOTAL (8)  -> 32 chars
    Gracefully wraps long item names to next line without skewing columns.
    """
    qty_str = f"{int(qty) if qty.is_integer() else qty}"
    price_str = f"{price:,.2f}"
    tot_str = f"{total:,.2f}"

    if col_width >= 40:
        w_qty = 4
        w_price = 9
        w_tot = 10
        w_item = col_width - (w_qty + w_price + w_tot + 3)
    else:
        w_qty = 3
        w_price = 7
        w_tot = 8
        w_item = col_width - (w_qty + w_price + w_tot + 3)

    w_item = max(6, w_item)

    words = item_name.split()
    item_lines = []
    curr = ""
    for w in words:
        if not curr:
            curr = w[:w_item]
        elif len(curr) + 1 + len(w) <= w_item:
            curr += " " + w
        else:
            item_lines.append(curr)
            curr = w[:w_item]
    if curr:
        item_lines.append(curr)
    if not item_lines:
        item_lines = [item_name[:w_item]]

    first_item = item_lines[0].ljust(w_item)
    q_col = qty_str.rjust(w_qty)
    p_col = price_str.rjust(w_price)
    t_col = tot_str.rjust(w_tot)

    res = f"{first_item} {q_col} {p_col} {t_col}\n"
    for extra in item_lines[1:]:
        res += f"{extra.ljust(w_item)}\n"
    return res


def format_dot_leader(left_str: str, right_str: str, col_width: int) -> str:
    """
    Fills space between left and right text with rhythmic dot leaders (. . .).
    Produces authentic fine-dining / boutique receipt aesthetics.
    """
    avail = col_width - len(left_str) - len(right_str)
    if avail <= 2:
        return format_row(left_str, right_str, col_width)
    dots = " " + ". " * (avail // 2)
    dots = dots[:avail]
    return f"{left_str}{dots}{right_str}\n"


def make_escpos_solid_line(
    paper_width: str = "80mm",
    thickness_dots: int = 2,
    pad_top: int = 2,
    pad_bottom: int = 4,
    is_escpos: bool = True,
) -> bytes:
    """
    Emits a 100% continuous, zero-gap solid black horizontal line across the printhead
    using ESC/POS raster bit image command (GS v 0).
    Energizes all thermal pins simultaneously with zero font character spacing.
    """
    col_width = COLUMN_WIDTH_MAP.get(paper_width, 32 if "58" in str(paper_width) else 48)
    if not is_escpos:
        return ("_" * col_width + "\n").encode("ascii")

    if "58" in str(paper_width):
        bytes_per_row = 45 if "narrow" in str(paper_width) else 48
    else:
        bytes_per_row = 64 if "compact" in str(paper_width) else 72

    total_rows = pad_top + thickness_dots + pad_bottom
    xL = bytes_per_row & 0xFF
    xH = (bytes_per_row >> 8) & 0xFF
    yL = total_rows & 0xFF
    yH = (total_rows >> 8) & 0xFF

    header = bytes([0x1D, 0x76, 0x30, 0x00, xL, xH, yL, yH])
    data = (
        (b"\x00" * (bytes_per_row * pad_top))
        + (b"\xFF" * (bytes_per_row * thickness_dots))
        + (b"\x00" * (bytes_per_row * pad_bottom))
    )
    return header + data


def make_escpos_double_solid_line(
    paper_width: str = "80mm",
    pad_top: int = 2,
    pad_bottom: int = 4,
    is_escpos: bool = True,
) -> bytes:
    """
    Emits a crisp solid double horizontal line (2 dots black, 2 dots white gap, 2 dots black).
    """
    col_width = COLUMN_WIDTH_MAP.get(paper_width, 32 if "58" in str(paper_width) else 48)
    if not is_escpos:
        return ("=" * col_width + "\n").encode("ascii")

    if "58" in str(paper_width):
        bytes_per_row = 45 if "narrow" in str(paper_width) else 48
    else:
        bytes_per_row = 64 if "compact" in str(paper_width) else 72

    total_rows = pad_top + 2 + 2 + 2 + pad_bottom
    xL = bytes_per_row & 0xFF
    xH = (bytes_per_row >> 8) & 0xFF
    yL = total_rows & 0xFF
    yH = (total_rows >> 8) & 0xFF

    header = bytes([0x1D, 0x76, 0x30, 0x00, xL, xH, yL, yH])
    data = (
        (b"\x00" * (bytes_per_row * pad_top))
        + (b"\xFF" * (bytes_per_row * 2))
        + (b"\x00" * (bytes_per_row * 2))
        + (b"\xFF" * (bytes_per_row * 2))
        + (b"\x00" * (bytes_per_row * pad_bottom))
    )
    return header + data


# ISO/IEC 15417 Code-128 Patterns for symbols 0 through 106
CODE128_PATTERNS = [
    "212222", "222122", "222221", "121223", "121322", "131222", "122213", "122312", "132212", "221213",
    "221312", "231212", "112232", "122132", "122231", "113222", "123122", "123221", "223211", "221132",
    "221231", "213212", "223112", "312131", "311222", "321122", "321221", "312212", "322112", "322211",
    "212123", "212321", "232121", "111323", "131123", "131321", "112313", "132113", "132311", "211313",
    "231113", "231311", "112133", "112331", "132131", "113123", "113321", "133121", "313121", "211331",
    "231131", "213113", "213311", "213131", "311123", "311321", "331121", "312113", "312311", "332111",
    "314111", "221411", "431111", "111224", "111422", "121124", "121421", "141122", "141221", "112214",
    "112412", "122114", "122411", "142112", "142211", "241211", "221114", "413111", "241112", "134111",
    "111242", "121142", "121241", "114212", "124112", "124211", "411212", "421112", "421211", "212141",
    "214121", "412121", "111143", "111341", "131141", "114113", "114311", "411113", "411311", "113141",
    "114131", "311141", "411131", "211412", "211214", "211232", "2331112"
]


def generate_code128_raster_escpos(
    text: str,
    paper_width: str = "80mm",
    height_dots: int = 56,
    include_text: bool = True,
) -> bytes:
    """
    Generates a universal 1-bit monochrome ISO/IEC 15417 Code-128 raster barcode
    rendered via ESC/POS raster bit image command (GS v 0).
    Guarantees 100% hardware scannability and crisp visual parity across ANY
    thermal printer brand, completely bypassing firmware ROM barcode limitations.
    """
    clean_text = re.sub(r"[^ -~]", "", str(text or "").strip())
    if not clean_text:
        return b""

    if "58" in str(paper_width):
        bytes_per_row = 45 if "narrow" in str(paper_width) else 48
    else:
        bytes_per_row = 64 if "compact" in str(paper_width) else 72

    total_dots_w = bytes_per_row * 8

    # Code-128 Subset B encoding
    symbols = [104]  # Start B
    checksum_total = 104
    for i, ch in enumerate(clean_text):
        symbol_val = max(0, min(94, ord(ch) - 32))
        symbols.append(symbol_val)
        checksum_total += symbol_val * (i + 1)
    symbols.append(checksum_total % 103)  # Checksum modulo 103
    symbols.append(106)  # Stop code

    # Calculate total modules
    quiet_modules = 10
    total_modules = (quiet_modules * 2) + sum(sum(int(d) for d in CODE128_PATTERNS[s]) for s in symbols)

    module_width = 2 if total_modules * 2 <= total_dots_w else 1

    # Build 1D bit module sequence
    barcode_bits = [0] * (quiet_modules * module_width)
    for s in symbols:
        pat = CODE128_PATTERNS[s]
        is_bar = True
        for digit_char in pat:
            w = int(digit_char) * module_width
            barcode_bits.extend([1 if is_bar else 0] * w)
            is_bar = not is_bar
    barcode_bits.extend([0] * (quiet_modules * module_width))

    # Center horizontally across paper dot width
    left_pad = max(0, (total_dots_w - len(barcode_bits)) // 2)
    row_bytes = bytearray(bytes_per_row)
    for i, b in enumerate(barcode_bits):
        if b:
            dot_pos = left_pad + i
            if dot_pos < total_dots_w:
                row_bytes[dot_pos // 8] |= (1 << (7 - (dot_pos % 8)))

    # Determine vertical height
    actual_h = min(height_dots, 44) if "58" in str(paper_width) else height_dots
    xL = bytes_per_row & 0xFF
    xH = (bytes_per_row >> 8) & 0xFF

    out = bytearray()
    band_limit = 24
    for start_r in range(0, actual_h, band_limit):
        chunk_h = min(band_limit, actual_h - start_r)
        chunk_data = bytes(row_bytes) * chunk_h
        yL = chunk_h & 0xFF
        yH = (chunk_h >> 8) & 0xFF
        header = bytes([0x1D, 0x76, 0x30, 0x00, xL, xH, yL, yH])
        out.extend(header + chunk_data)

    if include_text:
        out.extend(CMD_ALIGN_CENTER)
        out.extend(safe_escpos_text(f"{clean_text}\n"))

    return bytes(out)


def generate_escpos_receipt(
    sale_data: Dict[str, Any],
    settings: Optional[Any] = None,
    paper_width: str = "80mm",
    header_style: str = "logo_text",
    receipt_layout: Optional[str] = None,
    show_barcode: bool = True,
    kick_drawer: bool = False,
    darkness: Optional[str] = None,
    printer_profile: Optional[str] = None,
    cut_mode: Optional[str] = None,
    feed_lines: Optional[int] = None,
    beep_enabled: Optional[bool] = None,
) -> bytes:
    """
    Builds a complete, formatted ESC/POS binary receipt payload.
    Supports 80mm (48/42 column) and 58mm (32/30 column) layouts, with Classic and Modern styling.
    Adapts cleanly to Standard ESC/POS, Xprinter/POS-80, Star Micronics, and Generic Plain Text profiles.
    """
    col_width = COLUMN_WIDTH_MAP.get(paper_width, 32 if "58" in str(paper_width) else 48)
    density_mode = darkness or getattr(settings, "thermal_darkness", "normal") or "normal"
    layout_mode = (receipt_layout or getattr(settings, "thermal_layout", "classic") or "classic").lower()
    profile = (printer_profile or getattr(settings, "thermal_printer_profile", "standard_escpos") or "standard_escpos").lower()
    actual_cut_mode = (cut_mode or getattr(settings, "thermal_cut_mode", "partial") or "partial").lower()
    actual_feed_lines = feed_lines if feed_lines is not None else getattr(settings, "thermal_feed_lines", 4) or 4

    is_escpos = (profile != "generic_plain")

    # True continuous solid raster dividers across thermal heads (no character dashes)
    solid_div = make_escpos_solid_line(paper_width, thickness_dots=2, is_escpos=is_escpos)
    thin_solid_div = make_escpos_solid_line(paper_width, thickness_dots=1, is_escpos=is_escpos)
    double_solid_div = make_escpos_double_solid_line(paper_width, is_escpos=is_escpos)
    div_line = double_solid_div if density_mode == "maximum" else solid_div
    double_div = double_solid_div

    shop_name = getattr(settings, "business_name", "My Local Business") or "My Local Business"
    shop_address = getattr(settings, "address", "") or ""
    shop_phone = getattr(settings, "phone", "") or ""
    custom_header = getattr(settings, "receipt_header", "") or ""
    footer_text = getattr(settings, "receipt_footer", "Thank you for your business!") or "Thank you for your business!"
    currency = getattr(settings, "currency", "Rs.") or "Rs."

    is_escpos = (profile != "generic_plain")
    cmd_bold_on = CMD_BOLD_ON if is_escpos else b""
    cmd_bold_off = CMD_BOLD_OFF if is_escpos else b""
    cmd_align_center = CMD_ALIGN_CENTER if is_escpos else b""
    cmd_align_left = CMD_ALIGN_LEFT if is_escpos else b""
    cmd_double_size = CMD_DOUBLE_SIZE if is_escpos else b""
    cmd_double_height = CMD_DOUBLE_HEIGHT if is_escpos else b""
    cmd_normal_size = CMD_NORMAL_SIZE if is_escpos else b""

    buf = bytearray()

    # 1. Initialize Printer & Set Density according to Profile
    if is_escpos:
        buf.extend(CMD_INIT)
        buf.extend(CMD_CODEPAGE_CP1252)

        # Heating & Density control based on hardware profile
        if density_mode in ("maximum", "high"):
            if profile == "xprinter_enhanced":
                buf.extend(CMD_HEATING_MAX)        # 2.55ms max heating duration on POS-80/58
                buf.extend(CMD_DENSITY_MAX)        # DC2 # 31: max darkness level 31/31
            buf.extend(CMD_DOUBLE_STRIKE_ON)       # ESC G 1: Double-strike mode for rich, pitch-black text
            buf.extend(CMD_BOLD_ON)

    # Cash drawer kick if requested
    if kick_drawer and is_escpos:
        buf.extend(CMD_CASH_DRAWER_KICK)

    # 2. Header
    buf.extend(cmd_align_center)

    # Raster Graphic Logo (printed by default whenever header_style is NOT text_only and in ESC/POS mode)
    if header_style != "text_only" and is_escpos:
        logo_source = getattr(settings, "receipt_logo_path", None) or getattr(settings, "logo_path", None)
        raster_logo = image_to_escpos_raster(logo_source, paper_width=paper_width)
        if raster_logo:
            buf.extend(raster_logo)
            buf.extend(b"\n")

    # 2. Store Header
    buf.extend(cmd_align_center)
    custom_sub = (custom_header or "").strip()
    has_custom_sub = bool(custom_sub and custom_sub.lower() != shop_name.strip().lower())

    if layout_mode == "elegant":
        buf.extend(thin_solid_div)
        buf.extend(cmd_bold_on)
        buf.extend(cmd_double_height)
        buf.extend(safe_escpos_text(f"{shop_name}\n"))
        buf.extend(cmd_normal_size)
        buf.extend(cmd_bold_off)
        if has_custom_sub:
            sub_text = custom_sub if custom_sub.startswith("~") else f"~ {custom_sub} ~"
            buf.extend(safe_escpos_text(f"{sub_text}\n"))
    elif layout_mode == "modern":
        buf.extend(cmd_bold_on)
        buf.extend(cmd_double_height)
        buf.extend(safe_escpos_text(f"{shop_name.upper()}\n"))
        buf.extend(cmd_normal_size)
        buf.extend(cmd_bold_off)
        if has_custom_sub:
            buf.extend(safe_escpos_text(f"[{custom_sub.upper()}]\n"))
    elif layout_mode == "compact":
        buf.extend(cmd_bold_on)
        buf.extend(safe_escpos_text(f"{shop_name}\n"))
        buf.extend(cmd_bold_off)
    elif layout_mode == "tabular":
        buf.extend(cmd_bold_on)
        buf.extend(cmd_double_height)
        buf.extend(safe_escpos_text(f"{shop_name}\n"))
        buf.extend(cmd_normal_size)
        buf.extend(cmd_bold_off)
        if has_custom_sub:
            buf.extend(safe_escpos_text(f"{custom_sub}\n"))
    else:  # classic
        buf.extend(cmd_bold_on)
        buf.extend(cmd_double_height)
        buf.extend(safe_escpos_text(f"{shop_name}\n"))
        buf.extend(cmd_normal_size)
        buf.extend(cmd_bold_off)
        if has_custom_sub:
            buf.extend(safe_escpos_text(f"{custom_sub}\n"))

    if shop_address and layout_mode != "compact":
        for line in shop_address.splitlines():
            buf.extend(safe_escpos_text(f"{line.strip()}\n"))
    if shop_phone and layout_mode != "compact":
        buf.extend(safe_escpos_text(f"Phone: {shop_phone}\n"))

    buf.extend(cmd_align_left)

    # 3. Receipt Metadata & Info
    receipt_no = sale_data.get("receipt_number", "RECEIPT")
    created_at = sale_data.get("created_at")
    if isinstance(created_at, datetime):
        dt_str = created_at.strftime("%Y-%m-%d %I:%M %p")
        dt_short = created_at.strftime("%m/%d %I:%M%p")
    elif isinstance(created_at, str):
        try:
            dt = datetime.fromisoformat(created_at.replace("Z", "+00:00"))
            dt_str = dt.strftime("%Y-%m-%d %I:%M %p")
            dt_short = dt.strftime("%m/%d %I:%M%p")
        except Exception:
            dt_str = str(created_at)[:19]
            dt_short = dt_str[:10]
    else:
        dt_str = datetime.now().strftime("%Y-%m-%d %I:%M %p")
        dt_short = datetime.now().strftime("%m/%d %I:%M%p")

    cust_name = sale_data.get("customer_name") or "Counter Walk-in"
    payment_method = sale_data.get("payment_method", "CASH")
    payments = sale_data.get("payments", [])
    if payments and isinstance(payments, list) and len(payments) > 0:
        p0 = payments[0]
        if isinstance(p0, dict):
            payment_method = p0.get("payment_method", payment_method)

    if layout_mode == "compact":
        buf.extend(solid_div)
        buf.extend(safe_escpos_text(f"#{receipt_no} | {dt_short} | {cust_name[:12]}\n"))
        buf.extend(solid_div)
    elif layout_mode == "modern":
        buf.extend(solid_div)
        buf.extend(safe_escpos_text(format_row(f"#{receipt_no}", dt_str, col_width)))
        buf.extend(safe_escpos_text(format_row(f"Customer: {cust_name}", f"Tender: [{str(payment_method).upper()}]", col_width)))
        buf.extend(solid_div)
    elif layout_mode == "elegant":
        buf.extend(thin_solid_div)
        buf.extend(cmd_align_center)
        buf.extend(safe_escpos_text(f"Order Ref: {receipt_no}\n"))
        buf.extend(safe_escpos_text(f"{dt_str}\n"))
        buf.extend(safe_escpos_text(f"Honored Guest: {cust_name}\n"))
        buf.extend(cmd_align_left)
        buf.extend(thin_solid_div)
    elif layout_mode == "tabular":
        buf.extend(solid_div)
        buf.extend(safe_escpos_text(format_row(f"Voucher: {receipt_no}", f"Date: {dt_str[:10]}", col_width)))
        buf.extend(safe_escpos_text(format_row(f"Customer: {cust_name}", f"Pay: {str(payment_method).upper()}", col_width)))
        buf.extend(solid_div)
    else:  # classic
        buf.extend(solid_div)
        buf.extend(safe_escpos_text(format_row("Receipt #:", receipt_no, col_width)))
        buf.extend(safe_escpos_text(format_row("Date:", dt_str, col_width)))
        buf.extend(safe_escpos_text(format_row("Customer:", cust_name, col_width)))
        buf.extend(safe_escpos_text(format_row("Payment:", str(payment_method).upper(), col_width)))
        buf.extend(solid_div)

    # 4. Items Table
    items = sale_data.get("items", [])
    total_qty = 0

    if layout_mode == "tabular":
        buf.extend(cmd_bold_on)
        if col_width >= 40:
            # 48 col header
            w_qty = 4
            w_price = 9
            w_tot = 10
            w_item = col_width - (w_qty + w_price + w_tot + 3)
            tbl_hdr = f"{'ITEM'.ljust(w_item)} {'QTY'.rjust(w_qty)} {'PRICE'.rjust(w_price)} {'TOTAL'.rjust(w_tot)}\n"
        else:
            w_qty = 3
            w_price = 7
            w_tot = 8
            w_item = col_width - (w_qty + w_price + w_tot + 3)
            tbl_hdr = f"{'ITEM'.ljust(w_item)} {'QTY'.rjust(w_qty)} {'PRICE'.rjust(w_price)} {'TOTAL'.rjust(w_tot)}\n"
        buf.extend(safe_escpos_text(tbl_hdr))
        buf.extend(cmd_bold_off)
        buf.extend(solid_div)

        for it in items:
            p_name = it.get("product_name", "Item")
            orig_qty = float(it.get("quantity", 0))
            ret_qty = float(it.get("returned_quantity", 0))
            u_price = float(it.get("unit_price", 0))
            disc_amt = float(it.get("discount_amount", 0))
            tot_price = float(it.get("total_price", 0))

            is_fully_returned = (ret_qty >= orig_qty and orig_qty > 0)
            is_partially_returned = (ret_qty > 0 and ret_qty < orig_qty)
            rem_qty = 0 if is_fully_returned else max(0.0, orig_qty - ret_qty)
            line_total = 0.0 if is_fully_returned else (rem_qty * u_price - disc_amt if is_partially_returned else tot_price)
            total_qty += rem_qty

            tag = " [RET]" if is_fully_returned else (f" [{int(ret_qty)}R]" if is_partially_returned else "")
            display_name = f"{p_name}{tag}"
            row_text = format_tabular_cols(display_name, rem_qty if is_partially_returned else orig_qty, u_price, line_total, currency, col_width)
            buf.extend(safe_escpos_text(row_text))

            if disc_amt > 0 and not is_fully_returned:
                buf.extend(safe_escpos_text(f"  (Disc: -{currency} {disc_amt:,.2f})\n"))

        buf.extend(solid_div)

    elif layout_mode == "compact":
        for it in items:
            p_name = it.get("product_name", "Item")
            orig_qty = float(it.get("quantity", 0))
            ret_qty = float(it.get("returned_quantity", 0))
            u_price = float(it.get("unit_price", 0))
            disc_amt = float(it.get("discount_amount", 0))
            tot_price = float(it.get("total_price", 0))

            is_fully_returned = (ret_qty >= orig_qty and orig_qty > 0)
            is_partially_returned = (ret_qty > 0 and ret_qty < orig_qty)
            rem_qty = 0 if is_fully_returned else max(0.0, orig_qty - ret_qty)
            line_total = 0.0 if is_fully_returned else (rem_qty * u_price - disc_amt if is_partially_returned else tot_price)
            total_qty += rem_qty

            qty_disp = int(orig_qty) if orig_qty.is_integer() else orig_qty
            right_str = f"{line_total:,.2f}"
            avail = col_width - len(right_str) - 1
            short_name = f"{p_name} ({qty_disp}x)"[:avail]
            buf.extend(safe_escpos_text(format_row(short_name, right_str, col_width)))
            if disc_amt > 0 and not is_fully_returned:
                buf.extend(safe_escpos_text(f" -Disc: {disc_amt:,.2f}\n"))

        buf.extend(solid_div)

    elif layout_mode == "modern":
        buf.extend(cmd_bold_on)
        buf.extend(safe_escpos_text(format_row("ITEM / DESCRIPTION", "TOTAL", col_width)))
        buf.extend(cmd_bold_off)
        buf.extend(solid_div)

        for it in items:
            p_name = it.get("product_name", "Item")
            orig_qty = float(it.get("quantity", 0))
            ret_qty = float(it.get("returned_quantity", 0))
            u_price = float(it.get("unit_price", 0))
            disc_amt = float(it.get("discount_amount", 0))
            tot_price = float(it.get("total_price", 0))

            is_fully_returned = (ret_qty >= orig_qty and orig_qty > 0)
            is_partially_returned = (ret_qty > 0 and ret_qty < orig_qty)
            rem_qty = 0 if is_fully_returned else max(0.0, orig_qty - ret_qty)
            line_total = 0.0 if is_fully_returned else (rem_qty * u_price - disc_amt if is_partially_returned else tot_price)
            total_qty += rem_qty

            tag = " (RETURNED)" if is_fully_returned else (f" ({int(ret_qty)} RET)" if is_partially_returned else "")
            buf.extend(cmd_bold_on)
            buf.extend(safe_escpos_text(f"{p_name.upper()}{tag}\n"))
            buf.extend(cmd_bold_off)

            qty_disp = int(orig_qty) if orig_qty.is_integer() else orig_qty
            left_str = f"{qty_disp} pcs @ {currency} {u_price:,.2f}"
            right_str = f"{currency} {line_total:,.2f}"
            buf.extend(safe_escpos_text(format_row(left_str, right_str, col_width)))

            if disc_amt > 0 and not is_fully_returned:
                buf.extend(safe_escpos_text(f"  ↳ Promo Disc: -{currency} {disc_amt:,.2f}\n"))

        buf.extend(solid_div)
        buf.extend(safe_escpos_text(format_row("Items / Units:", f"{len(items)} lines / {int(total_qty) if total_qty.is_integer() else total_qty:.1f} pcs", col_width)))
        buf.extend(solid_div)

    elif layout_mode == "elegant":
        buf.extend(thin_solid_div)
        for it in items:
            p_name = it.get("product_name", "Item")
            orig_qty = float(it.get("quantity", 0))
            ret_qty = float(it.get("returned_quantity", 0))
            u_price = float(it.get("unit_price", 0))
            disc_amt = float(it.get("discount_amount", 0))
            tot_price = float(it.get("total_price", 0))

            is_fully_returned = (ret_qty >= orig_qty and orig_qty > 0)
            is_partially_returned = (ret_qty > 0 and ret_qty < orig_qty)
            rem_qty = 0 if is_fully_returned else max(0.0, orig_qty - ret_qty)
            line_total = 0.0 if is_fully_returned else (rem_qty * u_price - disc_amt if is_partially_returned else tot_price)
            total_qty += rem_qty

            tag = " (Returned)" if is_fully_returned else (f" ({int(ret_qty)} Returned)" if is_partially_returned else "")
            buf.extend(cmd_bold_on)
            buf.extend(safe_escpos_text(f"  {p_name}{tag}\n"))
            buf.extend(cmd_bold_off)

            qty_disp = int(orig_qty) if orig_qty.is_integer() else orig_qty
            left_str = f"    {qty_disp} × {currency} {u_price:,.2f}"
            right_str = f"{currency} {line_total:,.2f}"
            buf.extend(safe_escpos_text(format_dot_leader(left_str, right_str, col_width)))

            if disc_amt > 0 and not is_fully_returned:
                buf.extend(safe_escpos_text(f"    * Courtesy Savings: -{currency} {disc_amt:,.2f}\n"))

        buf.extend(thin_solid_div)

    else:  # classic
        buf.extend(cmd_bold_on)
        buf.extend(safe_escpos_text(format_row("Description", "Amount", col_width)))
        buf.extend(cmd_bold_off)
        buf.extend(solid_div)

        for it in items:
            p_name = it.get("product_name", "Item")
            orig_qty = float(it.get("quantity", 0))
            ret_qty = float(it.get("returned_quantity", 0))
            u_price = float(it.get("unit_price", 0))
            disc_amt = float(it.get("discount_amount", 0))
            tot_price = float(it.get("total_price", 0))

            is_fully_returned = (ret_qty >= orig_qty and orig_qty > 0)
            is_partially_returned = (ret_qty > 0 and ret_qty < orig_qty)
            rem_qty = 0 if is_fully_returned else max(0.0, orig_qty - ret_qty)
            line_total = 0.0 if is_fully_returned else (rem_qty * u_price - disc_amt if is_partially_returned else tot_price)
            total_qty += rem_qty

            tag = " (RETURNED)" if is_fully_returned else (f" ({int(ret_qty) if ret_qty.is_integer() else ret_qty} RET)" if is_partially_returned else "")
            buf.extend(cmd_bold_on)
            buf.extend(safe_escpos_text(f"{p_name}{tag}\n"))
            buf.extend(cmd_bold_off)

            qty_disp = int(orig_qty) if orig_qty.is_integer() else orig_qty
            if is_partially_returned:
                left_str = f"{int(rem_qty) if rem_qty.is_integer() else rem_qty} kept ({qty_disp} orig) x {currency} {u_price:,.2f}"
            else:
                left_str = f"{qty_disp} x {currency} {u_price:,.2f}"
            right_str = f"{currency} {line_total:,.2f}"
            buf.extend(safe_escpos_text(format_row(left_str, right_str, col_width)))

            if disc_amt > 0 and not is_fully_returned:
                buf.extend(safe_escpos_text(f"  -> Disc: -{currency} {disc_amt:,.2f}\n"))

        buf.extend(solid_div)
        buf.extend(safe_escpos_text(format_row("Lines / Units:", f"{len(items)} lines / {int(total_qty) if total_qty.is_integer() else total_qty:.1f} pcs", col_width)))
        buf.extend(solid_div)

    # 5. Financial Totals & Grand Summary
    subtotal = float(sale_data.get("subtotal", 0))
    discount = float(sale_data.get("discount_amount", 0))
    tax_amt = float(sale_data.get("tax_amount", 0))
    tax_rate = float(sale_data.get("tax_rate", 0))
    total_amt = float(sale_data.get("total_amount", 0))
    total_ret_amt = float(sale_data.get("total_returned_amount", 0))
    paid_amt = float(sale_data.get("paid_amount", 0))
    due_amt = float(sale_data.get("due_amount", 0))
    payment_status = str(sale_data.get("payment_status", "PAID")).upper()

    if layout_mode == "compact":
        # 2-line condensed financial totals
        disc_part = f" | DISC: {discount:,.2f}" if discount > 0 else ""
        tax_part = f" | TAX: {tax_amt:,.2f}" if tax_amt > 0 else ""
        buf.extend(safe_escpos_text(f"SUB: {subtotal:,.2f}{disc_part}{tax_part}\n"))
        buf.extend(cmd_bold_on)
        buf.extend(cmd_align_center)
        buf.extend(safe_escpos_text(f">>> TOTAL: {currency} {total_amt:,.2f} <<<\n"))
        buf.extend(cmd_align_left)
        buf.extend(cmd_bold_off)
        paid_line = f"PAID: {paid_amt:,.2f} ({str(payment_method).upper()})"
        if paid_amt > total_amt:
            paid_line += f" | CHANGE: {paid_amt - total_amt:,.2f}"
        buf.extend(safe_escpos_text(f"{paid_line}\n"))
        buf.extend(solid_div)

    elif layout_mode == "modern":
        buf.extend(safe_escpos_text(format_row("Subtotal:", f"{currency} {subtotal:,.2f}", col_width)))
        if discount > 0:
            buf.extend(safe_escpos_text(format_row("Discount:", f"-{currency} {discount:,.2f}", col_width)))
        if tax_amt > 0:
            buf.extend(safe_escpos_text(format_row(f"Tax ({tax_rate}%):", f"+{currency} {tax_amt:,.2f}", col_width)))

        # Solid Framed Total Card
        buf.extend(double_solid_div)
        buf.extend(cmd_align_center)
        buf.extend(safe_escpos_text("TOTAL DUE:\n"))
        buf.extend(cmd_bold_on)
        buf.extend(cmd_double_height)
        buf.extend(safe_escpos_text(f"{currency} {total_amt:,.2f}\n"))
        buf.extend(cmd_normal_size)
        buf.extend(cmd_bold_off)
        buf.extend(cmd_align_left)
        buf.extend(double_solid_div)

        if total_ret_amt > 0:
            net_payable = max(0.0, total_amt - total_ret_amt)
            buf.extend(safe_escpos_text(format_row("Less Returns:", f"-{currency} {total_ret_amt:,.2f}", col_width)))
            buf.extend(cmd_bold_on)
            buf.extend(safe_escpos_text(format_row("NET PAYABLE:", f"{currency} {net_payable:,.2f}", col_width)))
            buf.extend(cmd_bold_off)

        # Payment & Change
        change_amt = max(0.0, paid_amt - total_amt) if paid_amt > total_amt else 0.0
        buf.extend(safe_escpos_text(format_row("Paid:", f"{currency} {paid_amt:,.2f} ({str(payment_method).upper()})", col_width)))
        if due_amt > 0:
            buf.extend(cmd_bold_on)
            buf.extend(safe_escpos_text(format_row("REMAINING DUE:", f"{currency} {due_amt:,.2f}", col_width)))
            buf.extend(cmd_bold_off)
        elif change_amt > 0:
            buf.extend(safe_escpos_text(format_row("Change:", f"{currency} {change_amt:,.2f}", col_width)))
        buf.extend(solid_div)

    elif layout_mode == "elegant":
        buf.extend(safe_escpos_text(format_row("  Subtotal:", f"{currency} {subtotal:,.2f}", col_width)))
        if discount > 0:
            buf.extend(safe_escpos_text(format_row("  Courtesy Discount:", f"-{currency} {discount:,.2f}", col_width)))
        if tax_amt > 0:
            buf.extend(safe_escpos_text(format_row(f"  Sales Tax ({tax_rate}%):", f"+{currency} {tax_amt:,.2f}", col_width)))

        buf.extend(thin_solid_div)
        buf.extend(cmd_align_center)
        buf.extend(safe_escpos_text("NET AMOUNT PAYABLE\n"))
        buf.extend(cmd_bold_on)
        buf.extend(cmd_double_height)
        buf.extend(safe_escpos_text(f"{currency} {total_amt:,.2f}\n"))
        buf.extend(cmd_normal_size)
        buf.extend(cmd_bold_off)
        buf.extend(thin_solid_div)
        buf.extend(cmd_align_left)

        buf.extend(safe_escpos_text(format_row(f"  Tendered via {payment_method}:", f"{currency} {paid_amt:,.2f}", col_width)))
        if due_amt > 0:
            buf.extend(cmd_bold_on)
            buf.extend(safe_escpos_text(format_row("  Balance Due:", f"{currency} {due_amt:,.2f}", col_width)))
            buf.extend(cmd_bold_off)
        elif paid_amt > total_amt:
            buf.extend(safe_escpos_text(format_row("  Change Returned:", f"{currency} {paid_amt - total_amt:,.2f}", col_width)))
        buf.extend(thin_solid_div)

    elif layout_mode == "tabular":
        buf.extend(safe_escpos_text(format_row("Subtotal:", f"{currency} {subtotal:,.2f}", col_width)))
        if discount > 0:
            buf.extend(safe_escpos_text(format_row("Discount:", f"-{currency} {discount:,.2f}", col_width)))
        if tax_amt > 0:
            buf.extend(safe_escpos_text(format_row(f"Tax ({tax_rate}%):", f"+{currency} {tax_amt:,.2f}", col_width)))

        buf.extend(double_solid_div)
        buf.extend(cmd_bold_on)
        buf.extend(safe_escpos_text(format_row("TOTAL AMOUNT:", f"{currency} {total_amt:,.2f}", col_width)))
        buf.extend(cmd_bold_off)
        buf.extend(double_solid_div)

        buf.extend(safe_escpos_text(format_row(f"Paid ({str(payment_method).upper()}):", f"{currency} {paid_amt:,.2f}", col_width)))
        if due_amt > 0:
            buf.extend(cmd_bold_on)
            buf.extend(safe_escpos_text(format_row("DUE BALANCE:", f"{currency} {due_amt:,.2f}", col_width)))
            buf.extend(cmd_bold_off)
        elif paid_amt > total_amt:
            buf.extend(safe_escpos_text(format_row("Change:", f"{currency} {paid_amt - total_amt:,.2f}", col_width)))
        buf.extend(solid_div)

    else:  # classic
        buf.extend(safe_escpos_text(format_row("Subtotal:", f"{currency} {subtotal:,.2f}", col_width)))
        if discount > 0:
            buf.extend(safe_escpos_text(format_row("Order Discount:", f"-{currency} {discount:,.2f}", col_width)))
        if tax_amt > 0:
            buf.extend(safe_escpos_text(format_row(f"Tax ({tax_rate}%):", f"+{currency} {tax_amt:,.2f}", col_width)))

        buf.extend(double_solid_div)
        buf.extend(cmd_bold_on)
        buf.extend(safe_escpos_text(format_row("TOTAL:", f"{currency} {total_amt:,.2f}", col_width)))
        buf.extend(cmd_bold_off)
        buf.extend(double_solid_div)

        if total_ret_amt > 0:
            net_payable = max(0.0, total_amt - total_ret_amt)
            buf.extend(safe_escpos_text(format_row("Less Returns:", f"-{currency} {total_ret_amt:,.2f}", col_width)))
            buf.extend(cmd_bold_on)
            buf.extend(safe_escpos_text(format_row("NET PAYABLE:", f"{currency} {net_payable:,.2f}", col_width)))
            buf.extend(cmd_bold_off)
            buf.extend(solid_div)

        buf.extend(safe_escpos_text(format_row("Paid Amount:", f"{currency} {paid_amt:,.2f}", col_width)))
        if due_amt > 0:
            buf.extend(cmd_bold_on)
            buf.extend(safe_escpos_text(format_row("REMAINING DUE:", f"{currency} {due_amt:,.2f}", col_width)))
            buf.extend(cmd_bold_off)
        else:
            status_text = "PAID IN FULL"
            if payment_status == "RETURNED":
                status_text = "FULLY RETURNED"
            elif payment_status == "PARTIALLY_RETURNED":
                status_text = "SETTLED (PARTIAL RET)"
            buf.extend(safe_escpos_text(format_row("Status:", status_text, col_width)))

        if paid_amt > total_amt:
            change_amt = paid_amt - total_amt
            buf.extend(safe_escpos_text(format_row("Change:", f"{currency} {change_amt:,.2f}", col_width)))

        buf.extend(solid_div)

    # 7. Universal 1-Bit Raster Code 128 Barcode (GS v 0)
    if show_barcode and receipt_no:
        if is_escpos:
            raster_bc = generate_code128_raster_escpos(
                receipt_no,
                paper_width=paper_width,
                height_dots=44 if layout_mode == "compact" or "58" in str(paper_width) else 56,
                include_text=True,
            )
            if raster_bc:
                buf.extend(raster_bc)
                buf.extend(b"\n")
            else:
                buf.extend(cmd_align_center)
                buf.extend(safe_escpos_text(f"* {receipt_no} *\n"))
        else:
            buf.extend(safe_escpos_text(f"* {receipt_no} *\n"))

    # 8. Footer Message
    if footer_text and str(footer_text).strip():
        if profile != "generic_plain":
            buf.extend(CMD_ALIGN_CENTER)
        buf.extend(b"\n")
        buf.extend(safe_escpos_text(f"{str(footer_text).strip()}\n"))

    # Feed lines before cutter/tear bar
    feed_count = max(2, min(8, actual_feed_lines))
    buf.extend(b"\n" * feed_count)

    # 9. Cutter Action
    if profile != "generic_plain" and actual_cut_mode != "tear_only":
        if profile == "star_line":
            buf.extend(CMD_STAR_CUT_FULL if actual_cut_mode == "full" else CMD_STAR_CUT_PARTIAL)
        else:
            buf.extend(CMD_CUT_FULL if actual_cut_mode == "full" else CMD_CUT_PARTIAL)

    # 10. Hardware Buzzer / Beep
    is_beep = beep_enabled if beep_enabled is not None else getattr(settings, "thermal_beep_enabled", True)
    if is_beep and profile != "generic_plain":
        buf.extend(CMD_BEEP)

    return bytes(buf)


def generate_diagnostic_receipt(
    settings: Optional[Any] = None,
    paper_width: str = "80mm",
    printer_profile: str = "standard_escpos",
    printer_name: Optional[str] = None,
    darkness: str = "normal",
    cut_mode: str = "partial",
    feed_lines: int = 4,
) -> bytes:
    """
    Generates a universal hardware calibration and diagnostic test receipt.
    Allows testing character column rulers, density swatches, raster logo banding,
    barcode scanning, and cutter geometry across ANY thermal printer brand.
    """
    col_width = COLUMN_WIDTH_MAP.get(paper_width, 32 if "58" in str(paper_width) else 48)
    profile = (printer_profile or "standard_escpos").lower()
    is_escpos = (profile != "generic_plain")
    solid_div = make_escpos_solid_line(paper_width, thickness_dots=2, is_escpos=is_escpos)
    double_solid_div = make_escpos_double_solid_line(paper_width, is_escpos=is_escpos)
    div = double_solid_div
    sub_div = solid_div

    buf = bytearray()

    # 1. Initialize
    if profile != "generic_plain":
        buf.extend(CMD_INIT)
        buf.extend(CMD_CODEPAGE_CP1252)
        if darkness in ("high", "maximum") and profile == "xprinter_enhanced":
            buf.extend(CMD_HEATING_MAX)
            buf.extend(CMD_DENSITY_MAX)
        if darkness in ("high", "maximum"):
            buf.extend(CMD_DOUBLE_STRIKE_ON)

    # 2. Header & Logo
    if profile != "generic_plain":
        buf.extend(CMD_ALIGN_CENTER)
    logo_source = getattr(settings, "receipt_logo_path", None) or getattr(settings, "logo_path", None)
    raster_logo = image_to_escpos_raster(logo_source, paper_width=paper_width)
    if raster_logo and profile != "generic_plain":
        buf.extend(raster_logo)
        buf.extend(b"\n")

    biz_name = getattr(settings, "business_name", "StockFlow POS") or "StockFlow POS"
    if profile != "generic_plain":
        buf.extend(CMD_BOLD_ON)
        buf.extend(CMD_DOUBLE_SIZE)
    buf.extend(safe_escpos_text(f"{biz_name}\n"))
    if profile != "generic_plain":
        buf.extend(CMD_NORMAL_SIZE)
    buf.extend(safe_escpos_text("THERMAL CALIBRATION & DIAGNOSTIC\n"))
    if profile != "generic_plain":
        buf.extend(CMD_BOLD_OFF)
    buf.extend(div)

    # 3. System & Target Diagnostics
    if profile != "generic_plain":
        buf.extend(CMD_ALIGN_LEFT)
    buf.extend(safe_escpos_text(format_row("System OS:", f"{platform.system()} {platform.release()[:10]}", col_width)))
    buf.extend(safe_escpos_text(format_row("Target Printer:", str(printer_name or "Auto-Resolved Default"), col_width)))
    buf.extend(safe_escpos_text(format_row("Dialect Profile:", profile.upper(), col_width)))
    buf.extend(safe_escpos_text(format_row("Roll / Columns:", f"{paper_width} ({col_width} cols)", col_width)))
    buf.extend(safe_escpos_text(format_row("Print Darkness:", darkness.upper(), col_width)))
    buf.extend(safe_escpos_text(format_row("Cutter Mode:", cut_mode.upper(), col_width)))
    buf.extend(safe_escpos_text(format_row("Feed Spacing:", f"{feed_lines} lines", col_width)))
    buf.extend(safe_escpos_text(format_row("Timestamp:", datetime.now().strftime("%Y-%m-%d %H:%M:%S"), col_width)))
    buf.extend(div)

    # 4. Column Alignment Ruler
    if profile != "generic_plain":
        buf.extend(CMD_ALIGN_CENTER)
        buf.extend(CMD_BOLD_ON)
    buf.extend(safe_escpos_text("--- COLUMN ALIGNMENT RULER ---\n"))
    if profile != "generic_plain":
        buf.extend(CMD_BOLD_OFF)
        buf.extend(CMD_ALIGN_LEFT)

    ruler_digits = "".join(str(i % 10) for i in range(1, col_width + 1)) + "\n"
    ticks = []
    for i in range(1, col_width + 1):
        if i % 10 == 0:
            ticks.append(str(i // 10))
        elif i % 5 == 0:
            ticks.append("+")
        elif i == 1 or i == col_width:
            ticks.append("|")
        else:
            ticks.append(".")
    ruler_ticks = "".join(ticks) + "\n"

    buf.extend(safe_escpos_text(ruler_digits))
    buf.extend(safe_escpos_text(ruler_ticks))
    buf.extend(safe_escpos_text("(If digits wrap to next line, select a narrower column mode)\n"))
    buf.extend(sub_div)

    # 5. Density & Print Head Test
    if profile != "generic_plain":
        buf.extend(CMD_ALIGN_CENTER)
        buf.extend(CMD_BOLD_ON)
    buf.extend(safe_escpos_text("--- PRINT HEAD DENSITY TEST ---\n"))
    if profile != "generic_plain":
        buf.extend(CMD_BOLD_OFF)
    buf.extend(safe_escpos_text("100% Solid: [################################]\n"))
    buf.extend(safe_escpos_text("50% Dither: [::::::::::::::::::::::::::::::::]\n"))
    buf.extend(safe_escpos_text("Double-Burn: Rs. 1,234.50 (Bold/Double Strike)\n"))
    buf.extend(sub_div)

    # 6. Barcode Test
    if profile != "generic_plain":
        buf.extend(CMD_ALIGN_CENTER)
        buf.extend(CMD_BOLD_ON)
    buf.extend(safe_escpos_text("--- HARDWARE BARCODE TEST ---\n"))
    if profile != "generic_plain":
        buf.extend(CMD_BOLD_OFF)
    test_bc = "DIAG-TEST-01"
    if profile != "generic_plain":
        try:
            bc_payload = b"\x7b\x42" + test_bc.encode("ascii")
            buf.extend(GS + b"h\x40")  # 64 dots height
            buf.extend(GS + b"w\x02")  # width multiplier 2
            buf.extend(GS + b"H\x02")  # HRI below
            buf.extend(GS + b"k\x49" + bytes([len(bc_payload)]) + bc_payload)
            buf.extend(b"\n")
        except Exception:
            buf.extend(safe_escpos_text(f"* {test_bc} *\n"))
    else:
        buf.extend(safe_escpos_text(f"* {test_bc} *\n"))

    buf.extend(div)
    if profile != "generic_plain":
        buf.extend(CMD_ALIGN_CENTER)
    buf.extend(safe_escpos_text("CALIBRATION OK - PRINTER READY\n"))
    buf.extend(safe_escpos_text(f"- - - - [ CUT / TEAR HERE ({feed_lines} lines) ] - - - -\n"))

    # 7. Feed lines & Cutter
    feed_count = max(2, min(8, feed_lines))
    buf.extend(b"\n" * feed_count)
    if cut_mode != "tear_only" and profile != "generic_plain":
        if profile == "star_line":
            buf.extend(CMD_STAR_CUT_FULL if cut_mode == "full" else CMD_STAR_CUT_PARTIAL)
        else:
            buf.extend(CMD_CUT_FULL if cut_mode == "full" else CMD_CUT_PARTIAL)

    if profile != "generic_plain" and getattr(settings, "thermal_beep_enabled", True):
        buf.extend(CMD_BEEP)

    return bytes(buf)


def send_network_socket_escpos(target: str, data: bytes, timeout: int = 5) -> int:
    """Connects directly to an Ethernet or Wi-Fi thermal printer via TCP port 9100."""
    import socket
    clean = re.sub(r"^(tcp|socket|net)://", "", target.strip()).split("/")[0]
    if ":" in clean:
        host, port_str = clean.split(":", 1)
        port = int(port_str)
    else:
        host = clean
        port = 9100  # Default standard RAW JetDirect thermal print port

    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        s.settimeout(timeout)
        s.connect((host, port))
        s.sendall(data)
        try:
            s.shutdown(socket.SHUT_WR)
        except Exception:
            pass
    return len(data)


def send_to_thermal_printer(escpos_bytes: bytes, printer_name: Optional[str] = None) -> Dict[str, Any]:
    """
    Sends raw ESC/POS binary data to the designated local or network thermal printer.
    - Network / IP printer (e.g. 192.168.1.100:9100): Direct TCP socket stream (0 drivers needed).
    - macOS / Linux: CUPS raw mode `/usr/bin/lpr -P <name> -l` with auto queue recovery.
    - Windows: 3-tier raw spooler (win32print / winspool.drv / PowerShell).
    """
    # 1. Direct Network / TCP Thermal Printer Dispatch
    if printer_name and is_network_printer_target(printer_name):
        logger.info(f"Dispatching raw ESC/POS payload ({len(escpos_bytes)} bytes) to Network Thermal Printer: {printer_name}")
        try:
            bytes_sent = send_network_socket_escpos(printer_name, escpos_bytes, timeout=5)
            return {
                "success": True,
                "printer": printer_name,
                "bytes_sent": bytes_sent,
                "is_online": True,
                "warning": None,
                "message": f"Successfully sent receipt to Network Thermal Printer at '{printer_name}' via raw TCP socket.",
            }
        except Exception as ex:
            raise RuntimeError(f"Failed to connect to Network Thermal Printer at '{printer_name}': {ex}")

    sys_name = platform.system()

    # Fast-Path Direct Dispatch: When printer_name is already known, attempt immediate spooling
    # without enumerating system printers or spawning PowerShell (sub-10ms latency).
    if printer_name and printer_name.strip() and not is_network_printer_target(printer_name):
        clean_name = printer_name.strip()
        if sys_name == "Windows":
            try:
                bytes_sent = _send_windows_raw(clean_name, escpos_bytes)
                logger.info(f"Fast-path raw ESC/POS direct dispatch to '{clean_name}' succeeded ({bytes_sent} bytes).")
                return {
                    "success": True,
                    "printer": clean_name,
                    "bytes_sent": bytes_sent,
                    "is_online": True,
                    "warning": None,
                    "message": f"Successfully sent receipt to '{clean_name}' via Windows Spooler (RAW, Fast-Path 0ms).",
                }
            except Exception as direct_err:
                logger.info(f"Fast-path direct send to '{clean_name}' failed ({direct_err}), falling back to printer resolver...")
        elif sys_name in ("Darwin", "Linux"):
            lpr_bin = shutil.which("lpr") or "/usr/bin/lpr"
            try:
                cmd = [lpr_bin, "-P", clean_name, "-l"]
                proc = subprocess.Popen(cmd, stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
                _, stderr = proc.communicate(input=escpos_bytes, timeout=4)
                if proc.returncode == 0:
                    logger.info(f"Fast-path raw ESC/POS direct dispatch to '{clean_name}' succeeded ({len(escpos_bytes)} bytes).")
                    return {
                        "success": True,
                        "printer": clean_name,
                        "bytes_sent": len(escpos_bytes),
                        "is_online": True,
                        "warning": None,
                        "message": f"Successfully sent receipt to '{clean_name}' via raw ESC/POS (Fast-Path 0ms).",
                    }
            except Exception as direct_err:
                logger.info(f"Fast-path direct send to '{clean_name}' failed ({direct_err}), falling back to printer resolver...")

    available = list_system_printers()

    # Determine target printer using resilient multi-tier resolver
    target, target_info = resolve_target_printer(printer_name, available)
    if not target:
        raise RuntimeError("No connected printers found on your system. Please connect your thermal printer via USB or specify a network IP.")

    is_online = target_info.get("is_online", True) if target_info else True

    logger.info(f"Dispatching raw ESC/POS payload ({len(escpos_bytes)} bytes) to printer: {target} (online={is_online})")

    if sys_name in ("Darwin", "Linux"):
        # Auto-enable queue in case CUPS paused it after a disconnect
        subprocess.run(["cupsenable", target], capture_output=True, timeout=2)
        subprocess.run(["cupsaccept", target], capture_output=True, timeout=2)

        # 1. Primary spooling: lpr -P <target> -l
        lpr_bin = shutil.which("lpr") or "/usr/bin/lpr"
        lpr_err = ""
        spooled = False
        try:
            cmd = [lpr_bin, "-P", target, "-l"]
            proc = subprocess.Popen(cmd, stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
            stdout, stderr = proc.communicate(input=escpos_bytes, timeout=10)
            if proc.returncode == 0:
                spooled = True
            else:
                lpr_err = stderr.decode("utf-8", errors="replace").strip()
        except Exception as ex:
            lpr_err = str(ex)

        # 2. Resilient fallback: lp -d <target> -o raw
        if not spooled:
            lp_bin = shutil.which("lp") or "/usr/bin/lp"
            try:
                cmd_lp = [lp_bin, "-d", target, "-o", "raw"]
                proc_lp = subprocess.Popen(cmd_lp, stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
                stdout_lp, stderr_lp = proc_lp.communicate(input=escpos_bytes, timeout=10)
                if proc_lp.returncode == 0:
                    spooled = True
                else:
                    lp_err = stderr_lp.decode("utf-8", errors="replace").strip()
                    raise RuntimeError(f"Failed to spool ESC/POS to '{target}': {lpr_err or lp_err or 'printer queue error'}")
            except Exception as ex:
                raise RuntimeError(f"Failed to spool ESC/POS to '{target}': {lpr_err or str(ex)}")

        warning = None
        if not is_online:
            warning = f"Receipt queued for '{target}', but the printer is currently OFFLINE / Powered Off. Please check the power switch and USB cable."

        return {
            "success": True,
            "printer": target,
            "bytes_sent": len(escpos_bytes),
            "is_online": is_online,
            "warning": warning,
            "message": f"Successfully sent receipt to '{target}' via raw ESC/POS." + (f" ({warning})" if warning else ""),
        }

    elif sys_name == "Windows":
        bytes_sent = _send_windows_raw(target, escpos_bytes)
        warning = None
        if not is_online:
            warning = f"Receipt queued for '{target}', but the printer is currently OFFLINE / Powered Off. Please check the power switch and USB cable."

        return {
            "success": True,
            "printer": target,
            "bytes_sent": bytes_sent,
            "is_online": is_online,
            "warning": warning,
            "message": f"Successfully sent receipt to '{target}' via Windows Spooler (RAW)." + (f" ({warning})" if warning else ""),
        }

    raise RuntimeError(f"Unsupported operating system for direct printing: {sys_name}")


def _send_windows_raw(target: str, escpos_bytes: bytes, doc_name: str = "StockFlow Thermal Receipt") -> int:
    """
    Sends raw ESC/POS binary data to a Windows printer using a resilient 3-tier strategy:
    1. win32print (if pywin32 is installed)
    2. ctypes.windll.winspool (built-in standard library Win32 Spooler API, 0 extra dependencies)
    3. PowerShell with .NET RawPrinterHelper (P/Invoke to winspool.drv)
    """
    errors = []

    # 1. Try win32print if available
    try:
        import win32print
        hPrinter = win32print.OpenPrinter(target)
        try:
            hJob = win32print.StartDocPrinter(hPrinter, 1, (doc_name, None, "RAW"))
            try:
                win32print.StartPagePrinter(hPrinter)
                bytes_written = win32print.WritePrinter(hPrinter, escpos_bytes)
                win32print.EndPagePrinter(hPrinter)
                return bytes_written or len(escpos_bytes)
            finally:
                win32print.EndDocPrinter(hPrinter)
        finally:
            win32print.ClosePrinter(hPrinter)
    except ImportError:
        pass
    except Exception as ex:
        errors.append(f"win32print failed: {ex}")

    # 2. Try native ctypes calling winspool.drv directly (standard library on Windows)
    try:
        import ctypes
        from ctypes import wintypes

        class DOC_INFO_1W(ctypes.Structure):
            _fields_ = [
                ("pDocName", wintypes.LPWSTR),
                ("pOutputFile", wintypes.LPWSTR),
                ("pDatatype", wintypes.LPWSTR),
            ]

        win_dll_cls = getattr(ctypes, "WinDLL", getattr(ctypes, "CDLL", None))
        if win_dll_cls is None:
            raise RuntimeError("ctypes WinDLL not available")
        winspool = win_dll_cls("winspool.drv", use_last_error=True)

        OpenPrinterW = winspool.OpenPrinterW
        OpenPrinterW.argtypes = [wintypes.LPWSTR, ctypes.POINTER(wintypes.HANDLE), ctypes.c_void_p]
        OpenPrinterW.restype = wintypes.BOOL

        StartDocPrinterW = winspool.StartDocPrinterW
        StartDocPrinterW.argtypes = [wintypes.HANDLE, wintypes.DWORD, ctypes.POINTER(DOC_INFO_1W)]
        StartDocPrinterW.restype = wintypes.DWORD

        StartPagePrinter = winspool.StartPagePrinter
        StartPagePrinter.argtypes = [wintypes.HANDLE]
        StartPagePrinter.restype = wintypes.BOOL

        WritePrinter = winspool.WritePrinter
        WritePrinter.argtypes = [wintypes.HANDLE, ctypes.c_void_p, wintypes.DWORD, ctypes.POINTER(wintypes.DWORD)]
        WritePrinter.restype = wintypes.BOOL

        EndPagePrinter = winspool.EndPagePrinter
        EndPagePrinter.argtypes = [wintypes.HANDLE]
        EndPagePrinter.restype = wintypes.BOOL

        EndDocPrinter = winspool.EndDocPrinter
        EndDocPrinter.argtypes = [wintypes.HANDLE]
        EndDocPrinter.restype = wintypes.BOOL

        ClosePrinter = winspool.ClosePrinter
        ClosePrinter.argtypes = [wintypes.HANDLE]
        ClosePrinter.restype = wintypes.BOOL

        h_printer = wintypes.HANDLE()
        if not OpenPrinterW(target, ctypes.byref(h_printer), None):
            err = ctypes.get_last_error()
            raise RuntimeError(f"OpenPrinter failed for '{target}': {ctypes.FormatError(err)} (code {err})")

        try:
            doc_info = DOC_INFO_1W()
            doc_info.pDocName = doc_name
            doc_info.pOutputFile = None
            doc_info.pDatatype = "RAW"

            job_id = StartDocPrinterW(h_printer, 1, ctypes.byref(doc_info))
            if job_id == 0:
                err = ctypes.get_last_error()
                raise RuntimeError(f"StartDocPrinter failed for '{target}': {ctypes.FormatError(err)} (code {err})")

            try:
                if not StartPagePrinter(h_printer):
                    err = ctypes.get_last_error()
                    raise RuntimeError(f"StartPagePrinter failed: {ctypes.FormatError(err)} (code {err})")

                try:
                    buf = ctypes.create_string_buffer(escpos_bytes, len(escpos_bytes))
                    bytes_written = wintypes.DWORD(0)
                    if not WritePrinter(h_printer, buf, len(escpos_bytes), ctypes.byref(bytes_written)):
                        err = ctypes.get_last_error()
                        raise RuntimeError(f"WritePrinter failed: {ctypes.FormatError(err)} (code {err})")
                    return bytes_written.value or len(escpos_bytes)
                finally:
                    EndPagePrinter(h_printer)
            finally:
                EndDocPrinter(h_printer)
        finally:
            ClosePrinter(h_printer)
    except Exception as ex:
        errors.append(f"ctypes winspool failed: {ex}")

    # 3. Emergency Fallback: PowerShell via temp file with .NET RawPrinterHelper
    import tempfile, os
    temp_path = None
    try:
        with tempfile.NamedTemporaryFile(delete=False, suffix=".bin") as f:
            f.write(escpos_bytes)
            temp_path = f.name

        ps_code = """
$code = @'
using System;
using System.IO;
using System.Runtime.InteropServices;
public class RawPrinterHelper {
    [StructLayout(LayoutKind.Sequential, CharSet=CharSet.Unicode)]
    public class DOCINFOA {
        [MarshalAs(UnmanagedType.LPWStr)] public string pDocName;
        [MarshalAs(UnmanagedType.LPWStr)] public string pOutputFile;
        [MarshalAs(UnmanagedType.LPWStr)] public string pDataType;
    }
    [DllImport("winspool.Drv", EntryPoint="OpenPrinterW", SetLastError=true, CharSet=CharSet.Unicode, ExactSpelling=true, CallingConvention=CallingConvention.StdCall)]
    public static extern bool OpenPrinter(string pPrinterName, out IntPtr phPrinter, IntPtr pDefault);
    [DllImport("winspool.Drv", EntryPoint="ClosePrinter", SetLastError=true, ExactSpelling=true, CallingConvention=CallingConvention.StdCall)]
    public static extern bool ClosePrinter(IntPtr hPrinter);
    [DllImport("winspool.Drv", EntryPoint="StartDocPrinterW", SetLastError=true, CharSet=CharSet.Unicode, ExactSpelling=true, CallingConvention=CallingConvention.StdCall)]
    public static extern bool StartDocPrinter(IntPtr hPrinter, int level, [In] DOCINFOA di);
    [DllImport("winspool.Drv", EntryPoint="EndDocPrinter", SetLastError=true, ExactSpelling=true, CallingConvention=CallingConvention.StdCall)]
    public static extern bool EndDocPrinter(IntPtr hPrinter);
    [DllImport("winspool.Drv", EntryPoint="StartPagePrinter", SetLastError=true, ExactSpelling=true, CallingConvention=CallingConvention.StdCall)]
    public static extern bool StartPagePrinter(IntPtr hPrinter);
    [DllImport("winspool.Drv", EntryPoint="EndPagePrinter", SetLastError=true, ExactSpelling=true, CallingConvention=CallingConvention.StdCall)]
    public static extern bool EndPagePrinter(IntPtr hPrinter);
    [DllImport("winspool.Drv", EntryPoint="WritePrinter", SetLastError=true, ExactSpelling=true, CallingConvention=CallingConvention.StdCall)]
    public static extern bool WritePrinter(IntPtr hPrinter, IntPtr pBytes, int dwCount, out int dwWritten);

    public static bool SendFile(string szPrinterName, string szFileName, string docName) {
        byte[] bytes = File.ReadAllBytes(szFileName);
        IntPtr pUnmanagedBytes = Marshal.AllocCoTaskMem(bytes.Length);
        Marshal.Copy(bytes, 0, pUnmanagedBytes, bytes.Length);
        IntPtr hPrinter;
        DOCINFOA di = new DOCINFOA();
        di.pDocName = docName;
        di.pDataType = "RAW";
        bool success = false;
        if (OpenPrinter(szPrinterName, out hPrinter, IntPtr.Zero)) {
            if (StartDocPrinter(hPrinter, 1, di) > 0) {
                if (StartPagePrinter(hPrinter)) {
                    int dwWritten = 0;
                    success = WritePrinter(hPrinter, pUnmanagedBytes, bytes.Length, out dwWritten);
                    EndPagePrinter(hPrinter);
                }
                EndDocPrinter(hPrinter);
            }
            ClosePrinter(hPrinter);
        }
        Marshal.FreeCoTaskMem(pUnmanagedBytes);
        return success;
    }
}
'@
Add-Type -TypeDefinition $code -Language CSharp
$res = [RawPrinterHelper]::SendFile($args[0], $args[1], $args[2])
if (-not $res) { exit 1 }
"""
        res = subprocess.run(
            ["powershell", "-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", ps_code, target, temp_path, doc_name],
            capture_output=True,
            text=True,
            timeout=10,
        )
        if res.returncode == 0:
            return len(escpos_bytes)
        errors.append(f"PowerShell raw spooler failed: {res.stderr.strip() or 'Exit code 1'}")
    except Exception as ex:
        errors.append(f"PowerShell fallback failed: {ex}")
    finally:
        if temp_path and os.path.exists(temp_path):
            try:
                os.unlink(temp_path)
            except OSError:
                pass

    joined_errors = "; ".join(errors)
    raise RuntimeError(f"Failed to spool raw ESC/POS to Windows printer '{target}': {joined_errors}")


def clear_printer_queue(printer_name: Optional[str] = None) -> Dict[str, Any]:
    """
    Purges all stuck or stalled print jobs in the spooler and resets/enables the queue.
    """
    sys_name = platform.system()
    if sys_name in ("Darwin", "Linux"):
        cancel_bin = shutil.which("cancel") or "/usr/bin/cancel"
        cmd = [cancel_bin, "-a", printer_name] if printer_name else [cancel_bin, "-a"]
        res = subprocess.run(cmd, capture_output=True, text=True, timeout=5)
        if printer_name:
            subprocess.run(["cupsenable", printer_name], capture_output=True, timeout=2)
            subprocess.run(["cupsaccept", printer_name], capture_output=True, timeout=2)
        return {
            "success": res.returncode == 0,
            "message": f"Print queue for '{printer_name or 'all printers'}' successfully cleared and reset.",
        }
    elif sys_name == "Windows":
        try:
            if printer_name:
                safe_name = printer_name.replace("'", "''")
                cmd = ["powershell", "-NoProfile", "-Command", f"Get-PrintJob -PrinterName '{safe_name}' | Remove-PrintJob -Confirm:$false"]
            else:
                cmd = ["powershell", "-NoProfile", "-Command", "Get-Printer | ForEach-Object { Get-PrintJob -PrinterName $_.Name | Remove-PrintJob -Confirm:$false }"]
            res = subprocess.run(cmd, capture_output=True, text=True, timeout=5)
            return {
                "success": res.returncode == 0,
                "message": f"Print queue for '{printer_name or 'all printers'}' cleared successfully.",
            }
        except Exception as e:
            return {"success": False, "message": f"Failed to clear Windows print queue: {e}"}
    return {"success": False, "message": f"Unsupported OS: {sys_name}"}


def diagnose_printer_subsystem(target_printer_name: Optional[str] = None) -> Dict[str, Any]:
    """
    Performs comprehensive diagnostic checks on the host OS printing subsystem:
    1. Spooler Service Status (Windows Spooler service / CUPS scheduler)
    2. Detected printer inventory & connection health
    3. Target printer configuration, reachability, and handle validation
    4. Spooler queue depth (counts pending / stuck / errored jobs)
    5. Actionable diagnosis and remediation suggestions
    """
    sys_name = platform.system()
    issues: List[str] = []
    recommendations: List[str] = []
    spooler_running = True
    queue_job_count = 0

    # 1. Spooler Service Check
    if sys_name == "Windows":
        try:
            res = subprocess.run(["sc", "query", "spooler"], capture_output=True, text=True, timeout=2)
            if res.returncode == 0:
                spooler_running = "RUNNING" in res.stdout.upper()
            else:
                spooler_running = True
        except Exception:
            spooler_running = True
    elif sys_name in ("Darwin", "Linux"):
        try:
            res = subprocess.run(["lpstat", "-r"], capture_output=True, text=True, timeout=2)
            spooler_running = "running" in res.stdout.lower() and "not running" not in res.stdout.lower()
        except Exception:
            spooler_running = True

    if not spooler_running:
        issues.append("Print Spooler service is stopped or inactive on host machine.")
        if sys_name == "Windows":
            recommendations.append("Start the 'Print Spooler' service in Windows Services (services.msc) or run 'net start spooler' as Administrator.")
        else:
            recommendations.append("Start the CUPS print daemon by running 'sudo cupsenable' or restarting cupsd.")

    # 2. Printers enumeration (force fresh deep scan for diagnostics)
    available = list_system_printers(force_refresh=True, include_wmi=True)
    if not available:
        issues.append("No local or network printers found on host system.")
        recommendations.append("Connect your thermal printer via USB or assign a network IP printer (e.g. 192.168.1.100:9100) in Settings.")

    # 3. Target printer resolution & queue inspection
    resolved_name, target_info = resolve_target_printer(target_printer_name, available)
    printer_found = bool(resolved_name)
    is_online = target_info.get("is_online", True) if target_info else True
    port_name = target_info.get("device_uri", "") if target_info else ""

    if target_printer_name and not target_info:
        issues.append(f"Configured printer '{target_printer_name}' was not found among connected devices.")
        recommendations.append("Check the printer USB connection and power switch, or select an available printer in Settings.")

    if target_info and not is_online:
        issues.append(f"Printer '{resolved_name}' is currently OFFLINE or Powered Off.")
        recommendations.append("Turn ON the printer power switch, check for paper roll empty LED, and ensure 'Use Printer Offline' is unchecked in Windows Printer Properties.")

    # 4. Queue stuck jobs check
    if sys_name == "Windows":
        try:
            if target_printer_name:
                safe_t = target_printer_name.replace("'", "''")
                cmd = ["powershell", "-NoProfile", "-Command", f"@((Get-PrintJob -PrinterName '{safe_t}' -ErrorAction SilentlyContinue)).Count"]
            else:
                cmd = ["powershell", "-NoProfile", "-Command", "@((Get-PrintJob -ErrorAction SilentlyContinue)).Count"]
            res = subprocess.run(cmd, capture_output=True, text=True, timeout=3)
            if res.returncode == 0 and res.stdout.strip().isdigit():
                queue_job_count = int(res.stdout.strip())
        except Exception:
            queue_job_count = 0
    elif sys_name in ("Darwin", "Linux"):
        try:
            cmd = ["lpstat", "-o", resolved_name] if resolved_name else ["lpstat", "-o"]
            res = subprocess.run(cmd, capture_output=True, text=True, timeout=2)
            if res.returncode == 0:
                queue_job_count = len([line for line in res.stdout.splitlines() if line.strip()])
        except Exception:
            queue_job_count = 0

    if queue_job_count > 0:
        issues.append(f"There are {queue_job_count} pending or stuck job(s) in the print spooler queue.")
        recommendations.append("Click 'Clear Spooler Queue' to remove stuck jobs and unblock printer communication.")

    # 5. Handle open test
    if resolved_name and sys_name == "Windows":
        try:
            import win32print
            h = win32print.OpenPrinter(resolved_name)
            win32print.ClosePrinter(h)
        except ImportError:
            pass
        except Exception as e:
            issues.append(f"Cannot open direct spooler handle to '{resolved_name}': {e}")
            recommendations.append("Ensure StokFlow has permission to access the printer and no other application has locked the port.")

    # Status classification
    if not spooler_running or not available or (target_printer_name and not target_info):
        overall_status = "error"
    elif issues:
        overall_status = "warning"
    else:
        overall_status = "healthy"
        recommendations.append("Printer subsystem is healthy and ready for instant printing.")

    return {
        "status": overall_status,
        "spooler_running": spooler_running,
        "target_printer": target_printer_name,
        "resolved_printer": resolved_name,
        "printer_found": printer_found,
        "is_online": is_online,
        "queue_job_count": queue_job_count,
        "port_name": port_name,
        "os_name": sys_name,
        "issues": issues,
        "recommendations": recommendations,
        "printers": available,
    }

