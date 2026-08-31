from decimal import Decimal
from typing import Optional, List
from sqlalchemy.orm import Session, joinedload
from sqlalchemy import or_

from backend.app.models.product import ProductCategory, Product, ProductCustomField, ProductCustomValue
from backend.app.models.inventory import InventoryBatch, InventoryMovement
from backend.app.schemas.product import (
    ProductCreate, ProductUpdate, CategoryCreate, CustomFieldCreate, CustomValueDto,
    StockAdjustmentRequest, BulkProductsResponse
)
from backend.app.services.id_generator import generate_product_id
from backend.app.core.errors import DuplicateBarcodeException, EntityNotFoundException, BusinessRuleException

# Categories
def list_categories(db: Session, active_only: bool = True) -> List[ProductCategory]:
    q = db.query(ProductCategory)
    if active_only:
        q = q.filter(ProductCategory.is_active == True)
    return q.order_by(ProductCategory.name.asc()).all()

def create_category(db: Session, data: CategoryCreate) -> ProductCategory:
    existing = db.query(ProductCategory).filter(ProductCategory.name == data.name.strip()).first()
    if existing:
        if not existing.is_active:
            existing.is_active = True
            db.commit()
            db.refresh(existing)
            return existing
        raise BusinessRuleException(f"Category '{data.name}' already exists.")
    cat = ProductCategory(name=data.name.strip(), is_active=True)
    db.add(cat)
    db.commit()
    db.refresh(cat)
    return cat

def update_category(db: Session, cat_id: int, name: str, is_active: Optional[bool] = None) -> ProductCategory:
    cat = db.query(ProductCategory).filter(ProductCategory.id == cat_id).first()
    if not cat:
        raise EntityNotFoundException("Category", str(cat_id))
    cat.name = name.strip()
    if is_active is not None:
        cat.is_active = is_active
    db.commit()
    db.refresh(cat)
    return cat

# Custom Fields
def list_custom_fields(db: Session, active_only: bool = True) -> List[ProductCustomField]:
    q = db.query(ProductCustomField)
    if active_only:
        q = q.filter(ProductCustomField.is_active == True)
    return q.order_by(ProductCustomField.display_order.asc(), ProductCustomField.id.asc()).all()

def create_custom_field(db: Session, data: CustomFieldCreate) -> ProductCustomField:
    field = ProductCustomField(
        name=data.name.strip(),
        field_type=data.field_type,
        options=data.options.strip() if data.options else None,
        is_required=data.is_required,
        show_in_table=data.show_in_table,
        show_in_pos=data.show_in_pos,
        show_in_receipt=data.show_in_receipt,
        display_order=data.display_order,
        is_active=True
    )
    db.add(field)
    db.commit()
    db.refresh(field)
    return field

def update_custom_field(
    db: Session,
    field_id: int,
    data: CustomFieldUpdate
) -> ProductCustomField:
    field = db.query(ProductCustomField).filter(ProductCustomField.id == field_id).first()
    if not field:
        raise EntityNotFoundException("Custom Field", str(field_id))
    if data.name is not None:
        field.name = data.name.strip()
    if data.field_type is not None:
        field.field_type = data.field_type
    if data.options is not None:
        field.options = data.options.strip() if data.options else None
    if data.is_required is not None:
        field.is_required = data.is_required
    if data.show_in_table is not None:
        field.show_in_table = data.show_in_table
    if data.show_in_pos is not None:
        field.show_in_pos = data.show_in_pos
    if data.show_in_receipt is not None:
        field.show_in_receipt = data.show_in_receipt
    if data.display_order is not None:
        field.display_order = data.display_order
    if data.is_active is not None:
        field.is_active = data.is_active
    db.commit()
    db.refresh(field)
    return field

def delete_custom_field(db: Session, field_id: int) -> bool:
    field = db.query(ProductCustomField).filter(ProductCustomField.id == field_id).first()
    if not field:
        raise EntityNotFoundException("Custom Field", str(field_id))
    db.delete(field)
    db.commit()
    return True

# Products
def _format_product_response(product: Product) -> dict:
    custom_vals = []
    if product.custom_values:
        for cv in product.custom_values:
            custom_vals.append(CustomValueDto(
                field_id=cv.field_id,
                field_name=cv.custom_field.name if cv.custom_field else None,
                value=cv.value
            ))
    return {
        "id": product.id,
        "product_id": product.product_id,
        "name": product.name,
        "sku": product.sku,
        "barcode": product.barcode,
        "category_id": product.category_id,
        "category_name": product.category.name if product.category else None,
        "purchase_price": product.purchase_price,
        "selling_price": product.selling_price,
        "current_stock": product.current_stock,
        "is_active": product.is_active,
        "custom_fields": custom_vals,
        "created_at": product.created_at,
        "updated_at": product.updated_at
    }

