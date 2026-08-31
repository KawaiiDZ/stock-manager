from datetime import datetime
from decimal import Decimal
from typing import Optional, List
from pydantic import BaseModel

class PurchaseItemCreate(BaseModel):
    product_id: int
    quantity: Decimal
    unit_cost: Decimal

class PurchaseCreate(BaseModel):
    supplier_id: int
    items: List[PurchaseItemCreate]
    discount_amount: Decimal = Decimal("0.00")
    tax_amount: Decimal = Decimal("0.00")
    paid_amount: Decimal = Decimal("0.00")
    payment_method: str = "Cash"
    notes: Optional[str] = None

class PurchaseItemResponse(BaseModel):
    id: int
    product_id: int
    product_name: Optional[str] = None
    quantity: Decimal
    unit_cost: Decimal
    total_cost: Decimal

    class Config:
        from_attributes = True

class PurchasePaymentResponse(BaseModel):
    id: int
    amount: Decimal
    payment_method: str
    created_at: datetime

    class Config:
        from_attributes = True

class PurchaseResponse(BaseModel):
    id: int
    purchase_number: str
    supplier_id: int
    supplier_name: Optional[str] = None
    subtotal: Decimal
    discount_amount: Decimal
    tax_amount: Decimal
    total_amount: Decimal
    paid_amount: Decimal
    due_amount: Decimal
    payment_status: str
    notes: Optional[str] = None
    created_at: datetime
    items: List[PurchaseItemResponse] = []
    payments: List[PurchasePaymentResponse] = []

    class Config:
        from_attributes = True

class PurchaseReturnItemCreate(BaseModel):
    product_id: int
    quantity: Decimal
    unit_cost: Decimal

class PurchaseReturnCreate(BaseModel):
    purchase_id: Optional[int] = None
    supplier_id: int
    items: List[PurchaseReturnItemCreate]
    reason: Optional[str] = None

class PurchaseReturnItemResponse(BaseModel):
    id: int
    product_id: int
    product_name: Optional[str] = None
    quantity: Decimal
    unit_cost: Decimal
    total_amount: Decimal

    class Config:
        from_attributes = True

class PurchaseReturnResponse(BaseModel):
    id: int
    return_number: str
    purchase_id: Optional[int] = None
    purchase_number: Optional[str] = None
    supplier_id: int
    supplier_name: Optional[str] = None
    total_return_amount: Decimal
    reason: Optional[str] = None
    created_at: datetime
    items: List[PurchaseReturnItemResponse] = []

    class Config:
        from_attributes = True
