import time
import logging
from typing import Optional, List, Dict, Any

_recent_print_cache: Dict[str, Dict[str, Any]] = {}
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from backend.app.core.database import get_db
from backend.app.core.errors import EntityNotFoundException
from backend.app.models.business import BusinessSettings
from backend.app.models.sales import Sale, SaleItem, SalePayment
from backend.app.services.sales_service import get_sale
from backend.app.services.escpos_service import (
    list_system_printers,
    generate_escpos_receipt,
    generate_diagnostic_receipt,
    send_to_thermal_printer,
    clear_printer_queue,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/printing", tags=["Hardware & Thermal Printing"])


class PrinterItemResponse(BaseModel):
    name: str
    is_default: bool
    is_thermal: bool
    device_uri: Optional[str] = ""
    status: Optional[str] = ""
    is_online: Optional[bool] = True


class ThermalPrintRequest(BaseModel):
    sale_id: Optional[int] = None
    printer_name: Optional[str] = None
    paper_width: Optional[str] = None  # "58mm" | "58mm_narrow" | "80mm" | "80mm_compact"
    header_style: Optional[str] = None  # "logo_text" | "text_only"
    layout: Optional[str] = None  # "classic" | "modern" | "tabular" | "compact" | "elegant"
    show_barcode: Optional[bool] = None
    kick_drawer: Optional[bool] = False
    is_sample: Optional[bool] = False
    darkness: Optional[str] = None  # "maximum" | "high" | "normal"
    printer_profile: Optional[str] = None  # "standard_escpos" | "xprinter_enhanced" | "star_line" | "generic_plain"
    cut_mode: Optional[str] = None  # "partial" | "full" | "tear_only"
    feed_lines: Optional[int] = None  # 2 to 8 lines


class DiagnosticPrintRequest(BaseModel):
    printer_name: Optional[str] = None
    paper_width: Optional[str] = None
    printer_profile: Optional[str] = None
    darkness: Optional[str] = None
    cut_mode: Optional[str] = None
    feed_lines: Optional[int] = None


class ThermalPrintResponse(BaseModel):
    success: bool
    printer: str
    bytes_sent: int
    message: str
    is_online: Optional[bool] = True
    warning: Optional[str] = None


class ClearQueueRequest(BaseModel):
    printer_name: Optional[str] = None


@router.get("/printers", response_model=List[PrinterItemResponse])
def get_printers():
    """Returns all detected printers on the host system with thermal printer auto-detection."""
    return list_system_printers()


@router.post("/clear-queue")
def clear_queue(data: Optional[ClearQueueRequest] = None):
    """Cancels all stuck print jobs and resets the printer spooler."""
    pname = data.printer_name if data else None
    return clear_printer_queue(pname)


@router.post("/receipt", response_model=ThermalPrintResponse)
def print_thermal_receipt(data: ThermalPrintRequest, db: Session = Depends(get_db)):
    """
    Renders receipt data into ESC/POS binary format and dispatches directly to the thermal printer
    via raw spooler / lpr -l, completely bypassing PostScript rendering.
    """
    settings = db.query(BusinessSettings).filter(BusinessSettings.id == 1).first()

    paper_width = data.paper_width or (settings.receipt_printer_type if settings else "80mm") or "80mm"
    header_style = data.header_style or (settings.thermal_header_style if settings else "logo_text") or "logo_text"
    show_barcode = data.show_barcode if data.show_barcode is not None else (settings.show_barcode if settings else True)
    printer_name = data.printer_name or (settings.selected_thermal_printer if settings else None)

    # Deduplicate rapid concurrent submissions (e.g. double-click, double Enter key within 3.0 seconds)
    dedup_key = f"{data.sale_id}_{printer_name}_{data.is_sample}_{data.layout}"
    now = time.time()
    cached = _recent_print_cache.get(dedup_key)
    if cached and (now - cached["timestamp"] < 3.0):
        logger.info(f"Deduplicated rapid print request for '{dedup_key}' (elapsed: {now - cached['timestamp']:.2f}s)")
        return ThermalPrintResponse(**cached["response"])

    sale_dict: Dict[str, Any] = {}

    if data.is_sample or not data.sale_id:
        # Realistic sample retail transaction for diagnostics
        currency = settings.currency if settings else "Rs."
        sale_dict = {
            "receipt_number": "TEST-POS-001",
            "created_at": None,
            "customer_name": "Diagnostic Walk-in",
            "payment_method": "Cash",
            "subtotal": 1450.00,
            "discount_amount": 50.00,
            "tax_amount": 0.00,
            "tax_rate": 0.00,
            "total_amount": 1400.00,
            "total_returned_amount": 0.00,
            "paid_amount": 1500.00,
            "due_amount": 0.00,
            "payment_status": "PAID",
            "items": [
                {
                    "product_name": "Diagnostic Thermal Test Item A",
                    "quantity": 2,
                    "unit_price": 500.00,
                    "discount_amount": 0.00,
                    "total_price": 1000.00,
                },
                {
                    "product_name": "Premium Diagnostic Roll Pack",
                    "quantity": 1,
                    "unit_price": 450.00,
                    "discount_amount": 50.00,
                    "total_price": 400.00,
                },
            ],
        }
    else:
        try:
            sale_dto = get_sale(db, data.sale_id)
        except EntityNotFoundException:
            raise HTTPException(status_code=404, detail=f"Sale #{data.sale_id} not found.")

        sale_dict = {
            "receipt_number": sale_dto.receipt_number,
            "created_at": sale_dto.created_at,
            "customer_name": sale_dto.customer_name or "Counter Walk-in",
            "subtotal": float(sale_dto.subtotal or 0),
            "discount_amount": float(sale_dto.discount_amount or 0),
            "tax_amount": float(sale_dto.tax_amount or 0),
            "tax_rate": float(sale_dto.tax_rate or 0),
            "total_amount": float(sale_dto.total_amount or 0),
            "total_returned_amount": float(sale_dto.total_returned_amount or 0),
            "paid_amount": float(sale_dto.paid_amount or 0),
            "due_amount": float(sale_dto.due_amount or 0),
            "payment_status": sale_dto.payment_status,
            "payments": [{"payment_method": p.payment_method} for p in sale_dto.payments],
            "items": [
                {
                    "product_name": it.product_name,
                    "quantity": float(it.quantity or 0),
                    "returned_quantity": float(it.returned_quantity or 0),
                    "unit_price": float(it.unit_price or 0),
                    "discount_amount": float(it.discount_amount or 0),
                    "total_price": float(it.total_price or 0),
                }
                for it in sale_dto.items
            ],
        }

    try:
        escpos_bytes = generate_escpos_receipt(
            sale_data=sale_dict,
            settings=settings,
            paper_width=paper_width,
            header_style=header_style,
            receipt_layout=data.layout or getattr(settings, "thermal_layout", "classic") or "classic",
            show_barcode=show_barcode,
            kick_drawer=bool(data.kick_drawer),
            darkness=data.darkness or (settings.thermal_darkness if settings else "normal"),
            printer_profile=data.printer_profile or getattr(settings, "thermal_printer_profile", "standard_escpos") or "standard_escpos",
            cut_mode=data.cut_mode or getattr(settings, "thermal_cut_mode", "partial") or "partial",
            feed_lines=data.feed_lines if data.feed_lines is not None else getattr(settings, "thermal_feed_lines", 4),
        )

        res = send_to_thermal_printer(escpos_bytes, printer_name=printer_name)
        _recent_print_cache[dedup_key] = {"timestamp": now, "response": res}
        return ThermalPrintResponse(**res)
    except Exception as e:
        logger.error(f"Thermal print failure: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/diagnostic", response_model=ThermalPrintResponse)
def print_thermal_diagnostic(data: Optional[DiagnosticPrintRequest] = None, db: Session = Depends(get_db)):
    """
    Renders and prints a universal thermal hardware diagnostic & calibration receipt.
    Allows verifying ruler columns, density swatches, raster logo banding, and cutting.
    """
    settings = db.query(BusinessSettings).filter(BusinessSettings.id == 1).first()
    data = data or DiagnosticPrintRequest()

    paper_width = data.paper_width or (settings.receipt_printer_type if settings else "80mm") or "80mm"
    printer_name = data.printer_name or (settings.selected_thermal_printer if settings else None)
    profile = data.printer_profile or getattr(settings, "thermal_printer_profile", "standard_escpos") or "standard_escpos"
    darkness = data.darkness or getattr(settings, "thermal_darkness", "normal") or "normal"
    cut_mode = data.cut_mode or getattr(settings, "thermal_cut_mode", "partial") or "partial"
    feed_lines = data.feed_lines if data.feed_lines is not None else getattr(settings, "thermal_feed_lines", 4)

    try:
        diag_bytes = generate_diagnostic_receipt(
            settings=settings,
            paper_width=paper_width,
            printer_profile=profile,
            printer_name=printer_name,
            darkness=darkness,
            cut_mode=cut_mode,
            feed_lines=feed_lines,
        )

        res = send_to_thermal_printer(diag_bytes, printer_name=printer_name)
        return ThermalPrintResponse(**res)
    except Exception as e:
        logger.error(f"Diagnostic print failure: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))
