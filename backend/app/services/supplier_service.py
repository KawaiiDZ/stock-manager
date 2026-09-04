from decimal import Decimal
from typing import List, Optional
from sqlalchemy.orm import Session
from sqlalchemy import func, or_

from backend.app.models.supplier import Supplier, SupplierPayment
from backend.app.models.purchase import Purchase, PurchaseReturn, PurchasePayment
from backend.app.schemas.supplier import (
    SupplierCreate, SupplierUpdate, SupplierPaymentCreate, SupplierResponse,
    SupplierPaymentResponse, SupplierLedgerEntry
)
from backend.app.services.id_generator import generate_supplier_id, generate_supplier_payment_number
from backend.app.core.errors import EntityNotFoundException, BusinessRuleException

def calculate_supplier_summary(db: Session, supplier_id: int):
    total_purchases = db.query(func.coalesce(func.sum(Purchase.total_amount), Decimal("0.00")))\
        .filter(Purchase.supplier_id == supplier_id).scalar()

    total_paid = db.query(func.coalesce(func.sum(Purchase.paid_amount), Decimal("0.00")))\
        .filter(Purchase.supplier_id == supplier_id).scalar()

    total_returns = db.query(func.coalesce(func.sum(PurchaseReturn.total_return_amount), Decimal("0.00")))\
        .filter(PurchaseReturn.supplier_id == supplier_id).scalar()

    current_due = max(Decimal("0.00"), total_purchases - total_paid - total_returns)

    return {
        "total_purchases": total_purchases,
        "total_paid": total_paid,
        "total_returns": total_returns,
        "current_due": current_due
    }

def get_supplier_due(db: Session, supplier_id: int) -> Decimal:
    return calculate_supplier_summary(db, supplier_id)["current_due"]

def list_suppliers(db: Session, search: Optional[str] = None, is_active: Optional[bool] = True) -> List[SupplierResponse]:
    q = db.query(Supplier)
    if is_active is not None:
        q = q.filter(Supplier.is_active == is_active)
    if search:
        st = f"%{search.strip()}%"
        q = q.filter(
            or_(
                Supplier.name.ilike(st),
                Supplier.supplier_id.ilike(st),
                Supplier.phone.ilike(st)
            )
        )
    suppliers = q.order_by(Supplier.name.asc()).all()

    result = []
    for s in suppliers:
        summary = calculate_supplier_summary(db, s.id)
        result.append(SupplierResponse(
            id=s.id,
            supplier_id=s.supplier_id,
            name=s.name,
            phone=s.phone,
            address=s.address,
            is_active=s.is_active,
            current_due=summary["current_due"],
            total_purchases=summary["total_purchases"],
            total_paid=summary["total_paid"],
            total_returns=summary["total_returns"],
            created_at=s.created_at,
            updated_at=s.updated_at
        ))
    return result

def get_supplier(db: Session, supplier_id: int) -> SupplierResponse:
    s = db.query(Supplier).filter(Supplier.id == supplier_id).first()
    if not s:
        raise EntityNotFoundException("Supplier", str(supplier_id))
    summary = calculate_supplier_summary(db, s.id)
    return SupplierResponse(
        id=s.id,
        supplier_id=s.supplier_id,
        name=s.name,
        phone=s.phone,
        address=s.address,
        is_active=s.is_active,
        current_due=summary["current_due"],
        total_purchases=summary["total_purchases"],
        total_paid=summary["total_paid"],
        total_returns=summary["total_returns"],
        created_at=s.created_at,
        updated_at=s.updated_at
    )

def create_supplier(db: Session, data: SupplierCreate) -> SupplierResponse:
    new_sid = generate_supplier_id(db)
    supp = Supplier(
        supplier_id=new_sid,
        name=data.name.strip(),
        phone=data.phone.strip() if data.phone else None,
        address=data.address.strip() if data.address else None,
        is_active=True
    )
    db.add(supp)
    db.commit()
    db.refresh(supp)
    return get_supplier(db, supp.id)

def update_supplier(db: Session, supplier_id: int, data: SupplierUpdate) -> SupplierResponse:
    s = db.query(Supplier).filter(Supplier.id == supplier_id).first()
    if not s:
        raise EntityNotFoundException("Supplier", str(supplier_id))
    if data.name is not None:
        s.name = data.name.strip()
    if data.phone is not None:
        s.phone = data.phone.strip() if data.phone else None
    if data.address is not None:
        s.address = data.address.strip() if data.address else None
    db.commit()
    db.refresh(s)
    return get_supplier(db, s.id)

def deactivate_supplier(db: Session, supplier_id: int) -> SupplierResponse:
    s = db.query(Supplier).filter(Supplier.id == supplier_id).first()
    if not s:
        raise EntityNotFoundException("Supplier", str(supplier_id))
    s.is_active = False
    db.commit()
    return get_supplier(db, s.id)

