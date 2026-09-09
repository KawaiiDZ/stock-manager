from datetime import datetime
from decimal import Decimal
from typing import Optional, List
from pydantic import BaseModel, Field

class QuotationItemCreate(BaseModel):
    product_id: int
    quantity: Decimal = Field(..., gt=Decimal('0'))
    unit_price: Decimal = Field(..., ge=Decimal('0'))
    discount_amount: Decimal = Field(default=Decimal('0.00'), ge=Decimal('0'))
    notes: Optional[str] = None

class QuotationItemResponse(BaseModel):
    id: int
    quotation_id: int
    product_id: int
    product_name: str
    quantity: Decimal
    unit_price: Decimal
    discount_amount: Decimal
    total_price: Decimal
    notes: Optional[str] = None

    class Config:
        from_attributes = True

class QuotationCreate(BaseModel):
    customer_id: Optional[int] = None
    customer_name: str = Field(..., min_length=1)
    customer_phone: str = Field(..., min_length=1)
    customer_address: Optional[str] = None
    items: List[QuotationItemCreate] = Field(..., min_items=1)
    discount_amount: Decimal = Field(default=Decimal('0.00'), ge=Decimal('0'))
    tax_rate: Decimal = Field(default=Decimal('0.00'), ge=Decimal('0'))
    valid_until: Optional[datetime] = None
    notes: Optional[str] = None

class QuotationResponse(BaseModel):
    id: int
    quotation_number: str
    customer_id: Optional[int] = None
    customer_name: str
    customer_phone: str
    customer_address: Optional[str] = None
    subtotal: Decimal
    discount_amount: Decimal
    tax_rate: Decimal
    tax_amount: Decimal
    total_amount: Decimal
    status: str
    sale_id: Optional[int] = None
    converted_at: Optional[datetime] = None
    rejection_reason: Optional[str] = None
    valid_until: Optional[datetime] = None
    notes: Optional[str] = None
    created_at: datetime
    updated_at: datetime
    items: List[QuotationItemResponse] = []

    class Config:
        from_attributes = True

class QuotationConversionCheckItem(BaseModel):
    product_id: int
    product_name: str
    quantity: Decimal
    quoted_price: Decimal
    current_price: Decimal
    price_difference: Decimal
    price_changed: bool
    current_stock: Decimal
    has_stock_shortage: bool

class QuotationConversionCheckResponse(BaseModel):
    quotation_id: int
    quotation_number: str
    has_price_changes: bool
    has_stock_shortages: bool
    items: List[QuotationConversionCheckItem]

class QuotationConvertRequest(BaseModel):
    price_mode: str = 'quoted'  # 'quoted' or 'current'
    payment_method: str = 'CASH'
    amount_paid: Optional[Decimal] = None
    notes: Optional[str] = None

class QuotationRejectRequest(BaseModel):
    reason: Optional[str] = None
