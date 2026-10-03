from decimal import Decimal
from backend.app.schemas.product import ProductCreate
from backend.app.schemas.customer import CustomerCreate, CustomerPaymentCreate
from backend.app.schemas.sales import SaleCreate, SaleItemCreate
from backend.app.services.product_service import create_product
from backend.app.services.customer_service import (
    create_customer,
    get_customer,
    record_customer_payment,
    get_customer_ledger
)
from backend.app.services.sales_service import create_sale

def test_customer_progressive_bill_payoff(db_session):
    # Setup Customer & Product with inventory
    cust = create_customer(db_session, CustomerCreate(name="Ahmed Khan", phone="03001234567"))
    prod = create_product(db_session, ProductCreate(
        name="Designer Silk",
        purchase_price=Decimal("500.00"),
        selling_price=Decimal("1000.00"),
        opening_stock=Decimal("200.00")
    ))

    # Scenario:
    # 1. Invoice 1 (R-000001): 100 units @ 1000 = Rs. 100,000. Downpayment at checkout: Rs. 20,000.
    #    Expected: Bill 100k, Paid 20k, Remaining 80k.
    sale1 = create_sale(db_session, SaleCreate(
        customer_id=cust.id,
        items=[SaleItemCreate(
            product_id=prod["id"],
            quantity=Decimal("100.00"),
            unit_price=Decimal("1000.00")
        )],
        paid_amount=Decimal("20000.00"),
        payment_method="Cash"
    ))

    ledger1 = get_customer_ledger(db_session, cust.id)
    assert len(ledger1) == 2
    # Row 1: Sale invoice creation
    assert ledger1[0].type == "Sale"
    assert ledger1[0].bill_amount == Decimal("100000.00")
    assert ledger1[0].paid_amount == Decimal("0.00")
    assert ledger1[0].bill_remaining == Decimal("100000.00")
    assert ledger1[0].balance == Decimal("100000.00")

    # Row 2: Downpayment at checkout
    assert ledger1[1].type == "Payment"
    assert ledger1[1].bill_amount == Decimal("100000.00")
    assert ledger1[1].paid_amount == Decimal("20000.00")
    assert ledger1[1].bill_remaining == Decimal("80000.00")
    assert ledger1[1].balance == Decimal("80000.00")

    # 2. Next payment: customer pays another Rs. 20,000 via Ledger Payment.
    #    Expected: Bill 100k, Paid 20k, Remaining 60k.
    record_customer_payment(db_session, cust.id, CustomerPaymentCreate(amount=Decimal("20000.00")))
    ledger2 = get_customer_ledger(db_session, cust.id)
    assert len(ledger2) == 3
    assert ledger2[2].type == "Payment"
    assert ledger2[2].bill_reference == sale1.receipt_number
    assert ledger2[2].bill_amount == Decimal("100000.00")
    assert ledger2[2].paid_amount == Decimal("20000.00")
    assert ledger2[2].bill_remaining == Decimal("60000.00")
    assert ledger2[2].balance == Decimal("60000.00")

    # 3. Create a SECOND separate bill: Invoice 2 (R-000002): 50 units @ 1000 = Rs. 50,000. Paid 0.
    #    Expected: Bill 50k, Paid 0, Remaining 50k. Total Account Balance = 60k + 50k = 110k.
    sale2 = create_sale(db_session, SaleCreate(
        customer_id=cust.id,
        items=[SaleItemCreate(
            product_id=prod["id"],
            quantity=Decimal("50.00"),
            unit_price=Decimal("1000.00")
        )],
        paid_amount=Decimal("0.00")
    ))

    ledger3 = get_customer_ledger(db_session, cust.id)
    assert len(ledger3) == 4
    assert ledger3[3].type == "Sale"
    assert ledger3[3].reference == sale2.receipt_number
    assert ledger3[3].bill_reference == sale2.receipt_number
    assert ledger3[3].bill_amount == Decimal("50000.00")
    assert ledger3[3].paid_amount == Decimal("0.00")
    assert ledger3[3].bill_remaining == Decimal("50000.00")
    assert ledger3[3].balance == Decimal("110000.00")

    # 4. Now customer makes a payment of Rs. 70,000.
    #    FIFO allocation:
    #    - Sale 1 (R-000001) gets Rs. 60,000 -> fully settles Sale 1 (Remaining: 0.00).
    #    - Sale 2 (R-000002) gets Rs. 10,000 -> partially settles Sale 2 (Remaining: 40,000.00).
    #    - Total net balance left: Rs. 40,000.00.
    record_customer_payment(db_session, cust.id, CustomerPaymentCreate(amount=Decimal("70000.00")))
    ledger4 = get_customer_ledger(db_session, cust.id)
    assert len(ledger4) == 6

    # Payment row for Sale 1
    p_sale1 = [e for e in ledger4 if e.bill_reference == sale1.receipt_number and e.paid_amount == Decimal("60000.00")][0]
    assert p_sale1.bill_amount == Decimal("100000.00")
    assert p_sale1.bill_remaining == Decimal("0.00")

    # Payment row for Sale 2
    p_sale2 = [e for e in ledger4 if e.bill_reference == sale2.receipt_number and e.paid_amount == Decimal("100000.00") or (e.bill_reference == sale2.receipt_number and e.paid_amount == Decimal("10000.00"))][0]
    assert p_sale2.bill_amount == Decimal("50000.00")
    assert p_sale2.bill_remaining == Decimal("40000.00")

    # Final overall account balance is 40,000.00
    assert ledger4[-1].balance == Decimal("40000.00")
