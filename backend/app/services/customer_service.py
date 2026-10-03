from datetime import datetime
from decimal import Decimal
from typing import List, Optional
from sqlalchemy.orm import Session
from sqlalchemy import func, or_

from backend.app.models.customer import Customer, CustomerPayment
from backend.app.models.sales import Sale, SalesReturn, SalePayment
from backend.app.schemas.customer import (
    CustomerCreate, CustomerUpdate, CustomerPaymentCreate, CustomerResponse,
    CustomerPaymentResponse, CustomerLedgerEntry
)
from backend.app.services.id_generator import generate_customer_id, generate_customer_payment_number
from backend.app.core.errors import EntityNotFoundException, BusinessRuleException

def calculate_customer_summary(db: Session, customer_id: int):
    # Total sales
    total_sales = db.query(func.coalesce(func.sum(Sale.total_amount), Decimal("0.00")))\
        .filter(Sale.customer_id == customer_id).scalar()

    # Total paid on sales
    total_paid = db.query(func.coalesce(func.sum(Sale.paid_amount), Decimal("0.00")))\
        .filter(Sale.customer_id == customer_id).scalar()

    # Total returns (total return amount and return balance credit amount)
    total_returns = db.query(func.coalesce(func.sum(SalesReturn.total_return_amount), Decimal("0.00")))\
        .filter(SalesReturn.customer_id == customer_id).scalar()

    # Return balance credit reduces customer obligation
    return_balance_credits = db.query(func.coalesce(func.sum(SalesReturn.balance_credit_amount), Decimal("0.00")))\
        .filter(SalesReturn.customer_id == customer_id).scalar()

    # Current Due = Total Sales - Total Paid - Return Credits
    current_due = max(Decimal("0.00"), total_sales - total_paid - return_balance_credits)

    return {
        "total_sales": total_sales,
        "total_paid": total_paid,
        "total_returns": total_returns,
        "current_due": current_due
    }

def get_customer_due(db: Session, customer_id: int) -> Decimal:
    return calculate_customer_summary(db, customer_id)["current_due"]

def list_customers(db: Session, search: Optional[str] = None, is_active: Optional[bool] = True) -> List[CustomerResponse]:
    q = db.query(Customer)
    if is_active is not None:
        q = q.filter(Customer.is_active == is_active)
    if search:
        st = f"%{search.strip()}%"
        q = q.filter(
            or_(
                Customer.name.ilike(st),
                Customer.customer_id.ilike(st),
                Customer.phone.ilike(st)
            )
        )
    customers = q.order_by(Customer.name.asc()).all()

    result = []
    for c in customers:
        summary = calculate_customer_summary(db, c.id)
        result.append(CustomerResponse(
            id=c.id,
            customer_id=c.customer_id,
            name=c.name,
            phone=c.phone,
            address=c.address,
            is_active=c.is_active,
            current_due=summary["current_due"],
            total_sales=summary["total_sales"],
            total_paid=summary["total_paid"],
            total_returns=summary["total_returns"],
            created_at=c.created_at,
            updated_at=c.updated_at
        ))
    return result

def get_customer(db: Session, customer_id: int) -> CustomerResponse:
    c = db.query(Customer).filter(Customer.id == customer_id).first()
    if not c:
        raise EntityNotFoundException("Customer", str(customer_id))
    summary = calculate_customer_summary(db, c.id)
    return CustomerResponse(
        id=c.id,
        customer_id=c.customer_id,
        name=c.name,
        phone=c.phone,
        address=c.address,
        is_active=c.is_active,
        current_due=summary["current_due"],
        total_sales=summary["total_sales"],
        total_paid=summary["total_paid"],
        total_returns=summary["total_returns"],
        created_at=c.created_at,
        updated_at=c.updated_at
    )

