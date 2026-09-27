from decimal import Decimal
from typing import List, Optional
from sqlalchemy.orm import Session, joinedload
from backend.app.models.sales import Sale, SalesReturn, SalesReturnItem
from backend.app.models.purchase import Purchase, PurchaseReturn, PurchaseReturnItem
from backend.app.models.customer import Customer
from backend.app.models.supplier import Supplier
from backend.app.models.product import Product
from backend.app.models.inventory import InventoryBatch, InventoryMovement
from backend.app.schemas.sales import SalesReturnCreate, SalesReturnResponse, SalesReturnItemResponse
from backend.app.schemas.purchase import PurchaseReturnCreate, PurchaseReturnResponse, PurchaseReturnItemResponse
from backend.app.services.id_generator import generate_sales_return_number, generate_purchase_return_number
from backend.app.core.errors import EntityNotFoundException, InsufficientStockException, BusinessRuleException

def _format_sales_return_response(ret: SalesReturn) -> SalesReturnResponse:
    items_dto = []
    for it in ret.items:
        items_dto.append(SalesReturnItemResponse(
            id=it.id,
            product_id=it.product_id,
            product_name=it.product.name if it.product else "Unknown",
            quantity=it.quantity,
            unit_price=it.unit_price,
            total_amount=it.total_amount
        ))

    return SalesReturnResponse(
        id=ret.id,
        return_number=ret.return_number,
        sale_id=ret.sale_id,
        sale_receipt_number=ret.sale.receipt_number if ret.sale else None,
        customer_id=ret.customer_id,
        customer_name=ret.customer.name if ret.customer else "Unknown",
        total_return_amount=ret.total_return_amount,
        cash_refund_amount=ret.cash_refund_amount,
        balance_credit_amount=ret.balance_credit_amount,
        reason=ret.reason,
        created_at=ret.created_at,
        items=items_dto
    )

