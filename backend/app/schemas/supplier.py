from datetime import datetime
from decimal import Decimal
from typing import Optional
from pydantic import BaseModel

class SupplierCreate(BaseModel):
    name: str
    phone: Optional[str] = None
    address: Optional[str] = None

class SupplierUpdate(BaseModel):
    name: Optional[str] = None
    phone: Optional[str] = None
    address: Optional[str] = None

class SupplierPaymentCreate(BaseModel):
    amount: Decimal
    payment_method: str = "Cash"
    notes: Optional[str] = None

class SupplierPaymentResponse(BaseModel):
    id: int
    payment_number: str
    supplier_id: int
    amount: Decimal
    payment_method: str
    notes: Optional[str] = None
    created_at: datetime

    class Config:
        from_attributes = True

class SupplierResponse(BaseModel):
    id: int
    supplier_id: str
    name: str
    phone: Optional[str] = None
    address: Optional[str] = None
    is_active: bool
    current_due: Decimal = Decimal("0.00")
    total_purchases: Decimal = Decimal("0.00")
    total_paid: Decimal = Decimal("0.00")
    total_returns: Decimal = Decimal("0.00")
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True

class SupplierLedgerEntry(BaseModel):
    date: datetime
    type: str  # "Purchase", "Payment", "Return"
    reference: str  # "PO-000001", "SP-000001", "PRET-000001"
    description: str
    debit: Decimal   # Decreases supplier obligation (Payments, Returns)
    credit: Decimal  # Increases supplier obligation (Purchases)
    balance: Decimal # Running balance
