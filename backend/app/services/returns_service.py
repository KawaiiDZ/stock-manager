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

    for item_data in data.items:
        product = db.query(Product).filter(Product.id == item_data.product_id).first()
        if not product:
            raise EntityNotFoundException("Product", str(item_data.product_id))

        if item_data.quantity <= Decimal("0.00"):
            raise BusinessRuleException(f"Return quantity for {product.name} must be greater than zero.")

        line_return_amount = item_data.quantity * item_data.unit_price
        total_return_amount += line_return_amount

        # Increase current stock
        product.current_stock += item_data.quantity

        # Create a new inventory batch for the returned goods
        return_cost = product.purchase_price
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
            "unit_price": item_data.unit_price,
            "total_amount": line_return_amount
        })

    # 4. Financial Cashback Rule (Section 29)
    # If customer paid partially, only refund up to the actual cash paid.
    if original_sale:
        prev_returns = db.query(SalesReturn).filter(SalesReturn.sale_id == original_sale.id).all()
        prev_cash_refunded = sum((pr.cash_refund_amount for pr in prev_returns), Decimal("0.00"))
        remaining_refundable_cash = max(Decimal("0.00"), original_sale.paid_amount - prev_cash_refunded)

        cash_refund = min(total_return_amount, remaining_refundable_cash)
        balance_credit = total_return_amount - cash_refund
    else:
        # For manual returns without receipt:
        # If Walk-in customer -> full cash refund; if named customer -> credit towards their ledger balance
        if customer.customer_id == "C-000001":
            cash_refund = total_return_amount
            balance_credit = Decimal("0.00")
        else:
            cash_refund = Decimal("0.00")
            balance_credit = total_return_amount

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

def list_sales_returns(db: Session, skip: int = 0, limit: int = 100) -> List[SalesReturnResponse]:
    returns = db.query(SalesReturn).options(
        joinedload(SalesReturn.customer),
        joinedload(SalesReturn.sale),
        joinedload(SalesReturn.items).joinedload(SalesReturnItem.product)
    ).order_by(SalesReturn.created_at.desc()).offset(skip).limit(limit).all()
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

    for item_data in data.items:
        product = db.query(Product).filter(Product.id == item_data.product_id).first()
        if not product:
            raise EntityNotFoundException("Product", str(item_data.product_id))

        if item_data.quantity <= Decimal("0.00"):
            raise BusinessRuleException(f"Return quantity for {product.name} must be greater than zero.")

        # Check stock availability
        if product.current_stock < item_data.quantity:
            raise InsufficientStockException(
                product_name=product.name,
                available=float(product.current_stock),
                requested=float(item_data.quantity)
            )

        line_return_amount = item_data.quantity * item_data.unit_cost
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