def create_sales_return(db: Session, data: SalesReturnCreate) -> SalesReturnResponse:
    # 1. Validate Customer
    customer = db.query(Customer).filter(Customer.id == data.customer_id).first()
    if not customer:
        raise EntityNotFoundException("Customer", str(data.customer_id))

    if not data.items:
        raise BusinessRuleException("Return must include at least one item.")

    # 2. Check original sale if return is tied to a receipt
    original_sale = None
    if data.sale_id:
        original_sale = db.query(Sale).filter(Sale.id == data.sale_id).first()
        if not original_sale:
            raise EntityNotFoundException("Sale", str(data.sale_id))

    # 3. Calculate total return value & restore stock
    total_return_amount = Decimal("0.00")
    processed_items = []
    ret_num = generate_sales_return_number(db)

    # Pre-calculate already returned quantities per product for this sale
    already_returned_by_prod = {}
    if original_sale:
        prev_returns = db.query(SalesReturn).filter(SalesReturn.sale_id == original_sale.id).all()
        for pr in prev_returns:
            for pri in pr.items:
                already_returned_by_prod[pri.product_id] = (
                    already_returned_by_prod.get(pri.product_id, Decimal("0.00")) + pri.quantity
                )

    for item_data in data.items:
        product = db.query(Product).filter(Product.id == item_data.product_id).first()
        if not product:
            raise EntityNotFoundException("Product", str(item_data.product_id))

        if item_data.quantity <= Decimal("0.00"):
            raise BusinessRuleException(f"Return quantity for {product.name} must be greater than zero.")
        if item_data.unit_price < Decimal("0.00"):
            raise BusinessRuleException(f"Unit price for {product.name} cannot be negative.")

        # Calculate effective return unit price considering line discounts and order discounts
        effective_unit_price = item_data.unit_price
        if original_sale:
            sale_item = next((si for si in original_sale.items if si.product_id == item_data.product_id), None)
            if not sale_item:
                raise BusinessRuleException(
                    f"Product '{product.name}' was not found in receipt {original_sale.receipt_number}."
                )
            already_ret = already_returned_by_prod.get(item_data.product_id, Decimal("0.00"))
            max_returnable = max(Decimal("0.00"), sale_item.quantity - already_ret)
            if item_data.quantity > max_returnable:
                raise BusinessRuleException(
                    f"Cannot return {item_data.quantity} units of '{product.name}'. Only {max_returnable} unit(s) remaining returnable on receipt {original_sale.receipt_number}."
                )

            # Net unit price paid on original sale item after line discount
            base_net_price = (sale_item.total_price / sale_item.quantity) if sale_item.quantity > Decimal("0.00") else sale_item.unit_price
            # Proportional adjustment if sale had an order-level discount
            order_ratio = (original_sale.total_amount / original_sale.subtotal) if (original_sale.subtotal and original_sale.subtotal > Decimal("0.00")) else Decimal("1.00")
            max_net_return_price = (base_net_price * order_ratio).quantize(Decimal("0.01"))
            effective_unit_price = min(item_data.unit_price, max_net_return_price)

        line_return_amount = (item_data.quantity * effective_unit_price).quantize(Decimal("0.01"))
        total_return_amount += line_return_amount

        # Increase current stock
        product.current_stock += item_data.quantity

        # Create a new inventory batch for the returned goods
        return_cost = (sale_item.unit_cost if original_sale and sale_item else product.purchase_price)
        batch = InventoryBatch(
            product_id=product.id,
            purchase_id=None,
            quantity_received=item_data.quantity,
            quantity_remaining=item_data.quantity,
            unit_cost=return_cost
        )
        db.add(batch)

        # Log inventory movement
        movement = InventoryMovement(
            product_id=product.id,
            movement_type="CUSTOMER_RETURN",
            quantity=item_data.quantity,
            unit_cost=return_cost,
            reference_type="CUSTOMER_RETURN",
            reference_id=ret_num,
            notes=f"Customer return ({ret_num})"
        )
        db.add(movement)

        processed_items.append({
            "product_id": product.id,
            "quantity": item_data.quantity,
            "unit_price": effective_unit_price,
            "total_amount": line_return_amount
        })

    # 4. Financial Refund & Debt Cancellation Formula (Section 29)
    is_walk_in = customer.customer_id == "C-000001" or customer.name.strip().lower() == "walk-in customer"
    if original_sale:
        prev_returns = db.query(SalesReturn).filter(SalesReturn.sale_id == original_sale.id).all()
        prev_cash_refunded = sum((pr.cash_refund_amount for pr in prev_returns), Decimal("0.00"))
        prev_balance_credit = sum((pr.balance_credit_amount for pr in prev_returns), Decimal("0.00"))
        
        remaining_refundable_cash = max(Decimal("0.00"), original_sale.paid_amount - prev_cash_refunded)
        remaining_debt_on_sale = max(Decimal("0.00"), original_sale.total_amount - original_sale.paid_amount - prev_balance_credit)

        cash_refund = min(total_return_amount, remaining_refundable_cash)
        unfunded_return = max(Decimal("0.00"), total_return_amount - cash_refund)

        # Balance credit can only reduce the remaining debt on THIS sale.
        # Walk-in customer (C-000001) cannot carry any balance credit.
        if is_walk_in:
            balance_credit = Decimal("0.00")
        else:
            balance_credit = min(remaining_debt_on_sale, unfunded_return)
    else:
        # For manual returns without receipt:
        if is_walk_in:
            cash_refund = total_return_amount
            balance_credit = Decimal("0.00")
        else:
            from backend.app.services.customer_service import get_customer_due
            cust_due = get_customer_due(db, customer.id)
            if cust_due > Decimal("0.00"):
                balance_credit = min(cust_due, total_return_amount)
                cash_refund = max(Decimal("0.00"), total_return_amount - balance_credit)
            else:
                balance_credit = Decimal("0.00")
                cash_refund = total_return_amount

    # 5. Create SalesReturn record
    sales_return = SalesReturn(
        return_number=ret_num,
        sale_id=original_sale.id if original_sale else None,
        customer_id=customer.id,
        total_return_amount=total_return_amount,
        cash_refund_amount=cash_refund,
        balance_credit_amount=balance_credit,
        reason=data.reason
    )
    db.add(sales_return)
    db.flush()

    for p_item in processed_items:
        ret_item = SalesReturnItem(
            sales_return_id=sales_return.id,
            product_id=p_item["product_id"],
            quantity=p_item["quantity"],
            unit_price=p_item["unit_price"],
            total_amount=p_item["total_amount"]
        )
        db.add(ret_item)

    # 6. Update original sale due amount and status
    if original_sale:
        all_sale_returns = db.query(SalesReturn).filter(SalesReturn.sale_id == original_sale.id).all()
        total_cred = sum((r.balance_credit_amount for r in all_sale_returns), Decimal("0.00"))
        new_due = max(Decimal("0.00"), original_sale.total_amount - original_sale.paid_amount - total_cred)
        original_sale.due_amount = new_due

        total_orig_qty = sum((si.quantity for si in original_sale.items), Decimal("0.00"))
        total_ret_qty = sum((ri.quantity for r in all_sale_returns for ri in r.items), Decimal("0.00"))

        if total_orig_qty > Decimal("0.00") and total_ret_qty >= total_orig_qty:
            original_sale.payment_status = "RETURNED"
            original_sale.due_amount = Decimal("0.00")
        elif total_ret_qty > Decimal("0.00"):
            if original_sale.due_amount == Decimal("0.00"):
                original_sale.payment_status = "PARTIALLY_RETURNED"
            else:
                original_sale.payment_status = "PARTIALLY_PAID"
        db.add(original_sale)

    db.commit()
    db.refresh(sales_return)
    return get_sales_return(db, sales_return.id)

