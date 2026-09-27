import pytest
from decimal import Decimal
from backend.app.services import (
    auth_service, sales_service, returns_service, quotation_service,
    customer_service, supplier_service, purchase_service, product_service,
    expense_service, bills_service
)
from backend.app.schemas.sales import SaleCreate, SaleItemCreate, SalesReturnCreate, SalesReturnItemCreate
from backend.app.schemas.quotation import QuotationCreate, QuotationItemCreate
from backend.app.schemas.customer import CustomerCreate, CustomerUpdate
from backend.app.schemas.supplier import SupplierCreate
from backend.app.schemas.purchase import PurchaseCreate, PurchaseItemCreate
from backend.app.schemas.product import ProductCreate
from backend.app.schemas.expenses import ExpenseCategoryCreate
from backend.app.schemas.bills import BillCategoryCreate
from backend.app.models.user import User
from backend.app.models.business import BusinessSettings
from backend.app.core.errors import BusinessRuleException

def test_section_1_auth_and_pin_fallback(db_session):
    # Verify fallback if user_id differs from 1
    # Ensure admin user exists
    admin = db_session.query(User).filter(User.username == "admin").first()
    assert admin is not None
    
    # Change password targeting ID 9999 (fallback to admin)
    res = auth_service.change_user_password(db_session, 9999, "admin123", "newpass123")
    assert res is True
    # Revert password back
    auth_service.change_user_password(db_session, admin.id, "newpass123", "admin123")

    # Verify PIN with fallback if id 9999
    valid = auth_service.verify_settings_pin(db_session, "1234")
    assert valid is True

def test_section_2_walk_in_credit_rejection_and_quantization(db_session):
    # Create product
    prod = product_service.create_product(db_session, ProductCreate(
        name="Quantization Test Item",
        purchase_price=Decimal("10.555"),
        selling_price=Decimal("25.333"),
        opening_stock=Decimal("100.00")
    ))

    # Walk-in customer credit purchase attempt must fail
    walk_in = db_session.query(customer_service.Customer).filter(customer_service.Customer.customer_id == "C-000001").first()
    assert walk_in is not None

    with pytest.raises(BusinessRuleException) as exc:
        sales_service.create_sale(db_session, SaleCreate(
            customer_id=walk_in.id,
            items=[SaleItemCreate(product_id=prod["id"], quantity=Decimal("2.00"), unit_price=Decimal("25.33"))],
            paid_amount=Decimal("10.00") # partial payment
        ))
    assert "Walk-in" in str(exc.value)

def test_section_4_manual_return_cash_refund_for_debt_free_customer(db_session):
    # Create product
    prod = product_service.create_product(db_session, ProductCreate(
        name="Return Test Item",
        purchase_price=Decimal("15.00"),
        selling_price=Decimal("30.00"),
        opening_stock=Decimal("50.00")
    ))

    # Create debt-free customer
    cust = customer_service.create_customer(db_session, CustomerCreate(
        name="Debt Free Customer",
        phone="03001234567"
    ))

    # Manual return without receipt
    ret = returns_service.create_sales_return(db_session, SalesReturnCreate(
        customer_id=cust.id,
        items=[SalesReturnItemCreate(
            product_id=prod["id"],
            quantity=Decimal("2.00"),
            unit_price=Decimal("30.00")
        )],
        reason="Manual Return by Debt-Free Customer"
    ))

    # Since customer owed Rs. 0.00, they must receive cash refund of Rs. 60.00, not phantom balance credit
    assert ret.total_return_amount == Decimal("60.00")
    assert ret.cash_refund_amount == Decimal("60.00")
    assert ret.balance_credit_amount == Decimal("0.00")

def test_section_4_manual_return_credit_for_customer_with_debt(db_session):
    prod = product_service.create_product(db_session, ProductCreate(
        name="Return Debt Item",
        purchase_price=Decimal("20.00"),
        selling_price=Decimal("40.00"),
        opening_stock=Decimal("50.00")
    ))

    cust = customer_service.create_customer(db_session, CustomerCreate(
        name="Indebted Customer",
        phone="03009876543"
    ))

    # Create unpaid sale to establish debt of Rs. 40.00
    sales_service.create_sale(db_session, SaleCreate(
        customer_id=cust.id,
        items=[SaleItemCreate(product_id=prod["id"], quantity=Decimal("1.00"), unit_price=Decimal("40.00"))],
        paid_amount=Decimal("0.00")
    ))
    assert customer_service.get_customer_due(db_session, cust.id) == Decimal("40.00")

    # Manual return of Rs. 60.00 worth of goods
    ret = returns_service.create_sales_return(db_session, SalesReturnCreate(
        customer_id=cust.id,
        items=[SalesReturnItemCreate(
            product_id=prod["id"],
            quantity=Decimal("1.50"),
            unit_price=Decimal("40.00")
        )],
        reason="Manual return with debt"
    ))

    # Rs. 40 should clear their debt, and remaining Rs. 20 refunded in cash
    assert ret.total_return_amount == Decimal("60.00")
    assert ret.balance_credit_amount == Decimal("40.00")
    assert ret.cash_refund_amount == Decimal("20.00")
    assert customer_service.get_customer_due(db_session, cust.id) == Decimal("0.00")

