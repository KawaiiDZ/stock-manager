from decimal import Decimal
from typing import List, Optional
from datetime import datetime, time
from sqlalchemy.orm import Session, joinedload
from sqlalchemy import func, or_
from sqlalchemy.exc import IntegrityError

def _normalize_datetime_range(start_date: Optional[datetime], end_date: Optional[datetime]):
    if start_date is not None and end_date is not None and start_date > end_date:
        start_date, end_date = end_date, start_date
    if end_date is not None and isinstance(end_date, datetime):
        if end_date.time() == time.min:
            end_date = datetime.combine(end_date.date(), time.max)
    return start_date, end_date

from backend.app.models.sales import Sale, SaleItem, SaleItemBatch, SalePayment, SalesReturn, SalesReturnItem
from backend.app.models.product import Product
from backend.app.models.customer import Customer
from backend.app.models.inventory import InventoryBatch, InventoryMovement
from backend.app.models.business import BusinessSettings
from backend.app.schemas.sales import (
    SaleCreate, SaleResponse, SaleItemResponse, SalePaymentResponse,
    ReceiptPrintResponse, SaleItemBatchResponse
)
from backend.app.services.id_generator import generate_receipt_number, generate_customer_id
from backend.app.core.errors import EntityNotFoundException, InsufficientStockException, BusinessRuleException

def _format_sale_response(sale: Sale) -> SaleResponse:
    # 1. Aggregate return data if returns exist on this sale
    total_returned_val = Decimal("0.00")
    total_balance_credit = Decimal("0.00")
    total_cash_refunded = Decimal("0.00")
    returned_qty_by_prod = {}
    if sale.returns:
        for ret in sale.returns:
            total_returned_val += ret.total_return_amount
            total_balance_credit += ret.balance_credit_amount
            total_cash_refunded += ret.cash_refund_amount
            for ri in ret.items:
                returned_qty_by_prod[ri.product_id] = (
                    returned_qty_by_prod.get(ri.product_id, Decimal("0.00")) + ri.quantity
                )

    total_sale_qty = Decimal("0.00")
    total_ret_qty = Decimal("0.00")
    items_dto = []
    for item in sale.items:
        batch_links = []
        if item.batch_links:
            for bl in item.batch_links:
                batch_links.append(SaleItemBatchResponse(
                    id=bl.id,
                    inventory_batch_id=bl.inventory_batch_id,
                    quantity=bl.quantity,
                    unit_cost=bl.unit_cost
                ))

        ret_qty = returned_qty_by_prod.get(item.product_id, Decimal("0.00"))
        rem_ret_qty = max(Decimal("0.00"), item.quantity - ret_qty)
        total_sale_qty += item.quantity
        total_ret_qty += ret_qty

        # Calculate realized profit based on cash collected ratio
        paid_ratio = min(Decimal("1.00"), max(Decimal("0.00"), sale.paid_amount / sale.total_amount)) if sale.total_amount > Decimal("0.00") else Decimal("1.00")
        item_realized_profit = (item.gross_profit * paid_ratio).quantize(Decimal("0.01"))

        items_dto.append(SaleItemResponse(
            id=item.id,
            product_id=item.product_id,
            product_name=item.product_name,
            quantity=item.quantity,
            unit_price=item.unit_price,
            discount_amount=item.discount_amount,
            total_price=item.total_price,
            unit_cost=item.unit_cost,
            total_cost=item.total_cost,
            gross_profit=item.gross_profit,
            realized_profit=item_realized_profit,
            returned_quantity=ret_qty,
            remaining_returnable_quantity=rem_ret_qty,
            batches=batch_links
        ))

    payments_dto = []
    for p in sale.payments:
        payments_dto.append(SalePaymentResponse(
            id=p.id,
            amount=p.amount,
            payment_method=p.payment_method,
            created_at=p.created_at
        ))

    # Net due amount after accounting for debt cancelled by return balance credits
    net_due_amount = max(Decimal("0.00"), sale.total_amount - sale.paid_amount - total_balance_credit)

    # Determine accurate status
    if total_sale_qty > Decimal("0.00") and total_ret_qty >= total_sale_qty:
        effective_status = "RETURNED"
        net_due_amount = Decimal("0.00")
    elif total_ret_qty > Decimal("0.00"):
        if net_due_amount == Decimal("0.00"):
            effective_status = "PARTIALLY_RETURNED"
        else:
            effective_status = "PARTIALLY_PAID"
    elif net_due_amount == Decimal("0.00") and sale.paid_amount >= sale.total_amount:
        effective_status = "PAID"
    elif sale.paid_amount > Decimal("0.00"):
        effective_status = "PARTIALLY_PAID"
    else:
        effective_status = "UNPAID"

    # Overall sale realized and unrealized profit
    sale_paid_ratio = min(Decimal("1.00"), max(Decimal("0.00"), sale.paid_amount / sale.total_amount)) if sale.total_amount > Decimal("0.00") else Decimal("1.00")
    realized_sale_profit = (sale.gross_profit * sale_paid_ratio).quantize(Decimal("0.01"))
    unrealized_sale_profit = max(Decimal("0.00"), sale.gross_profit - realized_sale_profit)

    return SaleResponse(
        id=sale.id,
        receipt_number=sale.receipt_number,
        customer_id=sale.customer_id,
        customer_name=sale.customer.name if sale.customer else "Counter Sale",
        customer_phone=sale.customer.phone if (sale.customer and sale.customer.phone) else None,
        subtotal=sale.subtotal,
        discount_amount=sale.discount_amount,
        tax_rate=sale.tax_rate,
        tax_amount=sale.tax_amount,
        total_amount=sale.total_amount,
        paid_amount=sale.paid_amount,
        due_amount=net_due_amount,
        payment_status=effective_status,
        total_returned_amount=total_returned_val,
        total_cost=sale.total_cost,
        gross_profit=sale.gross_profit,
        realized_profit=realized_sale_profit,
        unrealized_profit=unrealized_sale_profit,
        notes=sale.notes,
        created_at=sale.created_at,
        items=items_dto,
        payments=payments_dto
    )