def restore_supplier(db: Session, supplier_id: int) -> SupplierResponse:
    s = db.query(Supplier).filter(Supplier.id == supplier_id).first()
    if not s:
        raise EntityNotFoundException("Supplier", str(supplier_id))
    s.is_active = True
    db.commit()
    return get_supplier(db, s.id)

def record_supplier_payment(db: Session, supplier_id: int, data: SupplierPaymentCreate) -> SupplierPaymentResponse:
    s = db.query(Supplier).filter(Supplier.id == supplier_id).first()
    if not s:
        raise EntityNotFoundException("Supplier", str(supplier_id))
    if data.amount <= Decimal("0.00"):
        raise BusinessRuleException("Payment amount must be greater than zero.")

    current_due = get_supplier_due(db, supplier_id)
    if current_due <= Decimal("0.00"):
        raise BusinessRuleException(f"Supplier {s.name} has no outstanding payable balance (Balance is 0.00).")
    if data.amount > current_due:
        raise BusinessRuleException(f"Payment amount ({data.amount}) cannot exceed current outstanding payable balance ({current_due}).")

    p_num = generate_supplier_payment_number(db)
    payment = SupplierPayment(
        payment_number=p_num,
        supplier_id=supplier_id,
        amount=data.amount,
        payment_method=data.payment_method or "Cash",
        notes=data.notes
    )
    db.add(payment)
    db.flush()

    # Allocate payment to unpaid/partially paid purchases FIFO
    unallocated = data.amount
    unpaid_purchases = db.query(Purchase).filter(
        Purchase.supplier_id == supplier_id,
        Purchase.due_amount > Decimal("0.00")
    ).order_by(Purchase.created_at.asc()).all()

    for pur in unpaid_purchases:
        if unallocated <= Decimal("0.00"):
            break
        alloc = min(unallocated, pur.due_amount)
        pur.paid_amount += alloc
        pur.due_amount = max(Decimal("0.00"), pur.due_amount - alloc)
        if pur.due_amount == Decimal("0.00"):
            pur.payment_status = "PAID"
        else:
            pur.payment_status = "PARTIALLY_PAID"

        pp = PurchasePayment(
            purchase_id=pur.id,
            amount=alloc,
            payment_method=data.payment_method or "Cash",
            supplier_payment_id=payment.id,
            created_at=payment.created_at
        )
        db.add(pp)
        unallocated -= alloc

    db.commit()
    db.refresh(payment)
    return SupplierPaymentResponse.model_validate(payment)

def get_supplier_ledger(db: Session, supplier_id: int) -> List[SupplierLedgerEntry]:
    s = db.query(Supplier).filter(Supplier.id == supplier_id).first()
    if not s:
        raise EntityNotFoundException("Supplier", str(supplier_id))

    purchases = db.query(Purchase).filter(Purchase.supplier_id == supplier_id).all()
    standalone_payments = db.query(SupplierPayment).filter(SupplierPayment.supplier_id == supplier_id).all()
    returns = db.query(PurchaseReturn).filter(PurchaseReturn.supplier_id == supplier_id).all()

    timeline = []
    for p in purchases:
        timeline.append({
            "date": p.created_at,
            "type": "Purchase",
            "reference": p.purchase_number,
            "description": f"Purchase Invoice ({p.payment_status.replace('_', ' ')})",
            "debit": Decimal("0.00"),
            "credit": p.total_amount,
        })

        # Checkout down payment (if any paid at time of purchase, not linked to a SupplierPayment)
        initial_payments = [
            pm for pm in (p.payments or [])
            if pm.supplier_payment_id is None and pm.amount > Decimal("0.00")
        ]
        initial_paid = sum((pm.amount for pm in initial_payments), Decimal("0.00"))
        if initial_paid > Decimal("0.00"):
            method = initial_payments[0].payment_method if initial_payments else "Cash"
            timeline.append({
                "date": p.created_at,
                "type": "Payment",
                "reference": p.purchase_number,
                "description": f"Down payment on purchase ({method})",
                "debit": initial_paid,
                "credit": Decimal("0.00"),
            })

    for pay in standalone_payments:
        timeline.append({
            "date": pay.created_at,
            "type": "Payment",
            "reference": pay.payment_number,
            "description": f"Paid Supplier ({pay.payment_method})",
            "debit": pay.amount,
            "credit": Decimal("0.00"),
        })

    for r in returns:
        timeline.append({
            "date": r.created_at,
            "type": "Return",
            "reference": r.return_number,
            "description": f"Supplier Return",
            "debit": r.total_return_amount,
            "credit": Decimal("0.00"),
        })

    timeline.sort(key=lambda x: x["date"])

    running_balance = Decimal("0.00")
    ledger_entries = []
    for item in timeline:
        # For supplier, credit increases our payable obligation, debit decreases it
        running_balance += item["credit"] - item["debit"]
        ledger_entries.append(SupplierLedgerEntry(
            date=item["date"],
            type=item["type"],
            reference=item["reference"],
            description=item["description"],
            debit=item["debit"],
            credit=item["credit"],
            balance=running_balance
        ))

    return ledger_entries
