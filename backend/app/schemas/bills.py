from datetime import datetime, date
from decimal import Decimal
from typing import Optional, List
from pydantic import BaseModel

class BillCategoryCreate(BaseModel):
    name: str

class BillCategoryResponse(BaseModel):
    id: int
    name: str
    is_active: bool

    class Config:
        from_attributes = True

class BillPaymentCreate(BaseModel):
    amount: Decimal
    payment_method: str = "Cash"
    notes: Optional[str] = None

class BillPaymentResponse(BaseModel):
    id: int
    bill_id: int
    amount: Decimal
    payment_method: str
    payment_date: datetime
    notes: Optional[str] = None

    class Config:
        from_attributes = True

class BillCreate(BaseModel):
    bill_number: Optional[str] = None
    name: str
    category_id: int
    amount: Decimal
    due_date: date
    notes: Optional[str] = None

class BillUpdate(BaseModel):
    bill_number: Optional[str] = None
    name: Optional[str] = None
    category_id: Optional[int] = None
    amount: Optional[Decimal] = None
    due_date: Optional[date] = None
    status: Optional[str] = None
    notes: Optional[str] = None

class BillAttentionItem(BaseModel):
    id: int
    bill_number: str
    name: str
    amount: Decimal
    paid_amount: Decimal
    due_amount: Decimal
    due_date: date
    status: str
    urgency_label: str

    class Config:
        from_attributes = True

class BillResponse(BaseModel):
    id: int
    bill_number: str
    name: str
    category_id: int
    category_name: Optional[str] = None
    amount: Decimal
    paid_amount: Decimal
    due_amount: Decimal
    due_date: date
    status: str
    notes: Optional[str] = None
    created_at: datetime
    updated_at: datetime
    payments: List[BillPaymentResponse] = []

    class Config:
        from_attributes = True
