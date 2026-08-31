from datetime import datetime
from decimal import Decimal
from typing import Optional, List
from pydantic import BaseModel

class CategoryCreate(BaseModel):
    name: str

class CategoryResponse(BaseModel):
    id: int
    name: str
    is_active: bool
    created_at: datetime

    class Config:
        from_attributes = True

class CustomFieldCreate(BaseModel):
    name: str
    field_type: str = "text"
    options: Optional[str] = None
    is_required: bool = False
    show_in_table: bool = True
    show_in_pos: bool = True
    show_in_receipt: bool = False
    display_order: int = 0

class CustomFieldUpdate(BaseModel):
    name: Optional[str] = None
    field_type: Optional[str] = None
    options: Optional[str] = None
    is_required: Optional[bool] = None
    show_in_table: Optional[bool] = None
    show_in_pos: Optional[bool] = None
    show_in_receipt: Optional[bool] = None
    display_order: Optional[int] = None
    is_active: Optional[bool] = None

class CustomFieldResponse(BaseModel):
    id: int
    name: str
    field_type: str
    options: Optional[str] = None
    is_required: bool
    show_in_table: bool = True
    show_in_pos: bool = True
    show_in_receipt: bool = False
    display_order: int
    is_active: bool

    class Config:
        from_attributes = True

class CustomValueDto(BaseModel):
    field_id: int
    field_name: Optional[str] = None
    value: str

class ProductCreate(BaseModel):
    name: str
    sku: Optional[str] = None
    barcode: Optional[str] = None
    category_id: Optional[int] = None
    purchase_price: Decimal = Decimal("0.00")
    selling_price: Decimal = Decimal("0.00")
    opening_stock: Decimal = Decimal("0.00")
    custom_fields: Optional[List[CustomValueDto]] = None

class ProductUpdate(BaseModel):
    name: Optional[str] = None
    sku: Optional[str] = None
    barcode: Optional[str] = None
    category_id: Optional[int] = None
    purchase_price: Optional[Decimal] = None
    selling_price: Optional[Decimal] = None
    custom_fields: Optional[List[CustomValueDto]] = None

class StockAdjustmentRequest(BaseModel):
    new_stock: Decimal
    reason: Optional[str] = "Physical count correction"

class ProductResponse(BaseModel):
    id: int
    product_id: str
    name: str
    sku: Optional[str] = None
    barcode: Optional[str] = None
    category_id: Optional[int] = None
    category_name: Optional[str] = None
    purchase_price: Decimal
    selling_price: Decimal
    current_stock: Decimal
    is_active: bool
    custom_fields: Optional[List[CustomValueDto]] = None
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True

class BulkProductsResponse(BaseModel):
    success: bool
    count: int
    products: List[ProductResponse]
    message: str
