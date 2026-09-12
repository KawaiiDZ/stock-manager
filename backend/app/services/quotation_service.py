from decimal import Decimal
from typing import List, Optional
from datetime import datetime
from sqlalchemy.orm import Session, joinedload
from sqlalchemy import or_
from sqlalchemy.exc import IntegrityError

from backend.app.models.quotation import Quotation, QuotationItem
from backend.app.models.product import Product
from backend.app.models.customer import Customer
from backend.app.models.business import BusinessSettings
from backend.app.schemas.quotation import (
    QuotationCreate, QuotationResponse, QuotationItemResponse,
    QuotationConversionCheckResponse, QuotationConversionCheckItem,
    QuotationConvertRequest, QuotationRejectRequest
)
from backend.app.schemas.sales import SaleCreate, SaleItemCreate, SaleResponse
from backend.app.services.id_generator import generate_quotation_number, generate_customer_id
from backend.app.services.sales_service import create_sale
from backend.app.core.errors import EntityNotFoundException, InsufficientStockException, BusinessRuleException

def _format_quotation_response(quotation: Quotation) -> QuotationResponse:
    items_dto = [
        QuotationItemResponse(
            id=item.id,
            quotation_id=item.quotation_id,
            product_id=item.product_id,
            product_name=item.product_name,
            quantity=item.quantity,
            unit_price=item.unit_price,
            discount_amount=item.discount_amount,
            total_price=item.total_price,
            notes=item.notes
        )
        for item in quotation.items
    ]
    return QuotationResponse(
        id=quotation.id,
        quotation_number=quotation.quotation_number,
        customer_id=quotation.customer_id,
        customer_name=quotation.customer_name,
        customer_phone=quotation.customer_phone,
        customer_address=quotation.customer_address,
        subtotal=quotation.subtotal,
        discount_amount=quotation.discount_amount,
        tax_rate=quotation.tax_rate,
        tax_amount=quotation.tax_amount,
        total_amount=quotation.total_amount,
        status=quotation.status,
        sale_id=quotation.sale_id,
        converted_at=quotation.converted_at,
        rejection_reason=quotation.rejection_reason,
        valid_until=quotation.valid_until,
        notes=quotation.notes,
        created_at=quotation.created_at,
        updated_at=quotation.updated_at,
        items=items_dto
    )

def _execute_create_quotation(db: Session, data: QuotationCreate) -> QuotationResponse:
    # 0. Check settings if quotations are enabled
    settings = db.query(BusinessSettings).filter(BusinessSettings.id == 1).first()
    if settings and getattr(settings, 'enable_quotations', True) is False:
        raise BusinessRuleException('Quotations feature is currently disabled in Settings.')

    # 1. Validate customer name and phone
    name = (data.customer_name or '').strip()
    phone = (data.customer_phone or '').strip()
    if not name:
        raise BusinessRuleException('Customer name is required for creating a quotation.')
    if not phone:
        raise BusinessRuleException('Customer phone number is required for creating a quotation.')

    # 2. Customer resolution or registration
    customer = None
    if data.customer_id:
        customer = db.query(Customer).filter(Customer.id == data.customer_id).first()
    if not customer and phone:
        customer = db.query(Customer).filter(Customer.phone == phone).first()
    if not customer and name:
        customer = db.query(Customer).filter(Customer.name.ilike(name)).first()
    if not customer:
        new_cid = generate_customer_id(db)
        customer = Customer(
            customer_id=new_cid,
            name=name,
            phone=phone,
            address=data.customer_address or 'Added via Quotation',
            is_active=True
        )
        db.add(customer)
        db.flush()

    # 3. Tax rate determination
    if data.tax_rate is not None and data.tax_rate > Decimal('0.00'):
        effective_tax_rate = data.tax_rate
    elif settings and settings.tax_enabled:
        effective_tax_rate = settings.default_tax_rate
    else:
        effective_tax_rate = Decimal('0.00')

    # 4. Generate unique Quotation Number
    quote_number = generate_quotation_number(db)

    # 5. Process quotation items
    p_ids = [it.product_id for it in data.items]
    products = {p.id: p for p in db.query(Product).filter(Product.id.in_(p_ids)).all()}

    subtotal = Decimal('0.00')
    quotation_items = []

    for item_in in data.items:
        product = products.get(item_in.product_id)
        if not product:
            raise EntityNotFoundException('Product', str(item_in.product_id))

        if item_in.quantity <= Decimal('0.00'):
            raise BusinessRuleException(f'Quantity for {product.name} must be greater than zero.')
        if item_in.unit_price < Decimal('0.00'):
            raise BusinessRuleException(f'Unit price for {product.name} cannot be negative.')
        if item_in.discount_amount < Decimal('0.00'):
            raise BusinessRuleException(f'Discount for {product.name} cannot be negative.')

        line_gross = item_in.quantity * item_in.unit_price
        line_total = max(Decimal('0.00'), line_gross - item_in.discount_amount)
        subtotal += line_total

        quotation_items.append(QuotationItem(
            product_id=product.id,
            product_name=product.name,
            quantity=item_in.quantity,
            unit_price=item_in.unit_price,
            discount_amount=item_in.discount_amount,
            total_price=line_total,
            notes=item_in.notes
        ))

    # 6. Calculate summary figures
    discount_amount = max(Decimal('0.00'), min(data.discount_amount, subtotal))
    taxable_amount = max(Decimal('0.00'), subtotal - discount_amount)
    tax_amount = ((taxable_amount * effective_tax_rate) / Decimal('100.00')).quantize(Decimal('0.01'))
    total_amount = (taxable_amount + tax_amount).quantize(Decimal('0.01'))

    quotation = Quotation(
        quotation_number=quote_number,
        customer_id=customer.id if customer else None,
        customer_name=name,
        customer_phone=phone,
        customer_address=data.customer_address or (customer.address if customer else None),
        subtotal=subtotal,
        discount_amount=discount_amount,
        tax_rate=effective_tax_rate,
        tax_amount=tax_amount,
        total_amount=total_amount,
        status='PENDING',
        valid_until=data.valid_until,
        notes=data.notes
    )
    db.add(quotation)
    db.flush()

    for qi in quotation_items:
        qi.quotation_id = quotation.id
        db.add(qi)

    db.commit()
    db.refresh(quotation)
    return get_quotation(db, quotation.id)