def list_products(
    db: Session,
    search: Optional[str] = None,
    category_id: Optional[int] = None,
    is_active: Optional[bool] = True,
    skip: int = 0,
    limit: int = 500
) -> List[dict]:
    q = db.query(Product).options(
        joinedload(Product.category),
        joinedload(Product.custom_values).joinedload(ProductCustomValue.custom_field)
    )
    if is_active is not None:
        q = q.filter(Product.is_active == is_active)
    if category_id:
        q = q.filter(Product.category_id == category_id)
    if search:
        search_term = f"%{search.strip()}%"
        q = q.filter(
            or_(
                Product.name.ilike(search_term),
                Product.product_id.ilike(search_term),
                Product.sku.ilike(search_term),
                Product.barcode.ilike(search_term)
            )
        )
    products = q.order_by(Product.name.asc()).offset(skip).limit(limit).all()
    return [_format_product_response(p) for p in products]

def get_product(db: Session, product_id: int) -> dict:
    product = db.query(Product).options(
        joinedload(Product.category),
        joinedload(Product.custom_values).joinedload(ProductCustomValue.custom_field)
    ).filter(Product.id == product_id).first()
    if not product:
        raise EntityNotFoundException("Product", str(product_id))
    return _format_product_response(product)

def get_product_by_barcode(db: Session, barcode: str) -> Optional[dict]:
    product = db.query(Product).options(
        joinedload(Product.category),
        joinedload(Product.custom_values).joinedload(ProductCustomValue.custom_field)
    ).filter(Product.barcode == barcode.strip(), Product.is_active == True).first()
    if not product:
        return None
    return _format_product_response(product)

def create_product(db: Session, data: ProductCreate) -> dict:
    # Check duplicate barcode
    if data.barcode and data.barcode.strip():
        existing_bc = db.query(Product).filter(Product.barcode == data.barcode.strip()).first()
        if existing_bc:
            raise DuplicateBarcodeException(data.barcode.strip(), existing_bc.name)

    new_pid = generate_product_id(db)

    product = Product(
        product_id=new_pid,
        name=data.name.strip(),
        sku=data.sku.strip() if data.sku else None,
        barcode=data.barcode.strip() if data.barcode else None,
        category_id=data.category_id if data.category_id and data.category_id > 0 else None,
        purchase_price=data.purchase_price,
        selling_price=data.selling_price,
        current_stock=data.opening_stock,
        is_active=True
    )
    db.add(product)
    db.flush()

    if data.opening_stock > Decimal("0.00"):
        batch = InventoryBatch(
            product_id=product.id,
            purchase_id=None,
            quantity_received=data.opening_stock,
            quantity_remaining=data.opening_stock,
            unit_cost=data.purchase_price
        )
        db.add(batch)

        movement = InventoryMovement(
            product_id=product.id,
            movement_type="OPENING_STOCK",
            quantity=data.opening_stock,
            unit_cost=data.purchase_price,
            reference_type="OPENING",
            reference_id=product.product_id,
            notes="Initial opening stock on product creation"
        )
        db.add(movement)

    if data.custom_fields:
        for cf in data.custom_fields:
            if cf.value and cf.value.strip():
                val = ProductCustomValue(
                    product_id=product.id,
                    field_id=cf.field_id,
                    value=cf.value.strip()
                )
                db.add(val)

    db.commit()
    db.refresh(product)
    return get_product(db, product.id)

def create_products_bulk(db: Session, products_data: List[ProductCreate]) -> BulkProductsResponse:
    if not products_data:
        raise BusinessRuleException("No products provided for bulk creation.")

    created_ids = []
    barcodes_in_batch = set()

    for item in products_data:
        name = item.name.strip()
        if not name:
            continue

        barcode = item.barcode.strip() if item.barcode else None
        if barcode:
            if barcode in barcodes_in_batch:
                raise DuplicateBarcodeException(barcode, f"Multiple rows in this batch have barcode '{barcode}'")
            barcodes_in_batch.add(barcode)

            existing = db.query(Product).filter(Product.barcode == barcode).first()
            if existing:
                raise DuplicateBarcodeException(barcode, existing.name)

        new_pid = generate_product_id(db)

        product = Product(
            product_id=new_pid,
            name=name,
            sku=item.sku.strip() if item.sku else None,
            barcode=barcode,
            category_id=item.category_id if item.category_id and item.category_id > 0 else None,
            purchase_price=item.purchase_price,
            selling_price=item.selling_price,
            current_stock=item.opening_stock,
            is_active=True
        )
        db.add(product)
        db.flush()

        if item.opening_stock > Decimal("0.00"):
            batch = InventoryBatch(
                product_id=product.id,
                purchase_id=None,
                quantity_received=item.opening_stock,
                quantity_remaining=item.opening_stock,
                unit_cost=item.purchase_price
            )
            db.add(batch)

            movement = InventoryMovement(
                product_id=product.id,
                movement_type="OPENING_STOCK",
                quantity=item.opening_stock,
                unit_cost=item.purchase_price,
                reference_type="OPENING",
                reference_id=product.product_id,
                notes="Bulk opening stock"
            )
            db.add(movement)

        if item.custom_fields:
            for cf in item.custom_fields:
                if cf.value and cf.value.strip():
                    val = ProductCustomValue(
                        product_id=product.id,
                        field_id=cf.field_id,
                        value=cf.value.strip()
                    )
                    db.add(val)

        created_ids.append(product.id)

    db.commit()

    saved_products = [get_product(db, pid) for pid in created_ids]
    return BulkProductsResponse(
        success=True,
        count=len(saved_products),
        products=saved_products,
        message=f"Successfully added {len(saved_products)} products to catalog."
    )

