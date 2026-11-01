from decimal import Decimal
import pytest
from sqlalchemy.orm import Session
from datetime import datetime

from backend.app.models.product import Product
from backend.app.models.inventory import InventoryBatch
from backend.app.models.customer import Customer
from backend.app.models.sales import Sale, SaleItem
from backend.app.schemas.sales import SaleCreate, SaleItemCreate, ExternalSaleCreate
from backend.app.schemas.quotation import QuotationCreate, QuotationItemCreate, QuotationConvertRequest
from backend.app.services.sales_service import create_sale, record_external_sale, list_sales
from backend.app.services.quotation_service import create_quotation, check_quotation_conversion, convert_quotation_to_sale
from backend.app.services.dashboard_service import get_dashboard_stats
from backend.app.services.account_service import get_cash_flow_summary
from backend.app.services.id_generator import generate_product_id, generate_customer_id

def test_add_to_bill_external_item_zero_profit_and_no_stock_impact(db_session: Session):
    db = db_session
    """Verify that external sourced items added to bill do not affect profit and touch zero stock."""
    # 1. Create a real physical product with stock and profit
    cid = generate_customer_id(db)
    customer = Customer(customer_id=cid, name="Test Customer", phone="0300-1112233", is_active=True)
    db.add(customer)
    db.flush()

    pid = generate_product_id(db)
    prod = Product(
        product_id=pid,
        name="Business Product A",
        purchase_price=Decimal("40.00"),
        selling_price=Decimal("100.00"),
        current_stock=Decimal("10.00"),
        is_service=False,
        is_active=True
    )
    db.add(prod)
    db.flush()

    batch = InventoryBatch(
        product_id=prod.id,
        quantity_received=Decimal("10.00"),
        quantity_remaining=Decimal("10.00"),
        unit_cost=Decimal("40.00")
    )
    db.add(batch)
    db.commit()

    # 2. Create a sale with 1 Business Product + 1 External Sourced Item
    sale_data = SaleCreate(
        customer_id=customer.id,
        items=[
            SaleItemCreate(
                product_id=prod.id,
                quantity=Decimal("2.00"),
                unit_price=Decimal("100.00"),
                discount_amount=Decimal("0.00")
            ),
            SaleItemCreate(
                product_id=None,
                external_name="Sourced External Cable",
                is_external=True,
                quantity=Decimal("3.00"),
                unit_price=Decimal("50.00"),
                discount_amount=Decimal("0.00"),
                notes="Bought from vendor next door"
            )
        ],
        paid_amount=Decimal("350.00"),
        payment_method="Cash"
    )

    sale_res = create_sale(db, sale_data)

    # 3. Assertions
    # Total = 2 * 100 + 3 * 50 = 200 + 150 = 350.00
    assert sale_res.total_amount == Decimal("350.00")
    assert sale_res.subtotal == Decimal("350.00")
    assert sale_res.paid_amount == Decimal("350.00")

    # Business profit on Product A = 2 * (100 - 40) = 120.00
    # External item profit = 0.00 (unit_cost = 50, unit_price = 50)
    # Total sale profit MUST BE exactly 120.00
    assert sale_res.gross_profit == Decimal("120.00")

    # Verify line items
    assert len(sale_res.items) == 2
    ext_item = next(it for it in sale_res.items if it.is_external)
    assert ext_item.product_id is None
    assert ext_item.product_name == "Sourced External Cable"
    assert ext_item.gross_profit == Decimal("0.00")
    assert ext_item.unit_cost == Decimal("50.00")
    assert ext_item.total_cost == Decimal("150.00")

    # Verify inventory: Product A stock decremented from 10 to 8
    db.refresh(prod)
    assert prod.current_stock == Decimal("8.00")

def test_add_balance_in_total_sales_and_cash_flow(db_session: Session):
    db = db_session
    """Verify recording an outside service / sale balance directly updates revenue, profit, cash flow, and sales history."""
    initial_stats = get_dashboard_stats(db)
    initial_revenue = initial_stats.today_sales_revenue
    initial_profit = initial_stats.today_gross_profit

    # Record outside AC repair service
    ext_sale = record_external_sale(db, ExternalSaleCreate(
        amount=Decimal("1500.00"),
        profit=Decimal("1000.00"),
        notes="Outside AC repair & compressor tuning service",
        payment_method="Cash",
        customer_name="Direct Walk-in"
    ))

    assert ext_sale.is_external is True
    assert ext_sale.total_amount == Decimal("1500.00")
    assert ext_sale.gross_profit == Decimal("1000.00")
    assert ext_sale.total_cost == Decimal("500.00")
    assert ext_sale.payment_status == "PAID"

    # Verify Dashboard KPIs reflect revenue and profit
    updated_stats = get_dashboard_stats(db)
    assert updated_stats.today_sales_revenue == initial_revenue + Decimal("1500.00")
    assert updated_stats.today_gross_profit == initial_profit + Decimal("1000.00")

    # Verify Cash Flow accounts summary
    cash_flow = get_cash_flow_summary(db)
    cash_acc = next((acc for acc in cash_flow.accounts if acc.account.lower() == "cash"), None)
    assert cash_acc is not None
    assert cash_acc.today_sales_inflow >= Decimal("1500.00")

    # Verify sales history list includes this external sale
    sales_list = list_sales(db, search=ext_sale.receipt_number)
    assert len(sales_list) >= 1
    found = sales_list[0]
    assert found.receipt_number == ext_sale.receipt_number
    assert found.is_external is True
    assert found.notes == "Outside AC repair & compressor tuning service"

def test_external_quotation_conversion(db_session: Session):
    db = db_session
    """Verify quotations can contain external items and convert cleanly into sales."""
    quotation_data = QuotationCreate(
        customer_name="Quotation Client",
        customer_phone="0321-9988776",
        items=[
            QuotationItemCreate(
                product_id=None,
                external_name="Custom Metal Fabrication (Sourced)",
                is_external=True,
                quantity=Decimal("1.00"),
                unit_price=Decimal("4500.00")
            )
        ]
    )
    quot = create_quotation(db, quotation_data)
    assert quot.total_amount == Decimal("4500.00")
    assert len(quot.items) == 1
    assert quot.items[0].is_external is True

    # Check conversion
    check_res = check_quotation_conversion(db, quot.id)
    assert check_res.has_stock_shortages is False
    assert len(check_res.items) == 1
    assert check_res.items[0].product_id is None

    # Convert to sale
    sale_res = convert_quotation_to_sale(db, quot.id, QuotationConvertRequest(
        price_mode="quoted",
        payment_method="Cash",
        amount_paid=Decimal("4500.00")
    ))
    assert sale_res.total_amount == Decimal("4500.00")
    assert sale_res.gross_profit == Decimal("0.00")
    assert sale_res.items[0].is_external is True
