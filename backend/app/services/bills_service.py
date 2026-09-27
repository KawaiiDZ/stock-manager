from datetime import date, datetime
from decimal import Decimal
from typing import List, Optional
from sqlalchemy.orm import Session, joinedload

from backend.app.models.bills import BillCategory, Bill, BillPayment
from backend.app.schemas.bills import (
    BillCategoryCreate, BillCategoryResponse, BillCreate, BillUpdate,
    BillResponse, BillPaymentCreate, BillPaymentResponse
)
from backend.app.schemas.dashboard import BillAttentionItem
from backend.app.services.id_generator import generate_bill_number
from backend.app.core.errors import EntityNotFoundException, BusinessRuleException

# Categories
def list_bill_categories(db: Session, active_only: bool = True) -> List[BillCategoryResponse]:
    q = db.query(BillCategory)
    if active_only:
        q = q.filter(BillCategory.is_active == True)
    categories = q.order_by(BillCategory.name.asc()).all()
    return [BillCategoryResponse.model_validate(c) for c in categories]

def create_bill_category(db: Session, data: BillCategoryCreate) -> BillCategoryResponse:
    if not data.name or not data.name.strip():
        raise BusinessRuleException("Bill category name cannot be empty.")
    existing = db.query(BillCategory).filter(BillCategory.name.ilike(data.name.strip())).first()
    if existing:
        if not existing.is_active:
            existing.is_active = True
            db.commit()
            return BillCategoryResponse.model_validate(existing)
        raise BusinessRuleException(f"Bill category '{data.name}' already exists.")
    cat = BillCategory(name=data.name.strip(), is_active=True)
    db.add(cat)
    db.commit()
    db.refresh(cat)
    return BillCategoryResponse.model_validate(cat)

# Bills
def _format_bill_response(bill: Bill) -> BillResponse:
    payments_dto = []
    for p in bill.payments:
        payments_dto.append(BillPaymentResponse(
            id=p.id,
            bill_id=p.bill_id,
            amount=p.amount,
            payment_method=p.payment_method,
            payment_date=p.payment_date,
            notes=p.notes
        ))

    due_amt = max(Decimal("0.00"), bill.amount - bill.paid_amount)

    return BillResponse(
        id=bill.id,
        bill_number=bill.bill_number,
        name=bill.name,
        category_id=bill.category_id,
        category_name=bill.category.name if bill.category else "General",
        amount=bill.amount,
        paid_amount=bill.paid_amount,
        due_amount=due_amt,
        due_date=bill.due_date,
        status=bill.status,
        notes=bill.notes,
        created_at=bill.created_at,
        updated_at=bill.updated_at,
        payments=payments_dto
    )

def list_bills(
    db: Session,
    category_id: Optional[int] = None,
    status: Optional[str] = None,
    skip: int = 0,
    limit: int = 100
) -> List[BillResponse]:
    q = db.query(Bill).options(
        joinedload(Bill.category),
        joinedload(Bill.payments)
    )
    if category_id:
        q = q.filter(Bill.category_id == category_id)
    if status:
        q = q.filter(Bill.status == status)
    bills = q.order_by(Bill.due_date.asc(), Bill.id.desc()).offset(skip).limit(limit).all()
    return [_format_bill_response(b) for b in bills]

def get_bill(db: Session, bill_id: int) -> BillResponse:
    bill = db.query(Bill).options(
        joinedload(Bill.category),
        joinedload(Bill.payments)
    ).filter(Bill.id == bill_id).first()
    if not bill:
        raise EntityNotFoundException("Bill", str(bill_id))
    return _format_bill_response(bill)

