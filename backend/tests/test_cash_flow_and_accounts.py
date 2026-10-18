import pytest
from decimal import Decimal
from datetime import date
from backend.app.services.settings_service import get_settings, update_settings
from backend.app.schemas.business import BusinessSettingsUpdate
from backend.app.services.product_service import create_product
from backend.app.schemas.product import ProductCreate
from backend.app.services.customer_service import create_customer, record_customer_payment
from backend.app.schemas.customer import CustomerCreate, CustomerPaymentCreate
from backend.app.services.sales_service import create_sale
from backend.app.schemas.sales import SaleCreate, SaleItemCreate, PaymentSplit
from backend.app.services.account_service import get_cash_flow_summary, create_account_transfer, list_account_transfers
from backend.app.schemas.accounts import AccountTransferCreate
from backend.app.services.expense_service import create_expense, create_expense_category
from backend.app.schemas.expenses import ExpenseCreate, ExpenseCategoryCreate
from backend.app.services.dashboard_service import get_dashboard_stats, get_day_sales_detail
from backend.app.core.errors import BusinessRuleException

def test_sales_and_account_tracking_complete_flow(db_session):
    # 1. Setup payment accounts: Cash, Bank Transfer, Easypaisa
    update_settings(db_session, BusinessSettingsUpdate(
        payment_accounts=["Cash", "Bank Transfer", "Easypaisa"]
    ))

    # 2. Create products
    p1 = create_product(db_session, ProductCreate(
        name="Solar Inverter 5kW",
        purchase_price=Decimal("150000.00"),
        selling_price=Decimal("200000.00"),
        opening_stock=Decimal("10.00")
    ))
    p2 = create_product(db_session, ProductCreate(
        name="Solar Battery 48V",
        purchase_price=Decimal("80000.00"),
        selling_price=Decimal("100000.00"),
        opening_stock=Decimal("10.00")
    ))

    # 3. Create customer
    cust = create_customer(db_session, CustomerCreate(name="Ali Khan", phone="03001234567"))

    # Initial summary: 0 in all accounts
    summary0 = get_cash_flow_summary(db_session)
    acc_map0 = {a.account: a.current_balance for a in summary0.accounts}
    assert acc_map0["Cash"] == Decimal("0.00")
    assert acc_map0["Bank Transfer"] == Decimal("0.00")
    assert acc_map0["Easypaisa"] == Decimal("0.00")
    assert summary0.total_business_funds == Decimal("0.00")

    # 4. Sale 1: Full Payment via Bank Transfer (Rs. 200,000)
    s1 = create_sale(db_session, SaleCreate(
        customer_id=cust.id,
        items=[SaleItemCreate(product_id=p1["id"], quantity=Decimal("1.00"), unit_price=Decimal("200000.00"))],
        paid_amount=Decimal("200000.00"),
        payment_method="Bank Transfer"
    ))
    assert s1.payment_status == "PAID"

    summary1 = get_cash_flow_summary(db_session)
    acc_map1 = {a.account: a.current_balance for a in summary1.accounts}
    assert acc_map1["Bank Transfer"] == Decimal("200000.00")
    assert acc_map1["Cash"] == Decimal("0.00")
    assert summary1.total_business_funds == Decimal("200000.00")

    # 5. Sale 2: Partial Payment via Easypaisa
    # Total Rs. 100,000. Paid Rs. 30,000 via Easypaisa, Rs. 70,000 due
    s2 = create_sale(db_session, SaleCreate(
        customer_id=cust.id,
        items=[SaleItemCreate(product_id=p2["id"], quantity=Decimal("1.00"), unit_price=Decimal("100000.00"))],
        paid_amount=Decimal("30000.00"),
        payment_method="Easypaisa"
    ))
    assert s2.payment_status == "PARTIALLY_PAID"
    assert s2.due_amount == Decimal("70000.00")

    summary2 = get_cash_flow_summary(db_session)
    acc_map2 = {a.account: a.current_balance for a in summary2.accounts}
    assert acc_map2["Bank Transfer"] == Decimal("200000.00")
    assert acc_map2["Easypaisa"] == Decimal("30000.00")
    assert acc_map2["Cash"] == Decimal("0.00")
    assert summary2.total_business_funds == Decimal("230000.00")

    # 6. Customer Debt Repayment: Customer pays Rs. 50,000 of the debt via Cash
    record_customer_payment(db_session, cust.id, CustomerPaymentCreate(
        amount=Decimal("50000.00"),
        payment_method="Cash",
        notes="Cash repayment at shop"
    ))

    summary3 = get_cash_flow_summary(db_session)
    acc_map3 = {a.account: a.current_balance for a in summary3.accounts}
    assert acc_map3["Bank Transfer"] == Decimal("200000.00")
    assert acc_map3["Easypaisa"] == Decimal("30000.00")
    assert acc_map3["Cash"] == Decimal("50000.00")
    assert summary3.total_business_funds == Decimal("280000.00")

    # 7. Outflow test: Record an expense of Rs. 10,000 via Cash
    # Per user requirement: Outflows must NOT deduct from the business sales funds
    exp_cat = create_expense_category(db_session, ExpenseCategoryCreate(name="Shop Supplies"))
    create_expense(db_session, ExpenseCreate(
        category_id=exp_cat.id,
        title="Printer paper and stationery",
        amount=Decimal("10000.00"),
        payment_method="Cash",
        expense_date=date.today()
    ))

    summary_after_exp = get_cash_flow_summary(db_session)
    acc_map_exp = {a.account: a.current_balance for a in summary_after_exp.accounts}
    # Balances must remain unchanged by expenses!
    assert acc_map_exp["Cash"] == Decimal("50000.00")
    assert acc_map_exp["Bank Transfer"] == Decimal("200000.00")
    assert summary_after_exp.total_business_funds == Decimal("280000.00")

    # 8. Inter-Account Transfer: Transfer Rs. 40,000 from Cash to Bank Transfer (Bank deposit)
    tr = create_account_transfer(db_session, AccountTransferCreate(
        from_account="Cash",
        to_account="Bank Transfer",
        amount=Decimal("40000.00"),
        notes="Counter cash deposited to Meezan Bank"
    ))
    assert tr.transfer_number.startswith("TR-")
    assert tr.amount == Decimal("40000.00")

    summary4 = get_cash_flow_summary(db_session)
    acc_map4 = {a.account: a.current_balance for a in summary4.accounts}
    # Cash was 50,000 - 40,000 = 10,000
    assert acc_map4["Cash"] == Decimal("10000.00")
    # Bank Transfer was 200,000 + 40,000 = 240,000
    assert acc_map4["Bank Transfer"] == Decimal("240000.00")
    # Easypaisa unchanged: 30,000
    assert acc_map4["Easypaisa"] == Decimal("30000.00")
    # Total business funds remain preserved: 280,000
    assert summary4.total_business_funds == Decimal("280000.00")

    # 9. Verify Transfer History
    transfers = list_account_transfers(db_session)
    assert len(transfers) >= 1
    assert transfers[0].transfer_number == tr.transfer_number
    assert transfers[0].from_account == "Cash"
    assert transfers[0].to_account == "Bank Transfer"

    # 10. Verify Transfer Validation (cannot transfer to same account or exceed balance)
    with pytest.raises((BusinessRuleException, ValueError)):
        create_account_transfer(db_session, AccountTransferCreate(
            from_account="Cash",
            to_account="Cash",
            amount=Decimal("1000.00")
        ))

    # Cash currently has 10,000.00 remaining; attempting to transfer 15,000.00 must raise BusinessRuleException
    with pytest.raises(BusinessRuleException) as exc_info:
        create_account_transfer(db_session, AccountTransferCreate(
            from_account="Cash",
            to_account="Bank Transfer",
            amount=Decimal("15000.00")
        ))
    assert "cannot exceed available balance" in str(exc_info.value)

    # 11. Verify Today's Sales Account Breakdown
    today_stats = get_dashboard_stats(db_session)
    assert len(today_stats.today_account_breakdown) > 0
    bk_map = {b.account: b for b in today_stats.today_account_breakdown}
    assert "Bank Transfer" in bk_map
    assert bk_map["Bank Transfer"].sales_amount == Decimal("200000.00")
    assert "Easypaisa" in bk_map
    assert bk_map["Easypaisa"].sales_amount == Decimal("30000.00")
    assert "Cash" in bk_map
    assert bk_map["Cash"].total_collected == Decimal("50000.00")

    # 12. Verify Day Sales Detail Breakdown
    day_detail = get_day_sales_detail(db_session, date.today())
    assert len(day_detail.account_breakdown) > 0
    day_bk_map = {b.account: b for b in day_detail.account_breakdown}
    assert day_bk_map["Bank Transfer"].total_collected == Decimal("200000.00")
    assert day_bk_map["Easypaisa"].total_collected == Decimal("30000.00")
    assert day_bk_map["Cash"].total_collected == Decimal("50000.00")

