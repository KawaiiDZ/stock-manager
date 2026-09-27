from decimal import Decimal
from typing import List, Optional
from datetime import datetime, time
from sqlalchemy.orm import Session, joinedload
from sqlalchemy import or_

def _normalize_datetime_range(start_date: Optional[datetime], end_date: Optional[datetime]):
    if start_date is not None and end_date is not None and start_date > end_date:
        start_date, end_date = end_date, start_date
    if end_date is not None and isinstance(end_date, datetime):
        if end_date.time() == time.min:
            end_date = datetime.combine(end_date.date(), time.max)
    return start_date, end_date

from backend.app.models.purchase import Purchase, PurchaseItem, PurchasePayment
from backend.app.models.supplier import Supplier
from backend.app.models.product import Product
from backend.app.models.inventory import InventoryBatch, InventoryMovement
from backend.app.schemas.purchase import (
    PurchaseCreate, PurchaseResponse, PurchaseItemResponse, PurchasePaymentResponse
)
from backend.app.services.id_generator import generate_purchase_number
from backend.app.core.errors import EntityNotFoundException, BusinessRuleException

def _format_purchase_response(purchase: Purchase) -> PurchaseResponse:
    # Check returns on this purchase
    total_ret_val = Decimal("0.00")
    returned_qty_by_prod = {}
    if purchase.returns:
        for ret in purchase.returns:
            total_ret_val += ret.total_return_amount
            for ri in ret.items:
                returned_qty_by_prod[ri.product_id] = (
                    returned_qty_by_prod.get(ri.product_id, Decimal("0.00")) + ri.quantity
                )

    total_pur_qty = Decimal("0.00")
    total_ret_qty = Decimal("0.00")
    items_dto = []
    for it in purchase.items:
        ret_qty = returned_qty_by_prod.get(it.product_id, Decimal("0.00"))
        total_pur_qty += it.quantity
        total_ret_qty += ret_qty
        items_dto.append(PurchaseItemResponse(
            id=it.id,
            product_id=it.product_id,
            product_name=it.product.name if it.product else "Unknown",
            quantity=it.quantity,
            unit_cost=it.unit_cost,
            selling_price=getattr(it, 'selling_price', None),
            total_cost=it.total_cost
        ))

    payments_dto = []
    for p in purchase.payments:
        payments_dto.append(PurchasePaymentResponse(
            id=p.id,
            amount=p.amount,
            payment_method=p.payment_method,
            created_at=p.created_at
        ))

    net_due = max(Decimal("0.00"), purchase.total_amount - purchase.paid_amount - total_ret_val)

    if total_pur_qty > Decimal("0.00") and total_ret_qty >= total_pur_qty:
        effective_status = "RETURNED"
        net_due = Decimal("0.00")
    elif total_ret_qty > Decimal("0.00"):
        if net_due == Decimal("0.00"):
            effective_status = "PARTIALLY_RETURNED"
        else:
            effective_status = "PARTIALLY_PAID"
    elif net_due == Decimal("0.00") and purchase.paid_amount >= purchase.total_amount:
        effective_status = "PAID"
    elif purchase.paid_amount > Decimal("0.00"):
        effective_status = "PARTIALLY_PAID"
    else:
        effective_status = "UNPAID"

    return PurchaseResponse(
        id=purchase.id,
        purchase_number=purchase.purchase_number,
        supplier_id=purchase.supplier_id,
        supplier_name=purchase.supplier.name if purchase.supplier else "Direct / No Supplier",
        subtotal=purchase.subtotal,
        discount_amount=purchase.discount_amount,
        tax_amount=purchase.tax_amount,
        total_amount=purchase.total_amount,
        paid_amount=purchase.paid_amount,
        due_amount=net_due,
        payment_status=effective_status,
        notes=purchase.notes,
        created_at=purchase.created_at,
        items=items_dto,
        payments=payments_dto
    )

