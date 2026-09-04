from decimal import Decimal
from typing import List, Optional
from datetime import datetime
from sqlalchemy.orm import Session, joinedload
from sqlalchemy import or_

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
        supplier_name=purchase.supplier.name if purchase.supplier else "Unknown",
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
    supplier = db.query(Supplier).filter(Supplier.id == data.supplier_id).first()
    if not supplier:
        raise EntityNotFoundException("Supplier", str(data.supplier_id))

    if not data.items:
        raise BusinessRuleException("Purchase must have at least one product.")

    po_num = generate_purchase_number(db)

    subtotal = Decimal("0.00")
    processed_items = []

    for it in data.items:
        product = db.query(Product).filter(Product.id == it.product_id).first()
        if not product:
            raise EntityNotFoundException("Product", str(it.product_id))

        if it.quantity <= Decimal("0.00"):
            raise BusinessRuleException(f"Quantity for {product.name} must be greater than zero.")
        if it.unit_cost < Decimal("0.00"):
            raise BusinessRuleException(f"Unit cost for {product.name} cannot be negative.")

        line_total = it.quantity * it.unit_cost
        subtotal += line_total

        # Increase product current stock
        product.current_stock += it.quantity
        # Update product's latest purchase price
        product.purchase_price = it.unit_cost

        processed_items.append({
            "product": product,
            "quantity": it.quantity,
            "unit_cost": it.unit_cost,
            "total_cost": line_total
        })

    disc = data.discount_amount or Decimal("0.00")
    tax = data.tax_amount or Decimal("0.00")
    total_amount = max(Decimal("0.00"), subtotal - disc + tax)

    paid = min(data.paid_amount, total_amount) if data.paid_amount > Decimal("0.00") else Decimal("0.00")
    due = max(Decimal("0.00"), total_amount - paid)

    if due == Decimal("0.00"):
        status = "PAID"
    elif paid > Decimal("0.00"):
        status = "PARTIALLY_PAID"
    else:
        status = "UNPAID"

    # Create Purchase
    purchase = Purchase(
        purchase_number=po_num,
        supplier_id=supplier.id,
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
    for p_it in processed_items:
        prod = p_it["product"]
        qty = p_it["quantity"]
        cost = p_it["unit_cost"]

        p_item = PurchaseItem(
            purchase_id=purchase.id,
            product_id=prod.id,
            quantity=qty,
            unit_cost=cost,
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
        movement = InventoryMovement(
            product_id=prod.id,
            movement_type="PURCHASE",
            quantity=qty,
            unit_cost=cost,
            reference_type="PURCHASE",
            reference_id=po_num,
            notes=f"Purchased from {supplier.name} ({po_num})"
        )
        db.add(movement)

    if paid > Decimal("0.00"):
        payment = PurchasePayment(
            purchase_id=purchase.id,
            amount=paid,
            payment_method=data.payment_method or "Cash",
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
        q = q.join(Purchase.supplier).filter(
            or_(
                Purchase.purchase_number.ilike(st),
                Supplier.name.ilike(st)
            )
        )
    purchases = q.order_by(Purchase.created_at.desc(), Purchase.id.desc()).offset(skip).limit(limit).all()
    return [_format_purchase_response(p) for p in purchases]
