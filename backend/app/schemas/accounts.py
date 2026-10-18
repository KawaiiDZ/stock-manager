from datetime import datetime
from decimal import Decimal
from typing import List, Optional
from pydantic import BaseModel, Field, field_validator

class AccountBalanceResponse(BaseModel):
    account: str
    current_balance: Decimal
    total_sales_inflow: Decimal
    today_sales_inflow: Decimal
    net_transfers: Decimal

    class Config:
        from_attributes = True

class AccountTransferCreate(BaseModel):
    from_account: str = Field(..., min_length=1)
    to_account: str = Field(..., min_length=1)
    amount: Decimal = Field(..., gt=Decimal("0.00"))
    notes: Optional[str] = None
    transfer_date: Optional[datetime] = None

    @field_validator("to_account")
    @classmethod
    def validate_accounts_not_same(cls, v, info):
        from_acc = info.data.get("from_account")
        if from_acc and from_acc.strip().lower() == v.strip().lower():
            raise ValueError("From Account and To Account cannot be the same.")
        return v.strip()

    @field_validator("from_account")
    @classmethod
    def clean_from_account(cls, v):
        return v.strip()

class AccountTransferResponse(BaseModel):
    id: int
    transfer_number: str
    from_account: str
    to_account: str
    amount: Decimal
    notes: Optional[str] = None
    transfer_date: datetime
    created_at: datetime

    class Config:
        from_attributes = True

class CashFlowSummaryResponse(BaseModel):
    total_business_funds: Decimal
    accounts: List[AccountBalanceResponse]
    recent_transfers: List[AccountTransferResponse]