def _execute_create_sale(db: Session, data: SaleCreate) -> SaleResponse:
    if not data.items:
        raise BusinessRuleException("Cannot complete a sale with no items.")

    # 1. Customer Resolution (Default to Counter/Walk-in, or inline create/find for credit)
    customer = None
    if data.customer_id:
        customer = db.query(Customer).filter(Customer.id == data.customer_id).first()
    elif data.customer_name and data.customer_name.strip():
        # Check if customer already exists by phone or name
        cust_name = data.customer_name.strip()
        cust_phone = data.customer_phone.strip() if data.customer_phone else None
        
        if cust_phone:
            customer = db.query(Customer).filter(Customer.phone == cust_phone).first()
        if not customer:
            customer = db.query(Customer).filter(Customer.name.ilike(cust_name)).first()

        if not customer:
            # Inline create new customer for credit tracking
            new_cid = generate_customer_id(db)
            customer = Customer(
                customer_id=new_cid,
                name=cust_name,
                phone=cust_phone,
                address="Added at POS checkout",
                is_active=True
            )
            db.add(customer)
            db.flush()

    if not customer:
        # Default Walk-in Customer (C-000001)
        customer = db.query(Customer).filter(Customer.customer_id == "C-000001").first()
        if not customer:
            customer = db.query(Customer).first()

    if not customer:
        raise BusinessRuleException("No customer account available.")

    # 2. Get business settings for tax
    settings = db.query(BusinessSettings).filter(BusinessSettings.id == 1).first()
    if data.tax_rate is not None:
        effective_tax_rate = data.tax_rate
    elif settings and settings.tax_enabled:
        effective_tax_rate = settings.default_tax_rate
    else:
        effective_tax_rate = Decimal("0.00")

    # 3. Generate Receipt Number
    receipt_no = generate_receipt_number(db)

    # 4. Preliminary check & item computation
    subtotal = Decimal("0.00")
    total_sale_cost = Decimal("0.00")
    processed_items = []

    p_ids = [it.product_id for it in data.items]
    products = {p.id: p for p in db.query(Product).filter(Product.id.in_(p_ids)).all()}

    for item_data in data.items:
        product = products.get(item_data.product_id)
        if not product:
            raise EntityNotFoundException("Product", str(item_data.product_id))

        if hasattr(product, "is_active") and not product.is_active:
            raise BusinessRuleException(f"Product '{product.name}' is archived/inactive and cannot be sold.")

        if item_data.quantity <= Decimal("0.00"):
            raise BusinessRuleException(f"Quantity for {product.name} must be greater than zero.")

        if item_data.unit_price < Decimal("0.00"):
            raise BusinessRuleException(f"Unit price for {product.name} cannot be negative.")

        if item_data.discount_amount < Decimal("0.00"):
            raise BusinessRuleException(f"Discount for {product.name} cannot be negative.")

        # Stock check
        if product.current_stock < item_data.quantity:
            raise InsufficientStockException(
                product_name=product.name,
                available=float(product.current_stock),
                requested=float(item_data.quantity)
            )

        item_total_price = ((item_data.quantity * item_data.unit_price) - item_data.discount_amount).quantize(Decimal("0.01"))
        if item_total_price < Decimal("0.00"):
            item_total_price = Decimal("0.00")

        subtotal += item_total_price

        # FIFO Batch Consumption
        batches = db.query(InventoryBatch).filter(
            InventoryBatch.product_id == product.id,
            InventoryBatch.quantity_remaining > Decimal("0.00")
        ).order_by(InventoryBatch.created_at.asc(), InventoryBatch.id.asc()).all()

        qty_needed = item_data.quantity
        item_fifo_cost = Decimal("0.00")
        batch_links_to_create = []

        for b in batches:
            if qty_needed <= Decimal("0.00"):
                break
            consume_qty = min(qty_needed, b.quantity_remaining)
            b.quantity_remaining -= consume_qty
            item_fifo_cost += (consume_qty * b.unit_cost)
            qty_needed -= consume_qty
            batch_links_to_create.append({
                "batch_id": b.id,
                "quantity": consume_qty,
                "unit_cost": b.unit_cost
            })

        if qty_needed > Decimal("0.00"):
            # Auto-heal FIFO batch deficit if physical stock was available
            fallback_batch = InventoryBatch(
                product_id=product.id,
                purchase_id=None,
                quantity_received=qty_needed,
                quantity_remaining=Decimal("0.00"),
                unit_cost=product.purchase_price
            )
            db.add(fallback_batch)
            db.flush()

            item_fifo_cost += (qty_needed * product.purchase_price)
            batch_links_to_create.append({
                "batch_id": fallback_batch.id,
                "quantity": qty_needed,
                "unit_cost": product.purchase_price
            })
            qty_needed = Decimal("0.00")

        product.current_stock -= item_data.quantity

        item_unit_cost = (item_fifo_cost / item_data.quantity).quantize(Decimal("0.01"))
        item_gross_profit = item_total_price - item_fifo_cost
        total_sale_cost += item_fifo_cost

        # Log Inventory Movement
        movement = InventoryMovement(
            product_id=product.id,
            movement_type="SALE",
            quantity=-item_data.quantity,
            unit_cost=item_unit_cost,
            reference_type="SALE",
            reference_id=receipt_no,
            notes=f"Sold in receipt {receipt_no}"
        )
        db.add(movement)

        processed_items.append({
            "product_id": product.id,
            "product_name": product.name,
            "quantity": item_data.quantity,
            "unit_price": item_data.unit_price,
            "discount_amount": item_data.discount_amount,
            "total_price": item_total_price,
            "unit_cost": item_unit_cost,
            "total_cost": item_fifo_cost,
            "gross_profit": item_gross_profit,
            "batches": batch_links_to_create
        })

    # 5. Calculate Sale Totals
    sale_discount = max(Decimal("0.00"), min(data.discount_amount or Decimal("0.00"), subtotal))
    taxable_amount = max(Decimal("0.00"), subtotal - sale_discount)
    tax_amount = ((taxable_amount * effective_tax_rate) / Decimal("100.00")).quantize(Decimal("0.01"))
    total_amount = (taxable_amount + tax_amount).quantize(Decimal("0.01"))

    valid_splits = [sp for sp in (data.payment_splits or []) if sp.amount > Decimal("0.00")]
    if valid_splits:
        total_split_amount = sum((sp.amount for sp in valid_splits), Decimal("0.00"))
        effective_paid = total_split_amount if data.paid_amount <= Decimal("0.00") else data.paid_amount
    else:
        effective_paid = data.paid_amount

    paid_amount = min(effective_paid, total_amount) if effective_paid > Decimal("0.00") else Decimal("0.00")
    due_amount = max(Decimal("0.00"), total_amount - paid_amount)

    # Prevent credit sales on Walk-in / Counter customer (C-000001)
    if customer.customer_id == "C-000001" and due_amount > Decimal("0.00"):
        raise BusinessRuleException("Walk-in / Counter Customer cannot purchase on credit. Please provide or select a customer name for partial or unpaid sales.")

    if due_amount == Decimal("0.00"):
        payment_status = "PAID"
    elif paid_amount > Decimal("0.00"):
        payment_status = "PARTIALLY_PAID"
    else:
        payment_status = "UNPAID"

    sale_gross_profit = (subtotal - sale_discount) - total_sale_cost

    # 6. Save Sale Record
    sale = Sale(
        receipt_number=receipt_no,
        customer_id=customer.id,
        subtotal=subtotal,
        discount_amount=sale_discount,
        tax_rate=effective_tax_rate,
        tax_amount=tax_amount,
        total_amount=total_amount,
        paid_amount=paid_amount,
        due_amount=due_amount,
        payment_status=payment_status,
        total_cost=total_sale_cost,
        gross_profit=sale_gross_profit,
        notes=data.notes
    )
    db.add(sale)
    db.flush()

    # 7. Save Sale Items and Batch Links
    for p_item in processed_items:
        sale_item = SaleItem(
            sale_id=sale.id,
            product_id=p_item["product_id"],
            product_name=p_item["product_name"],
            quantity=p_item["quantity"],
            unit_price=p_item["unit_price"],
            discount_amount=p_item["discount_amount"],
            total_price=p_item["total_price"],
            unit_cost=p_item["unit_cost"],
            total_cost=p_item["total_cost"],
            gross_profit=p_item["gross_profit"]
        )
        db.add(sale_item)
        db.flush()

        for bl in p_item["batches"]:
            sib = SaleItemBatch(
                sale_item_id=sale_item.id,
                inventory_batch_id=bl["batch_id"],
                quantity=bl["quantity"],
                unit_cost=bl["unit_cost"]
            )
            db.add(sib)

    # 8. Record Initial Payment if paid
    if paid_amount > Decimal("0.00"):
        if valid_splits:
            remaining_to_allocate = paid_amount
            for sp in valid_splits:
                if remaining_to_allocate <= Decimal("0.00"):
                    break
                alloc_amount = min(sp.amount, remaining_to_allocate)
                payment = SalePayment(
                    sale_id=sale.id,
                    amount=alloc_amount,
                    payment_method=sp.payment_method or "Cash",
                    created_at=sale.created_at
                )
                db.add(payment)
                remaining_to_allocate -= alloc_amount
        else:
            payment = SalePayment(
                sale_id=sale.id,
                amount=paid_amount,
                payment_method=data.payment_method or "Cash",
                created_at=sale.created_at
            )
            db.add(payment)

    db.commit()
    db.refresh(sale)
    return get_sale(db, sale.id)