def adjust_stock(db: Session, product_id: int, data: StockAdjustmentRequest) -> dict:
    product = db.query(Product).filter(Product.id == product_id).first()
    if not product:
        raise EntityNotFoundException("Product", str(product_id))

    old_stock = product.current_stock
    diff = data.new_stock - old_stock

    if diff == Decimal("0.00"):
        return get_product(db, product_id)

    product.current_stock = data.new_stock

    if diff > Decimal("0.00"):
        # Stock increased -> create new adjustment batch
        batch = InventoryBatch(
            product_id=product.id,
            purchase_id=None,
            quantity_received=diff,
            quantity_remaining=diff,
            unit_cost=product.purchase_price
        )
        db.add(batch)
    else:
        # Stock decreased -> deduct from remaining batches
        qty_to_deduct = abs(diff)
        batches = db.query(InventoryBatch).filter(
            InventoryBatch.product_id == product.id,
            InventoryBatch.quantity_remaining > Decimal("0.00")
        ).order_by(InventoryBatch.created_at.desc(), InventoryBatch.id.desc()).all()

        for b in batches:
            if qty_to_deduct <= Decimal("0.00"):
                break
            deduct_amt = min(qty_to_deduct, b.quantity_remaining)
            b.quantity_remaining -= deduct_amt
            qty_to_deduct -= deduct_amt

    movement = InventoryMovement(
        product_id=product.id,
        movement_type="ADJUSTMENT",
        quantity=diff,
        unit_cost=product.purchase_price,
        reference_type="ADJUSTMENT",
        reference_id=f"ADJ-{product.product_id}",
        notes=data.reason or f"Manual stock count adjusted from {old_stock} to {data.new_stock}"
    )
    db.add(movement)

    db.commit()
    return get_product(db, product.id)

def update_product(db: Session, product_id: int, data: ProductUpdate) -> dict:
    product = db.query(Product).filter(Product.id == product_id).first()
    if not product:
        raise EntityNotFoundException("Product", str(product_id))

    if data.barcode is not None:
        bc_val = data.barcode.strip() if data.barcode else None
        if bc_val:
            conflict = db.query(Product).filter(Product.barcode == bc_val, Product.id != product_id).first()
            if conflict:
                raise DuplicateBarcodeException(bc_val, conflict.name)
        product.barcode = bc_val

    if data.name is not None:
        product.name = data.name.strip()
    if data.sku is not None:
        product.sku = data.sku.strip() if data.sku else None
    if data.category_id is not None:
        product.category_id = data.category_id if data.category_id > 0 else None
    if data.purchase_price is not None:
        product.purchase_price = data.purchase_price
    if data.selling_price is not None:
        product.selling_price = data.selling_price

    if data.custom_fields is not None:
        db.query(ProductCustomValue).filter(ProductCustomValue.product_id == product_id).delete()
        for cf in data.custom_fields:
            if cf.value and cf.value.strip():
                val = ProductCustomValue(
                    product_id=product.id,
                    field_id=cf.field_id,
                    value=cf.value.strip()
                )
                db.add(val)

    db.commit()
    db.refresh(product)
    return get_product(db, product.id)

def deactivate_product(db: Session, product_id: int) -> dict:
    product = db.query(Product).filter(Product.id == product_id).first()
    if not product:
        raise EntityNotFoundException("Product", str(product_id))
    product.is_active = False
    db.commit()
    return get_product(db, product.id)

def restore_product(db: Session, product_id: int) -> dict:
    product = db.query(Product).filter(Product.id == product_id).first()
    if not product:
        raise EntityNotFoundException("Product", str(product_id))
    product.is_active = True
    db.commit()
    return get_product(db, product.id)