def create_quotation(db: Session, data: QuotationCreate) -> QuotationResponse:
    for attempt in range(3):
        try:
            return _execute_create_quotation(db, data)
        except IntegrityError as e:
            db.rollback()
            err_str = f"{e.orig} {e}" if getattr(e, "orig", None) else str(e)
            if ("quotation_number" in err_str or "UNIQUE constraint failed" in err_str) and attempt < 2:
                continue
            raise

def get_quotation(db: Session, quotation_id: int) -> QuotationResponse:
    quotation = db.query(Quotation).options(
        joinedload(Quotation.items)
    ).filter(Quotation.id == quotation_id).first()
    if not quotation:
        raise EntityNotFoundException('Quotation', str(quotation_id))
    return _format_quotation_response(quotation)

def list_quotations(
    db: Session,
    status: Optional[str] = None,
    search: Optional[str] = None,
    limit: int = 100,
    offset: int = 0
) -> List[QuotationResponse]:
    query = db.query(Quotation).options(joinedload(Quotation.items))
    if status and status.upper() != 'ALL':
        query = query.filter(Quotation.status == status.upper())
    if search:
        s = f'%{search.strip()}%'
        query = query.filter(
            or_(
                Quotation.quotation_number.ilike(s),
                Quotation.customer_name.ilike(s),
                Quotation.customer_phone.ilike(s),
                Quotation.notes.ilike(s)
            )
        )
    quotations = query.order_by(Quotation.created_at.desc()).offset(offset).limit(limit).all()
    return [_format_quotation_response(q) for q in quotations]

def check_quotation_conversion(db: Session, quotation_id: int) -> QuotationConversionCheckResponse:
    quotation = db.query(Quotation).options(joinedload(Quotation.items)).filter(Quotation.id == quotation_id).first()
    if not quotation:
        raise EntityNotFoundException('Quotation', str(quotation_id))
    if quotation.status != 'PENDING':
        raise BusinessRuleException(f'Quotation {quotation.quotation_number} cannot be converted because its status is {quotation.status}.')

    p_ids = [it.product_id for it in quotation.items]
    products = {p.id: p for p in db.query(Product).filter(Product.id.in_(p_ids)).all()}

    items_check = []
    has_price_changes = False
    has_stock_shortages = False

    for item in quotation.items:
        prod = products.get(item.product_id)
        current_price = prod.selling_price if prod else item.unit_price
        current_stock = prod.current_stock if prod else Decimal('0.00')

        price_diff = current_price - item.unit_price
        price_changed = abs(price_diff) > Decimal('0.001')
        if price_changed:
            has_price_changes = True

        shortage = current_stock < item.quantity
        if shortage:
            has_stock_shortages = True

        items_check.append(QuotationConversionCheckItem(
            product_id=item.product_id,
            product_name=item.product_name,
            quantity=item.quantity,
            quoted_price=item.unit_price,
            current_price=current_price,
            price_difference=price_diff,
            price_changed=price_changed,
            current_stock=current_stock,
            has_stock_shortage=shortage
        ))

    return QuotationConversionCheckResponse(
        quotation_id=quotation.id,
        quotation_number=quotation.quotation_number,
        has_price_changes=has_price_changes,
        has_stock_shortages=has_stock_shortages,
        items=items_check
    )