def get_sales_return(db: Session, return_id: int) -> SalesReturnResponse:
    ret = db.query(SalesReturn).options(
        joinedload(SalesReturn.customer),
        joinedload(SalesReturn.sale),
        joinedload(SalesReturn.items).joinedload(SalesReturnItem.product)
    ).filter(SalesReturn.id == return_id).first()
    if not ret:
        raise EntityNotFoundException("Sales Return", str(return_id))
    return _format_sales_return_response(ret)

def list_sales_returns(db: Session, customer_id: Optional[int] = None, skip: int = 0, limit: int = 100) -> List[SalesReturnResponse]:
    q = db.query(SalesReturn).options(
        joinedload(SalesReturn.customer),
        joinedload(SalesReturn.sale),
        joinedload(SalesReturn.items).joinedload(SalesReturnItem.product)
    )
    if customer_id is not None:
        q = q.filter(SalesReturn.customer_id == customer_id)
    returns = q.order_by(SalesReturn.created_at.desc()).offset(skip).limit(limit).all()
    return [_format_sales_return_response(r) for r in returns]

# ----------------- Supplier Returns -----------------

def _format_purchase_return_response(ret: PurchaseReturn) -> PurchaseReturnResponse:
    items_dto = []
    for it in ret.items:
        items_dto.append(PurchaseReturnItemResponse(
            id=it.id,
            product_id=it.product_id,
            product_name=it.product.name if it.product else "Unknown",
            quantity=it.quantity,
            unit_cost=it.unit_cost,
            total_amount=it.total_amount
        ))

    return PurchaseReturnResponse(
        id=ret.id,
        return_number=ret.return_number,
        purchase_id=ret.purchase_id,
        purchase_number=ret.purchase.purchase_number if ret.purchase else None,
        supplier_id=ret.supplier_id,
        supplier_name=ret.supplier.name if ret.supplier else "Unknown",
        total_return_amount=ret.total_return_amount,
        reason=ret.reason,
        created_at=ret.created_at,
        items=items_dto
    )

