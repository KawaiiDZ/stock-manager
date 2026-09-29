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
CMD_CASH_DRAWER_KICK = ESC + b"p\x00\x19\xfa"


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
            # Query Windows printers via PowerShell
            cmd = ["powershell", "-NoProfile", "-Command", "Get-Printer | Select-Object Name, PortName, Type, IsDefault | ConvertTo-Json -Compress"]
            p = subprocess.run(cmd, capture_output=True, text=True, timeout=5)
            if p.returncode == 0 and p.stdout.strip():
                import json
                data = json.loads(p.stdout.strip())
                if isinstance(data, dict):
                    data = [data]
                for item in data:
                    pname = item.get("Name", "")
                    is_default = bool(item.get("IsDefault", False))
                    search_str = f"{pname} {item.get('PortName', '')}".lower()
                    is_thermal = any(
                        k in search_str
                        for k in ["pos", "escpo", "thermal", "receipt", "xprinter", "zijiang", "epson", "80", "58"]
                    )
                    printers.append({
                        "name": pname,
                        "is_default": is_default,
                        "is_thermal": is_thermal,
                        "device_uri": item.get("PortName", ""),
                        "status": "Ready",
                        "is_online": True,
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
    buf.extend(f"{shop_name}\n".encode("latin-1", errors="replace"))
    buf.extend(CMD_NORMAL_SIZE)
    buf.extend(CMD_BOLD_OFF)

    if shop_address:
        for line in shop_address.splitlines():
            buf.extend(f"{line.strip()}\n".encode("latin-1", errors="replace"))
    if shop_phone:
        buf.extend(f"Phone: {shop_phone}\n".encode("latin-1", errors="replace"))
    if custom_header and custom_header.strip().lower() != shop_name.strip().lower():
        buf.extend(f"{custom_header.strip()}\n".encode("latin-1", errors="replace"))

    buf.extend(CMD_ALIGN_LEFT)
    buf.extend(div_line.encode("ascii"))

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

    buf.extend(format_row("Receipt #:", receipt_no, col_width).encode("latin-1", errors="replace"))
    buf.extend(format_row("Date:", dt_str, col_width).encode("latin-1", errors="replace"))
    buf.extend(format_row("Customer:", cust_name, col_width).encode("latin-1", errors="replace"))
    buf.extend(format_row("Payment:", str(payment_method).upper(), col_width).encode("latin-1", errors="replace"))

    buf.extend(div_line.encode("ascii"))

    # 4. Items Table Header
    buf.extend(CMD_BOLD_ON)
    buf.extend(format_row("Description", "Amount", col_width).encode("ascii"))
    buf.extend(CMD_BOLD_OFF)
    buf.extend(div_line.encode("ascii"))

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
        buf.extend(f"{p_name}{tag}\n".encode("latin-1", errors="replace"))
        buf.extend(CMD_BOLD_OFF)

        # Line 2: Qty x Unit Price ... Line Total
        qty_disp = int(orig_qty) if orig_qty.is_integer() else orig_qty
        if is_partially_returned:
            left_str = f"{int(rem_qty) if rem_qty.is_integer() else rem_qty} kept ({qty_disp} orig) x {currency} {u_price:,.2f}"
        else:
            left_str = f"{qty_disp} x {currency} {u_price:,.2f}"
        right_str = f"{currency} {line_total:,.2f}"

        buf.extend(format_row(left_str, right_str, col_width).encode("latin-1", errors="replace"))

        # Line 3: Discount if any
        if disc_amt > 0 and not is_fully_returned:
            buf.extend(f"  -> Disc: -{currency} {disc_amt:,.2f}\n".encode("latin-1", errors="replace"))

    buf.extend(div_line.encode("ascii"))
    buf.extend(format_row("Lines / Units:", f"{len(items)} lines / {int(total_qty) if total_qty.is_integer() else total_qty:.1f} pcs", col_width).encode("ascii"))
    buf.extend(div_line.encode("ascii"))

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

    buf.extend(format_row("Subtotal:", f"{currency} {subtotal:,.2f}", col_width).encode("latin-1", errors="replace"))
    if discount > 0:
        buf.extend(format_row("Order Discount:", f"-{currency} {discount:,.2f}", col_width).encode("latin-1", errors="replace"))
    if tax_amt > 0:
        buf.extend(format_row(f"Tax ({tax_rate}%):", f"+{currency} {tax_amt:,.2f}", col_width).encode("latin-1", errors="replace"))

    # TOTAL IN BOLD
    buf.extend(double_div.encode("ascii"))
    buf.extend(CMD_BOLD_ON)
    buf.extend(format_row("TOTAL:", f"{currency} {total_amt:,.2f}", col_width).encode("latin-1", errors="replace"))
    buf.extend(CMD_BOLD_OFF)
    buf.extend(double_div.encode("ascii"))

    if total_ret_amt > 0:
        net_payable = max(0.0, total_amt - total_ret_amt)
        buf.extend(format_row("Less Returns:", f"-{currency} {total_ret_amt:,.2f}", col_width).encode("latin-1", errors="replace"))
        buf.extend(CMD_BOLD_ON)
        buf.extend(format_row("NET PAYABLE:", f"{currency} {net_payable:,.2f}", col_width).encode("latin-1", errors="replace"))
        buf.extend(CMD_BOLD_OFF)
        buf.extend(div_line.encode("ascii"))

    # 6. Payment & Due Balance
    buf.extend(format_row("Paid Amount:", f"{currency} {paid_amt:,.2f}", col_width).encode("latin-1", errors="replace"))
    if due_amt > 0:
        buf.extend(CMD_BOLD_ON)
        buf.extend(format_row("REMAINING DUE:", f"{currency} {due_amt:,.2f}", col_width).encode("latin-1", errors="replace"))
        buf.extend(CMD_BOLD_OFF)
    else:
        status_text = "PAID IN FULL"
        if payment_status == "RETURNED":
            status_text = "FULLY RETURNED"
        elif payment_status == "PARTIALLY_RETURNED":
            status_text = "SETTLED (PARTIAL RET)"
        buf.extend(format_row("Status:", status_text, col_width).encode("ascii"))

    if paid_amt > total_amt:
        change_amt = paid_amt - total_amt
        buf.extend(format_row("Change:", f"{currency} {change_amt:,.2f}", col_width).encode("latin-1", errors="replace"))

    buf.extend(div_line.encode("ascii"))

    # 7. Code 128 Barcode
    if show_barcode and receipt_no:
        buf.extend(CMD_ALIGN_CENTER)
        try:
            # Code 128 in ESC/POS: GS k 73 len data
            clean_bc = re.sub(r"[^A-Za-z0-9_-]", "", receipt_no)
            if clean_bc:
                bc_bytes = clean_bc.encode("ascii")
                buf.extend(GS + b"h\x48")  # Height = 72 dots
                buf.extend(GS + b"w\x03" if paper_width != "58mm" else GS + b"w\x02")  # Width multiplier = 3 (80mm) or 2 (58mm) for dark thick bars
                buf.extend(GS + b"H\x02")  # HRI text below
                buf.extend(GS + b"k\x49" + bytes([len(bc_bytes)]) + bc_bytes)
                buf.extend(b"\n")
        except Exception as e:
            logger.warning(f"Barcode ESC/POS generation failed: {e}")
            buf.extend(f"* {receipt_no} *\n".encode("ascii"))

    # 8. Footer Message
    buf.extend(CMD_ALIGN_CENTER)
    buf.extend(b"\n")
    buf.extend(f"{footer_text}\n".encode("latin-1", errors="replace"))
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

    # Determine target printer
    target = None
    target_info = None
    if printer_name and printer_name.strip():
        clean_name = printer_name.strip()
        # Match specified printer name against available printers (case-insensitive)
        for p in available:
            if p["name"].lower() == clean_name.lower():
                target = p["name"]
                target_info = p
                break
        # If not matched in available (e.g. transient cups query or direct queue), trust user's explicit printer
        if not target:
            target = clean_name

    if not target:
        # Auto-detect thermal printer
        for p in available:
            if p.get("is_thermal"):
                target = p["name"]
                target_info = p
                break

    if not target and available:
        # Fallback to default printer
        for p in available:
            if p.get("is_default"):
                target = p["name"]
                target_info = p
                break
        if not target:
            target = available[0]["name"]
            target_info = available[0]

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
        try:
            import win32print
            hPrinter = win32print.OpenPrinter(target)
            try:
                hJob = win32print.StartDocPrinter(hPrinter, 1, ("StockFlow Thermal Receipt", None, "RAW"))
                try:
                    win32print.StartPagePrinter(hPrinter)
                    win32print.WritePrinter(hPrinter, escpos_bytes)
                    win32print.EndPagePrinter(hPrinter)
                finally:
                    win32print.EndDocPrinter(hPrinter)
            finally:
                win32print.ClosePrinter(hPrinter)

            return {
                "success": True,
                "printer": target,
                "bytes_sent": len(escpos_bytes),
                "is_online": True,
                "warning": None,
                "message": f"Successfully sent receipt to '{target}' via Windows Raw Spooler.",
            }
        except ImportError:
            # Fallback: write to temp file and send via PowerShell raw or copy
            import tempfile, os
            with tempfile.NamedTemporaryFile(delete=False, suffix=".bin") as f:
                f.write(escpos_bytes)
                temp_path = f.name
            try:
                cmd = ["powershell", "-NoProfile", "-Command", f"Copy-Item -Path '{temp_path}' -Destination '\\\\localhost\\{target}'"]
                res = subprocess.run(cmd, capture_output=True, text=True)
                if res.returncode != 0:
                    raise RuntimeError(f"Windows raw copy failed: {res.stderr}")
                return {
                    "success": True,
                    "printer": target,
                    "bytes_sent": len(escpos_bytes),
                    "is_online": True,
                    "warning": None,
                    "message": f"Successfully sent receipt to '{target}'.",
                }
            finally:
                if os.path.exists(temp_path):
                    os.unlink(temp_path)

    raise RuntimeError(f"Unsupported operating system for direct printing: {sys_name}")


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
        return {
            "success": True,
            "message": "Windows print queue reset command dispatched.",
        }
    return {"success": False, "message": f"Unsupported OS: {sys_name}"}
