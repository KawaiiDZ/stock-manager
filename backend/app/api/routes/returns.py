from typing import List, Optional
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from backend.app.core.database import get_db
from backend.app.schemas.sales import SalesReturnCreate, SalesReturnResponse
from backend.app.schemas.purchase import PurchaseReturnCreate, PurchaseReturnResponse
from backend.app.services.returns_service import (
    create_sales_return, get_sales_return, list_sales_returns,
    create_purchase_return, get_purchase_return, list_purchase_returns
)

router = APIRouter(prefix="/returns", tags=["Returns"])

# Customer Returns
@router.post("", response_model=SalesReturnResponse)
@router.post("/", response_model=SalesReturnResponse)
@router.post("/sale", response_model=SalesReturnResponse)
@router.post("/sales", response_model=SalesReturnResponse)
def return_customer_sale(data: SalesReturnCreate, db: Session = Depends(get_db)):
    return create_sales_return(db, data)

@router.get("", response_model=List[SalesReturnResponse])
@router.get("/", response_model=List[SalesReturnResponse])
@router.get("/sales", response_model=List[SalesReturnResponse])
def get_all_sales_returns(customer_id: Optional[int] = None, skip: int = 0, limit: int = 100, db: Session = Depends(get_db)):
    return list_sales_returns(db, customer_id=customer_id, skip=skip, limit=limit)

@router.get("/sales/{id}", response_model=SalesReturnResponse)
def get_single_sales_return(id: int, db: Session = Depends(get_db)):
    return get_sales_return(db, id)

# Supplier Returns
@router.post("/purchase", response_model=PurchaseReturnResponse)
@router.post("/purchases", response_model=PurchaseReturnResponse)
def return_supplier_purchase(data: PurchaseReturnCreate, db: Session = Depends(get_db)):
    return create_purchase_return(db, data)

@router.get("/purchases", response_model=List[PurchaseReturnResponse])
def get_all_purchase_returns(skip: int = 0, limit: int = 100, db: Session = Depends(get_db)):
    return list_purchase_returns(db, skip=skip, limit=limit)

@router.get("/purchases/{id}", response_model=PurchaseReturnResponse)
def get_single_purchase_return(id: int, db: Session = Depends(get_db)):
    return get_purchase_return(db, id)
