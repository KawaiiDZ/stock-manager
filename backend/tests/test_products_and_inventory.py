from decimal import Decimal
import pytest
from backend.app.schemas.product import ProductCreate, ProductUpdate, CategoryCreate
from backend.app.services.product_service import (
    create_product, get_product, update_product, deactivate_product, restore_product,
    create_category, list_products
)
from backend.app.core.errors import DuplicateBarcodeException

def test_product_crud_and_opening_stock(db_session):
    cat = create_category(db_session, CategoryCreate(name="Grocery"))
    assert cat.id is not None

    prod_data = ProductCreate(
        name="Rice 1kg",
        sku="RICE-001",
        barcode="1234567890123",
        category_id=cat.id,
        purchase_price=Decimal("250.00"),
        selling_price=Decimal("300.00"),
        opening_stock=Decimal("50.00")
    )
    product = create_product(db_session, prod_data)

    assert product["product_id"] == "P-000001"
    assert product["name"] == "Rice 1kg"
    assert product["current_stock"] == Decimal("50.00")
    assert product["is_active"] is True

    # Test duplicate barcode prevention
    with pytest.raises(DuplicateBarcodeException):
        create_product(db_session, ProductCreate(
            name="Another Rice",
            barcode="1234567890123",
            purchase_price=Decimal("250.00"),
            selling_price=Decimal("300.00"),
            opening_stock=Decimal("10.00")
        ))

    # Test update
    updated = update_product(db_session, product["id"], ProductUpdate(selling_price=Decimal("320.00")))
    assert updated["selling_price"] == Decimal("320.00")

    # Test deactivation & restore
    deactivated = deactivate_product(db_session, product["id"])
    assert deactivated["is_active"] is False

    restored = restore_product(db_session, product["id"])
    assert restored["is_active"] is True
