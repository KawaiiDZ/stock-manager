from decimal import Decimal
import pytest
from backend.app.schemas.product import ProductCreate, ProductUpdate, CategoryCreate, ProductBulkUpdateItem
from backend.app.services.product_service import (
    create_product, get_product, update_product, deactivate_product, restore_product,
    create_category, list_products, update_products_bulk
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

def test_bulk_update_products(db_session):
    cat = create_category(db_session, CategoryCreate(name="Bulk Edit Test Cat"))
    p1 = create_product(db_session, ProductCreate(
        name="Item Alpha",
        sku="ALPHA-1",
        category_id=cat.id,
        purchase_price=Decimal("100.00"),
        selling_price=Decimal("150.00"),
        opening_stock=Decimal("10.00")
    ))
    p2 = create_product(db_session, ProductCreate(
        name="Item Beta",
        sku="BETA-1",
        category_id=cat.id,
        purchase_price=Decimal("200.00"),
        selling_price=Decimal("250.00"),
        opening_stock=Decimal("20.00")
    ))

    # Perform bulk update
    updates = [
        ProductBulkUpdateItem(
            id=p1["id"],
            name="Item Alpha Renamed",
            selling_price=Decimal("180.00"),
            current_stock=Decimal("15.00")  # +5 stock adjustment
        ),
        ProductBulkUpdateItem(
            id=p2["id"],
            purchase_price=Decimal("220.00"),
            selling_price=Decimal("290.00")
        )
    ]

    res = update_products_bulk(db_session, updates)
    assert res.success is True
    assert res.count == 2

    # Verify updated items
    updated_p1 = get_product(db_session, p1["id"])
    assert updated_p1["name"] == "Item Alpha Renamed"
    assert updated_p1["selling_price"] == Decimal("180.00")
    assert updated_p1["current_stock"] == Decimal("15.00")

    updated_p2 = get_product(db_session, p2["id"])
    assert updated_p2["purchase_price"] == Decimal("220.00")
    assert updated_p2["selling_price"] == Decimal("290.00")
    assert updated_p2["current_stock"] == Decimal("20.00")