def create_sale(db: Session, data: SaleCreate) -> SaleResponse:
    for attempt in range(3):
        try:
            return _execute_create_sale(db, data)
        except IntegrityError as e:
            db.rollback()
            err_str = f"{e.orig} {e}" if getattr(e, "orig", None) else str(e)
            if ("receipt_number" in err_str or "UNIQUE constraint failed" in err_str) and attempt < 2:
                continue
            raise

def get_sale(db: Session, sale_id: int) -> SaleResponse:
    sale = db.query(Sale).options(
        joinedload(Sale.customer),
        joinedload(Sale.items).joinedload(SaleItem.batch_links),
        joinedload(Sale.payments),
        joinedload(Sale.returns).joinedload(SalesReturn.items)
    ).filter(Sale.id == sale_id).first()
    if not sale:
        raise EntityNotFoundException("Sale", str(sale_id))
    return _format_sale_response(sale)

def get_sale_by_receipt(db: Session, receipt_number: str) -> SaleResponse:
    sale = db.query(Sale).options(
        joinedload(Sale.customer),
        joinedload(Sale.items).joinedload(SaleItem.batch_links),
        joinedload(Sale.payments),
        joinedload(Sale.returns).joinedload(SalesReturn.items)
    ).filter(Sale.receipt_number == receipt_number.strip()).first()
    if not sale:
        raise EntityNotFoundException("Receipt", receipt_number)
    return _format_sale_response(sale)

