from datetime import datetime
from decimal import Decimal
from typing import Optional, List
from pydantic import BaseModel

class SaleItemCreate(BaseModel):
    product_id: int
    quantity: Decimal
    unit_price: Decimal
    discount_amount: Decimal = Decimal("0.00")
    notes: Optional[str] = None

class PaymentSplit(BaseModel):
    payment_method: str
    amount: Decimal
    notes: Optional[str] = None

class SaleCreate(BaseModel):
    customer_id: Optional[int] = None
    customer_name: Optional[str] = None
    customer_phone: Optional[str] = None
    items: List[SaleItemCreate]
    discount_amount: Decimal = Decimal("0.00")
    tax_rate: Optional[Decimal] = None
    paid_amount: Decimal = Decimal("0.00")
    payment_method: str = "Cash"
    payment_splits: Optional[List[PaymentSplit]] = None
    notes: Optional[str] = None

class SaleItemBatchResponse(BaseModel):
    id: int
    inventory_batch_id: int
    quantity: Decimal
    unit_cost: Decimal

    class Config:
        from_attributes = True

class SaleItemResponse(BaseModel):
    id: int
    product_id: int
    product_name: str
    quantity: Decimal
    unit_price: Decimal
    discount_amount: Decimal
    total_price: Decimal
    unit_cost: Decimal
    total_cost: Decimal
    gross_profit: Decimal
    realized_profit: Decimal = Decimal("0.00")
    returned_quantity: Decimal = Decimal("0.00")
    remaining_returnable_quantity: Decimal = Decimal("0.00")
    batches: Optional[List[SaleItemBatchResponse]] = None
    notes: Optional[str] = None

    class Config:
        from_attributes = True

class SalePaymentResponse(BaseModel):
    id: int
    amount: Decimal
    payment_method: str
    created_at: datetime

    class Config:
        from_attributes = True

class SaleResponse(BaseModel):
    id: int
    receipt_number: str
    customer_id: int
    customer_name: Optional[str] = None
    customer_phone: Optional[str] = None
    subtotal: Decimal
    discount_amount: Decimal
    tax_rate: Decimal
    tax_amount: Decimal
    total_amount: Decimal
    paid_amount: Decimal
    due_amount: Decimal
    payment_status: str
    total_returned_amount: Decimal = Decimal("0.00")
    total_cost: Decimal
    gross_profit: Decimal
    realized_profit: Decimal = Decimal("0.00")
    unrealized_profit: Decimal = Decimal("0.00")
    notes: Optional[str] = None
    created_at: datetime
    items: List[SaleItemResponse] = []
    payments: List[SalePaymentResponse] = []

    class Config:
        from_attributes = True

class SalesReturnItemCreate(BaseModel):
    product_id: int
    quantity: Decimal
    unit_price: Decimal

class SalesReturnCreate(BaseModel):
    sale_id: Optional[int] = None
    customer_id: int
    items: List[SalesReturnItemCreate]
    reason: Optional[str] = None

class SalesReturnItemResponse(BaseModel):
    id: int
    product_id: int
    product_name: Optional[str] = None
    quantity: Decimal
    unit_price: Decimal
    total_amount: Decimal

    class Config:
        from_attributes = True

class SalesReturnResponse(BaseModel):
    id: int
    return_number: str
    sale_id: Optional[int] = None
    sale_receipt_number: Optional[str] = None
    customer_id: int
    customer_name: Optional[str] = None
    total_return_amount: Decimal
    cash_refund_amount: Decimal
    balance_credit_amount: Decimal
    reason: Optional[str] = None
    created_at: datetime
    items: List[SalesReturnItemResponse] = []

    class Config:
        from_attributes = True

class ReceiptPrintResponse(BaseModel):
    business_name: str
    phone: str
    address: str
    currency: str
    receipt_header: str
    receipt_footer: str
    receipt_printer_type: str
    receipt_number: str
    created_at: datetime
    customer_name: str
    customer_phone: Optional[str] = None
    items: List[SaleItemResponse]
    subtotal: Decimal
    discount_amount: Decimal
    tax_rate: Decimal
    tax_amount: Decimal
    total_amount: Decimal
    paid_amount: Decimal
    due_amount: Decimal
    payment_status: str
    payment_method: Optional[str] = "Cash"
    payments: List[SalePaymentResponse] = []
