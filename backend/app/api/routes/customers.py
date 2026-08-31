from typing import List, Optional
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from backend.app.core.database import get_db
from backend.app.schemas.customer import (
    CustomerCreate, CustomerUpdate, CustomerResponse, CustomerPaymentCreate,
    CustomerPaymentResponse, CustomerLedgerEntry
)
from backend.app.services.customer_service import (
    list_customers, get_customer, create_customer, update_customer,
    deactivate_customer, restore_customer, record_customer_payment, get_customer_ledger
)

router = APIRouter(prefix="/customers", tags=["Customers"])

@router.get("", response_model=List[CustomerResponse])
def get_customers(search: Optional[str] = None, is_active: Optional[bool] = True, db: Session = Depends(get_db)):
    return list_customers(db, search=search, is_active=is_active)

@router.post("", response_model=CustomerResponse)
def add_customer(data: CustomerCreate, db: Session = Depends(get_db)):
    return create_customer(db, data)

@router.get("/{id}", response_model=CustomerResponse)
def get_single_customer(id: int, db: Session = Depends(get_db)):
    return get_customer(db, id)

@router.put("/{id}", response_model=CustomerResponse)
def modify_customer(id: int, data: CustomerUpdate, db: Session = Depends(get_db)):
    return update_customer(db, id, data)

@router.delete("/{id}", response_model=CustomerResponse)
def delete_customer(id: int, db: Session = Depends(get_db)):
    return deactivate_customer(db, id)

@router.post("/{id}/deactivate", response_model=CustomerResponse)
def deactivate_single_customer(id: int, db: Session = Depends(get_db)):
    return deactivate_customer(db, id)

@router.post("/{id}/restore", response_model=CustomerResponse)
def restore_single_customer(id: int, db: Session = Depends(get_db)):
    return restore_customer(db, id)

@router.post("/{id}/payments", response_model=CustomerPaymentResponse)
def pay_customer_due(id: int, data: CustomerPaymentCreate, db: Session = Depends(get_db)):
    return record_customer_payment(db, id, data)

@router.get("/{id}/ledger", response_model=List[CustomerLedgerEntry])
def get_ledger(id: int, db: Session = Depends(get_db)):
    return get_customer_ledger(db, id)
