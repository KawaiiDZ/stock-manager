from decimal import Decimal
from backend.app.schemas.product import ProductCreate
from backend.app.schemas.customer import CustomerCreate
from backend.app.schemas.sales import SaleCreate, SaleItemCreate, SalesReturnCreate, SalesReturnItemCreate
from backend.app.services.product_service import create_product
from backend.app.services.customer_service import create_customer, get_customer
from backend.app.services.sales_service import create_sale
from backend.app.services.returns_service import create_sales_return

def test_sales_and_customer_returns_financial_rule(db_session):
    # Section 29 Example:
    # Original sale: Rs. 1500, Paid: Rs. 500, Due: Rs. 1000.
    # Return: Rs. 600.
    # Cash refund: Rs. 500 (max possible since customer only paid 500).
    # Remaining return value: Rs. 100 reduces customer's outstanding balance.
    # Final customer due: Rs. 900.

    cust = create_customer(db_session, CustomerCreate(name="Ahmed Khan", phone="03001112223"))
    prod = create_product(db_session, ProductCreate(
        name="Rice 1kg",
        purchase_price=Decimal("250.00"),
        selling_price=Decimal("300.00"),
        opening_stock=Decimal("50.00")
    ))

    # 1. Sale: 5 units of Rice @ Rs. 300 = Rs. 1500. Paid Rs. 500, Due Rs. 1000
    sale = create_sale(db_session, SaleCreate(
        customer_id=cust.id,
        items=[SaleItemCreate(
            product_id=prod["id"],
            quantity=Decimal("5.00"),
            unit_price=Decimal("300.00")
        )],
        paid_amount=Decimal("500.00")
    ))

    assert sale.total_amount == Decimal("1500.00")
    assert sale.paid_amount == Decimal("500.00")
    assert sale.due_amount == Decimal("1000.00")
    assert sale.payment_status == "PARTIALLY_PAID"

    cust_state1 = get_customer(db_session, cust.id)
    assert cust_state1.current_due == Decimal("1000.00")

    # 2. Return 2 units @ Rs. 300 = Rs. 600
    ret = create_sales_return(db_session, SalesReturnCreate(
        sale_id=sale.id,
        customer_id=cust.id,
        items=[SalesReturnItemCreate(
            product_id=prod["id"],
            quantity=Decimal("2.00"),
            unit_price=Decimal("300.00")
        )],
        reason="Defective packaging"
    ))

    assert ret.total_return_amount == Decimal("600.00")
    assert ret.cash_refund_amount == Decimal("500.00") # Never refund more than Rs. 500 paid
    assert ret.balance_credit_amount == Decimal("100.00") # Remaining Rs. 100 reduces due

    # 3. Customer outstanding due must now be exactly Rs. 900
    cust_state2 = get_customer(db_session, cust.id)
    assert cust_state2.current_due == Decimal("900.00")

    # 4. Stock must have been restored: was 50 - 5 = 45, now 45 + 2 = 47
    prod_check = db_session.query(ProductCreate).filter().first() if False else None
    from backend.app.services.product_service import get_product
    p_now = get_product(db_session, prod["id"])
    assert p_now["current_stock"] == Decimal("47.00")
