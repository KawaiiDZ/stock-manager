from typing import List, Optional
from datetime import datetime
from decimal import Decimal
from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session
from backend.app.core.database import get_db
from backend.app.schemas.purchase import (
    PurchaseCreate, PurchaseResponse
)
from backend.app.services.purchase_service import (
    create_purchase, get_purchase, list_purchases
)

router = APIRouter(prefix="/purchases", tags=["Purchases"])

@router.get("", response_model=List[PurchaseResponse])
def get_purchases(
    search: Optional[str] = None,
    supplier_id: Optional[int] = None,
    payment_status: Optional[str] = None,
    start_date: Optional[datetime] = None,
    end_date: Optional[datetime] = None,
    skip: int = 0,
    limit: int = 200,
    db: Session = Depends(get_db)
):
    return list_purchases(
        db,
        search=search,
        supplier_id=supplier_id,
        payment_status=payment_status,
        start_date=start_date,
        end_date=end_date,
        skip=skip,
        limit=limit
    )

@router.post("", response_model=PurchaseResponse)
def add_purchase(data: PurchaseCreate, db: Session = Depends(get_db)):
    return create_purchase(db, data)

@router.get("/{id}", response_model=PurchaseResponse)
def get_single_purchase(id: int, db: Session = Depends(get_db)):
    return get_purchase(db, id)

@router.post("/{id}/payments", response_model=PurchaseResponse)
def add_purchase_payment(
    id: int,
    amount: Decimal = Query(..., gt=0),
    payment_method: str = "Cash",
    db: Session = Depends(get_db)
):
    from backend.app.services.purchase_service import record_additional_purchase_payment
    return record_additional_purchase_payment(db, id, amount, payment_method)
