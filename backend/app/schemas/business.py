import json
from decimal import Decimal
from typing import Optional, List, Dict, Any
from pydantic import BaseModel, field_validator
from backend.app.schemas.product import CustomFieldCreate, CustomFieldResponse

class BusinessSettingsResponse(BaseModel):
    id: int
    business_name: str
    phone: str
    address: str
    logo_path: Optional[str] = None
    receipt_logo_path: Optional[str] = None
    currency: str
    tax_enabled: bool
    default_tax_rate: Decimal
    receipt_header: str
    receipt_footer: str
    receipt_printer_type: str
    industry_preset: Optional[str] = "general"
    setup_completed: bool = False
    show_sku: bool = True
    show_barcode: bool = True
    date_format: str = "YYYY-MM-DD"
    format_prices_with_commas: bool = True
    receipt_type: str = "thermal"
    thermal_print_mode: str = "browser"
    thermal_header_style: str = "logo_text"
    thermal_layout: str = "classic"
    selected_thermal_printer: str = ""
    selected_a4_printer: str = ""
    skip_receipt_preview: bool = False
    thermal_darkness: str = "normal"
    thermal_printer_profile: str = "standard_escpos"
    thermal_render_pipeline: str = "native_text"
    thermal_beep_enabled: bool = True
    thermal_feed_lines: int = 4
    thermal_cut_mode: str = "partial"
    receipt_letterhead_path: Optional[str] = None
    show_letterhead: bool = False
    hide_header_text_with_letterhead: bool = False
    invoice_title: str = "TAX INVOICE"
    enable_quotations: bool = True
    enable_navigation_hub: bool = True
    theme_mode: str = "light"
    color_theme: str = "emerald"
    invoice_terms: str = "1. Goods once sold will be accepted for return within 7 days in original condition.\n2. Warranty claims require presenting this invoice.\n3. Thank you for your business!"
    quotation_terms: str = "1. This quotation is an estimate and valid for 15 days from issue date.\n2. Stock is subject to physical availability upon confirmation.\n3. This document does not constitute a tax invoice until approved."
    enable_barcode_scanner: bool = True
    enable_barcode_printer: bool = True
    barcode_label_size: str = "50x25mm"
    barcode_label_show_business_name: bool = True
    barcode_label_show_product_name: bool = True
    barcode_label_show_price: bool = True
    barcode_label_show_sku: bool = True
    barcode_label_custom_text: str = ""
    lock_dashboard_finances: bool = False
    has_dashboard_financials_pin: bool = False
    enable_pos_quick_pay: bool = True
    payment_accounts: List[str] = ["Cash", "Bank Transfer", "Easypaisa", "Jazzcash"]

    @field_validator("payment_accounts", mode="before")
    def parse_payment_accounts(cls, v):
        if isinstance(v, str):
            try:
                parsed = json.loads(v)
                if isinstance(parsed, list):
                    res = [str(x).strip() for x in parsed if str(x).strip()]
                    if "Cash" not in res:
                        res.insert(0, "Cash")
                    return res
            except Exception:
                pass
            return ["Cash", "Bank Transfer", "Easypaisa", "Jazzcash"]
        elif isinstance(v, list):
            res = [str(x).strip() for x in v if str(x).strip()]
            if "Cash" not in res:
                res.insert(0, "Cash")
            return res
        return ["Cash", "Bank Transfer", "Easypaisa", "Jazzcash"]

    class Config:
        from_attributes = True

class BusinessSettingsUpdate(BaseModel):
    business_name: Optional[str] = None
    phone: Optional[str] = None
    address: Optional[str] = None
    logo_path: Optional[str] = None
    receipt_logo_path: Optional[str] = None
    currency: Optional[str] = None
    tax_enabled: Optional[bool] = None
    default_tax_rate: Optional[Decimal] = None
    receipt_header: Optional[str] = None
    receipt_footer: Optional[str] = None
    receipt_printer_type: Optional[str] = None
    industry_preset: Optional[str] = None
    setup_completed: Optional[bool] = None
    show_sku: Optional[bool] = None
    show_barcode: Optional[bool] = None
    date_format: Optional[str] = None
    format_prices_with_commas: Optional[bool] = None
    receipt_type: Optional[str] = None
    thermal_print_mode: Optional[str] = None
    thermal_header_style: Optional[str] = None
    thermal_layout: Optional[str] = None
    selected_thermal_printer: Optional[str] = None
    selected_a4_printer: Optional[str] = None
    skip_receipt_preview: Optional[bool] = None
    thermal_darkness: Optional[str] = None
    thermal_printer_profile: Optional[str] = None
    thermal_render_pipeline: Optional[str] = None
    thermal_beep_enabled: Optional[bool] = None
    thermal_feed_lines: Optional[int] = None
    thermal_cut_mode: Optional[str] = None
    receipt_letterhead_path: Optional[str] = None
    show_letterhead: Optional[bool] = None
    hide_header_text_with_letterhead: Optional[bool] = None
    invoice_title: Optional[str] = None
    enable_quotations: Optional[bool] = None
    enable_navigation_hub: Optional[bool] = None
    theme_mode: Optional[str] = None
    color_theme: Optional[str] = None
    invoice_terms: Optional[str] = None
    quotation_terms: Optional[str] = None
    enable_barcode_scanner: Optional[bool] = None
    enable_barcode_printer: Optional[bool] = None
    barcode_label_size: Optional[str] = None
    barcode_label_show_business_name: Optional[bool] = None
    barcode_label_show_product_name: Optional[bool] = None
    barcode_label_show_price: Optional[bool] = None
    barcode_label_show_sku: Optional[bool] = None
    barcode_label_custom_text: Optional[str] = None
    lock_dashboard_finances: Optional[bool] = None
    dashboard_financials_pin: Optional[str] = None
    enable_pos_quick_pay: Optional[bool] = None
    payment_accounts: Optional[List[str]] = None

class PresetTemplateResponse(BaseModel):
    key: str
    title: str
    icon: str
    description: str
    fields: List[CustomFieldCreate]

class ApplyPresetRequest(BaseModel):
    preset_key: str
    business_name: Optional[str] = None
    phone: Optional[str] = None
    address: Optional[str] = None
    logo_path: Optional[str] = None
    currency: Optional[str] = None
    custom_fields: Optional[List[CustomFieldCreate]] = None

class ResetDataRequest(BaseModel):
    confirm_pin: str
    wipe_mode: Optional[str] = "inventory_only"  # "sales_only", "inventory_only", or "all_data"

class ResetDataResponse(BaseModel):
    success: bool
    wipe_mode: str
    deleted_products_count: int
    message: str
