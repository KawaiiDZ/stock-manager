import pytest
from decimal import Decimal
from backend.app.services.settings_service import get_settings, update_settings
from backend.app.schemas.business import BusinessSettingsUpdate, BusinessSettingsResponse
from backend.app.services.product_service import create_product
from backend.app.schemas.product import ProductCreate
from backend.app.services.sales_service import create_sale, get_receipt_print_data
from backend.app.schemas.sales import SaleCreate, SaleItemCreate, PaymentSplit
from backend.app.services.customer_service import create_customer, record_customer_payment, get_customer_ledger
from backend.app.schemas.customer import CustomerCreate, CustomerPaymentCreate
from backend.app.services.supplier_service import create_supplier, record_supplier_payment, get_supplier_ledger
from backend.app.schemas.supplier import SupplierCreate, SupplierPaymentCreate
from backend.app.services.purchase_service import create_purchase
from backend.app.schemas.purchase import PurchaseCreate, PurchaseItemCreate

def test_settings_payment_accounts(db_session):
    s = get_settings(db_session)
    assert "Cash" in s.payment_accounts
    
    # Update payment accounts
    update_data = BusinessSettingsUpdate(
        payment_accounts=["Cash", "Easypaisa", "Jazzcash", "Meezan Bank"]
    )
    updated = update_settings(db_session, update_data)
    res = BusinessSettingsResponse.model_validate(updated)
    assert res.payment_accounts == ["Cash", "Easypaisa", "Jazzcash", "Meezan Bank"]

    # If user omits Cash, it should automatically be preserved
    update_data_no_cash = BusinessSettingsUpdate(
        payment_accounts=["Jazzcash", "SadaPay"]
    )
    updated2 = update_settings(db_session, update_data_no_cash)
    res2 = BusinessSettingsResponse.model_validate(updated2)
    assert "Cash" in res2.payment_accounts
    assert "SadaPay" in res2.payment_accounts

def test_sale_with_payment_splits(db_session):
    prod = create_product(db_session, ProductCreate(
        name="Split Test Item",
        purchase_price=Decimal("8000.00"),
        selling_price=Decimal("12000.00"),
        opening_stock=Decimal("10.00")
    ))

    # Create customer
    cust = create_customer(db_session, CustomerCreate(name="Split Customer", phone="03001234567"))

    # Create sale with split payment: 10,000 Cash + 2,000 Bank Transfer
    sale_data = SaleCreate(
        customer_id=cust.id,
        items=[SaleItemCreate(product_id=prod["id"], quantity=Decimal("1.00"), unit_price=Decimal("12000.00"))],
        paid_amount=Decimal("12000.00"),
        payment_splits=[
            PaymentSplit(payment_method="Cash", amount=Decimal("10000.00")),
            PaymentSplit(payment_method="Bank Transfer", amount=Decimal("2000.00"))
        ]
    )

    sale_res = create_sale(db_session, sale_data)
    assert sale_res.total_amount == Decimal("12000.00")
    assert sale_res.paid_amount == Decimal("12000.00")
    assert sale_res.due_amount == Decimal("0.00")
    assert sale_res.payment_status == "PAID"
    assert len(sale_res.payments) == 2
    
    methods = [pm.payment_method for pm in sale_res.payments]
    amounts = [pm.amount for pm in sale_res.payments]
    assert "Cash" in methods and "Bank Transfer" in methods
    assert Decimal("10000.00") in amounts and Decimal("2000.00") in amounts

    # Receipt print data
    print_data = get_receipt_print_data(db_session, sale_res.receipt_number)
    assert "Cash" in print_data.payment_method
    assert "Bank Transfer" in print_data.payment_method
    assert len(print_data.payments) == 2

def test_customer_ledger_payment_method(db_session):
    cust = create_customer(db_session, CustomerCreate(name="Ledger Cust", phone="03009998877"))
    prod = create_product(db_session, ProductCreate(
        name="Ledger Prod",
        purchase_price=Decimal("500.00"),
        selling_price=Decimal("1000.00"),
        opening_stock=Decimal("20.00")
    ))

    # Create partial credit sale of 10 units = 10,000. Paid 2000 via Cash, Due 8000
    create_sale(db_session, SaleCreate(
        customer_id=cust.id,
        items=[SaleItemCreate(product_id=prod["id"], quantity=Decimal("10.00"), unit_price=Decimal("1000.00"))],
        paid_amount=Decimal("2000.00"),
        payment_method="Cash"
    ))
    
    # Record payment of 5000 via Jazzcash
    record_customer_payment(db_session, cust.id, CustomerPaymentCreate(
        amount=Decimal("5000.00"),
        payment_method="Jazzcash",
        notes="Online transfer"
    ))

    # Record payment of 3000 via Bank Transfer
    record_customer_payment(db_session, cust.id, CustomerPaymentCreate(
        amount=Decimal("3000.00"),
        payment_method="Bank Transfer",
        notes="Bank deposit"
    ))

    ledger = get_customer_ledger(db_session, cust.id)
    # The ledger entries for payments should have payment_method set
    payment_entries = [e for e in ledger if e.type == "Payment"]
    assert len(payment_entries) == 3
    assert any(e.payment_method == "Cash" for e in payment_entries)
    assert any(e.payment_method == "Jazzcash" for e in payment_entries)
    assert any(e.payment_method == "Bank Transfer" for e in payment_entries)

def test_supplier_ledger_payment_method(db_session):
    supp = create_supplier(db_session, SupplierCreate(name="Ledger Supp", phone="03001112233"))
    prod = create_product(db_session, ProductCreate(
        name="Supplier Ledger Item",
        purchase_price=Decimal("500.00"),
        selling_price=Decimal("1000.00"),
        opening_stock=Decimal("0.00")
    ))

    # Purchase 50 units = 25,000. Paid 5,000 via Cash, Due 20,000
    create_purchase(db_session, PurchaseCreate(
        supplier_id=supp.id,
        items=[PurchaseItemCreate(product_id=prod["id"], quantity=Decimal("50.00"), unit_cost=Decimal("500.00"))],
        paid_amount=Decimal("5000.00")
    ))

    # Record supplier payment of 15,000 via Meezan Bank
    record_supplier_payment(db_session, supp.id, SupplierPaymentCreate(
        amount=Decimal("15000.00"),
        payment_method="Meezan Bank",
        notes="Online cheque deposit"
    ))

    ledger = get_supplier_ledger(db_session, supp.id)
    payment_entries = [e for e in ledger if e.type == "Payment"]
    assert len(payment_entries) == 2
    assert any(e.payment_method == "Cash" for e in payment_entries)
    assert any(e.payment_method == "Meezan Bank" for e in payment_entries)