def test_section_5_quotation_atomic_revision(db_session):
    prod = product_service.create_product(db_session, ProductCreate(
        name="Quotation Revision Prod",
        purchase_price=Decimal("100.00"),
        selling_price=Decimal("150.00"),
        opening_stock=Decimal("20.00")
    ))

    # Create initial quotation
    q1 = quotation_service.create_quotation(db_session, QuotationCreate(
        customer_name="Agreement Client",
        customer_phone="03120000000",
        items=[QuotationItemCreate(
            product_id=prod["id"],
            quantity=Decimal("2.00"),
            unit_price=Decimal("150.00")
        )]
    ))
    assert q1.status == "PENDING"

    # Revise quotation
    q2 = quotation_service.revise_quotation(db_session, q1.id, QuotationCreate(
        customer_id=q1.customer_id,
        customer_name="Agreement Client",
        customer_phone="03120000000",
        items=[QuotationItemCreate(
            product_id=prod["id"],
            quantity=Decimal("3.00"),
            unit_price=Decimal("140.00")
        )],
        notes="Revised price agreed"
    ))

    # Verify q1 is SUPERSEDED and q2 is PENDING
    reloaded_q1 = quotation_service.get_quotation(db_session, q1.id)
    assert reloaded_q1.status == "SUPERSEDED"
    assert q2.status == "PENDING"
    assert q2.total_amount == Decimal("420.00")
    assert f"[Revised from {q1.quotation_number}]" in q2.notes

def test_section_9_additional_purchase_payment(db_session):
    supp = supplier_service.create_supplier(db_session, SupplierCreate(
        name="Direct Purchase Supplier",
        phone="03331112233"
    ))
    prod = product_service.create_product(db_session, ProductCreate(
        name="Purchased Item For Payment",
        purchase_price=Decimal("50.00"),
        selling_price=Decimal("80.00"),
        opening_stock=Decimal("0.00")
    ))

    # Create partially paid purchase: 10 units @ 50 = 500, paid 200, due 300
    po = purchase_service.create_purchase(db_session, PurchaseCreate(
        supplier_id=supp.id,
        items=[PurchaseItemCreate(product_id=prod["id"], quantity=Decimal("10.00"), unit_cost=Decimal("50.00"))],
        paid_amount=Decimal("200.00")
    ))
    assert po.payment_status == "PARTIALLY_PAID"
    assert po.due_amount == Decimal("300.00")

    # Record additional purchase payment of 300
    updated_po = purchase_service.record_additional_purchase_payment(
        db_session, po.id, Decimal("300.00"), payment_method="Bank Transfer"
    )
    assert updated_po.payment_status == "PAID"
    assert updated_po.due_amount == Decimal("0.00")
    assert updated_po.paid_amount == Decimal("500.00")

def test_section_11_12_deactivation_safeguards_with_active_balances(db_session):
    # Customer with debt cannot be deactivated
    cust = customer_service.create_customer(db_session, CustomerCreate(
        name="Debt Safeguard Customer",
        phone="03450001122"
    ))
    prod = product_service.create_product(db_session, ProductCreate(
        name="Safeguard Item",
        purchase_price=Decimal("10.00"),
        selling_price=Decimal("20.00"),
        opening_stock=Decimal("10.00")
    ))

    sales_service.create_sale(db_session, SaleCreate(
        customer_id=cust.id,
        items=[SaleItemCreate(product_id=prod["id"], quantity=Decimal("1.00"), unit_price=Decimal("20.00"))],
        paid_amount=Decimal("0.00")
    ))
    assert customer_service.get_customer_due(db_session, cust.id) == Decimal("20.00")

    with pytest.raises(BusinessRuleException) as exc_cust:
        customer_service.deactivate_customer(db_session, cust.id)
    assert "outstanding balance" in str(exc_cust.value)

    # Supplier with payable cannot be deactivated
    supp = supplier_service.create_supplier(db_session, SupplierCreate(
        name="Payable Safeguard Supplier",
        phone="03459998877"
    ))
    purchase_service.create_purchase(db_session, PurchaseCreate(
        supplier_id=supp.id,
        items=[PurchaseItemCreate(product_id=prod["id"], quantity=Decimal("5.00"), unit_cost=Decimal("10.00"))],
        paid_amount=Decimal("0.00")
    ))
    assert supplier_service.get_supplier_due(db_session, supp.id) == Decimal("50.00")

    with pytest.raises(BusinessRuleException) as exc_supp:
        supplier_service.deactivate_supplier(db_session, supp.id)
    assert "outstanding payable" in str(exc_supp.value)

def test_walk_in_customer_rename_protection(db_session):
    walk_in = db_session.query(customer_service.Customer).filter(customer_service.Customer.customer_id == "C-000001").first()
    assert walk_in is not None

    with pytest.raises(BusinessRuleException) as exc:
        customer_service.update_customer(db_session, walk_in.id, CustomerUpdate(name="Renamed Customer"))
    assert "cannot be renamed" in str(exc.value)

def test_category_case_insensitive_duplication(db_session):
    # Expense category
    expense_service.create_expense_category(db_session, ExpenseCategoryCreate(name="Stationery"))
    with pytest.raises(BusinessRuleException) as exc_exp:
        expense_service.create_expense_category(db_session, ExpenseCategoryCreate(name="stationery"))
    assert "already exists" in str(exc_exp.value)

    # Bill category
    bills_service.create_bill_category(db_session, BillCategoryCreate(name="Electricity"))
    with pytest.raises(BusinessRuleException) as exc_bill:
        bills_service.create_bill_category(db_session, BillCategoryCreate(name="electricity"))
    assert "already exists" in str(exc_bill.value)

