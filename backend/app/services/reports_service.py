from datetime import datetime, date, time
from decimal import Decimal
from typing import List, Optional
from sqlalchemy.orm import Session, joinedload
from sqlalchemy import func

from backend.app.models.sales import Sale, SaleItem
from backend.app.models.purchase import Purchase, PurchaseItem
from backend.app.models.product import Product
from backend.app.models.inventory import InventoryMovement
from backend.app.models.customer import Customer
from backend.app.models.supplier import Supplier
from backend.app.models.bills import Bill
from backend.app.models.expenses import Expense
from backend.app.schemas.reports import (
    SalesReportRow, SalesDetailReportRow, PurchasesReportRow, InventoryReportRow,
    StockMovementReportRow, CustomerReportRow, SupplierReportRow, BillsReportRow, ExpensesReportRow
)
from backend.app.services.customer_service import list_customers
from backend.app.services.supplier_service import list_suppliers

def _normalize_datetime_range(start_date: Optional[datetime], end_date: Optional[datetime]):
    if end_date is not None and isinstance(end_date, datetime):
        if end_date.time() == time.min:
            end_date = datetime.combine(end_date.date(), time.max)
    return start_date, end_date

def get_sales_report(db: Session, start_date: Optional[datetime] = None, end_date: Optional[datetime] = None) -> List[SalesReportRow]:
    start_date, end_date = _normalize_datetime_range(start_date, end_date)
    q = db.query(Sale).options(joinedload(Sale.customer), joinedload(Sale.returns))
    if start_date:
        q = q.filter(Sale.created_at >= start_date)
    if end_date:
        q = q.filter(Sale.created_at <= end_date)
    sales = q.order_by(Sale.created_at.desc()).all()

    result = []
    for s in sales:
        total_balance_credit = sum((r.balance_credit_amount for r in s.returns), Decimal("0.00")) if s.returns else Decimal("0.00")
        net_due = max(Decimal("0.00"), s.total_amount - s.paid_amount - total_balance_credit)
        status = s.payment_status
        if s.returns and net_due == Decimal("0.00") and status != "RETURNED":
            status = "PARTIALLY_RETURNED" if s.paid_amount > Decimal("0.00") else "RETURNED"

        paid_ratio = min(Decimal("1.00"), max(Decimal("0.00"), s.paid_amount / s.total_amount)) if s.total_amount > Decimal("0.00") else Decimal("1.00")
        realized_profit = (s.gross_profit * paid_ratio).quantize(Decimal("0.01"))

        result.append(SalesReportRow(
            receipt_number=s.receipt_number,
            date=s.created_at,
            customer_name=s.customer.name if s.customer else "Unknown",
            total_amount=s.total_amount,
            paid_amount=s.paid_amount,
            due_amount=net_due,
            gross_profit=s.gross_profit,
            realized_profit=realized_profit,
            payment_status=status
        ))
    return result

def get_sales_detail_report(db: Session, start_date: Optional[datetime] = None, end_date: Optional[datetime] = None) -> List[SalesDetailReportRow]:
    start_date, end_date = _normalize_datetime_range(start_date, end_date)
    q = db.query(SaleItem).join(Sale, Sale.id == SaleItem.sale_id)
    if start_date:
        q = q.filter(Sale.created_at >= start_date)
    if end_date:
        q = q.filter(Sale.created_at <= end_date)
    items = q.order_by(Sale.created_at.desc(), SaleItem.id.desc()).all()

    rows = []
    for it in items:
        paid_ratio = min(Decimal("1.00"), max(Decimal("0.00"), it.sale.paid_amount / it.sale.total_amount)) if it.sale and it.sale.total_amount > Decimal("0.00") else Decimal("1.00")
        realized_profit = (it.gross_profit * paid_ratio).quantize(Decimal("0.01"))
        rows.append(SalesDetailReportRow(
            receipt_number=it.sale.receipt_number,
            date=it.sale.created_at,
            product_name=it.product_name,
            quantity=it.quantity,
            unit_price=it.unit_price,
            discount_amount=it.discount_amount,
            total_price=it.total_price,
            unit_cost=it.unit_cost,
            total_cost=it.total_cost,
            gross_profit=it.gross_profit,
            realized_profit=realized_profit,
            payment_status=it.sale.payment_status if it.sale else "PAID"
        ))
    return rows

