from decimal import Decimal
import pytest
from backend.app.schemas.product import ProductCreate, ProductUpdate, CategoryCreate
from backend.app.schemas.sales import SaleCreate, SaleItemCreate, SalesReturnCreate, SalesReturnItemCreate
from backend.app.schemas.quotation import QuotationCreate, QuotationItemCreate, QuotationConvertRequest
from backend.app.services.product_service import create_product, update_product, create_category, list_products
from backend.app.services.sales_service import create_sale
from backend.app.services.returns_service import create_sales_return
from backend.app.services.quotation_service import create_quotation, check_quotation_conversion, convert_quotation_to_sale
from backend.app.models.inventory import InventoryBatch, InventoryMovement
from backend.app.models.customer import Customer

def test_service_product_creation_and_zero_stock(db_session):
    cat = create_category(db_session, CategoryCreate(name="Services"))
    
    # Create a service product
    service_prod = create_product(db_session, ProductCreate(
        name="Transport & Delivery",
        sku="SERV-TRANS",
        category_id=cat.id,
        purchase_price=Decimal("100.00"), # should be forced to 0
        selling_price=Decimal("500.00"),
        opening_stock=Decimal("10.00"),   # should be forced to 0
        is_service=True
    ))

    assert service_prod["name"] == "Transport & Delivery"
    assert service_prod["is_service"] is True
    assert service_prod["category_name"] == "No-Stock Item"
    assert service_prod["barcode"] is None
    assert service_prod["purchase_price"] == Decimal("0.00")
    assert service_prod["selling_price"] == Decimal("500.00")
    assert service_prod["current_stock"] == Decimal("0.00")

    # Verify no inventory batch or opening movement was created
    batches = db_session.query(InventoryBatch).filter(InventoryBatch.product_id == service_prod["id"]).all()
    assert len(batches) == 0

    movements = db_session.query(InventoryMovement).filter(InventoryMovement.product_id == service_prod["id"]).all()
    assert len(movements) == 0

def test_sale_with_service_default_and_custom_price(db_session):
    cat = create_category(db_session, CategoryCreate(name="General"))
    
    # 1. Create a physical item with stock
    physical = create_product(db_session, ProductCreate(
        name="LED Bulb 12W",
        purchase_price=Decimal("150.00"),
        selling_price=Decimal("250.00"),
        opening_stock=Decimal("10.00"),
        is_service=False
    ))

    # 2. Create a service item with default price Rs. 300
    service = create_product(db_session, ProductCreate(
        name="Labour & Fitting Charge",
        selling_price=Decimal("300.00"),
        is_service=True
    ))

    assert service["current_stock"] == Decimal("0.00")

    # 3. Create POS sale with custom edited service price (Rs. 450 instead of 300)
    sale_data = SaleCreate(
        customer_id=1,
        payment_method="Cash",
        paid_amount=Decimal("700.00"),
        items=[
            SaleItemCreate(
                product_id=physical["id"],
                quantity=Decimal("1.00"),
                unit_price=Decimal("250.00")
            ),
            SaleItemCreate(
                product_id=service["id"],
                quantity=Decimal("1.00"),
                unit_price=Decimal("450.00") # Custom price edited in POS!
            )
        ]
    )

    sale = create_sale(db_session, sale_data)
    assert sale.total_amount == Decimal("700.00")
    assert sale.paid_amount == Decimal("700.00")

    # Verify physical stock decremented to 9, service stock remains 0
    from backend.app.models.product import Product
    phys_db = db_session.query(Product).filter(Product.id == physical["id"]).first()
    serv_db = db_session.query(Product).filter(Product.id == service["id"]).first()
    assert phys_db.current_stock == Decimal("9.00")
    assert serv_db.current_stock == Decimal("0.00")

    # Verify profit on service item is 100% margin (450)
    service_sale_item = next(it for it in sale.items if it.product_id == service["id"])
    assert service_sale_item.unit_price == Decimal("450.00")
    assert service_sale_item.total_cost == Decimal("0.00")
    assert service_sale_item.gross_profit == Decimal("450.00")

def test_service_sales_return_no_restock(db_session):
    service = create_product(db_session, ProductCreate(
        name="Delivery Fee",
        selling_price=Decimal("200.00"),
        is_service=True
    ))

    sale = create_sale(db_session, SaleCreate(
        customer_id=1,
        payment_method="Cash",
        paid_amount=Decimal("200.00"),
        items=[
            SaleItemCreate(
                product_id=service["id"],
                quantity=Decimal("1.00"),
                unit_price=Decimal("200.00")
            )
        ]
    ))

    # Return the service
    ret = create_sales_return(db_session, SalesReturnCreate(
        sale_id=sale.id,
        customer_id=1,
        reason="Customer cancelled delivery",
        items=[
            SalesReturnItemCreate(
                product_id=service["id"],
                quantity=Decimal("1.00"),
                unit_price=Decimal("200.00")
            )
        ]
    ))

    assert ret.total_return_amount == Decimal("200.00")

    # Verify service stock is still 0 and no batch created
    from backend.app.models.product import Product
    serv_db = db_session.query(Product).filter(Product.id == service["id"]).first()
    assert serv_db.current_stock == Decimal("0.00")

    batches = db_session.query(InventoryBatch).filter(InventoryBatch.product_id == service["id"]).all()
    assert len(batches) == 0

def test_quotation_with_service(db_session):
    service = create_product(db_session, ProductCreate(
        name="Installation Service",
        selling_price=Decimal("1000.00"),
        is_service=True
    ))

    quot = create_quotation(db_session, QuotationCreate(
        customer_id=1,
        customer_name="Walk-in Customer",
        customer_phone="03001234567",
        items=[
            QuotationItemCreate(
                product_id=service["id"],
                quantity=Decimal("2.00"),
                unit_price=Decimal("1000.00")
            )
        ]
    ))

    # Check conversion shortage
    check = check_quotation_conversion(db_session, quot.id)
    assert check.has_stock_shortages is False

    # Convert to sale
    sale = convert_quotation_to_sale(db_session, quot.id, QuotationConvertRequest(
        payment_method="Cash",
        amount_paid=Decimal("2000.00")
    ))
    assert sale.total_amount == Decimal("2000.00")
