from datetime import datetime, date
from typing import List, Optional
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from backend.app.core.database import get_db
from backend.app.schemas.reports import (
    SalesReportRow, SalesDetailReportRow, PurchasesReportRow, InventoryReportRow,
    StockMovementReportRow, CustomerReportRow, SupplierReportRow, BillsReportRow, ExpensesReportRow
)
from backend.app.services.reports_service import (
    get_sales_report, get_sales_detail_report, get_purchases_report, get_inventory_report,
    get_stock_movements_report, get_customers_report, get_suppliers_report, get_bills_report,
    get_expenses_report
)

router = APIRouter(prefix="/reports", tags=["Reports"])

@router.get("/sales", response_model=List[SalesReportRow])
def report_sales(start_date: Optional[datetime] = None, end_date: Optional[datetime] = None, db: Session = Depends(get_db)):
    return get_sales_report(db, start_date=start_date, end_date=end_date)

@router.get("/sales-detail", response_model=List[SalesDetailReportRow])
def report_sales_detail(start_date: Optional[datetime] = None, end_date: Optional[datetime] = None, db: Session = Depends(get_db)):
    return get_sales_detail_report(db, start_date=start_date, end_date=end_date)

@router.get("/purchases", response_model=List[PurchasesReportRow])
def report_purchases(start_date: Optional[datetime] = None, end_date: Optional[datetime] = None, db: Session = Depends(get_db)):
    return get_purchases_report(db, start_date=start_date, end_date=end_date)

@router.get("/inventory", response_model=List[InventoryReportRow])
def report_inventory(db: Session = Depends(get_db)):
    return get_inventory_report(db)

@router.get("/stock-movements", response_model=List[StockMovementReportRow])
def report_stock_movements(
    product_id: Optional[int] = None,
    start_date: Optional[datetime] = None,
    end_date: Optional[datetime] = None,
    db: Session = Depends(get_db)
):
    return get_stock_movements_report(db, product_id=product_id, start_date=start_date, end_date=end_date)

@router.get("/customers", response_model=List[CustomerReportRow])
def report_customers(db: Session = Depends(get_db)):
    return get_customers_report(db)

@router.get("/suppliers", response_model=List[SupplierReportRow])
def report_suppliers(db: Session = Depends(get_db)):
    return get_suppliers_report(db)

@router.get("/bills", response_model=List[BillsReportRow])
def report_bills(db: Session = Depends(get_db)):
    return get_bills_report(db)

@router.get("/expenses", response_model=List[ExpensesReportRow])
def report_expenses(start_date: Optional[date] = None, end_date: Optional[date] = None, db: Session = Depends(get_db)):
    return get_expenses_report(db, start_date=start_date, end_date=end_date)
