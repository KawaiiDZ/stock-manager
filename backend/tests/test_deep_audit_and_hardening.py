import pytest
from decimal import Decimal
from unittest.mock import patch
from sqlalchemy.exc import IntegrityError

from backend.app.schemas.sales import SaleCreate, SaleItemCreate
from backend.app.schemas.quotation import QuotationCreate, QuotationItemCreate
from backend.app.services.sales_service import create_sale
from backend.app.services.quotation_service import create_quotation
from backend.app.models.business import BusinessSettings
from backend.app.models.product import Product

def test_discounted_sale_return_accounting(client):
    """
    Verify that returning items from a sale with order-level discount computes
    the true effective net price, bounds balance credit to the sale's remaining debt,
    and produces zero phantom credit.
    """
    # 1. Create a customer
    c_res = client.post("/api/customers", json={"name": "Audit Customer", "phone": "03009998877", "address": "Audit St"})
    assert c_res.status_code in [200, 201]
    cust_id = c_res.json()["id"]

    # 2. Create a product: cost 50, price 100, stock 10
    p_res = client.post("/api/products", json={"name": "Discounted Widget", "purchase_price": 50, "selling_price": 100, "opening_stock": 10})
    assert p_res.status_code in [200, 201]
    prod_id = p_res.json()["id"]

    # 3. Create a sale: 2 items @ 100 = 200. Order discount = 20. Total = 180.
    # Customer pays 100. Due = 80.
    sale_payload = {
        "customer_id": cust_id,
        "items": [{"product_id": prod_id, "quantity": 2, "unit_price": 100, "discount_amount": 0}],
        "discount_amount": 20,
        "paid_amount": 100
    }
    s_res = client.post("/api/sales", json=sale_payload)
    assert s_res.status_code in [200, 201]
    sale_data = s_res.json()
    assert Decimal(str(sale_data["total_amount"])) == Decimal("180.00")
    assert Decimal(str(sale_data["paid_amount"])) == Decimal("100.00")
    assert Decimal(str(sale_data["due_amount"])) == Decimal("80.00")

    # Customer ledger balance should be exactly 80.00
    cust_check = client.get(f"/api/customers/{cust_id}").json()
    assert Decimal(str(cust_check["current_due"])) == Decimal("80.00")

    # 4. Return 1st item (worth 90):
    # Customer paid 100 in cash. Remaining refundable cash is 100.
    # Therefore, 1st item return refunds 90.00 in cash, balance credit = 0.00.
    ret_payload1 = {
        "sale_id": sale_data["id"],
        "customer_id": cust_id,
        "items": [{"product_id": prod_id, "quantity": 1, "unit_price": 100}],
        "reason": "Wrong item"
    }
    r_res1 = client.post("/api/returns", json=ret_payload1)
    assert r_res1.status_code in [200, 201]
    ret_data1 = r_res1.json()
    assert Decimal(str(ret_data1["total_return_amount"])) == Decimal("90.00")
    assert Decimal(str(ret_data1["cash_refund_amount"])) == Decimal("90.00")
    assert Decimal(str(ret_data1["balance_credit_amount"])) == Decimal("0.00")

    # 5. Return 2nd item (worth 90):
    # Only 10.00 remaining refundable cash left (100 - 90).
    # Remaining debt on sale is 80.00.
    # Therefore: cash_refund = 10.00, balance_credit = 80.00 (debt canceled).
    ret_payload2 = {
        "sale_id": sale_data["id"],
        "customer_id": cust_id,
        "items": [{"product_id": prod_id, "quantity": 1, "unit_price": 100}],
        "reason": "Second item defective"
    }
    r_res2 = client.post("/api/returns", json=ret_payload2)
    assert r_res2.status_code in [200, 201]
    ret_data2 = r_res2.json()
    assert Decimal(str(ret_data2["total_return_amount"])) == Decimal("90.00")
    assert Decimal(str(ret_data2["cash_refund_amount"])) == Decimal("10.00")
    assert Decimal(str(ret_data2["balance_credit_amount"])) == Decimal("80.00")

    # 6. Verify customer balance is exactly 0.00 (not negative phantom credit)
    cust_after = client.get(f"/api/customers/{cust_id}").json()
    assert Decimal(str(cust_after["current_due"])) == Decimal("0.00")

    # 7. Verify sale due amount is now 0.00
    sale_after = client.get(f"/api/sales/{sale_data['id']}").json()
    assert Decimal(str(sale_after["due_amount"])) == Decimal("0.00")

