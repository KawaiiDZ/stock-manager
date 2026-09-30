import base64
import io
import logging
import os
import platform
import re
import shutil
import subprocess
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


def list_system_printers() -> List[Dict[str, Any]]:
    """
    Enumerates connected/configured printers on the host system (macOS / Linux / Windows).
    Identifies thermal receipt printers by name and connection URI.
    """
    printers = []
    sys_name = platform.system()

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
        try:
            # Query Windows printers via PowerShell including offline & status attributes
            cmd = ["powershell", "-NoProfile", "-Command", "Get-Printer | Select-Object Name, PortName, Type, IsDefault, PrinterStatus, WorkOffline | ConvertTo-Json -Compress"]
            p = subprocess.run(cmd, capture_output=True, text=True, timeout=5)
            if p.returncode == 0 and p.stdout.strip():
                import json
                data = json.loads(p.stdout.strip())
                if isinstance(data, dict):
                    data = [data]
                for item in data:
                    pname = item.get("Name", "")
                    if not pname:
                        continue
                    is_default = bool(item.get("IsDefault", False))
                    port = str(item.get("PortName", ""))
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
                    printers.append({
                        "name": pname,
                        "is_default": is_default,
                        "is_thermal": is_thermal,
                        "device_uri": port,
                        "status": status_text,
                        "is_online": not is_offline,
                    })
        except Exception as e:
            logger.warning(f"Could not list Windows printers: {e}")

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
                target_dots_w = 128
            else:
                total_bytes_per_row = 32
                target_dots_w = 144
        else:
            if "compact" in paper_width:
                total_bytes_per_row = 42
                target_dots_w = 168
            else:
                total_bytes_per_row = 48
                target_dots_w = 192

        orig_w, orig_h = img.size
        if orig_w <= 0 or orig_h <= 0:
            return None

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

        # Emit in buffer-safe vertical bands (max 24 dots height per chunk)
        # Prevents receive buffer overflow on POS-80 / POS-58 hardware with 2KB-4KB RAM
        band_h_limit = 24
        raster_chunks = bytearray()

        for start_row in range(0, new_h, band_h_limit):
            chunk_h = min(band_h_limit, new_h - start_row)
            chunk_data = bytearray()
            for r in range(start_row, start_row + chunk_h):
                r_slice = raw_img_bytes[r * img_bytes_per_row : (r + 1) * img_bytes_per_row]
                chunk_data.extend(b"\x00" * left_pad)
                for b in r_slice:
                    chunk_data.append(~b & 0xFF)
                chunk_data.extend(b"\x00" * right_pad)

            xL = total_bytes_per_row & 0xFF
            xH = (total_bytes_per_row >> 8) & 0xFF
            yL = chunk_h & 0xFF
            yH = (chunk_h >> 8) & 0xFF

            # GS v 0 0 xL xH yL yH <chunk_data>
            header = bytes([0x1D, 0x76, 0x30, 0x00, xL, xH, yL, yH])
            raster_chunks.extend(header + chunk_data)

        return bytes(raster_chunks)

    except Exception as ex:
        logger.warning(f"Failed to generate ESC/POS raster image logo: {ex}")
        return None


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

    # Use solid double-divider only in maximum darkness mode; otherwise crisp standard divider
    div_line = ("=" * col_width + "\n") if density_mode == "maximum" else ("-" * col_width + "\n")
    double_div = "=" * col_width + "\n"

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

    # Store Name in Large Bold
    buf.extend(cmd_bold_on)
    buf.extend(cmd_double_size)
    display_shop_name = shop_name.upper() if layout_mode == "modern" else shop_name
    buf.extend(safe_escpos_text(f"{display_shop_name}\n"))
    buf.extend(cmd_normal_size)
    buf.extend(cmd_bold_off)

    if shop_address:
        for line in shop_address.splitlines():
            buf.extend(safe_escpos_text(f"{line.strip()}\n"))
    if shop_phone:
        buf.extend(safe_escpos_text(f"Phone: {shop_phone}\n"))
    if custom_header and custom_header.strip().lower() != shop_name.strip().lower():
        buf.extend(safe_escpos_text(f"{custom_header.strip()}\n"))

    buf.extend(cmd_align_left)
    buf.extend(safe_escpos_text(div_line))

    # 3. Receipt Info
    receipt_no = sale_data.get("receipt_number", "RECEIPT")
    created_at = sale_data.get("created_at")
    if isinstance(created_at, datetime):
        dt_str = created_at.strftime("%Y-%m-%d %I:%M %p")
    elif isinstance(created_at, str):
        try:
            dt = datetime.fromisoformat(created_at.replace("Z", "+00:00"))
            dt_str = dt.strftime("%Y-%m-%d %I:%M %p")
        except Exception:
            dt_str = str(created_at)[:19]
    else:
        dt_str = datetime.now().strftime("%Y-%m-%d %I:%M %p")

    cust_name = sale_data.get("customer_name") or "Counter Walk-in"
    payment_method = sale_data.get("payment_method", "CASH")
    payments = sale_data.get("payments", [])
    if payments and isinstance(payments, list) and len(payments) > 0:
        p0 = payments[0]
        if isinstance(p0, dict):
            payment_method = p0.get("payment_method", payment_method)

    buf.extend(safe_escpos_text(format_row("Receipt #:", receipt_no, col_width)))
    buf.extend(safe_escpos_text(format_row("Date:", dt_str, col_width)))
    buf.extend(safe_escpos_text(format_row("Customer:", cust_name, col_width)))
    buf.extend(safe_escpos_text(format_row("Payment:", str(payment_method).upper(), col_width)))

    buf.extend(safe_escpos_text(div_line))

    # 4. Items Table Header
    buf.extend(cmd_bold_on)
    col_desc = "DESCRIPTION" if layout_mode == "modern" else "Description"
    col_amt = "AMOUNT" if layout_mode == "modern" else "Amount"
    buf.extend(safe_escpos_text(format_row(col_desc, col_amt, col_width)))
    buf.extend(cmd_bold_off)
    buf.extend(safe_escpos_text(div_line))

    items = sale_data.get("items", [])
    total_qty = 0
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

        # Line 1: Item Name
        tag = " (RETURNED)" if is_fully_returned else (f" ({int(ret_qty) if ret_qty.is_integer() else ret_qty} RET)" if is_partially_returned else "")
        buf.extend(cmd_bold_on)
        buf.extend(safe_escpos_text(f"{p_name}{tag}\n"))
        buf.extend(cmd_bold_off)

        # Line 2: Qty x Unit Price ... Line Total
        qty_disp = int(orig_qty) if orig_qty.is_integer() else orig_qty
        if is_partially_returned:
            left_str = f"{int(rem_qty) if rem_qty.is_integer() else rem_qty} kept ({qty_disp} orig) x {currency} {u_price:,.2f}"
        else:
            left_str = f"{qty_disp} x {currency} {u_price:,.2f}"
        right_str = f"{currency} {line_total:,.2f}"

        buf.extend(safe_escpos_text(format_row(left_str, right_str, col_width)))

        # Line 3: Discount if any
        if disc_amt > 0 and not is_fully_returned:
            disc_tag = "  ↳ Item Disc:" if layout_mode == "modern" else "  -> Disc:"
            buf.extend(safe_escpos_text(f"{disc_tag} -{currency} {disc_amt:,.2f}\n"))

    buf.extend(safe_escpos_text(div_line))
    units_label = "Items / Units:" if layout_mode == "modern" else "Lines / Units:"
    buf.extend(safe_escpos_text(format_row(units_label, f"{len(items)} lines / {int(total_qty) if total_qty.is_integer() else total_qty:.1f} pcs", col_width)))
    buf.extend(safe_escpos_text(div_line))

    # 5. Totals
    subtotal = float(sale_data.get("subtotal", 0))
    discount = float(sale_data.get("discount_amount", 0))
    tax_amt = float(sale_data.get("tax_amount", 0))
    tax_rate = float(sale_data.get("tax_rate", 0))
    total_amt = float(sale_data.get("total_amount", 0))
    total_ret_amt = float(sale_data.get("total_returned_amount", 0))
    paid_amt = float(sale_data.get("paid_amount", 0))
    due_amt = float(sale_data.get("due_amount", 0))
    payment_status = str(sale_data.get("payment_status", "PAID")).upper()

    buf.extend(safe_escpos_text(format_row("Subtotal:", f"{currency} {subtotal:,.2f}", col_width)))
    if discount > 0:
        buf.extend(safe_escpos_text(format_row("Order Discount:", f"-{currency} {discount:,.2f}", col_width)))
    if tax_amt > 0:
        buf.extend(safe_escpos_text(format_row(f"Tax ({tax_rate}%):", f"+{currency} {tax_amt:,.2f}", col_width)))

    # TOTAL IN BOLD
    buf.extend(safe_escpos_text(double_div))
    buf.extend(cmd_bold_on)
    buf.extend(safe_escpos_text(format_row("TOTAL:", f"{currency} {total_amt:,.2f}", col_width)))
    buf.extend(cmd_bold_off)
    buf.extend(safe_escpos_text(double_div))

    if total_ret_amt > 0:
        net_payable = max(0.0, total_amt - total_ret_amt)
        buf.extend(safe_escpos_text(format_row("Less Returns:", f"-{currency} {total_ret_amt:,.2f}", col_width)))
        buf.extend(cmd_bold_on)
        buf.extend(safe_escpos_text(format_row("NET PAYABLE:", f"{currency} {net_payable:,.2f}", col_width)))
        buf.extend(cmd_bold_off)
        buf.extend(safe_escpos_text(div_line))

    # 6. Payment & Due Balance
    paid_label = "Paid:" if layout_mode == "modern" else "Paid Amount:"
    buf.extend(safe_escpos_text(format_row(paid_label, f"{currency} {paid_amt:,.2f}", col_width)))
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

    buf.extend(safe_escpos_text(div_line))

    # 7. Code 128 Barcode with Code Set B prefix
    if show_barcode and receipt_no:
        if is_escpos:
            buf.extend(cmd_align_center)
            try:
                # Code 128 in ESC/POS: GS k 73 (0x49) <len> {B <data>
                clean_bc = re.sub(r"[^A-Za-z0-9_-]", "", receipt_no)
                if clean_bc:
                    bc_payload = b"\x7b\x42" + clean_bc.encode("ascii")
                    buf.extend(GS + b"h\x48")  # Height = 72 dots
                    buf.extend(GS + b"w\x03" if "58" not in str(paper_width) else GS + b"w\x02")  # Width multiplier
                    buf.extend(GS + b"H\x02")  # HRI text below
                    buf.extend(GS + b"k\x49" + bytes([len(bc_payload)]) + bc_payload)
                    buf.extend(b"\n")
            except Exception as e:
                logger.warning(f"Barcode ESC/POS generation failed: {e}")
                buf.extend(safe_escpos_text(f"* {receipt_no} *\n"))
        else:
            buf.extend(safe_escpos_text(f"* {receipt_no} *\n"))

    # 8. Footer Message
    if profile != "generic_plain":
        buf.extend(CMD_ALIGN_CENTER)
    buf.extend(b"\n")
    buf.extend(safe_escpos_text(f"{footer_text}\n"))

    # Feed lines before cutter/tear bar
    feed_count = max(2, min(8, actual_feed_lines))
    buf.extend(b"\n" * feed_count)

    # 9. Cutter Action
    if profile != "generic_plain" and actual_cut_mode != "tear_only":
        if profile == "star_line":
            buf.extend(CMD_STAR_CUT_FULL if actual_cut_mode == "full" else CMD_STAR_CUT_PARTIAL)
        else:
            buf.extend(CMD_CUT_FULL if actual_cut_mode == "full" else CMD_CUT_PARTIAL)

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

    div = "=" * col_width + "\n"
    sub_div = "-" * col_width + "\n"

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
    buf.extend(safe_escpos_text(div))

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
    buf.extend(safe_escpos_text(div))

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
    buf.extend(safe_escpos_text(sub_div))

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
    buf.extend(safe_escpos_text(sub_div))

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

    buf.extend(safe_escpos_text(div))
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
