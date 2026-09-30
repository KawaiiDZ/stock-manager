import logging
import platform
import re
import shutil
import subprocess
from datetime import datetime
from typing import List, Dict, Any, Optional

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
# Dual-pin cash drawer kick (Pin 2 and Pin 5 standard RJ11 pulses)
CMD_CASH_DRAWER_KICK_PIN2 = ESC + b"p\x00\x19\xfa"
CMD_CASH_DRAWER_KICK_PIN5 = ESC + b"p\x01\x19\xfa"
CMD_CASH_DRAWER_KICK = CMD_CASH_DRAWER_KICK_PIN2 + CMD_CASH_DRAWER_KICK_PIN5


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
                    m = re.match(r"^printer\s+(\S+)\s+(is\s+\w+.*)$", line)
                    if m:
                        current_p = m.group(1)
                        printer_status[current_p] = m.group(2)

            for pname, status_str in printer_status.items():
                dev = device_map.get(pname, "")
                is_default = (pname == dest)
                search_str = f"{pname} {dev}".lower()
                is_thermal = any(
                    k in search_str
                    for k in ["pos", "escpo", "thermal", "receipt", "xprinter", "zijiang", "epson_tm", "80", "58", "printercmd"]
                )
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
                    is_thermal = any(
                        k in search_str
                        for k in ["pos", "escpo", "thermal", "receipt", "xprinter", "zijiang", "epson", "80", "58"]
                    )
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


def resolve_target_printer(
    requested_name: Optional[str],
    available: List[Dict[str, Any]]
) -> tuple[Optional[str], Optional[Dict[str, Any]]]:
    """
    Intelligently resolves the target printer using a 5-tier fuzzy matching algorithm:
    1. Exact case-sensitive match
    2. Case-insensitive exact match
    3. Alphanumeric slug match (ignores spaces, hyphens, underscores)
    4. Substring containment match (e.g. 'POS-80' matches 'POS-80 (Copy 1)')
    5. Fallback to first available online thermal printer, then system default
    """
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