def convert_quotation_to_sale(db: Session, quotation_id: int, request: QuotationConvertRequest) -> SaleResponse:
    quotation = db.query(Quotation).options(joinedload(Quotation.items)).filter(Quotation.id == quotation_id).first()
    if not quotation:
        raise EntityNotFoundException('Quotation', str(quotation_id))
    if quotation.status != 'PENDING':
        raise BusinessRuleException(f'Quotation {quotation.quotation_number} cannot be converted because it is already {quotation.status}.')

    p_ids = [it.product_id for it in quotation.items]
    products = {p.id: p for p in db.query(Product).filter(Product.id.in_(p_ids)).all()}

    # Check stock shortages before proceeding
    for it in quotation.items:
        p = products.get(it.product_id)
        if not p:
            raise EntityNotFoundException('Product', str(it.product_id))
        if p.current_stock < it.quantity:
            raise InsufficientStockException(
                product_name=p.name,
                available=float(p.current_stock),
                requested=float(it.quantity)
            )

    sale_items = []
    subtotal = Decimal('0.00')
    use_current_price = (request.price_mode == 'current')

    for it in quotation.items:
        p = products[it.product_id]
        unit_price = p.selling_price if use_current_price else it.unit_price
        line_total = max(Decimal('0.00'), (it.quantity * unit_price) - it.discount_amount)
        subtotal += line_total

        sale_items.append(SaleItemCreate(
            product_id=it.product_id,
            quantity=it.quantity,
            unit_price=unit_price,
            discount_amount=it.discount_amount
        ))

    # Calculate expected sale total to determine payment defaults
    sale_discount = max(Decimal('0.00'), min(quotation.discount_amount, subtotal))
    taxable_amount = max(Decimal('0.00'), subtotal - sale_discount)
    tax_amount = ((taxable_amount * quotation.tax_rate) / Decimal('100.00')).quantize(Decimal('0.01'))
    expected_total = (taxable_amount + tax_amount).quantize(Decimal('0.01'))

    paid_amt = request.amount_paid if request.amount_paid is not None else expected_total

    sale_create_dto = SaleCreate(
        customer_id=quotation.customer_id,
        customer_name=quotation.customer_name,
        customer_phone=quotation.customer_phone,
        items=sale_items,
        discount_amount=quotation.discount_amount,
        tax_rate=quotation.tax_rate,
        paid_amount=paid_amt,
        payment_method=request.payment_method or 'Cash',
        notes=f'Converted from Quotation {quotation.quotation_number}. {request.notes or ""}'.strip()
    )

    sale_response = create_sale(db, sale_create_dto)

    quotation.status = 'APPROVED'
    quotation.sale_id = sale_response.id
    quotation.converted_at = datetime.utcnow()
    db.commit()

    return sale_response

def reject_quotation(db: Session, quotation_id: int, request: QuotationRejectRequest) -> QuotationResponse:
    quotation = db.query(Quotation).filter(Quotation.id == quotation_id).first()
    if not quotation:
        raise EntityNotFoundException('Quotation', str(quotation_id))
    if quotation.status != 'PENDING':
        raise BusinessRuleException(f'Quotation {quotation.quotation_number} cannot be disapproved because it is already {quotation.status}.')

    quotation.status = 'REJECTED'
    quotation.rejection_reason = request.reason or 'Disapproved by user'
    db.commit()
    db.refresh(quotation)
    return get_quotation(db, quotation.id)

def delete_quotation(db: Session, quotation_id: int):
    quotation = db.query(Quotation).filter(Quotation.id == quotation_id).first()
    if not quotation:
        raise EntityNotFoundException('Quotation', str(quotation_id))
    if quotation.status == 'APPROVED':
        raise BusinessRuleException('Cannot delete an approved quotation that has already been converted to an invoice.')

    db.delete(quotation)
    db.commit()
