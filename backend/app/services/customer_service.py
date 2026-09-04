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
        notes=data.notes
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
        if s.due_amount == Decimal("0.00"):
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
    for s in sales:
        timeline.append({
            "date": s.created_at,
            "type": "Sale",
            "reference": s.receipt_number,
            "description": f"Invoice ({s.payment_status.replace('_', ' ')})",
            "debit": s.total_amount,
            "credit": Decimal("0.00"),
        })

        # Checkout down payment (if any paid at time of sale, not linked to a CustomerPayment)
        initial_payments = [
            pm for pm in (s.payments or [])
            if pm.customer_payment_id is None and pm.amount > Decimal("0.00")
        ]
        initial_credit = sum((pm.amount for pm in initial_payments), Decimal("0.00"))
        if initial_credit > Decimal("0.00"):
            method = initial_payments[0].payment_method if initial_payments else "Cash"
            timeline.append({
                "date": s.created_at,
                "type": "Payment",
                "reference": s.receipt_number,
                "description": f"Down payment at checkout ({method})",
                "debit": Decimal("0.00"),
                "credit": initial_credit,
            })

    for p in standalone_payments:
        timeline.append({
            "date": p.created_at,
            "type": "Payment",
            "reference": p.payment_number,
            "description": f"Received Payment ({p.payment_method})",
            "debit": Decimal("0.00"),
            "credit": p.amount,
        })

    for r in returns:
        if r.balance_credit_amount > Decimal("0.00"):
            timeline.append({
                "date": r.created_at,
                "type": "Return",
                "reference": r.return_number,
                "description": f"Return Credit (Balance reduced)",
                "debit": Decimal("0.00"),
                "credit": r.balance_credit_amount,
            })

    timeline.sort(key=lambda x: x["date"])

    running_balance = Decimal("0.00")
    ledger_entries = []
    for item in timeline:
        running_balance += item["debit"] - item["credit"]
        ledger_entries.append(CustomerLedgerEntry(
            date=item["date"],
            type=item["type"],
            reference=item["reference"],
            description=item["description"],
            debit=item["debit"],
            credit=item["credit"],
            balance=running_balance
        ))

    return ledger_entries
