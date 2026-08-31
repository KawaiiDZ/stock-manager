import pytest
from decimal import Decimal
from backend.app.schemas.product import ProductCreate, StockAdjustmentRequest
from backend.app.schemas.sales import SaleCreate, SaleItemCreate
from backend.app.services.product_service import create_products_bulk, adjust_stock, get_product
from backend.app.services.sales_service import create_sale
from backend.app.core.errors import DuplicateBarcodeException

def test_bulk_product_creation(db_session):
    bulk_data = [
        ProductCreate(
            name="Bulk Flour 10kg",
            sku="FLOUR-01",
            barcode="778899001",
            purchase_price=Decimal("800.00"),
            selling_price=Decimal("1000.00"),
            opening_stock=Decimal("20.00")
        ),
        ProductCreate(
            name="Bulk Cooking Oil 5L",
            sku="OIL-05",
            barcode="778899002",
            purchase_price=Decimal("2200.00"),
            selling_price=Decimal("2500.00"),
            opening_stock=Decimal("15.00")
        ),
        ProductCreate(
            name="Bulk Sugar 5kg",
            sku="SUGAR-05",
            barcode="778899003",
            purchase_price=Decimal("600.00"),
            selling_price=Decimal("750.00"),
            opening_stock=Decimal("30.00")
        )
    ]

    res = create_products_bulk(db_session, bulk_data)
    assert res.success is True
    assert res.count == 3
    assert len(res.products) == 3

    # Barcode uniqueness in batch
    with pytest.raises(DuplicateBarcodeException):
        create_products_bulk(db_session, [
            ProductCreate(name="Duplicate 1", barcode="112233"),
            ProductCreate(name="Duplicate 2", barcode="112233"),
        ])

def test_stock_adjustment(db_session):
    res = create_products_bulk(db_session, [
        ProductCreate(
            name="Adjust Test Item",
            purchase_price=Decimal("100.00"),
            selling_price=Decimal("150.00"),
            opening_stock=Decimal("10.00")
        )
    ])
    prod_id = res.products[0].id

    # Adjust stock up to 25
    adjusted = adjust_stock(db_session, prod_id, StockAdjustmentRequest(
        new_stock=Decimal("25.00"),
        reason="Physical audit found extra crates"
    ))
    assert adjusted["current_stock"] == Decimal("25.00")

    # Adjust stock down to 18
    adjusted_down = adjust_stock(db_session, prod_id, StockAdjustmentRequest(
        new_stock=Decimal("18.00"),
        reason="Damaged items discarded"
    ))
    assert adjusted_down["current_stock"] == Decimal("18.00")

def test_frictionless_counter_sale_and_inline_credit_customer(db_session):
    res = create_products_bulk(db_session, [
        ProductCreate(
            name="Counter Sale Biscuit",
            purchase_price=Decimal("40.00"),
            selling_price=Decimal("50.00"),
            opening_stock=Decimal("50.00")
        )
    ])
    p = res.products[0]

    # 1. Counter sale with no customer_id specified (Fully Paid cash sale)
    cash_sale = create_sale(db_session, SaleCreate(
        items=[SaleItemCreate(product_id=p.id, quantity=Decimal("2.00"), unit_price=Decimal("50.00"))],
        paid_amount=Decimal("100.00"),
        payment_method="Cash"
    ))
    assert cash_sale.payment_status == "PAID"
    assert cash_sale.due_amount == Decimal("0.00")

    # 2. Credit sale with inline customer name and phone
    credit_sale = create_sale(db_session, SaleCreate(
        customer_name="Tariq Mahmood",
        customer_phone="03339876543",
        items=[SaleItemCreate(product_id=p.id, quantity=Decimal("5.00"), unit_price=Decimal("50.00"))],
        paid_amount=Decimal("100.00"), # partial payment
        payment_method="Cash"
    ))
    assert credit_sale.customer_name == "Tariq Mahmood"
    assert credit_sale.payment_status == "PARTIALLY_PAID"
    assert credit_sale.due_amount == Decimal("150.00")