def create_purchase(db: Session, data: PurchaseCreate) -> PurchaseResponse:
    supplier = None
    if data.supplier_id:
        supplier = db.query(Supplier).filter(Supplier.id == data.supplier_id).first()
        if not supplier:
            raise EntityNotFoundException("Supplier", str(data.supplier_id))

    if not data.items:
        raise BusinessRuleException("Purchase must have at least one product.")

    po_num = generate_purchase_number(db)

    subtotal = Decimal("0.00")
    validated_items = []

    for it in data.items:
        product = db.query(Product).filter(Product.id == it.product_id).first()
        if not product:
            raise EntityNotFoundException("Product", str(it.product_id))

        if it.quantity <= Decimal("0.00"):
            raise BusinessRuleException(f"Quantity for {product.name} must be greater than zero.")
        if it.unit_cost < Decimal("0.00"):
            raise BusinessRuleException(f"Unit cost for {product.name} cannot be negative.")
        if it.selling_price is not None and it.selling_price < Decimal("0.00"):
            raise BusinessRuleException(f"Selling price for {product.name} cannot be negative.")

        line_total = (it.quantity * it.unit_cost).quantize(Decimal("0.01"))
        subtotal += line_total

        validated_items.append({
            "product": product,
            "quantity": it.quantity,
            "unit_cost": it.unit_cost,
            "selling_price": it.selling_price,
            "total_cost": line_total
        })

    if data.discount_amount is not None and data.discount_amount < Decimal("0.00"):
        raise BusinessRuleException("Discount amount cannot be negative.")
    if data.tax_amount is not None and data.tax_amount < Decimal("0.00"):
        raise BusinessRuleException("Tax amount cannot be negative.")
    if data.paid_amount is not None and data.paid_amount < Decimal("0.00"):
        raise BusinessRuleException("Paid amount cannot be negative.")

    disc = data.discount_amount or Decimal("0.00")
    tax = data.tax_amount or Decimal("0.00")
    total_amount = max(Decimal("0.00"), (subtotal - disc + tax).quantize(Decimal("0.01")))

    # Validate supplier payment rules:
    # If no supplier is assigned, partial payments / credit are not permitted. Must be settled in full.
    if supplier is None:
        if data.paid_amount < total_amount:
            raise BusinessRuleException(
                "Direct stock updates without a supplier cannot have unpaid credit or partial payments. Full payment is required."
            )
        paid = total_amount
        due = Decimal("0.00")
        status = "PAID"
    else:
        paid = min(data.paid_amount, total_amount) if data.paid_amount > Decimal("0.00") else Decimal("0.00")
        due = max(Decimal("0.00"), total_amount - paid)
        if due == Decimal("0.00"):
            status = "PAID"
        elif paid > Decimal("0.00"):
            status = "PARTIALLY_PAID"
        else:
            status = "UNPAID"

    # Now that all business rules are validated, update product stocks and prices
    for v_it in validated_items:
        prod = v_it["product"]
        prod.current_stock += v_it["quantity"]
        prod.purchase_price = v_it["unit_cost"]
        if v_it["selling_price"] is not None and v_it["selling_price"] >= Decimal("0.00"):
            prod.selling_price = v_it["selling_price"]

    # Create Purchase
    purchase = Purchase(
        purchase_number=po_num,
        supplier_id=supplier.id if supplier else None,
        subtotal=subtotal,
        discount_amount=disc,
        tax_amount=tax,
        total_amount=total_amount,
        paid_amount=paid,
        due_amount=due,
        payment_status=status,
        notes=data.notes
    )
    db.add(purchase)
    db.flush()

    # Create Purchase Items, Inventory Batches, and Movements
    for p_it in validated_items:
        prod = p_it["product"]
        qty = p_it["quantity"]
        cost = p_it["unit_cost"]
        sell_p = p_it["selling_price"]

        p_item = PurchaseItem(
            purchase_id=purchase.id,
            product_id=prod.id,
            quantity=qty,
            unit_cost=cost,
            selling_price=sell_p,
            total_cost=p_it["total_cost"]
        )
        db.add(p_item)

        # Create new FIFO Inventory Batch
        batch = InventoryBatch(
            product_id=prod.id,
            purchase_id=purchase.id,
            quantity_received=qty,
            quantity_remaining=qty,
            unit_cost=cost
        )
        db.add(batch)

        # Log movement
        supp_label = f"from {supplier.name}" if supplier else "(Direct Stock Entry)"
        movement = InventoryMovement(
            product_id=prod.id,
            movement_type="PURCHASE",
            quantity=qty,
            unit_cost=cost,
            reference_type="PURCHASE",
            reference_id=po_num,
            notes=f"Received {supp_label} ({po_num})"
        )
        db.add(movement)

    if paid > Decimal("0.00"):
        payment = PurchasePayment(
            purchase_id=purchase.id,
            amount=paid,
            payment_method=data.payment_method or "Cash",
            supplier_payment_id=None,
            created_at=purchase.created_at
        )
        db.add(payment)

    db.commit()
    db.refresh(purchase)
    return get_purchase(db, purchase.id)