def test_walkin_customer_return_no_balance_credit(client):
    """
    Verify Walk-in customer returns never create ledger balance credit.
    """
    p_res = client.post("/api/products", json={"name": "Walkin Widget", "purchase_price": 20, "selling_price": 60, "opening_stock": 5})
    assert p_res.status_code in [200, 201]
    prod_id = p_res.json()["id"]

    # Walk-in sale (C-000001) fully paid
    s_res = client.post("/api/sales", json={
        "customer_name": "Walk-in Customer",
        "items": [{"product_id": prod_id, "quantity": 1, "unit_price": 60}],
        "paid_amount": 60
    })
    assert s_res.status_code in [200, 201]
    sale_data = s_res.json()

    # Process return
    r_res = client.post("/api/returns", json={
        "sale_id": sale_data["id"],
        "customer_id": sale_data["customer_id"],
        "items": [{"product_id": prod_id, "quantity": 1, "unit_price": 60}],
        "reason": "Defective"
    })
    assert r_res.status_code in [200, 201]
    ret_data = r_res.json()
    assert Decimal(str(ret_data["balance_credit_amount"])) == Decimal("0.00")
    assert Decimal(str(ret_data["cash_refund_amount"])) == Decimal("60.00")

def test_reset_database_wipes_quotations_cleanly(client):
    """
    Verify that resetting database wipes quotations without foreign key violations or orphaned records.
    """
    # 1. Create product and customer
    p_res = client.post("/api/products", json={"name": "Reset Quote Prod", "purchase_price": 10, "selling_price": 20, "opening_stock": 5})
    assert p_res.status_code in [200, 201]
    prod_id = p_res.json()["id"]

    c_res = client.post("/api/customers", json={"name": "Reset Quote Cust", "phone": "03112233445"})
    assert c_res.status_code in [200, 201]
    cust_id = c_res.json()["id"]

    # 2. Create quotation
    q_res = client.post("/api/quotations", json={
        "customer_id": cust_id,
        "customer_name": "Reset Quote Cust",
        "customer_phone": "03112233445",
        "items": [{"product_id": prod_id, "quantity": 2, "unit_price": 20}]
    })
    assert q_res.status_code in [200, 201]
    assert len(client.get("/api/quotations").json()) >= 1

    # 3. Reset INVENTORY
    reset_inv = client.post("/api/settings/reset-data", json={"wipe_mode": "inventory_only", "confirm_pin": "1234"})
    assert reset_inv.status_code == 200
    assert len(client.get("/api/quotations").json()) == 0

    # 4. Create another quotation and reset ALL_DATA
    p2 = client.post("/api/products", json={"name": "Reset All Prod", "purchase_price": 10, "selling_price": 20, "opening_stock": 5}).json()["id"]
    c2 = client.post("/api/customers", json={"name": "Reset All Cust", "phone": "03223344556"}).json()["id"]
    client.post("/api/quotations", json={
        "customer_id": c2,
        "customer_name": "Reset All Cust",
        "customer_phone": "03223344556",
        "items": [{"product_id": p2, "quantity": 1, "unit_price": 20}]
    })

    reset_all = client.post("/api/settings/reset-data", json={"wipe_mode": "all_data", "confirm_pin": "1234"})
    assert reset_all.status_code == 200
    assert len(client.get("/api/quotations").json()) == 0

def test_permanent_product_deletion_blocked_by_quotation(client):
    """
    Verify that a product referenced in a quotation cannot be permanently deleted.
    """
    p_res = client.post("/api/products", json={"name": "Quote Locked Prod", "purchase_price": 10, "selling_price": 25, "opening_stock": 5})
    assert p_res.status_code in [200, 201]
    prod_id = p_res.json()["id"]

    c_res = client.post("/api/customers", json={"name": "Quote Locked Cust", "phone": "03334455667"})
    assert c_res.status_code in [200, 201]
    cust_id = c_res.json()["id"]

    q_res = client.post("/api/quotations", json={
        "customer_id": cust_id,
        "customer_name": "Quote Locked Cust",
        "customer_phone": "03334455667",
        "items": [{"product_id": prod_id, "quantity": 1, "unit_price": 25}]
    })
    assert q_res.status_code in [200, 201]

    # Deactivate product
    client.delete(f"/api/products/{prod_id}")

    # Permanent delete attempt must be blocked
    del_res = client.delete(f"/api/products/{prod_id}/permanent")
    assert del_res.status_code == 400
    assert "transaction history or quotations" in del_res.json()["detail"].lower()

