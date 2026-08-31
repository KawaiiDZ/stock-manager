from typing import List, Optional
from datetime import datetime
from decimal import Decimal
from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session
from backend.app.core.database import get_db
from backend.app.schemas.sales import (
    SaleCreate, SaleResponse, ReceiptPrintResponse
)
from backend.app.services.sales_service import (
    create_sale, get_sale, get_sale_by_receipt, list_sales,
    record_additional_sale_payment, get_receipt_print_data
)

router = APIRouter(prefix="/sales", tags=["Sales"])

@router.get("", response_model=List[SaleResponse])
def get_sales(
    search: Optional[str] = None,
    customer_id: Optional[int] = None,
    payment_status: Optional[str] = None,
    start_date: Optional[datetime] = None,
    end_date: Optional[datetime] = None,
    skip: int = 0,
    limit: int = 200,
    db: Session = Depends(get_db)
):
    return list_sales(
        db,
        search=search,
        customer_id=customer_id,
        payment_status=payment_status,
        start_date=start_date,
        end_date=end_date,
        skip=skip,
        limit=limit
    )

@router.post("", response_model=SaleResponse)
def make_sale(data: SaleCreate, db: Session = Depends(get_db)):
    return create_sale(db, data)

@router.get("/{id}", response_model=SaleResponse)
def get_single_sale(id: int, db: Session = Depends(get_db)):
    return get_sale(db, id)

@router.get("/receipt/{receipt_number}", response_model=ReceiptPrintResponse)
def get_receipt(receipt_number: str, db: Session = Depends(get_db)):
    return get_receipt_print_data(db, receipt_number)

@router.post("/{id}/payments", response_model=SaleResponse)
def add_sale_payment(
    id: int,
    amount: Decimal = Query(..., gt=0),
    payment_method: str = "Cash",
    db: Session = Depends(get_db)
):
    return record_additional_sale_payment(db, id, amount, payment_method)
