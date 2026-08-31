from typing import List, Optional
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from backend.app.core.database import get_db
from backend.app.schemas.bills import (
    BillCategoryCreate, BillCategoryResponse, BillCreate, BillUpdate,
    BillResponse, BillPaymentCreate, BillAttentionItem
)
from backend.app.services.bills_service import (
    list_bill_categories, create_bill_category, list_bills, get_bill,
    create_bill, update_bill, record_bill_payment, get_bills_needing_attention
)

router = APIRouter(tags=["Bills"])

# Categories
@router.get("/bill-categories", response_model=List[BillCategoryResponse])
def get_categories(active_only: bool = True, db: Session = Depends(get_db)):
    return list_bill_categories(db, active_only=active_only)

@router.post("/bill-categories", response_model=BillCategoryResponse)
def add_category(data: BillCategoryCreate, db: Session = Depends(get_db)):
    return create_bill_category(db, data)

# Attention Bills (MUST be defined before /bills/{id})
@router.get("/bills/attention", response_model=List[BillAttentionItem])
def get_attention_bills(db: Session = Depends(get_db)):
    return get_bills_needing_attention(db)

# Bills
@router.get("/bills", response_model=List[BillResponse])
def get_bills(
    category_id: Optional[int] = None,
    status: Optional[str] = None,
    skip: int = 0,
    limit: int = 100,
    db: Session = Depends(get_db)
):
    return list_bills(db, category_id=category_id, status=status, skip=skip, limit=limit)

@router.post("/bills", response_model=BillResponse)
def add_bill(data: BillCreate, db: Session = Depends(get_db)):
    return create_bill(db, data)

@router.get("/bills/{id}", response_model=BillResponse)
def get_single_bill(id: int, db: Session = Depends(get_db)):
    return get_bill(db, id)

@router.put("/bills/{id}", response_model=BillResponse)
def modify_bill(id: int, data: BillUpdate, db: Session = Depends(get_db)):
    return update_bill(db, id, data)

@router.post("/bills/{id}/payments", response_model=BillResponse)
def pay_bill_installment(id: int, data: BillPaymentCreate, db: Session = Depends(get_db)):
    return record_bill_payment(db, id, data)