def test_date_range_inversion_tolerance(client):
    """
    Verify that passing inverted date ranges (start_date > end_date) is auto-normalized
    across sales, purchases, expenses, and report endpoints without throwing errors or returning empty data.
    """
    # Create a product
    p_res = client.post("/api/products", json={"name": "Invert Date Prod", "purchase_price": 30, "selling_price": 50, "opening_stock": 10})
    assert p_res.status_code in [200, 201]
    prod_id = p_res.json()["id"]

    # Create a sale
    client.post("/api/sales", json={
        "items": [{"product_id": prod_id, "quantity": 1, "unit_price": 50}],
        "paid_amount": 50
    })

    # Create supplier & purchase
    sup = client.post("/api/suppliers", json={"name": "Invert Date Sup", "phone": "03445566778"}).json()
    client.post("/api/purchases", json={
        "supplier_id": sup["id"],
        "items": [{"product_id": prod_id, "quantity": 2, "unit_cost": 30}],
        "paid_amount": 60
    })

    # Create expense category & expense
    ecat = client.post("/api/expense-categories", json={"name": "Office Supplies"}).json()
    client.post("/api/expenses", json={
        "category_id": ecat["id"],
        "amount": 25,
        "title": "Notebooks",
        "payment_method": "CASH"
    })

    # Inverted date query: 2026-12-31 to 2026-01-01
    inv_params = "start_date=2026-12-31&end_date=2026-01-01"

    # 1. Sales query
    sales_res = client.get(f"/api/sales?{inv_params}")
    assert sales_res.status_code == 200
    assert len(sales_res.json()) >= 1

    # 2. Purchases query
    purch_res = client.get(f"/api/purchases?{inv_params}")
    assert purch_res.status_code == 200
    assert len(purch_res.json()) >= 1

    # 3. Expenses query
    exp_res = client.get(f"/api/expenses?{inv_params}")
    assert exp_res.status_code == 200
    assert len(exp_res.json()) >= 1

    # 4. Reports - Sales
    r_sales = client.get(f"/api/reports/sales?{inv_params}")
    assert r_sales.status_code == 200
    assert len(r_sales.json()) >= 1

    # 5. Reports - Purchases
    r_purch = client.get(f"/api/reports/purchases?{inv_params}")
    assert r_purch.status_code == 200
    assert len(r_purch.json()) >= 1

    # 6. Reports - Expenses
    r_exp = client.get(f"/api/reports/expenses?{inv_params}")
    assert r_exp.status_code == 200
    assert len(r_exp.json()) >= 1

def test_pin_normalization_and_security(client):
    """
    Verify PIN whitespace trimming and validation rules.
    """
    # PIN with leading and trailing spaces
    v_res = client.post("/api/auth/verify-pin", json={"pin": "  1234  "})
    assert v_res.status_code == 200
    assert v_res.json()["valid"] is True

    # Change PIN with whitespace
    ch_res = client.post("/api/auth/change-pin", json={"current_pin": " 1234 ", "new_pin": " 5678 "})
    assert ch_res.status_code == 200
    assert ch_res.json()["success"] is True

    # Verify new PIN
    v2_res = client.post("/api/auth/verify-pin", json={"pin": "5678"})
    assert v2_res.status_code == 200
    assert v2_res.json()["valid"] is True

    # Invalid non-numeric PIN
    bad_res = client.post("/api/auth/change-pin", json={"current_pin": "5678", "new_pin": "abcd"})
    assert bad_res.status_code == 400
    assert "numeric digits" in bad_res.json()["detail"].lower()

def test_collision_retry_mechanisms(db_session):
    """
    Verify that create_sale and create_quotation retry automatically if a receipt or quotation number collision occurs.
    """
    # Create product
    p_res = Product(name="Collision Item", purchase_price=Decimal("10.00"), selling_price=Decimal("20.00"), current_stock=Decimal("10.00"), is_active=True, product_id="P-000001")
    db_session.add(p_res)
    db_session.commit()
    db_session.refresh(p_res)

    # Test sale retry logic: simulate collision on first attempt
    orig_execute_sale = "backend.app.services.sales_service._execute_create_sale"
    calls = {"count": 0}

    def mocked_execute_sale(db, data):
        calls["count"] += 1
        if calls["count"] == 1:
            raise IntegrityError("mock statement", {}, Exception("mock receipt_number UNIQUE constraint failed"))
        return {"id": 1, "receipt_number": "REC-RETRY-OK"}

    with patch(orig_execute_sale, side_effect=mocked_execute_sale):
        sale_payload = SaleCreate(
            items=[SaleItemCreate(product_id=p_res.id, quantity=Decimal("1.0"), unit_price=Decimal("20.0"))],
            paid_amount=Decimal("20.0")
        )
        result = create_sale(db_session, sale_payload)
        assert result["receipt_number"] == "REC-RETRY-OK"
        assert calls["count"] == 2

    # Test quotation retry logic: simulate collision on first attempt
    orig_execute_quote = "backend.app.services.quotation_service._execute_create_quotation"
    quote_calls = {"count": 0}

    def mocked_execute_quote(db, data):
        quote_calls["count"] += 1
        if quote_calls["count"] == 1:
            raise IntegrityError("mock statement", {}, Exception("mock quotation_number UNIQUE constraint failed"))
        return {"id": 1, "quotation_number": "QT-RETRY-OK"}

    with patch(orig_execute_quote, side_effect=mocked_execute_quote):
        quote_payload = QuotationCreate(
            customer_name="Retry Cust",
            customer_phone="03001112233",
            items=[QuotationItemCreate(product_id=p_res.id, quantity=Decimal("1.0"), unit_price=Decimal("20.0"))]
        )
        q_result = create_quotation(db_session, quote_payload)
        assert q_result["quotation_number"] == "QT-RETRY-OK"
        assert quote_calls["count"] == 2
