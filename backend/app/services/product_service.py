from decimal import Decimal
from typing import Optional, List
from sqlalchemy.orm import Session, joinedload
from sqlalchemy import or_, func

from backend.app.models.product import ProductCategory, Product, ProductCustomField, ProductCustomValue
from backend.app.models.inventory import InventoryBatch, InventoryMovement
from backend.app.models.sales import SaleItem, SalesReturnItem
from backend.app.models.purchase import PurchaseItem, PurchaseReturnItem
from backend.app.models.quotation import QuotationItem
from backend.app.schemas.product import (
    ProductCreate, ProductUpdate, CategoryCreate, CustomFieldCreate, CustomFieldUpdate,
    CustomFieldResponse, CustomValueDto, StockAdjustmentRequest, BulkProductsResponse
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
    if not data.name or not data.name.strip():
        raise BusinessRuleException("Category name cannot be empty.")
    existing = db.query(ProductCategory).filter(ProductCategory.name == data.name.strip()).first()
    if existing:
        if not existing.is_active:
            existing.is_active = True
            db.commit()
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
    if not name or not name.strip():
        raise BusinessRuleException("Category name cannot be empty.")
    cat.name = name.strip()
    if is_active is not None:
        cat.is_active = is_active
    db.commit()
    db.refresh(cat)
    return cat

def delete_category(db: Session, cat_id: int) -> None:
    cat = db.query(ProductCategory).filter(ProductCategory.id == cat_id).first()
    if not cat:
        raise EntityNotFoundException("Category", str(cat_id))

    # 1. Find all products belonging to this category
    products = db.query(Product).filter(Product.category_id == cat_id).all()

    for p in products:
        has_sales = db.query(SaleItem).filter(SaleItem.product_id == p.id).first() is not None
        has_sales_returns = db.query(SalesReturnItem).filter(SalesReturnItem.product_id == p.id).first() is not None
        has_purchases = db.query(PurchaseItem).filter(PurchaseItem.product_id == p.id).first() is not None
        has_purchase_returns = db.query(PurchaseReturnItem).filter(PurchaseReturnItem.product_id == p.id).first() is not None
        has_quotations = db.query(QuotationItem).filter(QuotationItem.product_id == p.id).first() is not None

        if has_sales or has_sales_returns or has_purchases or has_purchase_returns or has_quotations:
            # Products with transaction or quotation history cannot be hard-deleted due to foreign keys and invoice integrity.
            # Deactivate them, zero their stock, unlink from category, and delete custom values.
            p.is_active = False
            p.current_stock = Decimal("0.00")
            p.category_id = None
            db.query(ProductCustomValue).filter(ProductCustomValue.product_id == p.id).delete(synchronize_session=False)
        else:
            # Safe to hard-delete completely
            db.query(ProductCustomValue).filter(ProductCustomValue.product_id == p.id).delete(synchronize_session=False)
            db.query(InventoryMovement).filter(InventoryMovement.product_id == p.id).delete(synchronize_session=False)
            db.query(InventoryBatch).filter(InventoryBatch.product_id == p.id).delete(synchronize_session=False)
            db.delete(p)

    # 2. Find and delete custom fields tied specifically to this category
    category_fields = db.query(ProductCustomField).filter(ProductCustomField.category_id == cat_id).all()
    cat_field_ids = [f.id for f in category_fields]
    if cat_field_ids:
        db.query(ProductCustomValue).filter(ProductCustomValue.field_id.in_(cat_field_ids)).delete(synchronize_session=False)
        db.query(ProductCustomField).filter(ProductCustomField.id.in_(cat_field_ids)).delete(synchronize_session=False)

    # 3. Delete the category record
    db.delete(cat)
    db.commit()

# Custom Fields
def _format_custom_field_response(field: ProductCustomField) -> CustomFieldResponse:
    return CustomFieldResponse(
        id=field.id,
        category_id=field.category_id,
        category_name=field.category.name if field.category else "All Categories (Global)",
        name=field.name,
        field_type=field.field_type,
        options=field.options,
        is_required=field.is_required,
        show_in_table=field.show_in_table,
        show_in_pos=field.show_in_pos,
        show_in_receipt=field.show_in_receipt,
        display_order=field.display_order,
        is_active=field.is_active
    )

def list_custom_fields(
    db: Session,
    category_id: Optional[int] = None,
    active_only: bool = True
) -> List[CustomFieldResponse]:
    q = db.query(ProductCustomField).options(joinedload(ProductCustomField.category))
    if active_only:
        q = q.filter(ProductCustomField.is_active == True)
    if category_id is not None:
        q = q.filter(or_(ProductCustomField.category_id == None, ProductCustomField.category_id == category_id))
    fields = q.order_by(
        ProductCustomField.category_id.asc().nullsfirst(),
        ProductCustomField.display_order.asc(),
        ProductCustomField.id.asc()
    ).all()
    return [_format_custom_field_response(f) for f in fields]

def create_custom_field(db: Session, data: CustomFieldCreate) -> CustomFieldResponse:
    if not data.name or not data.name.strip():
        raise BusinessRuleException("Custom field name cannot be empty.")
    cat_id = data.category_id if data.category_id and data.category_id > 0 else None
    if cat_id:
        cat = db.query(ProductCategory).filter(ProductCategory.id == cat_id).first()
        if not cat:
            raise EntityNotFoundException("Category", str(cat_id))

    field = ProductCustomField(
        category_id=cat_id,
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
    return _format_custom_field_response(field)

def update_custom_field(
    db: Session,
    field_id: int,
    data: CustomFieldUpdate
) -> CustomFieldResponse:
    field = db.query(ProductCustomField).filter(ProductCustomField.id == field_id).first()
    if not field:
        raise EntityNotFoundException("Custom Field", str(field_id))
    if data.category_id is not None:
        cat_id = data.category_id if data.category_id > 0 else None
        if cat_id:
            cat = db.query(ProductCategory).filter(ProductCategory.id == cat_id).first()
            if not cat:
                raise EntityNotFoundException("Category", str(cat_id))
        field.category_id = cat_id
    if data.name is not None:
        if not data.name.strip():
            raise BusinessRuleException("Custom field name cannot be empty.")
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
    return _format_custom_field_response(field)

def delete_custom_field(db: Session, field_id: int) -> bool:
    field = db.query(ProductCustomField).filter(ProductCustomField.id == field_id).first()
    if not field:
        raise EntityNotFoundException("Custom Field", str(field_id))
    db.delete(field)
    db.commit()
    return True

def reorder_custom_fields(db: Session, field_ids: List[int]) -> List[CustomFieldResponse]:
    for order, f_id in enumerate(field_ids):
        field = db.query(ProductCustomField).filter(ProductCustomField.id == f_id).first()
        if field:
            field.display_order = order
    db.commit()
    return list_custom_fields(db, active_only=False)

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
import random
import time

def generate_unique_barcode(db: Session) -> str:
    """Generate a unique 12-digit in-store barcode (prefix '20' internal GS1 distribution range)."""
    for _ in range(100):
        base = "20" + "".join([str(random.randint(0, 9)) for _ in range(9)])
        odds = sum(int(d) for d in base[::2])
        evens = sum(int(d) for d in base[1::2])
        checksum = (10 - ((odds + evens * 3) % 10)) % 10
        candidate = f"{base}{checksum}"
        existing = db.query(Product).filter(
            or_(Product.barcode == candidate, Product.sku == candidate, Product.product_id == candidate)
        ).first()
        if not existing:
            return candidate
    return f"20{int(time.time())}"

def get_product_by_barcode(db: Session, barcode: str) -> Optional[dict]:
    clean_code = (barcode or "").strip()
    if not clean_code:
        return None
    product = db.query(Product).options(
        joinedload(Product.category),
        joinedload(Product.custom_values).joinedload(ProductCustomValue.custom_field)
    ).filter(
        or_(
            Product.barcode == clean_code,
            Product.sku == clean_code,
            Product.product_id == clean_code,
            func.lower(Product.barcode) == clean_code.lower(),
            func.lower(Product.sku) == clean_code.lower(),
            func.lower(Product.product_id) == clean_code.lower(),
        ),
        Product.is_active == True
    ).first()
    if not product:
        return None
    return _format_product_response(product)

def create_product(db: Session, data: ProductCreate) -> dict:
    if not data.name or not data.name.strip():
        raise BusinessRuleException("Product name cannot be empty.")
    if data.purchase_price < Decimal("0.00"):
        raise BusinessRuleException("Purchase price cannot be negative.")
    if data.selling_price < Decimal("0.00"):
        raise BusinessRuleException("Selling price cannot be negative.")
    if data.opening_stock < Decimal("0.00"):
        raise BusinessRuleException("Opening stock cannot be negative.")

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
                field_exists = db.query(ProductCustomField).filter(ProductCustomField.id == cf.field_id).first()
                if not field_exists:
                    continue
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

        if item.purchase_price < Decimal("0.00"):
            raise BusinessRuleException(f"Purchase price for '{name}' cannot be negative.")
        if item.selling_price < Decimal("0.00"):
            raise BusinessRuleException(f"Selling price for '{name}' cannot be negative.")
        if item.opening_stock < Decimal("0.00"):
            raise BusinessRuleException(f"Opening stock for '{name}' cannot be negative.")

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
                    field_exists = db.query(ProductCustomField).filter(ProductCustomField.id == cf.field_id).first()
                    if not field_exists:
                        continue
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
    if data.new_stock < Decimal("0.00"):
        raise BusinessRuleException("New stock count cannot be negative.")
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
        if not data.name.strip():
            raise BusinessRuleException("Product name cannot be empty.")
        product.name = data.name.strip()
    if data.sku is not None:
        product.sku = data.sku.strip() if data.sku else None
    if data.category_id is not None:
        product.category_id = data.category_id if data.category_id > 0 else None
    if data.purchase_price is not None:
        if data.purchase_price < Decimal("0.00"):
            raise BusinessRuleException("Purchase price cannot be negative.")
        product.purchase_price = data.purchase_price
    if data.selling_price is not None:
        if data.selling_price < Decimal("0.00"):
            raise BusinessRuleException("Selling price cannot be negative.")
        product.selling_price = data.selling_price

    if data.custom_fields is not None:
        db.query(ProductCustomValue).filter(ProductCustomValue.product_id == product_id).delete()
        for cf in data.custom_fields:
            if cf.value and cf.value.strip():
                field_exists = db.query(ProductCustomField).filter(ProductCustomField.id == cf.field_id).first()
                if not field_exists:
                    continue
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

def delete_product_permanent(db: Session, product_id: int) -> None:
    product = db.query(Product).filter(Product.id == product_id).first()
    if not product:
        raise EntityNotFoundException("Product", str(product_id))

    # Check for historical transactions or quotations (sales, purchases, returns, quotations)
    has_sales = db.query(SaleItem).filter(SaleItem.product_id == product_id).first() is not None
    has_sales_returns = db.query(SalesReturnItem).filter(SalesReturnItem.product_id == product_id).first() is not None
    has_purchases = db.query(PurchaseItem).filter(PurchaseItem.product_id == product_id).first() is not None
    has_purchase_returns = db.query(PurchaseReturnItem).filter(PurchaseReturnItem.product_id == product_id).first() is not None
    has_quotations = db.query(QuotationItem).filter(QuotationItem.product_id == product_id).first() is not None

    if has_sales or has_sales_returns or has_purchases or has_purchase_returns or has_quotations:
        raise BusinessRuleException(
            f"Cannot permanently delete '{product.name}' because it has existing transaction history or quotations "
            f"(invoices, purchases, returns, or quotes). It must remain deactivated to preserve historical accounting records."
        )

    # Clean up custom field values, inventory movements, and inventory batches
    db.query(ProductCustomValue).filter(ProductCustomValue.product_id == product_id).delete(synchronize_session=False)
    db.query(InventoryMovement).filter(InventoryMovement.product_id == product_id).delete(synchronize_session=False)
    db.query(InventoryBatch).filter(InventoryBatch.product_id == product_id).delete(synchronize_session=False)

    db.delete(product)
    db.commit()

