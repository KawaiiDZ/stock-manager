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
    wipe_mode: Optional[str] = "inventory_only"  # "inventory_only" or "all_data"

class ResetDataResponse(BaseModel):
    success: bool
    wipe_mode: str
    deleted_products_count: int
    message: str
