from datetime import datetime
from decimal import Decimal
from typing import Optional
from pydantic import BaseModel

class CustomerCreate(BaseModel):
    name: str
    phone: Optional[str] = None
    address: Optional[str] = None

class CustomerUpdate(BaseModel):
    name: Optional[str] = None
    phone: Optional[str] = None
    address: Optional[str] = None

class CustomerPaymentCreate(BaseModel):
    amount: Decimal
    payment_method: str = "Cash"
    notes: Optional[str] = None

class CustomerPaymentResponse(BaseModel):
    id: int
    payment_number: str
    customer_id: int
    amount: Decimal
    payment_method: str
    notes: Optional[str] = None
    created_at: datetime

    class Config:
        from_attributes = True

class CustomerResponse(BaseModel):
    id: int
    customer_id: str
    name: str
    phone: Optional[str] = None
    address: Optional[str] = None
    is_active: bool
    current_due: Decimal = Decimal("0.00")
    total_sales: Decimal = Decimal("0.00")
    total_paid: Decimal = Decimal("0.00")
    total_returns: Decimal = Decimal("0.00")
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True

class CustomerLedgerEntry(BaseModel):
    date: datetime
    type: str  # "Sale", "Payment", "Return"
    reference: str  # "R-000001", "CP-000001", "RET-000001"
    description: str
    debit: Decimal  # Increases customer due (Sale)
    credit: Decimal # Decreases customer due (Payment, Return credit)
    balance: Decimal # Running balance
    bill_amount: Optional[Decimal] = None
    paid_amount: Optional[Decimal] = None
    bill_remaining: Optional[Decimal] = None
    bill_reference: Optional[str] = None
