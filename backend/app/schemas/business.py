from decimal import Decimal
from typing import Optional, List, Dict, Any
from pydantic import BaseModel
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
    receipt_letterhead_path: Optional[str] = None
    show_letterhead: bool = False
    hide_header_text_with_letterhead: bool = False
    invoice_title: str = "TAX INVOICE"
    enable_quotations: bool = True
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
    receipt_letterhead_path: Optional[str] = None
    show_letterhead: Optional[bool] = None
    hide_header_text_with_letterhead: Optional[bool] = None
    invoice_title: Optional[str] = None
    enable_quotations: Optional[bool] = None
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
