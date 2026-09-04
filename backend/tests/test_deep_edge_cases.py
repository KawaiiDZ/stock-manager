import pytest
from datetime import datetime, date, time
from decimal import Decimal

def test_report_date_filtering_midnight_boundary(client):
    """Verify sales created today are captured even if end_date has 00:00:00 time or date string."""
    # 1. Create a product
    prod = client.post("/api/products", json={
        "name": "Midnight Boundary Prod",
        "purchase_price": 50,
        "selling_price": 100,
        "opening_stock": 20
    }).json()

    # 2. Record a sale
    sale_res = client.post("/api/sales", json={
        "items": [{"product_id": prod["id"], "quantity": 1.0, "unit_price": 100.0}],
        "paid_amount": 100.0
    })
    assert sale_res.status_code in [200, 201]
    sale_receipt = sale_res.json()["receipt_number"]

    today_str = date.today().isoformat()

    # 3. Query sales report with end_date as today 00:00:00 or date string
    report_res = client.get(f"/api/reports/sales?start_date={today_str}&end_date={today_str}")
    assert report_res.status_code == 200
    report = report_res.json()
    assert len(report) >= 1
    assert any(s["receipt_number"] == sale_receipt for s in report)

    # 4. Also check sales detail report
    detail_res = client.get(f"/api/reports/sales-detail?start_date={today_str}&end_date={today_str}")
    assert detail_res.status_code == 200
    detail_report = detail_res.json()
    assert len(detail_report) >= 1
    assert any(d["receipt_number"] == sale_receipt for d in detail_report)

def test_customer_ledger_no_double_credit_on_later_payment(client):
    """Verify that a sale with 0 initial payment does not double count debt payments in the ledger."""
    # 1. Create customer & product
    cust = client.post("/api/customers", json={"name": "Zero Down Ledger Cust", "phone": "03001234567"}).json()
    cust_id = cust["id"]

    prod = client.post("/api/products", json={
        "name": "Zero Down Prod",
        "purchase_price": 40,
        "selling_price": 100,
        "opening_stock": 10
    }).json()

    # 2. Sale with 0 initial payment (100% on credit)
    sale_res = client.post("/api/sales", json={
        "customer_id": cust_id,
        "items": [{"product_id": prod["id"], "quantity": 1.0, "unit_price": 100.0}],
        "paid_amount": 0.0
    })
    assert sale_res.status_code in [200, 201]

    # Customer due should be 100
    cust_data = client.get(f"/api/customers/{cust_id}").json()
    assert float(cust_data["current_due"]) == 100.0

    # 3. Later customer pays 40
    pay_res = client.post(f"/api/customers/{cust_id}/payments", json={"amount": 40.0, "payment_method": "Cash"})
    assert pay_res.status_code in [200, 201]

    cust_data2 = client.get(f"/api/customers/{cust_id}").json()
    assert float(cust_data2["current_due"]) == 60.0

    # 4. Fetch ledger
    ledger_res = client.get(f"/api/customers/{cust_id}/ledger")
    assert ledger_res.status_code == 200
    entries = ledger_res.json()

    # Must have exactly 2 entries: 1 invoice (debit 100, credit 0) and 1 payment (debit 0, credit 40)
    assert len(entries) == 2

    total_debit = sum(float(e["debit"]) for e in entries)
    total_credit = sum(float(e["credit"]) for e in entries)
    closing_balance = float(entries[-1]["balance"])

    assert total_debit == 100.0
    assert total_credit == 40.0
    assert closing_balance == 60.0
    # Strict parity with customer current_due
    assert closing_balance == float(cust_data2["current_due"])