def create_customer(db: Session, data: CustomerCreate) -> CustomerResponse:
    if not data.name or not data.name.strip():
        raise BusinessRuleException("Customer name cannot be empty.")
    new_cid = generate_customer_id(db)
    cust = Customer(
        customer_id=new_cid,
        name=data.name.strip(),
        phone=data.phone.strip() if data.phone else None,
        address=data.address.strip() if data.address else None,
        is_active=True
    )
    db.add(cust)
    db.commit()
    db.refresh(cust)
    return get_customer(db, cust.id)

def update_customer(db: Session, customer_id: int, data: CustomerUpdate) -> CustomerResponse:
    c = db.query(Customer).filter(Customer.id == customer_id).first()
    if not c:
        raise EntityNotFoundException("Customer", str(customer_id))
    if data.name is not None:
        if not data.name.strip():
            raise BusinessRuleException("Customer name cannot be empty.")
        if c.customer_id == "C-000001" and data.name.strip().lower() != "walk-in customer":
            raise BusinessRuleException("The default Walk-in Customer account cannot be renamed.")
        c.name = data.name.strip()
    if data.phone is not None:
        c.phone = data.phone.strip() if data.phone else None
    if data.address is not None:
        c.address = data.address.strip() if data.address else None
    db.commit()
    db.refresh(c)
    return get_customer(db, c.id)

def deactivate_customer(db: Session, customer_id: int) -> CustomerResponse:
    c = db.query(Customer).filter(Customer.id == customer_id).first()
    if not c:
        raise EntityNotFoundException("Customer", str(customer_id))
    if c.customer_id == "C-000001":
        raise BusinessRuleException("Walk-in Customer cannot be deactivated.")
    
    due = get_customer_due(db, customer_id)
    if due > Decimal("0.00"):
        raise BusinessRuleException(f"Cannot deactivate customer '{c.name}' because they have an outstanding balance of Rs. {due}. Please settle or clear the balance before deactivation.")

    c.is_active = False
    db.commit()
    return get_customer(db, c.id)

def restore_customer(db: Session, customer_id: int) -> CustomerResponse:
    c = db.query(Customer).filter(Customer.id == customer_id).first()
    if not c:
        raise EntityNotFoundException("Customer", str(customer_id))
    c.is_active = True
    db.commit()
    return get_customer(db, c.id)

def record_customer_payment(db: Session, customer_id: int, data: CustomerPaymentCreate) -> CustomerPaymentResponse:
    c = db.query(Customer).filter(Customer.id == customer_id).first()
    if not c:
        raise EntityNotFoundException("Customer", str(customer_id))
    if data.amount <= Decimal("0.00"):
        raise BusinessRuleException("Payment amount must be greater than zero.")

    current_due = get_customer_due(db, customer_id)
    if current_due <= Decimal("0.00"):
        raise BusinessRuleException(f"Customer {c.name} has no outstanding debt (Balance is 0.00).")
    if data.amount > current_due:
        raise BusinessRuleException(f"Payment amount ({data.amount}) cannot exceed current outstanding due ({current_due}).")

    p_num = generate_customer_payment_number(db)
    payment = CustomerPayment(
        payment_number=p_num,
        customer_id=customer_id,
        amount=data.amount,
        payment_method=data.payment_method or "Cash",
        notes=data.notes,
        created_at=datetime.now()
    )
    db.add(payment)
    db.flush()

    # Allocate payment to unpaid/partially paid sales FIFO
    unallocated = data.amount
    unpaid_sales = db.query(Sale).filter(
        Sale.customer_id == customer_id,
        Sale.due_amount > Decimal("0.00")
    ).order_by(Sale.created_at.asc()).all()

    for s in unpaid_sales:
        if unallocated <= Decimal("0.00"):
            break
        alloc = min(unallocated, s.due_amount)
        s.paid_amount += alloc
        s.due_amount = max(Decimal("0.00"), s.due_amount - alloc)

        total_ret_qty = sum((ri.quantity for r in s.returns for ri in r.items), Decimal("0.00")) if s.returns else Decimal("0.00")
        total_orig_qty = sum((it.quantity for it in s.items), Decimal("0.00"))
        if total_orig_qty > Decimal("0.00") and total_ret_qty >= total_orig_qty:
            s.payment_status = "RETURNED"
        elif total_ret_qty > Decimal("0.00"):
            s.payment_status = "PARTIALLY_RETURNED" if s.due_amount == Decimal("0.00") else "PARTIALLY_PAID"
        elif s.due_amount == Decimal("0.00"):
            s.payment_status = "PAID"
        else:
            s.payment_status = "PARTIALLY_PAID"

        sp = SalePayment(
            sale_id=s.id,
            amount=alloc,
            payment_method=data.payment_method or "Cash",
            customer_payment_id=payment.id,
            created_at=payment.created_at
        )
        db.add(sp)
        unallocated -= alloc

    db.commit()
    db.refresh(payment)
    return CustomerPaymentResponse.model_validate(payment)

