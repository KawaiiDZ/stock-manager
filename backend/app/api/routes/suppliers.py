from typing import List, Optional
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from backend.app.core.database import get_db
from backend.app.schemas.supplier import (
    SupplierCreate, SupplierUpdate, SupplierResponse, SupplierPaymentCreate,
    SupplierPaymentResponse, SupplierLedgerEntry
)
from backend.app.services.supplier_service import (
    list_suppliers, get_supplier, create_supplier, update_supplier,
    deactivate_supplier, restore_supplier, record_supplier_payment, get_supplier_ledger
)

router = APIRouter(prefix="/suppliers", tags=["Suppliers"])

@router.get("", response_model=List[SupplierResponse])
def get_suppliers(search: Optional[str] = None, is_active: Optional[bool] = True, db: Session = Depends(get_db)):
    return list_suppliers(db, search=search, is_active=is_active)

@router.post("", response_model=SupplierResponse)
def add_supplier(data: SupplierCreate, db: Session = Depends(get_db)):
    return create_supplier(db, data)

@router.get("/{id}", response_model=SupplierResponse)
def get_single_supplier(id: int, db: Session = Depends(get_db)):
    return get_supplier(db, id)

@router.put("/{id}", response_model=SupplierResponse)
def modify_supplier(id: int, data: SupplierUpdate, db: Session = Depends(get_db)):
    return update_supplier(db, id, data)

@router.delete("/{id}", response_model=SupplierResponse)
def delete_supplier(id: int, db: Session = Depends(get_db)):
    return deactivate_supplier(db, id)

@router.post("/{id}/deactivate", response_model=SupplierResponse)
def deactivate_single_supplier(id: int, db: Session = Depends(get_db)):
    return deactivate_supplier(db, id)

@router.post("/{id}/restore", response_model=SupplierResponse)
def restore_single_supplier(id: int, db: Session = Depends(get_db)):
    return restore_supplier(db, id)

@router.post("/{id}/payments", response_model=SupplierPaymentResponse)
def pay_supplier_due(id: int, data: SupplierPaymentCreate, db: Session = Depends(get_db)):
    return record_supplier_payment(db, id, data)

@router.get("/{id}/ledger", response_model=List[SupplierLedgerEntry])
def get_ledger(id: int, db: Session = Depends(get_db)):
    return get_supplier_ledger(db, id)