def generate_escpos_receipt(
    sale_data: Dict[str, Any],
    settings: Optional[Any] = None,
    paper_width: str = "80mm",
    header_style: str = "logo_text",
    show_barcode: bool = True,
    kick_drawer: bool = False,
    darkness: Optional[str] = None,
) -> bytes:
    """
    Builds a complete, formatted ESC/POS binary receipt payload.
    Supports 80mm (48 column) and 58mm (32 column) layouts.
    Configured for maximum thermal head heating and deep, pitch-black print density.
    """
    col_width = 32 if paper_width == "58mm" else 48
    density_mode = darkness or getattr(settings, "thermal_darkness", "normal") or "normal"

    # Use solid double-divider only in maximum darkness mode; otherwise crisp standard divider
    div_line = ("=" * col_width + "\n") if density_mode == "maximum" else ("-" * col_width + "\n")
    double_div = "=" * col_width + "\n"

    shop_name = getattr(settings, "business_name", "My Local Business") or "My Local Business"
    shop_address = getattr(settings, "address", "") or ""
    shop_phone = getattr(settings, "phone", "") or ""
    custom_header = getattr(settings, "receipt_header", "") or ""
    footer_text = getattr(settings, "receipt_footer", "Thank you for your business!") or "Thank you for your business!"
    currency = getattr(settings, "currency", "Rs.") or "Rs."

    buf = bytearray()

    # 1. Initialize Printer & Set Maximum Thermal Heating Density
    buf.extend(CMD_INIT)
    if density_mode in ("maximum", "high"):
        buf.extend(CMD_HEATING_MAX)        # 2.55ms max heating duration on POS-80/58
        buf.extend(CMD_DENSITY_MAX)        # DC2 # 31: max darkness level 31/31
        buf.extend(CMD_EPSON_DENSITY_MAX)  # GS ~ 1 4: Epson/Star density +4
        buf.extend(CMD_DOUBLE_STRIKE_ON)   # ESC G 1: Double-strike mode for rich, pitch-black text

    # Cash drawer kick if requested
    if kick_drawer:
        buf.extend(CMD_CASH_DRAWER_KICK)

    # 2. Header
    buf.extend(CMD_ALIGN_CENTER)

    if header_style == "logo_text":
        buf.extend(CMD_BOLD_ON)
        buf.extend(b"[ STOKFLOW POS ]\n")
        buf.extend(CMD_BOLD_OFF)

    # Store Name in Large Bold
    buf.extend(CMD_BOLD_ON)
    buf.extend(CMD_DOUBLE_SIZE)
    buf.extend(safe_escpos_text(f"{shop_name}\n"))
    buf.extend(CMD_NORMAL_SIZE)
    buf.extend(CMD_BOLD_OFF)

    if shop_address:
        for line in shop_address.splitlines():
            buf.extend(safe_escpos_text(f"{line.strip()}\n"))
    if shop_phone:
        buf.extend(safe_escpos_text(f"Phone: {shop_phone}\n"))
    if custom_header and custom_header.strip().lower() != shop_name.strip().lower():
        buf.extend(safe_escpos_text(f"{custom_header.strip()}\n"))

    buf.extend(CMD_ALIGN_LEFT)
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
    buf.extend(CMD_BOLD_ON)
    buf.extend(safe_escpos_text(format_row("Description", "Amount", col_width)))
    buf.extend(CMD_BOLD_OFF)
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
        buf.extend(CMD_BOLD_ON)
        buf.extend(safe_escpos_text(f"{p_name}{tag}\n"))
        buf.extend(CMD_BOLD_OFF)

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
            buf.extend(safe_escpos_text(f"  -> Disc: -{currency} {disc_amt:,.2f}\n"))

    buf.extend(safe_escpos_text(div_line))
    buf.extend(safe_escpos_text(format_row("Lines / Units:", f"{len(items)} lines / {int(total_qty) if total_qty.is_integer() else total_qty:.1f} pcs", col_width)))
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
    buf.extend(CMD_BOLD_ON)
    buf.extend(safe_escpos_text(format_row("TOTAL:", f"{currency} {total_amt:,.2f}", col_width)))
    buf.extend(CMD_BOLD_OFF)
    buf.extend(safe_escpos_text(double_div))

    if total_ret_amt > 0:
        net_payable = max(0.0, total_amt - total_ret_amt)
        buf.extend(safe_escpos_text(format_row("Less Returns:", f"-{currency} {total_ret_amt:,.2f}", col_width)))
        buf.extend(CMD_BOLD_ON)
        buf.extend(safe_escpos_text(format_row("NET PAYABLE:", f"{currency} {net_payable:,.2f}", col_width)))
        buf.extend(CMD_BOLD_OFF)
        buf.extend(safe_escpos_text(div_line))

    # 6. Payment & Due Balance
    buf.extend(safe_escpos_text(format_row("Paid Amount:", f"{currency} {paid_amt:,.2f}", col_width)))
    if due_amt > 0:
        buf.extend(CMD_BOLD_ON)
        buf.extend(safe_escpos_text(format_row("REMAINING DUE:", f"{currency} {due_amt:,.2f}", col_width)))
        buf.extend(CMD_BOLD_OFF)
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
        buf.extend(CMD_ALIGN_CENTER)
        try:
            # Code 128 in ESC/POS: GS k 73 (0x49) <len> {B <data>
            clean_bc = re.sub(r"[^A-Za-z0-9_-]", "", receipt_no)
            if clean_bc:
                bc_payload = b"\x7b\x42" + clean_bc.encode("ascii")
                buf.extend(GS + b"h\x48")  # Height = 72 dots
                buf.extend(GS + b"w\x03" if paper_width != "58mm" else GS + b"w\x02")  # Width multiplier
                buf.extend(GS + b"H\x02")  # HRI text below
                buf.extend(GS + b"k\x49" + bytes([len(bc_payload)]) + bc_payload)
                buf.extend(b"\n")
        except Exception as e:
            logger.warning(f"Barcode ESC/POS generation failed: {e}")
            buf.extend(safe_escpos_text(f"* {receipt_no} *\n"))

    # 8. Footer Message
    buf.extend(CMD_ALIGN_CENTER)
    buf.extend(b"\n")
    buf.extend(safe_escpos_text(f"{footer_text}\n"))
    buf.extend(b"\n\n\n\n")

    # 9. Partial or Full Cut
    buf.extend(CMD_CUT_PARTIAL)

    return bytes(buf)


def send_to_thermal_printer(escpos_bytes: bytes, printer_name: Optional[str] = None) -> Dict[str, Any]:
    """
    Sends raw ESC/POS binary data to the designated local thermal printer.
    On macOS / Linux: uses `/usr/bin/lpr -P <name> -l` (raw mode, zero PostScript translation).
    On Windows: uses Windows Print Spooler raw API.
    """
    sys_name = platform.system()
    available = list_system_printers()

    # Determine target printer using resilient multi-tier resolver
    target, target_info = resolve_target_printer(printer_name, available)
    if not target:
        raise RuntimeError("No connected printers found on your system. Please connect your thermal printer via USB.")

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
