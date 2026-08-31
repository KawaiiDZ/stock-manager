from datetime import datetime, date
from decimal import Decimal
from typing import List, Optional
from pydantic import BaseModel

class SalesReportRow(BaseModel):
    receipt_number: str
    date: datetime
    customer_name: str
    total_amount: Decimal
    paid_amount: Decimal
    due_amount: Decimal
    payment_status: str

class SalesDetailReportRow(BaseModel):
    receipt_number: str
    date: datetime
    product_name: str
    quantity: Decimal
    unit_price: Decimal
    discount_amount: Decimal
    total_price: Decimal
    unit_cost: Decimal
    total_cost: Decimal
    gross_profit: Decimal

class PurchasesReportRow(BaseModel):
    purchase_number: str
    date: datetime
    supplier_name: str
    total_amount: Decimal
    paid_amount: Decimal
    due_amount: Decimal
    payment_status: str

class InventoryReportRow(BaseModel):
    product_id: str
    name: str
    category_name: Optional[str] = None
    current_stock: Decimal
    purchase_price: Decimal
    selling_price: Decimal
    stock_value_cost: Decimal
    stock_value_retail: Decimal

class StockMovementReportRow(BaseModel):
    date: datetime
    product_name: str
    movement_type: str
    quantity: Decimal
    reference_type: str
    reference_id: str
    notes: Optional[str] = None

class CustomerReportRow(BaseModel):
    customer_id: str
    name: str
    phone: Optional[str] = None
    total_purchases: Decimal
    total_payments: Decimal
    total_returns: Decimal
    current_due: Decimal

class SupplierReportRow(BaseModel):
    supplier_id: str
    name: str
    phone: Optional[str] = None
    total_purchases: Decimal
    total_payments: Decimal
    total_returns: Decimal
    current_due: Decimal

class BillsReportRow(BaseModel):
    bill_number: str
    name: str
    category_name: Optional[str] = None
    amount: Decimal
    paid_amount: Decimal
    due_amount: Decimal
    due_date: date
    status: str

class ExpensesReportRow(BaseModel):
    date: date
    expense_number: str
    category_name: Optional[str] = None
    title: str
    amount: Decimal
    payment_method: str