def get_purchases_report(db: Session, start_date: Optional[datetime] = None, end_date: Optional[datetime] = None) -> List[PurchasesReportRow]:
    start_date, end_date = _normalize_datetime_range(start_date, end_date)
    q = db.query(Purchase).options(joinedload(Purchase.supplier), joinedload(Purchase.returns))
    if start_date:
        q = q.filter(Purchase.created_at >= start_date)
    if end_date:
        q = q.filter(Purchase.created_at <= end_date)
    purchases = q.order_by(Purchase.created_at.desc()).all()

    result = []
    for p in purchases:
        total_ret = sum((r.total_return_amount for r in p.returns), Decimal("0.00")) if p.returns else Decimal("0.00")
        net_due = max(Decimal("0.00"), p.total_amount - p.paid_amount - total_ret)
        status = p.payment_status
        if p.returns and net_due == Decimal("0.00") and status != "RETURNED":
            status = "PARTIALLY_RETURNED" if p.paid_amount > Decimal("0.00") else "RETURNED"

        result.append(PurchasesReportRow(
            purchase_number=p.purchase_number,
            date=p.created_at,
            supplier_name=p.supplier.name if p.supplier else "Unknown",
            total_amount=p.total_amount,
            paid_amount=p.paid_amount,
            due_amount=net_due,
            payment_status=status
        ))
    return result

def get_inventory_report(db: Session) -> List[InventoryReportRow]:
    products = db.query(Product).options(joinedload(Product.category))\
        .filter(Product.is_active == True).order_by(Product.name.asc()).all()

    return [
        InventoryReportRow(
            product_id=p.product_id,
            name=p.name,
            category_name=p.category.name if p.category else None,
            current_stock=p.current_stock,
            purchase_price=p.purchase_price,
            selling_price=p.selling_price,
            stock_value_cost=p.current_stock * p.purchase_price,
            stock_value_retail=p.current_stock * p.selling_price
        )
        for p in products
    ]

def get_stock_movements_report(
    db: Session,
    product_id: Optional[int] = None,
    start_date: Optional[datetime] = None,
    end_date: Optional[datetime] = None
) -> List[StockMovementReportRow]:
    start_date, end_date = _normalize_datetime_range(start_date, end_date)
    q = db.query(InventoryMovement).options(joinedload(InventoryMovement.product))
    if product_id:
        q = q.filter(InventoryMovement.product_id == product_id)
    if start_date:
        q = q.filter(InventoryMovement.created_at >= start_date)
    if end_date:
        q = q.filter(InventoryMovement.created_at <= end_date)
    movements = q.order_by(InventoryMovement.created_at.desc()).all()

    return [
        StockMovementReportRow(
            date=m.created_at,
            product_name=m.product.name if m.product else "Unknown",
            movement_type=m.movement_type,
            quantity=m.quantity,
            reference_type=m.reference_type,
            reference_id=m.reference_id,
            notes=m.notes
        )
        for m in movements
    ]

def get_customers_report(db: Session) -> List[CustomerReportRow]:
    customers = list_customers(db, is_active=True)
    return [
        CustomerReportRow(
            customer_id=c.customer_id,
            name=c.name,
            phone=c.phone,
            total_purchases=c.total_sales,
            total_payments=c.total_paid,
            total_returns=c.total_returns,
            current_due=c.current_due
        )
        for c in customers
    ]

def get_suppliers_report(db: Session) -> List[SupplierReportRow]:
    suppliers = list_suppliers(db, is_active=True)
    return [
        SupplierReportRow(
            supplier_id=s.supplier_id,
            name=s.name,
            phone=s.phone,
            total_purchases=s.total_purchases,
            total_payments=s.total_paid,
            total_returns=s.total_returns,
            current_due=s.current_due
        )
        for s in suppliers
    ]

def get_bills_report(db: Session) -> List[BillsReportRow]:
    bills = db.query(Bill).options(joinedload(Bill.category)).order_by(Bill.due_date.asc()).all()
    return [
        BillsReportRow(
            bill_number=b.bill_number,
            name=b.name,
            category_name=b.category.name if b.category else None,
            amount=b.amount,
            paid_amount=b.paid_amount,
            due_amount=max(Decimal("0.00"), b.amount - b.paid_amount),
            due_date=b.due_date,
            status=b.status
        )
        for b in bills
    ]

def get_expenses_report(db: Session, start_date: Optional[date] = None, end_date: Optional[date] = None) -> List[ExpensesReportRow]:
    q = db.query(Expense).options(joinedload(Expense.category))
    if start_date:
        q = q.filter(Expense.expense_date >= start_date)
    if end_date:
        q = q.filter(Expense.expense_date <= end_date)
    expenses = q.order_by(Expense.expense_date.desc()).all()

    return [
        ExpensesReportRow(
            date=e.expense_date,
            expense_number=e.expense_number,
            category_name=e.category.name if e.category else None,
            title=e.title,
            amount=e.amount,
            payment_method=e.payment_method
        )
        for e in expenses
    ]