def list_sales(
    db: Session,
    search: Optional[str] = None,
    customer_id: Optional[int] = None,
    payment_status: Optional[str] = None,
    start_date: Optional[datetime] = None,
    end_date: Optional[datetime] = None,
    skip: int = 0,
    limit: int = 500
) -> List[SaleResponse]:
    start_date, end_date = _normalize_datetime_range(start_date, end_date)
    q = db.query(Sale).options(
        joinedload(Sale.customer),
        joinedload(Sale.items).joinedload(SaleItem.batch_links),
        joinedload(Sale.payments),
        joinedload(Sale.returns).joinedload(SalesReturn.items)
    )
    if customer_id:
        q = q.filter(Sale.customer_id == customer_id)
    if start_date:
        q = q.filter(Sale.created_at >= start_date)
    if end_date:
        q = q.filter(Sale.created_at <= end_date)
    if search:
        clean_search = search.strip()
        stripped_code = clean_search.lstrip('#')
        st = f"%{clean_search}%"
        st_code = f"%{stripped_code}%"
        q = q.outerjoin(Sale.customer).filter(
            or_(
                Sale.receipt_number.ilike(st),
                Sale.receipt_number.ilike(st_code),
                Customer.name.ilike(st),
                Customer.phone.ilike(st),
                Sale.items.any(SaleItem.product_name.ilike(st))
            )
        )
    sales = q.order_by(Sale.created_at.desc(), Sale.id.desc()).all()

    formatted = []
    needs_commit = False
    for s in sales:
        dto = _format_sale_response(s)
        if s.payment_status != dto.payment_status:
            s.payment_status = dto.payment_status
            needs_commit = True
        if payment_status and dto.payment_status != payment_status:
            continue
        formatted.append(dto)

    if needs_commit:
        try:
            db.commit()
        except Exception:
            db.rollback()

    return formatted[skip:skip+limit]