def create_bill(db: Session, data: BillCreate) -> BillResponse:
    cat = db.query(BillCategory).filter(BillCategory.id == data.category_id).first()
    if not cat:
        raise EntityNotFoundException("Bill Category", str(data.category_id))

    if not data.name or not data.name.strip():
        raise BusinessRuleException("Bill name cannot be empty.")

    if data.amount <= Decimal("0.00"):
        raise BusinessRuleException("Bill amount must be greater than zero.")

    b_num = data.bill_number.strip() if data.bill_number else generate_bill_number(db)

    bill = Bill(
        bill_number=b_num,
        name=data.name.strip(),
        category_id=cat.id,
        amount=data.amount,
        paid_amount=Decimal("0.00"),
        due_date=data.due_date,
        status="TO_PAY",
        notes=data.notes
    )
    db.add(bill)
    db.commit()
    db.refresh(bill)
    return get_bill(db, bill.id)

def update_bill(db: Session, bill_id: int, data: BillUpdate) -> BillResponse:
    bill = db.query(Bill).filter(Bill.id == bill_id).first()
    if not bill:
        raise EntityNotFoundException("Bill", str(bill_id))

    if data.bill_number is not None:
        bill.bill_number = data.bill_number.strip()
    if data.name is not None:
        if not data.name.strip():
            raise BusinessRuleException("Bill name cannot be empty.")
        bill.name = data.name.strip()
    if data.category_id is not None:
        bill.category_id = data.category_id
    if data.amount is not None:
        if data.amount < Decimal("0.00"):
            raise BusinessRuleException("Bill amount cannot be negative.")
        if data.amount < bill.paid_amount:
            raise BusinessRuleException(f"Bill amount cannot be less than already paid amount (Rs. {bill.paid_amount}).")
        bill.amount = data.amount
    if data.due_date is not None:
        bill.due_date = data.due_date
    if data.status is not None:
        bill.status = data.status
    if data.notes is not None:
        bill.notes = data.notes

    # Recompute status
    due_amt = bill.amount - bill.paid_amount
    if due_amt <= Decimal("0.00"):
        bill.status = "PAID"
    elif bill.paid_amount > Decimal("0.00"):
        bill.status = "PARTIALLY_PAID"
    else:
        if bill.status in ("PAID", "PARTIALLY_PAID") or data.status is None:
            bill.status = "TO_PAY"

    db.commit()
    db.refresh(bill)
    return get_bill(db, bill.id)

def record_bill_payment(db: Session, bill_id: int, data: BillPaymentCreate) -> BillResponse:
    bill = db.query(Bill).filter(Bill.id == bill_id).first()
    if not bill:
        raise EntityNotFoundException("Bill", str(bill_id))

    if data.amount <= Decimal("0.00"):
        raise BusinessRuleException("Payment amount must be greater than zero.")

    remaining_due = bill.amount - bill.paid_amount
    if data.amount > remaining_due:
        raise BusinessRuleException(f"Payment amount exceeds remaining bill due (Rs. {remaining_due}).")

    payment = BillPayment(
        bill_id=bill.id,
        amount=data.amount,
        payment_method=data.payment_method or "Cash",
        notes=data.notes
    )
    db.add(payment)

    bill.paid_amount += data.amount
    if bill.paid_amount >= bill.amount:
        bill.status = "PAID"
    else:
        bill.status = "PARTIALLY_PAID"

    db.commit()
    return get_bill(db, bill.id)

def get_bills_needing_attention(db: Session) -> List[BillAttentionItem]:
    today = date.today()
    bills = db.query(Bill).options(joinedload(Bill.category))\
        .filter(Bill.status.in_(["TO_PAY", "PARTIALLY_PAID", "PENDING"]))\
        .order_by(Bill.due_date.asc()).all()

    attention_list = []
    for b in bills:
        days_diff = (b.due_date - today).days
        if days_diff < 0:
            urgency = f"Overdue by {abs(days_diff)} days"
        elif days_diff == 0:
            urgency = "Due Today"
        elif days_diff <= 7:
            urgency = f"Due in {days_diff} days"
        else:
            urgency = f"Due on {b.due_date.strftime('%d %b')}"

        attention_list.append(BillAttentionItem(
            id=b.id,
            bill_number=b.bill_number,
            name=b.name,
            amount=b.amount,
            paid_amount=b.paid_amount,
            due_amount=b.amount - b.paid_amount,
            due_date=b.due_date,
            status=b.status,
            urgency_label=urgency
        ))

    return attention_list
