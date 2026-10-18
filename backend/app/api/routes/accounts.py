from typing import List, Optional
from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.orm import Session
from backend.app.core.database import get_db
from backend.app.schemas.accounts import (
    CashFlowSummaryResponse, AccountTransferCreate, AccountTransferResponse
)
from backend.app.services.account_service import (
    get_cash_flow_summary, create_account_transfer, list_account_transfers, delete_account_transfer
)

router = APIRouter(prefix="/accounts", tags=["Accounts & Cash Flow"])

@router.get("/summary", response_model=CashFlowSummaryResponse)
@router.get("/cash-flow", response_model=CashFlowSummaryResponse)
def get_accounts_summary(db: Session = Depends(get_db)):
    return get_cash_flow_summary(db)

@router.get("/transfers", response_model=List[AccountTransferResponse])
def get_transfers(limit: int = Query(50, ge=1, le=500), db: Session = Depends(get_db)):
    return list_account_transfers(db, limit=limit)

@router.post("/transfers", response_model=AccountTransferResponse, status_code=status.HTTP_201_CREATED)
def make_transfer(data: AccountTransferCreate, db: Session = Depends(get_db)):
    return create_account_transfer(db, data)

@router.delete("/transfers/{transfer_id}", status_code=status.HTTP_200_OK)
def remove_transfer(transfer_id: int, db: Session = Depends(get_db)):
    delete_account_transfer(db, transfer_id)
    return {"message": f"Transfer #{transfer_id} deleted successfully."}