def get_purchase(db: Session, purchase_id: int) -> PurchaseResponse:
    purchase = db.query(Purchase).options(
        joinedload(Purchase.supplier),
        joinedload(Purchase.items).joinedload(PurchaseItem.product),
        joinedload(Purchase.payments)
    ).filter(Purchase.id == purchase_id).first()
    if not purchase:
        raise EntityNotFoundException("Purchase", str(purchase_id))
    return _format_purchase_response(purchase)

def list_purchases(
    db: Session,
    search: Optional[str] = None,
    supplier_id: Optional[int] = None,
    payment_status: Optional[str] = None,
    start_date: Optional[datetime] = None,
    end_date: Optional[datetime] = None,
    skip: int = 0,
    limit: int = 200
) -> List[PurchaseResponse]:
    start_date, end_date = _normalize_datetime_range(start_date, end_date)
    q = db.query(Purchase).options(
        joinedload(Purchase.supplier),
        joinedload(Purchase.items).joinedload(PurchaseItem.product),
        joinedload(Purchase.payments)
    )
    if supplier_id:
        q = q.filter(Purchase.supplier_id == supplier_id)
    if payment_status:
        q = q.filter(Purchase.payment_status == payment_status)
    if start_date:
        q = q.filter(Purchase.created_at >= start_date)
    if end_date:
        q = q.filter(Purchase.created_at <= end_date)
    if search:
        st = f"%{search.strip()}%"
        q = q.outerjoin(Purchase.supplier).filter(
            or_(
                Purchase.purchase_number.ilike(st),
                Supplier.name.ilike(st)
            )
        )
    purchases = q.order_by(Purchase.created_at.desc(), Purchase.id.desc()).offset(skip).limit(limit).all()
    return [_format_purchase_response(p) for p in purchases]

def record_additional_purchase_payment(db: Session, purchase_id: int, amount: Decimal, payment_method: str = "Cash") -> PurchaseResponse:
    from backend.app.models.purchase import PurchaseReturn, PurchaseReturnItem
    purchase = db.query(Purchase).options(
        joinedload(Purchase.returns).joinedload(PurchaseReturn.items),
        joinedload(Purchase.items)
    ).filter(Purchase.id == purchase_id).first()
    if not purchase:
        raise EntityNotFoundException("Purchase", str(purchase_id))

    if amount <= Decimal("0.00"):
        raise BusinessRuleException("Payment amount must be greater than zero.")
    amount = amount.quantize(Decimal("0.01"))

    total_return_val = Decimal("0.00")
    total_returned_qty = Decimal("0.00")
    total_purchased_qty = sum(item.quantity for item in purchase.items)
    if purchase.returns:
        for ret in purchase.returns:
            total_return_val += ret.total_return_amount
            for ri in ret.items:
                total_returned_qty += ri.quantity

    current_due = max(Decimal("0.00"), purchase.total_amount - purchase.paid_amount - total_return_val)

    if amount > current_due:
        raise BusinessRuleException(f"Payment amount cannot exceed remaining due (Rs. {current_due}).")

    payment = PurchasePayment(
        purchase_id=purchase.id,
        amount=amount,
        payment_method=payment_method
    )
    db.add(payment)

    purchase.paid_amount += amount
    new_due = max(Decimal("0.00"), purchase.total_amount - purchase.paid_amount - total_return_val)
    purchase.due_amount = new_due

    if total_purchased_qty > Decimal("0.00") and total_returned_qty >= total_purchased_qty:
        purchase.payment_status = "RETURNED"
    elif total_returned_qty > Decimal("0.00"):
        if new_due == Decimal("0.00"):
            purchase.payment_status = "PARTIALLY_RETURNED"
        else:
            purchase.payment_status = "PARTIALLY_PAID"
    elif new_due == Decimal("0.00") and purchase.paid_amount >= purchase.total_amount:
        purchase.payment_status = "PAID"
    else:
        purchase.payment_status = "PARTIALLY_PAID"

    db.commit()
    return get_purchase(db, purchase.id)
