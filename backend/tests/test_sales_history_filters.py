from datetime import datetime, timedelta, time
from decimal import Decimal
from backend.app.schemas.product import ProductCreate
from backend.app.schemas.customer import CustomerCreate
from backend.app.schemas.sales import SaleCreate, SaleItemCreate
from backend.app.services.product_service import create_product
from backend.app.services.customer_service import create_customer
from backend.app.services.sales_service import create_sale, list_sales
from backend.app.models.sales import Sale

def test_sales_date_filters_single_day_and_boundaries(db_session):
    # 1. Setup Customer and Product
    cust = create_customer(db_session, CustomerCreate(name="Bilal Tariq", phone="03331234567"))
    prod = create_product(db_session, ProductCreate(
        name="Mechanical Keyboard",
        purchase_price=Decimal("3000.00"),
        selling_price=Decimal("4500.00"),
        opening_stock=Decimal("100.00")
    ))

    # 2. Create 3 sales
    s1 = create_sale(db_session, SaleCreate(
        customer_id=cust.id,
        items=[SaleItemCreate(product_id=prod["id"], quantity=Decimal("1.00"), unit_price=Decimal("4500.00"))],
        paid_amount=Decimal("4500.00")
    ))
    s2 = create_sale(db_session, SaleCreate(
        customer_id=cust.id,
        items=[SaleItemCreate(product_id=prod["id"], quantity=Decimal("1.00"), unit_price=Decimal("4500.00"))],
        paid_amount=Decimal("2000.00")
    ))
    s3 = create_sale(db_session, SaleCreate(
        customer_id=cust.id,
        items=[SaleItemCreate(product_id=prod["id"], quantity=Decimal("1.00"), unit_price=Decimal("4500.00"))],
        paid_amount=Decimal("0.00")
    ))

    # Explicitly set s1, s2 to today (morning and evening), and s3 to yesterday
    target_day = datetime(2026, 9, 9)
    db_s1 = db_session.query(Sale).filter(Sale.id == s1.id).first()
    db_s1.created_at = datetime(2026, 9, 9, 9, 30, 0)

    db_s2 = db_session.query(Sale).filter(Sale.id == s2.id).first()
    db_s2.created_at = datetime(2026, 9, 9, 21, 45, 0) # Late evening

    db_s3 = db_session.query(Sale).filter(Sale.id == s3.id).first()
    db_s3.created_at = datetime(2026, 9, 8, 14, 0, 0) # Yesterday
    db_session.commit()

    # Query with single day: start_date=2026-09-09, end_date=2026-09-09 (time.min)
    # This simulates frontend sending '2026-09-09' for Today preset
    today_results = list_sales(
        db_session,
        start_date=datetime(2026, 9, 9, 0, 0, 0),
        end_date=datetime(2026, 9, 9, 0, 0, 0)
    )

    today_ids = [s.id for s in today_results]
    assert s1.id in today_ids, "Morning sale should be included in single day filter"
    assert s2.id in today_ids, "Evening sale (21:45) must be included due to end_date normalization"
    assert s3.id not in today_ids, "Yesterday sale must not be included in today filter"

    # Query with yesterday only
    yesterday_results = list_sales(
        db_session,
        start_date=datetime(2026, 9, 8, 0, 0, 0),
        end_date=datetime(2026, 9, 8, 0, 0, 0)
    )
    yest_ids = [s.id for s in yesterday_results]
    assert s3.id in yest_ids, "Yesterday sale should be returned when filtering yesterday"
    assert s1.id not in yest_ids

def test_sales_search_and_product_matching(db_session):
    cust1 = create_customer(db_session, CustomerCreate(name="Usman Ghani", phone="03219876543"))
    prod1 = create_product(db_session, ProductCreate(
        name="UltraWide Monitor 34-inch",
        purchase_price=Decimal("40000.00"),
        selling_price=Decimal("55000.00"),
        opening_stock=Decimal("10.00")
    ))

    sale = create_sale(db_session, SaleCreate(
        customer_id=cust1.id,
        items=[SaleItemCreate(product_id=prod1["id"], quantity=Decimal("1.00"), unit_price=Decimal("55000.00"))],
        paid_amount=Decimal("55000.00")
    ))

    # 1. Search by exact receipt number
    res_receipt = list_sales(db_session, search=sale.receipt_number)
    assert len(res_receipt) >= 1
    assert any(s.id == sale.id for s in res_receipt)

    # 2. Search by receipt number with '#' prefix (e.g. #R-000001)
    res_hash = list_sales(db_session, search=f"#{sale.receipt_number}")
    assert any(s.id == sale.id for s in res_hash), "Searching with '#' prefix must match receipt"

    # 3. Search by product name within sale items
    res_product = list_sales(db_session, search="UltraWide")
    assert any(s.id == sale.id for s in res_product), "Searching by item product name must match sale"

    # 4. Search by customer phone
    res_phone = list_sales(db_session, search="03219876543")
    assert any(s.id == sale.id for s in res_phone)

def test_sales_payment_status_filter(db_session):
    cust = create_customer(db_session, CustomerCreate(name="Farooq", phone="03001239874"))
    prod = create_product(db_session, ProductCreate(
        name="USB Cable",
        purchase_price=Decimal("100.00"),
        selling_price=Decimal("200.00"),
        opening_stock=Decimal("50.00")
    ))

    # Paid sale
    s_paid = create_sale(db_session, SaleCreate(
        customer_id=cust.id,
        items=[SaleItemCreate(product_id=prod["id"], quantity=Decimal("1.00"), unit_price=Decimal("200.00"))],
        paid_amount=Decimal("200.00")
    ))
    # Unpaid sale
    s_unpaid = create_sale(db_session, SaleCreate(
        customer_id=cust.id,
        items=[SaleItemCreate(product_id=prod["id"], quantity=Decimal("1.00"), unit_price=Decimal("200.00"))],
        paid_amount=Decimal("0.00")
    ))

    res_paid = list_sales(db_session, payment_status="PAID")
    assert any(s.id == s_paid.id for s in res_paid)
    assert not any(s.id == s_unpaid.id for s in res_paid)

    res_unpaid = list_sales(db_session, payment_status="UNPAID")
    assert any(s.id == s_unpaid.id for s in res_unpaid)
    assert not any(s.id == s_paid.id for s in res_unpaid)
