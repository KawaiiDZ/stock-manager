from datetime import date, datetime, time
from decimal import Decimal
import json
from typing import List, Dict, Optional
from sqlalchemy.orm import Session
from sqlalchemy import func

from backend.app.models.business import BusinessSettings
from backend.app.models.sales import SalePayment
from backend.app.models.customer import CustomerPayment
from backend.app.models.account_transfer import AccountTransfer
from backend.app.schemas.accounts import (
    AccountBalanceResponse, AccountTransferCreate, AccountTransferResponse, CashFlowSummaryResponse
)
from backend.app.services.id_generator import generate_transfer_number
from backend.app.core.errors import EntityNotFoundException, BusinessRuleException

def _get_active_accounts(db: Session) -> List[str]:
    """Retrieve active payment accounts configured in BusinessSettings."""
    settings = db.query(BusinessSettings).filter(BusinessSettings.id == 1).first()
    accounts: List[str] = ["Cash", "Bank Transfer", "Easypaisa", "Jazzcash"]
    if settings and settings.payment_accounts:
        try:
            parsed = json.loads(settings.payment_accounts)
            if isinstance(parsed, list) and len(parsed) > 0:
                accounts = [str(a).strip() for a in parsed if str(a).strip()]
        except Exception:
            pass

    # Ensure "Cash" is always present as base account
    if not any(a.lower() == "cash" for a in accounts):
        accounts.insert(0, "Cash")

    IGNORE_METHODS = {"split", "split payment", "mix", "mixed", "__split__"}
    accounts = [a for a in accounts if a.lower() not in IGNORE_METHODS]

    # Also detect any distinct accounts present in historical payments or transfers
    # so money is never orphaned if an account was renamed
    payment_methods = db.query(SalePayment.payment_method).distinct().all()
    for (pm,) in payment_methods:
        if pm and pm.strip() and pm.strip().lower() not in IGNORE_METHODS and not any(a.lower() == pm.strip().lower() for a in accounts):
            accounts.append(pm.strip())

    transfer_methods = db.query(AccountTransfer.from_account).distinct().all() + db.query(AccountTransfer.to_account).distinct().all()
    for (tm,) in transfer_methods:
        if tm and tm.strip() and tm.strip().lower() not in IGNORE_METHODS and not any(a.lower() == tm.strip().lower() for a in accounts):
            accounts.append(tm.strip())

    return accounts

