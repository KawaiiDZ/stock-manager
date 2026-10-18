from typing import List, Optional
from sqlalchemy.orm import Session
from sqlalchemy import text

from backend.app.models.template import BillTemplate, BillTemplateItem
from backend.app.models.product import ProductCategory, Product
from backend.app.schemas.template import (
    BillTemplateCreate, BillTemplateUpdate,
    BillTemplateResponse, BillTemplateItemResponse
)
from backend.app.core.errors import EntityNotFoundException, BusinessRuleException

def _build_template_response(template: BillTemplate) -> BillTemplateResponse:
    items_response = []
    for item in (template.items or []):
        cat_name = item.category.name if item.category else item.category_name
        prod_name = item.default_product.name if item.default_product else None
        prod_sku = item.default_product.sku if item.default_product else None
        prod_price = item.default_product.selling_price if item.default_product else None
        prod_stock = item.default_product.current_stock if item.default_product else None

        items_response.append(
            BillTemplateItemResponse(
                id=item.id,
                template_id=item.template_id,
                display_order=item.display_order,
                slot_name=item.slot_name,
                category_id=item.category_id,
                category_name=cat_name,
                default_product_id=item.default_product_id,
                default_quantity=item.default_quantity,
                is_optional=item.is_optional,
                default_product_name=prod_name,
                default_product_sku=prod_sku,
                default_product_selling_price=prod_price,
                default_product_current_stock=prod_stock,
            )
        )

    return BillTemplateResponse(
        id=template.id,
        name=template.name,
        description=template.description,
        is_active=template.is_active,
        items=items_response,
        created_at=template.created_at,
        updated_at=template.updated_at,
    )

def list_templates(db: Session, active_only: bool = True) -> List[BillTemplateResponse]:
    query = db.query(BillTemplate)
    if active_only:
        query = query.filter(BillTemplate.is_active == True)
    templates = query.order_by(BillTemplate.name.asc()).all()
    return [_build_template_response(t) for t in templates]

def get_template(db: Session, template_id: int) -> BillTemplateResponse:
    template = db.query(BillTemplate).filter(BillTemplate.id == template_id).first()
    if not template:
        raise EntityNotFoundException("Bill Template")
    return _build_template_response(template)

def create_template(db: Session, data: BillTemplateCreate) -> BillTemplateResponse:
    name_clean = data.name.strip()
    if not name_clean:
        raise BusinessRuleException("Template name cannot be empty.")

    existing = db.query(BillTemplate).filter(BillTemplate.name == name_clean).first()
    if existing:
        raise BusinessRuleException(f"A bill template named '{name_clean}' already exists.")

    template = BillTemplate(
        name=name_clean,
        description=data.description.strip() if data.description else None,
        is_active=True
    )
    db.add(template)
    db.flush()

    for idx, item_data in enumerate(data.items, start=1):
        cat_id = item_data.category_id
        cat_name = item_data.category_name
        if cat_id and not cat_name:
            cat = db.query(ProductCategory).filter(ProductCategory.id == cat_id).first()
            if cat:
                cat_name = cat.name
        elif not cat_id and cat_name:
            cat = db.query(ProductCategory).filter(ProductCategory.name == cat_name.strip()).first()
            if cat:
                cat_id = cat.id

        slot_name = item_data.slot_name.strip() if item_data.slot_name else (cat_name or f"Item {idx}")

        item = BillTemplateItem(
            template_id=template.id,
            display_order=item_data.display_order or idx,
            slot_name=slot_name,
            category_id=cat_id,
            category_name=cat_name,
            default_product_id=item_data.default_product_id,
            default_quantity=item_data.default_quantity,
            is_optional=item_data.is_optional,
        )
        db.add(item)

    db.commit()
    db.refresh(template)
    try:
        db.execute(text("PRAGMA wal_checkpoint(PASSIVE)"))
    except Exception:
        pass

    return _build_template_response(template)

def update_template(db: Session, template_id: int, data: BillTemplateUpdate) -> BillTemplateResponse:
    template = db.query(BillTemplate).filter(BillTemplate.id == template_id).first()
    if not template:
        raise EntityNotFoundException("Bill Template")

    if data.name is not None:
        name_clean = data.name.strip()
        if not name_clean:
            raise BusinessRuleException("Template name cannot be empty.")
        existing = db.query(BillTemplate).filter(
            BillTemplate.name == name_clean,
            BillTemplate.id != template_id
        ).first()
        if existing:
            raise BusinessRuleException(f"A bill template named '{name_clean}' already exists.")
        template.name = name_clean

    if data.description is not None:
        template.description = data.description.strip() if data.description else None

    if data.is_active is not None:
        template.is_active = data.is_active

    if data.items is not None:
        # Replace items
        db.query(BillTemplateItem).filter(BillTemplateItem.template_id == template_id).delete()
        for idx, item_data in enumerate(data.items, start=1):
            cat_id = item_data.category_id
            cat_name = item_data.category_name
            if cat_id and not cat_name:
                cat = db.query(ProductCategory).filter(ProductCategory.id == cat_id).first()
                if cat:
                    cat_name = cat.name
            elif not cat_id and cat_name:
                cat = db.query(ProductCategory).filter(ProductCategory.name == cat_name.strip()).first()
                if cat:
                    cat_id = cat.id

            slot_name = item_data.slot_name.strip() if item_data.slot_name else (cat_name or f"Item {idx}")

            item = BillTemplateItem(
                template_id=template.id,
                display_order=item_data.display_order or idx,
                slot_name=slot_name,
                category_id=cat_id,
                category_name=cat_name,
                default_product_id=item_data.default_product_id,
                default_quantity=item_data.default_quantity,
                is_optional=item_data.is_optional,
            )
            db.add(item)

    db.commit()
    db.refresh(template)
    try:
        db.execute(text("PRAGMA wal_checkpoint(PASSIVE)"))
    except Exception:
        pass

    return _build_template_response(template)

def delete_template(db: Session, template_id: int) -> bool:
    template = db.query(BillTemplate).filter(BillTemplate.id == template_id).first()
    if not template:
        raise EntityNotFoundException("Bill Template")
    db.delete(template)
    db.commit()
    try:
        db.execute(text("PRAGMA wal_checkpoint(PASSIVE)"))
    except Exception:
        pass
    return True
