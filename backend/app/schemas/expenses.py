from datetime import datetime, date
from decimal import Decimal
from typing import Optional
from pydantic import BaseModel

class ExpenseCategoryCreate(BaseModel):
    name: str

class ExpenseCategoryResponse(BaseModel):
    id: int
    name: str
    is_active: bool

    class Config:
        from_attributes = True

class ExpenseCreate(BaseModel):
    category_id: int
    title: str
    amount: Decimal
    payment_method: str = "Cash"
    expense_date: Optional[date] = None
    notes: Optional[str] = None

class ExpenseResponse(BaseModel):
    id: int
    expense_number: str
    category_id: int
    category_name: Optional[str] = None
    title: str
    amount: Decimal
    payment_method: str
    expense_date: date
    notes: Optional[str] = None
    created_at: datetime

    class Config:
        from_attributes = True