def get_customer_ledger(db: Session, customer_id: int) -> List[CustomerLedgerEntry]:
    c = db.query(Customer).filter(Customer.id == customer_id).first()
    if not c:
        raise EntityNotFoundException("Customer", str(customer_id))

    # Collect transactions
    sales = db.query(Sale).filter(Sale.customer_id == customer_id).all()
    standalone_payments = db.query(CustomerPayment).filter(CustomerPayment.customer_id == customer_id).all()
    returns = db.query(SalesReturn).filter(SalesReturn.customer_id == customer_id).all()

    timeline = []
    allocated_sale_payment_ids = set()
    linked_return_ids = set()
    customer_payment_allocated_totals = {}

    for s in sales:
        # 1. Sale Invoice Creation Event
        timeline.append({
            "date": s.created_at,
            "type": "Sale",
            "reference": s.receipt_number,
            "bill_reference": s.receipt_number,
            "description": f"Invoice #{s.receipt_number} ({s.payment_status.replace('_', ' ')})",
            "debit": s.total_amount,
            "credit": Decimal("0.00"),
            "bill_amount": s.total_amount,
            "paid_amount": Decimal("0.00"),
            "_bill_event_type": "SALE_CREATION",
            "_sale_id": s.id,
        })

        # 2. Payments on this specific sale (checkout downpayments and allocated ledger payments)
        sorted_pms = sorted(
            [pm for pm in (s.payments or []) if pm.amount > Decimal("0.00")],
            key=lambda x: (x.created_at, x.id)
        )
        for idx, pm in enumerate(sorted_pms):
            allocated_sale_payment_ids.add(pm.id)
            is_initial = (idx == 0 and pm.customer_payment_id is None and abs((pm.created_at - s.created_at).total_seconds()) < 2)

            ref_num = s.receipt_number
            desc = f"Down payment at checkout ({pm.payment_method})" if is_initial else f"Direct payment on receipt ({pm.payment_method})"

            if pm.customer_payment_id:
                cp = pm.customer_payment
                if cp:
                    ref_num = cp.payment_number
                else:
                    ref_num = f"CP-{pm.customer_payment_id:06d}"
                desc = f"Ledger Payment on {s.receipt_number} ({pm.payment_method})"
                customer_payment_allocated_totals[pm.customer_payment_id] = (
                    customer_payment_allocated_totals.get(pm.customer_payment_id, Decimal("0.00")) + pm.amount
                )

            timeline.append({
                "date": s.created_at if is_initial else pm.created_at,
                "type": "Payment",
                "reference": ref_num,
                "bill_reference": s.receipt_number,
                "description": desc,
                "debit": Decimal("0.00"),
                "credit": pm.amount,
                "bill_amount": s.total_amount,
                "paid_amount": pm.amount,
                "_bill_event_type": "PAYMENT",
                "_sale_id": s.id,
            })

        # 3. Returns on this specific sale
        for r in (s.returns or []):
            if r.balance_credit_amount > Decimal("0.00"):
                linked_return_ids.add(r.id)
                timeline.append({
                    "date": r.created_at,
                    "type": "Return",
                    "reference": r.return_number,
                    "bill_reference": s.receipt_number,
                    "description": f"Return Credit on {s.receipt_number}",
                    "debit": Decimal("0.00"),
                    "credit": r.balance_credit_amount,
                    "bill_amount": s.total_amount,
                    "paid_amount": r.balance_credit_amount,
                    "_bill_event_type": "RETURN",
                    "_sale_id": s.id,
                })

    # 4. Standalone customer payments that were not allocated to sales (or any remaining balance)
    for p in standalone_payments:
        allocated = customer_payment_allocated_totals.get(p.id, Decimal("0.00"))
        unallocated = max(Decimal("0.00"), p.amount - allocated)
        if unallocated > Decimal("0.00"):
            timeline.append({
                "date": p.created_at,
                "type": "Payment",
                "reference": p.payment_number,
                "bill_reference": None,
                "description": f"Advance / Unallocated Payment ({p.payment_method})",
                "debit": Decimal("0.00"),
                "credit": unallocated,
                "bill_amount": None,
                "paid_amount": unallocated,
                "bill_remaining": None,
                "_bill_event_type": "UNALLOCATED_PAYMENT",
                "_sale_id": None,
            })

    # 5. General returns not tied to a specific sale
    for r in returns:
        if r.id not in linked_return_ids and r.balance_credit_amount > Decimal("0.00"):
            timeline.append({
                "date": r.created_at,
                "type": "Return",
                "reference": r.return_number,
                "bill_reference": None,
                "description": "General Return Credit (Balance reduced)",
                "debit": Decimal("0.00"),
                "credit": r.balance_credit_amount,
                "bill_amount": None,
                "paid_amount": r.balance_credit_amount,
                "bill_remaining": None,
                "_bill_event_type": "STANDALONE_RETURN",
                "_sale_id": None,
            })

    # 6. Calculate progressive payoff (bill_remaining) for each distinct sale
    for s in sales:
        sale_events = [ev for ev in timeline if ev.get("_sale_id") == s.id]
        sale_events.sort(key=lambda ev: (ev["date"], 0 if ev["_bill_event_type"] == "SALE_CREATION" else 1))

        cur_bill_remaining = s.total_amount
        for ev in sale_events:
            if ev["_bill_event_type"] == "SALE_CREATION":
                ev["bill_remaining"] = cur_bill_remaining
            else:
                paid_or_credit = ev.get("paid_amount") or Decimal("0.00")
                cur_bill_remaining = max(Decimal("0.00"), cur_bill_remaining - paid_or_credit)
                ev["bill_remaining"] = cur_bill_remaining

    # 7. Sort all timeline entries chronologically
    def global_sort_key(ev):
        type_priority = 0 if ev.get("_bill_event_type") == "SALE_CREATION" else 1
        return (ev["date"], type_priority)

    timeline.sort(key=global_sort_key)

    # 8. Compute running overall account balance
    running_balance = Decimal("0.00")
    ledger_entries = []
    for item in timeline:
        d = item["debit"].quantize(Decimal("0.01"))
        c = item["credit"].quantize(Decimal("0.01"))
        running_balance = (running_balance + d - c).quantize(Decimal("0.01"))

        b_amt = item["bill_amount"].quantize(Decimal("0.01")) if item.get("bill_amount") is not None else None
        p_amt = item["paid_amount"].quantize(Decimal("0.01")) if item.get("paid_amount") is not None else None
        b_rem = item["bill_remaining"].quantize(Decimal("0.01")) if item.get("bill_remaining") is not None else None

        ledger_entries.append(CustomerLedgerEntry(
            date=item["date"],
            type=item["type"],
            reference=item["reference"],
            bill_reference=item.get("bill_reference"),
            description=item["description"],
            debit=d,
            credit=c,
            balance=running_balance,
            bill_amount=b_amt,
            paid_amount=p_amt,
            bill_remaining=b_rem
        ))

    return ledger_entries