def record_additional_sale_payment(db: Session, sale_id: int, amount: Decimal, payment_method: str = "Cash") -> SaleResponse:
    sale = db.query(Sale).options(
        joinedload(Sale.returns).joinedload(SalesReturn.items)
    ).filter(Sale.id == sale_id).first()
    if not sale:
        raise EntityNotFoundException("Sale", str(sale_id))

    if amount <= Decimal("0.00"):
        raise BusinessRuleException("Payment amount must be greater than zero.")
    amount = amount.quantize(Decimal("0.01"))

    total_balance_credit = Decimal("0.00")
    total_returned_qty = Decimal("0.00")
    total_sold_qty = sum(item.quantity for item in sale.items)
    if sale.returns:
        for ret in sale.returns:
            total_balance_credit += ret.balance_credit_amount
            for ri in ret.items:
                total_returned_qty += ri.quantity

    current_due = max(Decimal("0.00"), sale.total_amount - sale.paid_amount - total_balance_credit)

    if amount > current_due:
        raise BusinessRuleException(f"Payment amount cannot exceed remaining due (Rs. {current_due}).")

    payment = SalePayment(
        sale_id=sale.id,
        amount=amount,
        payment_method=payment_method
    )
    db.add(payment)

    sale.paid_amount += amount
    new_due = max(Decimal("0.00"), sale.total_amount - sale.paid_amount - total_balance_credit)
    sale.due_amount = new_due

    if total_sold_qty > Decimal("0.00") and total_returned_qty >= total_sold_qty:
        sale.payment_status = "RETURNED"
    elif total_returned_qty > Decimal("0.00"):
        if new_due == Decimal("0.00"):
            sale.payment_status = "PARTIALLY_RETURNED"
        else:
            sale.payment_status = "PARTIALLY_PAID"
    elif new_due == Decimal("0.00") and sale.paid_amount >= sale.total_amount:
        sale.payment_status = "PAID"
    else:
        sale.payment_status = "PARTIALLY_PAID"

    db.commit()
    return get_sale(db, sale.id)

def get_receipt_print_data(db: Session, receipt_number: str) -> ReceiptPrintResponse:
    sale = get_sale_by_receipt(db, receipt_number)
    settings = db.query(BusinessSettings).filter(BusinessSettings.id == 1).first()

    return ReceiptPrintResponse(
        business_name=settings.business_name if settings else "My Business",
        phone=settings.phone if settings else "",
        address=settings.address if settings else "",
        currency=settings.currency if settings else "Rs.",
        receipt_header=settings.receipt_header if settings else "",
        receipt_footer=settings.receipt_footer if settings else "Thank you!",
        receipt_printer_type=settings.receipt_printer_type if settings else "80mm",
        receipt_number=sale.receipt_number,
        created_at=sale.created_at,
        customer_name=sale.customer_name or "Walk-in Customer",
        customer_phone=sale.customer_phone,
        items=sale.items,
        subtotal=sale.subtotal,
        discount_amount=sale.discount_amount,
        tax_rate=sale.tax_rate,
        tax_amount=sale.tax_amount,
        total_amount=sale.total_amount,
        paid_amount=sale.paid_amount,
        due_amount=sale.due_amount,
        payment_status=sale.payment_status,
        payment_method=" + ".join([p.payment_method for p in (sale.payments or [])]) if sale.payments else "Cash",
        payments=sale.payments or []
    )