def create_purchase_return(db: Session, data: PurchaseReturnCreate) -> PurchaseReturnResponse:
    # 1. Validate Supplier
    supplier = db.query(Supplier).filter(Supplier.id == data.supplier_id).first()
    if not supplier:
        raise EntityNotFoundException("Supplier", str(data.supplier_id))

    if not data.items:
        raise BusinessRuleException("Return must include at least one item.")

    original_purchase = None
    if data.purchase_id:
        original_purchase = db.query(Purchase).filter(Purchase.id == data.purchase_id).first()
        if not original_purchase:
            raise EntityNotFoundException("Purchase", str(data.purchase_id))

    total_return_amount = Decimal("0.00")
    processed_items = []
    ret_num = generate_purchase_return_number(db)

    # Pre-calculate already returned quantities per product for this purchase
    already_returned_by_prod = {}
    if original_purchase:
        prev_returns = db.query(PurchaseReturn).filter(PurchaseReturn.purchase_id == original_purchase.id).all()
        for pr in prev_returns:
            for pri in pr.items:
                already_returned_by_prod[pri.product_id] = (
                    already_returned_by_prod.get(pri.product_id, Decimal("0.00")) + pri.quantity
                )

    for item_data in data.items:
        product = db.query(Product).filter(Product.id == item_data.product_id).first()
        if not product:
            raise EntityNotFoundException("Product", str(item_data.product_id))

        if item_data.quantity <= Decimal("0.00"):
            raise BusinessRuleException(f"Return quantity for {product.name} must be greater than zero.")
        if item_data.unit_cost < Decimal("0.00"):
            raise BusinessRuleException(f"Unit cost for {product.name} cannot be negative.")

        # Check purchase item limit
        if original_purchase:
            pur_item = next((pi for pi in original_purchase.items if pi.product_id == item_data.product_id), None)
            if not pur_item:
                raise BusinessRuleException(
                    f"Product '{product.name}' was not found in purchase {original_purchase.purchase_number}."
                )
            already_ret = already_returned_by_prod.get(item_data.product_id, Decimal("0.00"))
            max_returnable = max(Decimal("0.00"), pur_item.quantity - already_ret)
            if item_data.quantity > max_returnable:
                raise BusinessRuleException(
                    f"Cannot return {item_data.quantity} units of '{product.name}'. Only {max_returnable} unit(s) remaining returnable on purchase {original_purchase.purchase_number}."
                )

        # Check stock availability
        if product.current_stock < item_data.quantity:
            raise InsufficientStockException(
                product_name=product.name,
                available=float(product.current_stock),
                requested=float(item_data.quantity)
            )

        line_return_amount = (item_data.quantity * item_data.unit_cost).quantize(Decimal("0.01"))
        total_return_amount += line_return_amount

        # Reduce stock
        product.current_stock -= item_data.quantity

        # Consume from product FIFO batches
        batches = db.query(InventoryBatch).filter(
            InventoryBatch.product_id == product.id,
            InventoryBatch.quantity_remaining > Decimal("0.00")
        ).order_by(InventoryBatch.created_at.desc(), InventoryBatch.id.desc()).all()

        qty_to_remove = item_data.quantity
        for b in batches:
            if qty_to_remove <= Decimal("0.00"):
                break
            deduct_qty = min(qty_to_remove, b.quantity_remaining)
            b.quantity_remaining -= deduct_qty
            qty_to_remove -= deduct_qty

        # Log inventory movement
        movement = InventoryMovement(
            product_id=product.id,
            movement_type="SUPPLIER_RETURN",
            quantity=-item_data.quantity,
            unit_cost=item_data.unit_cost,
            reference_type="SUPPLIER_RETURN",
            reference_id=ret_num,
            notes=f"Supplier return ({ret_num})"
        )
        db.add(movement)

        processed_items.append({
            "product_id": product.id,
            "quantity": item_data.quantity,
            "unit_cost": item_data.unit_cost,
            "total_amount": line_return_amount
        })

    # Create PurchaseReturn record
    purchase_return = PurchaseReturn(
        return_number=ret_num,
        purchase_id=original_purchase.id if original_purchase else None,
        supplier_id=supplier.id,
        total_return_amount=total_return_amount,
        reason=data.reason
    )
    db.add(purchase_return)
    db.flush()

    for p_item in processed_items:
        ret_item = PurchaseReturnItem(
            purchase_return_id=purchase_return.id,
            product_id=p_item["product_id"],
            quantity=p_item["quantity"],
            unit_cost=p_item["unit_cost"],
            total_amount=p_item["total_amount"]
        )
        db.add(ret_item)

    # Update original purchase due amount and status
    if original_purchase:
        all_pur_returns = db.query(PurchaseReturn).filter(PurchaseReturn.purchase_id == original_purchase.id).all()
        total_ret_val = sum((r.total_return_amount for r in all_pur_returns), Decimal("0.00"))
        new_due = max(Decimal("0.00"), original_purchase.total_amount - original_purchase.paid_amount - total_ret_val)
        original_purchase.due_amount = new_due

        total_orig_qty = sum((pi.quantity for pi in original_purchase.items), Decimal("0.00"))
        total_ret_qty = sum((ri.quantity for r in all_pur_returns for ri in r.items), Decimal("0.00"))

        if total_orig_qty > Decimal("0.00") and total_ret_qty >= total_orig_qty:
            original_purchase.payment_status = "RETURNED"
            original_purchase.due_amount = Decimal("0.00")
        elif total_ret_qty > Decimal("0.00"):
            if original_purchase.due_amount == Decimal("0.00"):
                original_purchase.payment_status = "PARTIALLY_RETURNED"
            else:
                original_purchase.payment_status = "PARTIALLY_PAID"
        db.add(original_purchase)

    db.commit()
    db.refresh(purchase_return)
    return get_purchase_return(db, purchase_return.id)

def get_purchase_return(db: Session, return_id: int) -> PurchaseReturnResponse:
    ret = db.query(PurchaseReturn).options(
        joinedload(PurchaseReturn.supplier),
        joinedload(PurchaseReturn.purchase),
        joinedload(PurchaseReturn.items).joinedload(PurchaseReturnItem.product)
    ).filter(PurchaseReturn.id == return_id).first()
    if not ret:
        raise EntityNotFoundException("Purchase Return", str(return_id))
    return _format_purchase_return_response(ret)

def list_purchase_returns(db: Session, skip: int = 0, limit: int = 100) -> List[PurchaseReturnResponse]:
    returns = db.query(PurchaseReturn).options(
        joinedload(PurchaseReturn.supplier),
        joinedload(PurchaseReturn.purchase),
        joinedload(PurchaseReturn.items).joinedload(PurchaseReturnItem.product)
    ).order_by(PurchaseReturn.created_at.desc()).offset(skip).limit(limit).all()
    return [_format_purchase_return_response(r) for r in returns]