def test_customer_ledger_checkout_down_payment_plus_subsequent_payment(client):
    """Verify ledger correctly tracks initial payment at sale time plus later customer payment."""
    cust = client.post("/api/customers", json={"name": "Partial Down Cust", "phone": "03009876543"}).json()
    cust_id = cust["id"]

    prod = client.post("/api/products", json={
        "name": "Partial Down Prod",
        "purchase_price": 50,
        "selling_price": 200,
        "opening_stock": 10
    }).json()

    # Sale: Rs. 200 total, Rs. 50 paid at checkout, Rs. 150 due
    sale_res = client.post("/api/sales", json={
        "customer_id": cust_id,
        "items": [{"product_id": prod["id"], "quantity": 1.0, "unit_price": 200.0}],
        "paid_amount": 50.0
    })
    assert sale_res.status_code in [200, 201]

    # Customer pays additional Rs. 50 later
    client.post(f"/api/customers/{cust_id}/payments", json={"amount": 50.0, "payment_method": "Bank Transfer"})

    cust_data = client.get(f"/api/customers/{cust_id}").json()
    assert float(cust_data["current_due"]) == 100.0

    # Check ledger
    entries = client.get(f"/api/customers/{cust_id}/ledger").json()
    total_debit = sum(float(e["debit"]) for e in entries)
    total_credit = sum(float(e["credit"]) for e in entries)
    closing_balance = float(entries[-1]["balance"])

    assert total_debit == 200.0
    assert total_credit == 100.0 # 50 at checkout + 50 later
    assert closing_balance == 100.0
    assert closing_balance == float(cust_data["current_due"])

def test_supplier_ledger_consistency_with_purchases_and_payments(client):
    """Verify supplier ledger tracks purchase credit, initial checkout debit, and subsequent payments."""
    sup = client.post("/api/suppliers", json={"name": "Ledger Test Supplier", "contact_person": "Ali"}).json()
    sup_id = sup["id"]

    prod = client.post("/api/products", json={"name": "Sup Prod", "purchase_price": 100, "selling_price": 150, "opening_stock": 0}).json()

    # Purchase: total Rs. 500, paid Rs. 200, due Rs. 300
    purch_res = client.post("/api/purchases", json={
        "supplier_id": sup_id,
        "items": [{"product_id": prod["id"], "quantity": 5.0, "unit_cost": 100.0}],
        "paid_amount": 200.0
    })
    assert purch_res.status_code in [200, 201]

    # Later pay remaining Rs. 300 to supplier
    pay_res = client.post(f"/api/suppliers/{sup_id}/payments", json={"amount": 300.0, "payment_method": "Cash"})
    assert pay_res.status_code in [200, 201]

    sup_data = client.get(f"/api/suppliers/{sup_id}").json()
    assert float(sup_data["current_due"]) == 0.0

    # Check supplier ledger
    entries = client.get(f"/api/suppliers/{sup_id}/ledger").json()
    total_credit = sum(float(e["credit"]) for e in entries)
    total_debit = sum(float(e["debit"]) for e in entries)
    closing_balance = float(entries[-1]["balance"])

    assert total_credit == 500.0 # Purchase bill is credit (we owe supplier)
    assert total_debit == 500.0 # 200 initial + 300 later paid
    assert closing_balance == 0.0
    assert closing_balance == float(sup_data["current_due"])

def test_deactivated_products_retrieval_and_filtering(client):
    """Verify filtering products by is_active=true vs is_active=false and product restoration."""
    prod = client.post("/api/products", json={"name": "Deactivate Filter Prod", "purchase_price": 10, "selling_price": 20, "opening_stock": 5}).json()
    p_id = prod["id"]

    # Active catalog contains it
    active_prods = client.get("/api/products?is_active=true").json()
    assert any(p["id"] == p_id for p in active_prods)

    # Soft-delete (deactivate)
    del_res = client.delete(f"/api/products/{p_id}")
    assert del_res.status_code == 200

    # Active catalog NO LONGER contains it
    active_after = client.get("/api/products?is_active=true").json()
    assert not any(p["id"] == p_id for p in active_after)

    # Deactivated catalog CONTAINS it
    deactive_prods = client.get("/api/products?is_active=false").json()
    assert any(p["id"] == p_id for p in deactive_prods)

    # Restore product
    restore_res = client.post(f"/api/products/{p_id}/restore")
    assert restore_res.status_code == 200

    # Active catalog contains it again
    active_final = client.get("/api/products?is_active=true").json()
    assert any(p["id"] == p_id for p in active_final)
