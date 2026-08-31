from decimal import Decimal
import pytest
from backend.app.schemas.product import ProductCreate
from backend.app.schemas.sales import SaleCreate, SaleItemCreate
from backend.app.schemas.supplier import SupplierCreate
from backend.app.schemas.purchase import PurchaseCreate, PurchaseItemCreate
from backend.app.services.product_service import create_product
from backend.app.services.sales_service import create_sale
from backend.app.services.supplier_service import create_supplier
from backend.app.services.purchase_service import create_purchase
from backend.app.models.customer import Customer
from backend.app.core.errors import InsufficientStockException

def test_fifo_single_and_crossing_batches(db_session):
    # Setup Walk-in Customer (C-000001)
    customer = db_session.query(Customer).filter(Customer.customer_id == "C-000001").first()

    # Create Product with 0 opening stock
    product = create_product(db_session, ProductCreate(
        name="Cooking Oil 1L",
        purchase_price=Decimal("250.00"),
        selling_price=Decimal("300.00"),
        opening_stock=Decimal("0.00")
    ))
    supplier = create_supplier(db_session, SupplierCreate(name="Oil Supplier"))

    # Batch 1: Purchase 3 units @ Rs. 250
    create_purchase(db_session, PurchaseCreate(
        supplier_id=supplier.id,
        items=[PurchaseItemCreate(product_id=product["id"], quantity=Decimal("3.00"), unit_cost=Decimal("250.00"))],
        paid_amount=Decimal("750.00")
    ))

    # Batch 2: Purchase 10 units @ Rs. 270
    create_purchase(db_session, PurchaseCreate(
        supplier_id=supplier.id,
        items=[PurchaseItemCreate(product_id=product["id"], quantity=Decimal("10.00"), unit_cost=Decimal("270.00"))],
        paid_amount=Decimal("2700.00")
    ))

    # Test Section 16 & 76 Crossing Batches Sale:
    # Sell 5 units @ Rs. 300
    # Expected FIFO Consumption: 3 units @ Rs. 250 (Rs. 750) + 2 units @ Rs. 270 (Rs. 540) = Rs. 1290 total cost
    # Expected Gross Profit: (5 * 300) - 1290 = 1500 - 1290 = Rs. 210
    sale = create_sale(db_session, SaleCreate(
        customer_id=customer.id,
        items=[SaleItemCreate(
            product_id=product["id"],
            quantity=Decimal("5.00"),
            unit_price=Decimal("300.00"),
            discount_amount=Decimal("0.00")
        )],
        paid_amount=Decimal("1500.00")
    ))

    assert sale.receipt_number == "R-000001"
    assert sale.total_amount == Decimal("1500.00")
    assert sale.total_cost == Decimal("1290.00")
    assert sale.gross_profit == Decimal("210.00")

    # Verify line item batches
    item = sale.items[0]
    assert len(item.batches) == 2
    assert item.batches[0].quantity == Decimal("3.00")
    assert item.batches[0].unit_cost == Decimal("250.00")
    assert item.batches[1].quantity == Decimal("2.00")
    assert item.batches[1].unit_cost == Decimal("270.00")

    # Remaining stock should be (3 + 10) - 5 = 8 units (all in Batch 2 @ 270)
    updated_prod = db_session.query(Customer).filter(Customer.id == customer.id).first()
    # Check next sale of 3 units should cost 3 * 270 = 810
    sale2 = create_sale(db_session, SaleCreate(
        customer_id=customer.id,
        items=[SaleItemCreate(
            product_id=product["id"],
            quantity=Decimal("3.00"),
            unit_price=Decimal("300.00")
        )],
        paid_amount=Decimal("900.00")
    ))
    assert sale2.total_cost == Decimal("810.00")
    assert sale2.gross_profit == Decimal("90.00")

def test_stock_validation_prevents_overselling(db_session):
    customer = db_session.query(Customer).filter(Customer.customer_id == "C-000001").first()
    product = create_product(db_session, ProductCreate(
        name="Sugar 1kg",
        purchase_price=Decimal("150.00"),
        selling_price=Decimal("180.00"),
        opening_stock=Decimal("4.00")
    ))

    # Attempt to sell 5 units when only 4 available
    with pytest.raises(InsufficientStockException) as exc_info:
        create_sale(db_session, SaleCreate(
            customer_id=customer.id,
            items=[SaleItemCreate(
                product_id=product["id"],
                quantity=Decimal("5.00"),
                unit_price=Decimal("180.00")
            )],
            paid_amount=Decimal("900.00")
        ))

    assert "Only 4 units of Sugar 1kg are available" in str(exc_info.value.detail)
