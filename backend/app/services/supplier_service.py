from datetime import datetime
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
    if not data.name or not data.name.strip():
        raise BusinessRuleException("Supplier name cannot be empty.")
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
        if not data.name.strip():
            raise BusinessRuleException("Supplier name cannot be empty.")
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
    
    due = get_supplier_due(db, supplier_id)
    if due > Decimal("0.00"):
        raise BusinessRuleException(f"Cannot deactivate supplier '{s.name}' because there is an outstanding payable balance of Rs. {due}. Please settle or clear the balance before deactivation.")

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
        notes=data.notes,
        created_at=datetime.now()
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

        total_ret_qty = sum((ri.quantity for r in pur.returns for ri in r.items), Decimal("0.00")) if pur.returns else Decimal("0.00")
        total_orig_qty = sum((it.quantity for it in pur.items), Decimal("0.00"))
        if total_orig_qty > Decimal("0.00") and total_ret_qty >= total_orig_qty:
            pur.payment_status = "RETURNED"
        elif total_ret_qty > Decimal("0.00"):
            pur.payment_status = "PARTIALLY_RETURNED" if pur.due_amount == Decimal("0.00") else "PARTIALLY_PAID"
        elif pur.due_amount == Decimal("0.00"):
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
    allocated_purchase_payment_ids = set()
    linked_return_ids = set()
    supplier_payment_allocated_totals = {}

    for p in purchases:
        # 1. Purchase Invoice Creation Event
        timeline.append({
            "date": p.created_at,
            "type": "Purchase",
            "reference": p.purchase_number,
            "bill_reference": p.purchase_number,
            "description": f"Purchase Invoice #{p.purchase_number} ({p.payment_status.replace('_', ' ')})",
            "debit": Decimal("0.00"),
            "credit": p.total_amount,
            "bill_amount": p.total_amount,
            "paid_amount": Decimal("0.00"),
            "_bill_event_type": "PURCHASE_CREATION",
            "_purchase_id": p.id,
        })

        # 2. Payments on this specific purchase
        sorted_pms = sorted(
            [pm for pm in (p.payments or []) if pm.amount > Decimal("0.00")],
            key=lambda x: (x.created_at, x.id)
        )
        for idx, pm in enumerate(sorted_pms):
            allocated_purchase_payment_ids.add(pm.id)
            is_initial = (idx == 0 and pm.supplier_payment_id is None and abs((pm.created_at - p.created_at).total_seconds()) < 2)

            ref_num = p.purchase_number
            desc = f"Down payment on purchase ({pm.payment_method})" if is_initial else f"Direct payment on invoice ({pm.payment_method})"

            if pm.supplier_payment_id:
                sp = pm.supplier_payment
                if sp:
                    ref_num = sp.payment_number
                else:
                    ref_num = f"SP-{pm.supplier_payment_id:06d}"
                desc = f"Ledger Payment on {p.purchase_number} ({pm.payment_method})"
                supplier_payment_allocated_totals[pm.supplier_payment_id] = (
                    supplier_payment_allocated_totals.get(pm.supplier_payment_id, Decimal("0.00")) + pm.amount
                )

            timeline.append({
                "date": p.created_at if is_initial else pm.created_at,
                "type": "Payment",
                "reference": ref_num,
                "bill_reference": p.purchase_number,
                "description": desc,
                "payment_method": pm.payment_method,
                "debit": pm.amount,
                "credit": Decimal("0.00"),
                "bill_amount": p.total_amount,
                "paid_amount": pm.amount,
                "_bill_event_type": "PAYMENT",
                "_purchase_id": p.id,
            })

        # 3. Returns on this specific purchase
        for r in (p.returns or []):
            if r.total_return_amount > Decimal("0.00"):
                linked_return_ids.add(r.id)
                timeline.append({
                    "date": r.created_at,
                    "type": "Return",
                    "reference": r.return_number,
                    "bill_reference": p.purchase_number,
                    "description": f"Supplier Return on {p.purchase_number}",
                    "debit": r.total_return_amount,
                    "credit": Decimal("0.00"),
                    "bill_amount": p.total_amount,
                    "paid_amount": r.total_return_amount,
                    "_bill_event_type": "RETURN",
                    "_purchase_id": p.id,
                })

    # 4. Standalone supplier payments unallocated
    for pay in standalone_payments:
        allocated = supplier_payment_allocated_totals.get(pay.id, Decimal("0.00"))
        unallocated = max(Decimal("0.00"), pay.amount - allocated)
        if unallocated > Decimal("0.00"):
            timeline.append({
                "date": pay.created_at,
                "type": "Payment",
                "reference": pay.payment_number,
                "bill_reference": None,
                "description": f"Advance / Unallocated Payment ({pay.payment_method})",
                "payment_method": pay.payment_method,
                "debit": unallocated,
                "credit": Decimal("0.00"),
                "bill_amount": None,
                "paid_amount": unallocated,
                "bill_remaining": None,
                "_bill_event_type": "UNALLOCATED_PAYMENT",
                "_purchase_id": None,
            })

    # 5. General returns not tied to a specific purchase
    for r in returns:
        if r.id not in linked_return_ids and r.total_return_amount > Decimal("0.00"):
            timeline.append({
                "date": r.created_at,
                "type": "Return",
                "reference": r.return_number,
                "bill_reference": None,
                "description": "General Supplier Return (Obligation reduced)",
                "debit": r.total_return_amount,
                "credit": Decimal("0.00"),
                "bill_amount": None,
                "paid_amount": r.total_return_amount,
                "bill_remaining": None,
                "_bill_event_type": "STANDALONE_RETURN",
                "_purchase_id": None,
            })

    # 6. Calculate progressive payoff (bill_remaining) for each purchase
    for p in purchases:
        purchase_events = [ev for ev in timeline if ev.get("_purchase_id") == p.id]
        purchase_events.sort(key=lambda ev: (ev["date"], 0 if ev["_bill_event_type"] == "PURCHASE_CREATION" else 1))

        cur_bill_remaining = p.total_amount
        for ev in purchase_events:
            if ev["_bill_event_type"] == "PURCHASE_CREATION":
                ev["bill_remaining"] = cur_bill_remaining
            else:
                paid_or_ret = ev.get("paid_amount") or Decimal("0.00")
                cur_bill_remaining = max(Decimal("0.00"), cur_bill_remaining - paid_or_ret)
                ev["bill_remaining"] = cur_bill_remaining

    # 7. Sort all timeline entries chronologically
    def global_sort_key(ev):
        type_priority = 0 if ev.get("_bill_event_type") == "PURCHASE_CREATION" else 1
        return (ev["date"], type_priority)

    timeline.sort(key=global_sort_key)

    # 8. Compute running overall payable balance
    running_balance = Decimal("0.00")
    ledger_entries = []
    for item in timeline:
        d = item["debit"].quantize(Decimal("0.01"))
        c = item["credit"].quantize(Decimal("0.01"))
        running_balance = (running_balance + c - d).quantize(Decimal("0.01"))

        b_amt = item["bill_amount"].quantize(Decimal("0.01")) if item.get("bill_amount") is not None else None
        p_amt = item["paid_amount"].quantize(Decimal("0.01")) if item.get("paid_amount") is not None else None
        b_rem = item["bill_remaining"].quantize(Decimal("0.01")) if item.get("bill_remaining") is not None else None

        ledger_entries.append(SupplierLedgerEntry(
            date=item["date"],
            type=item["type"],
            reference=item["reference"],
            bill_reference=item.get("bill_reference"),
            description=item["description"],
            payment_method=item.get("payment_method"),
            debit=d,
            credit=c,
            balance=running_balance,
            bill_amount=b_amt,
            paid_amount=p_amt,
            bill_remaining=b_rem
        ))

    return ledger_entries