def test_api_accounts_and_transfers_endpoints(client, db_session):
    # Test GET /api/accounts/summary
    res = client.get("/api/accounts/summary")
    assert res.status_code == 200
    data = res.json()
    assert "total_business_funds" in data
    assert "accounts" in data
    assert any(a["account"] == "Cash" for a in data["accounts"])

    # 1. Attempting transfer when Cash has 0 balance must return 400
    fail_res = client.post("/api/accounts/transfers", json={
        "from_account": "Cash",
        "to_account": "Bank Transfer",
        "amount": 5000.0,
        "notes": "API test transfer with zero balance"
    })
    assert fail_res.status_code == 400
    assert "available balance is Rs. 0.00" in fail_res.json()["detail"]

    # 2. Fund Cash by creating a product and recording a sale of Rs. 10,000
    p = create_product(db_session, ProductCreate(
        name="Cable 100m",
        purchase_price=Decimal("5000.00"),
        selling_price=Decimal("10000.00"),
        opening_stock=Decimal("10.00")
    ))
    create_sale(db_session, SaleCreate(
        items=[SaleItemCreate(product_id=p["id"], quantity=Decimal("1.00"), unit_price=Decimal("10000.00"))],
        paid_amount=Decimal("10000.00"),
        payment_method="Cash"
    ))

    # 3. Transfer 5,000 from Cash (balance 10,000) to Bank Transfer -> succeeds
    t_res = client.post("/api/accounts/transfers", json={
        "from_account": "Cash",
        "to_account": "Bank Transfer",
        "amount": 5000.0,
        "notes": "API test transfer"
    })
    assert t_res.status_code == 201
    transfer_data = t_res.json()
    assert transfer_data["transfer_number"].startswith("TR-")
    assert transfer_data["amount"] == "5000.00"

    # 4. Attempting to transfer 6,000 from Cash (only 5,000 left) -> returns 400
    exceed_res = client.post("/api/accounts/transfers", json={
        "from_account": "Cash",
        "to_account": "Bank Transfer",
        "amount": 6000.0,
        "notes": "Exceeding transfer"
    })
    assert exceed_res.status_code == 400
    assert "cannot exceed available balance" in exceed_res.json()["detail"]

    # Test GET /api/accounts/transfers
    list_res = client.get("/api/accounts/transfers")
    assert list_res.status_code == 200
    transfers = list_res.json()
    assert len(transfers) >= 1
    assert any(t["transfer_number"] == transfer_data["transfer_number"] for t in transfers)