def get_cash_flow_summary(db: Session) -> CashFlowSummaryResponse:
    accounts = _get_active_accounts(db)
    
    today = date.today()
    start_of_today = datetime.combine(today, time.min)
    end_of_today = datetime.combine(today, time.max)

    # 1. Direct POS Sale Payments (exclude those linked to CustomerPayment to avoid double counting)
    direct_sales_payments = db.query(
        SalePayment.payment_method,
        SalePayment.created_at,
        SalePayment.amount
    ).filter(SalePayment.customer_payment_id == None).all()

    # 2. Customer Debt Repayments
    customer_payments = db.query(
        CustomerPayment.payment_method,
        CustomerPayment.created_at,
        CustomerPayment.amount
    ).all()

    # 3. Inter-Account Transfers
    transfers = db.query(AccountTransfer).all()

    # Aggregate by normalized account name
    balance_map: Dict[str, Dict[str, Decimal]] = {
        acc: {
            "total_sales": Decimal("0.00"),
            "today_sales": Decimal("0.00"),
            "transfers_in": Decimal("0.00"),
            "transfers_out": Decimal("0.00"),
        }
        for acc in accounts
    }

    def _find_matching_key(name: str) -> str:
        clean = (name or "").strip()
        if clean.lower() in ("split", "split payment", "mix", "mixed", "__split__"):
            return "Cash"
        for acc in balance_map:
            if acc.lower() == clean.lower():
                return acc
        # Fallback to Cash if unknown
        return "Cash"

    # Process POS sale payments
    for pm, created_at, amount in direct_sales_payments:
        key = _find_matching_key(pm)
        balance_map[key]["total_sales"] += (amount or Decimal("0.00"))
        if created_at and start_of_today <= created_at <= end_of_today:
            balance_map[key]["today_sales"] += (amount or Decimal("0.00"))

    # Process Customer debt payments
    for pm, created_at, amount in customer_payments:
        key = _find_matching_key(pm)
        balance_map[key]["total_sales"] += (amount or Decimal("0.00"))
        if created_at and start_of_today <= created_at <= end_of_today:
            balance_map[key]["today_sales"] += (amount or Decimal("0.00"))

    # Process transfers
    for t in transfers:
        amt = t.amount or Decimal("0.00")
        from_key = _find_matching_key(t.from_account)
        to_key = _find_matching_key(t.to_account)
        balance_map[from_key]["transfers_out"] += amt
        balance_map[to_key]["transfers_in"] += amt

    account_responses: List[AccountBalanceResponse] = []
    total_business_funds = Decimal("0.00")

    for acc in accounts:
        data = balance_map[acc]
        net_transfers = data["transfers_in"] - data["transfers_out"]
        current_balance = data["total_sales"] + net_transfers
        total_business_funds += current_balance

        account_responses.append(AccountBalanceResponse(
            account=acc,
            current_balance=current_balance.quantize(Decimal("0.01")),
            total_sales_inflow=data["total_sales"].quantize(Decimal("0.01")),
            today_sales_inflow=data["today_sales"].quantize(Decimal("0.01")),
            net_transfers=net_transfers.quantize(Decimal("0.01"))
        ))

    # Fetch 50 most recent transfers
    recent_transfers = db.query(AccountTransfer).order_by(
        AccountTransfer.transfer_date.desc(), AccountTransfer.id.desc()
    ).limit(50).all()

    return CashFlowSummaryResponse(
        total_business_funds=total_business_funds.quantize(Decimal("0.01")),
        accounts=account_responses,
        recent_transfers=[AccountTransferResponse.model_validate(t) for t in recent_transfers]
    )

def create_account_transfer(db: Session, data: AccountTransferCreate) -> AccountTransfer:
    from_acc = data.from_account.strip()
    to_acc = data.to_account.strip()

    if from_acc.lower() == to_acc.lower():
        raise BusinessRuleException("Cannot transfer funds to the same account.")

    if data.amount <= Decimal("0.00"):
        raise BusinessRuleException("Transfer amount must be greater than zero.")

    # Validate against available balance of the source account
    summary = get_cash_flow_summary(db)
    source_acc = next((a for a in summary.accounts if a.account.lower() == from_acc.lower()), None)
    source_balance = source_acc.current_balance if source_acc else Decimal("0.00")

    if source_balance <= Decimal("0.00"):
        raise BusinessRuleException(
            f"Cannot transfer from '{from_acc}' because its available balance is Rs. {source_balance:,.2f}."
        )

    if data.amount > source_balance:
        raise BusinessRuleException(
            f"Transfer amount (Rs. {data.amount:,.2f}) cannot exceed available balance (Rs. {source_balance:,.2f}) in '{from_acc}'."
        )

    transfer_num = generate_transfer_number(db)
    t_date = data.transfer_date if data.transfer_date is not None else datetime.now()

    transfer = AccountTransfer(
        transfer_number=transfer_num,
        from_account=from_acc,
        to_account=to_acc,
        amount=data.amount,
        transfer_date=t_date,
        notes=data.notes.strip() if data.notes else None
    )
    db.add(transfer)
    db.commit()
    db.refresh(transfer)
    return transfer

def list_account_transfers(db: Session, limit: int = 50) -> List[AccountTransfer]:
    return db.query(AccountTransfer).order_by(
        AccountTransfer.transfer_date.desc(), AccountTransfer.id.desc()
    ).limit(limit).all()

def delete_account_transfer(db: Session, transfer_id: int) -> None:
    transfer = db.query(AccountTransfer).filter(AccountTransfer.id == transfer_id).first()
    if not transfer:
        raise EntityNotFoundException("AccountTransfer", str(transfer_id))
    db.delete(transfer)
    db.commit()
