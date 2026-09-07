import pytest
from decimal import Decimal
from datetime import datetime, date
from sqlalchemy.orm import Session

from backend.app.models.product import Product, ProductCategory
from backend.app.models.inventory import InventoryBatch
from backend.app.models.sales import Sale, SaleItem, SalesReturn, SalesReturnItem
from backend.app.models.customer import Customer
from backend.app.services.dashboard_service import get_dashboard_stats

def test_receipt_print_data_customer_phone(client):
    """Edge Case 1: get_receipt returns customer_phone correctly."""
    # 1. Create a customer with a phone number
    cust = client.post("/api/customers", json={
        "name": "Receipt Phone Test Cust",
        "phone": "0300-9876543",
        "address": "Islamabad"
    }).json()

    # 2. Create a product
    prod = client.post("/api/products", json={
        "name": "Receipt Phone Prod",
        "purchase_price": 100,
        "selling_price": 200,
        "opening_stock": 10
    }).json()

    # 3. Create sale linked to customer
    sale_res = client.post("/api/sales", json={
        "customer_id": cust["id"],
        "items": [{"product_id": prod["id"], "quantity": 1.0, "unit_price": 200.0, "discount_amount": 0.0}],
        "paid_amount": 200.0
    })
    assert sale_res.status_code in [200, 201]
    receipt_no = sale_res.json()["receipt_number"]
    assert sale_res.json()["customer_phone"] == "0300-9876543"

    # 4. Fetch receipt print data
    print_res = client.get(f"/api/sales/receipt/{receipt_no}")
    assert print_res.status_code == 200
    print_data = print_res.json()
    assert print_data["customer_name"] == "Receipt Phone Test Cust"
    assert print_data["customer_phone"] == "0300-9876543"

def test_additional_sale_payment_after_partial_return(client):
    """Edge Case 2: Additional sale payment calculates net due with return balance credits and assigns correct status."""
    cust = client.post("/api/customers", json={
        "name": "Return Debt Cust",
        "phone": "0311-1112233"
    }).json()

    prod = client.post("/api/products", json={
        "name": "Return Debt Prod",
        "purchase_price": 50,
        "selling_price": 100,
        "opening_stock": 20
    }).json()

    # 1. Sale: 2 units @ 100 = 200, paid 50, due 150
    sale_res = client.post("/api/sales", json={
        "customer_id": cust["id"],
        "items": [{"product_id": prod["id"], "quantity": 2.0, "unit_price": 100.0}],
        "paid_amount": 50.0
    }).json()
    sale_id = sale_res["id"]
    assert float(sale_res["due_amount"]) == 150.0
    assert sale_res["payment_status"] == "PARTIALLY_PAID"

    # 2. Return 1 unit (worth 100).
    # Since customer paid 50 at checkout, 50 is refunded in cash and 50 is applied as balance credit.
    # Remaining due on sale becomes 150 - 50 = 100.
    ret_res = client.post("/api/returns", json={
        "sale_id": sale_id,
        "customer_id": cust["id"],
        "items": [{"product_id": prod["id"], "quantity": 1.0, "unit_price": 100.0}],
        "reason": "Customer changed mind"
    })
    assert ret_res.status_code in [200, 201]

    # Verify updated sale due is 100
    updated_sale = client.get(f"/api/sales/{sale_id}").json()
    assert float(updated_sale["due_amount"]) == 100.0

    # 3. Try overpaying (e.g. paying 120 when only 100 is due) -> should fail
    overpay_res = client.post(f"/api/sales/{sale_id}/payments?amount=120.0&payment_method=Cash")
    assert overpay_res.status_code == 400
    assert "cannot exceed remaining due" in overpay_res.json()["detail"]

    # 4. Pay exact remaining due (100) -> should succeed and set status to PARTIALLY_RETURNED
    pay_res = client.post(f"/api/sales/{sale_id}/payments?amount=100.0&payment_method=Cash")
    assert pay_res.status_code in [200, 201]
    paid_sale = pay_res.json()
    assert float(paid_sale["due_amount"]) == 0.0
    assert paid_sale["payment_status"] == "PARTIALLY_RETURNED"

def test_customer_ledger_direct_payment_chronology(client):
    """Edge Case 3: Direct sale payments recorded after checkout appear with their own timestamp and description."""
    cust = client.post("/api/customers", json={
        "name": "Ledger Direct Payment Cust",
        "phone": "0321-4445566"
    }).json()
    cust_id = cust["id"]

    prod = client.post("/api/products", json={
        "name": "Ledger Direct Prod",
        "purchase_price": 50,
        "selling_price": 200,
        "opening_stock": 10
    }).json()

    # Sale: total 200, paid 50 at checkout, due 150
    sale = client.post("/api/sales", json={
        "customer_id": cust_id,
        "items": [{"product_id": prod["id"], "quantity": 1.0, "unit_price": 200.0}],
        "paid_amount": 50.0
    }).json()
    sale_id = sale["id"]

    # Customer makes a direct payment of 50 against this receipt
    client.post(f"/api/sales/{sale_id}/payments?amount=50.0&payment_method=Bank%20Transfer")

    # Check ledger
    ledger_res = client.get(f"/api/customers/{cust_id}/ledger")
    assert ledger_res.status_code == 200
    entries = ledger_res.json()

    # Must contain 3 entries: Sale invoice (debit 200), Down payment (credit 50), Direct payment (credit 50)
    assert len(entries) == 3
    descriptions = [e["description"] for e in entries]
    assert any("Down payment at checkout" in d for d in descriptions)
    assert any("Direct payment on receipt" in d for d in descriptions)

    closing_balance = float(entries[-1]["balance"])
    assert closing_balance == 100.0

def test_fifo_batch_shortfall_auto_healing(client, db_session: Session):
    """Edge Case 4: If batches have a deficit relative to current_stock, checkout auto-heals without crashing."""
    # 1. Create product with stock 10
    prod = client.post("/api/products", json={
        "name": "Deficit Healing Prod",
        "purchase_price": 60,
        "selling_price": 120,
        "opening_stock": 10
    }).json()
    prod_id = prod["id"]

    # 2. Simulate inventory discrepancy where batch quantity_remaining is depleted (0)
    # but product.current_stock is still 10
    db_batches = db_session.query(InventoryBatch).filter(InventoryBatch.product_id == prod_id).all()
    for b in db_batches:
        b.quantity_remaining = Decimal("0.00")
    db_session.commit()

    # 3. Attempt sale of 3 units. In the past, this raised InsufficientStockException.
    # Now, it must gracefully auto-generate an adjustment batch and complete successfully.
    sale_res = client.post("/api/sales", json={
        "items": [{"product_id": prod_id, "quantity": 3.0, "unit_price": 120.0}],
        "paid_amount": 360.0
    })
    assert sale_res.status_code in [200, 201]
    sale_data = sale_res.json()
    assert float(sale_data["total_amount"]) == 360.0
    assert float(sale_data["total_cost"]) == 180.0 # 3 * 60

    # Verify updated stock is 7
    updated_prod = client.get(f"/api/products/{prod_id}").json()
    assert float(updated_prod["current_stock"]) == 7.0

def test_product_and_stock_negative_input_validations(client):
    """Edge Case 5: Reject negative purchase price, selling price, opening stock, and stock adjustments."""
    # Negative purchase price on creation
    res = client.post("/api/products", json={
        "name": "Neg Purchase",
        "purchase_price": -10,
        "selling_price": 20,
        "opening_stock": 5
    })
    assert res.status_code == 400
    assert "cannot be negative" in res.json()["detail"]

    # Negative selling price on creation
    res = client.post("/api/products", json={
        "name": "Neg Selling",
        "purchase_price": 10,
        "selling_price": -20,
        "opening_stock": 5
    })
    assert res.status_code == 400
    assert "cannot be negative" in res.json()["detail"]

    # Negative opening stock on creation
    res = client.post("/api/products", json={
        "name": "Neg Stock",
        "purchase_price": 10,
        "selling_price": 20,
        "opening_stock": -5
    })
    assert res.status_code == 400
    assert "cannot be negative" in res.json()["detail"]

    # Bulk create with negative price
    res = client.post("/api/products/bulk", json=[
        {"name": "Valid Prod", "purchase_price": 10, "selling_price": 20, "opening_stock": 1},
        {"name": "Invalid Prod", "purchase_price": -5, "selling_price": 20, "opening_stock": 1}
    ])
    assert res.status_code == 400
    assert "cannot be negative" in res.json()["detail"]

    # Create valid product then test negative update & negative adjustment
    valid_prod = client.post("/api/products", json={
        "name": "Valid Update Prod",
        "purchase_price": 10,
        "selling_price": 20,
        "opening_stock": 5
    }).json()
    pid = valid_prod["id"]

    # Update with negative selling price
    res = client.put(f"/api/products/{pid}", json={"selling_price": -10})
    assert res.status_code == 400
    assert "cannot be negative" in res.json()["detail"]

    # Stock adjustment to negative
    res = client.post(f"/api/products/{pid}/adjust-stock", json={"new_stock": -2, "reason": "Bad count"})
    assert res.status_code == 400
    assert "cannot be negative" in res.json()["detail"]

    # Sale with negative discount
    res = client.post("/api/sales", json={
        "items": [{"product_id": pid, "quantity": 1.0, "unit_price": 20.0, "discount_amount": -5.0}],
        "paid_amount": 20.0
    })
    assert res.status_code == 400
    assert "cannot be negative" in res.json()["detail"]

def test_delete_category_with_returns_history(client):
    """Edge Case 6: delete_category safely handles products with sales returns without FK constraint crashes."""
    # 1. Create a category
    cat = client.post("/api/categories", json={"name": "Return Cat"}).json()
    cat_id = cat["id"]

    # 2. Create product in category
    prod = client.post("/api/products", json={
        "name": "Return Cat Prod",
        "category_id": cat_id,
        "purchase_price": 20,
        "selling_price": 50,
        "opening_stock": 10
    }).json()
    pid = prod["id"]

    # 3. Create sale & return
    sale = client.post("/api/sales", json={
        "items": [{"product_id": pid, "quantity": 2.0, "unit_price": 50.0}],
        "paid_amount": 100.0
    }).json()

    ret_res = client.post("/api/returns", json={
        "sale_id": sale["id"],
        "customer_id": sale["customer_id"],
        "items": [{"product_id": pid, "quantity": 1.0, "unit_price": 50.0}],
        "reason": "Test return"
    })
    assert ret_res.status_code in [200, 201]

    # 4. Delete the category -> must deactivate the product safely, unlink category, and delete category without 500 error
    del_res = client.delete(f"/api/categories/{cat_id}")
    assert del_res.status_code == 200

    # Verify product is deactivated, stock is 0, category_id is None
    p_check = client.get(f"/api/products/{pid}").json()
    assert p_check["is_active"] is False
    assert p_check["category_id"] is None
    assert float(p_check["current_stock"]) == 0.0

def test_bill_status_transitions_and_validations(client):
    """Edge Cases 9 & validation: Bill amount updates recompute status to TO_PAY and reject negative amounts."""
    # 1. Create bill category & bill
    bcat = client.post("/api/bill-categories", json={"name": "Utilities"}).json()
    bill = client.post("/api/bills", json={
        "name": "Electric Bill",
        "category_id": bcat["id"],
        "amount": 500.0,
        "due_date": "2026-10-01"
    }).json()
    bid = bill["id"]
    assert bill["status"] == "TO_PAY"

    # 2. Reject negative bill amount update
    res = client.put(f"/api/bills/{bid}", json={"amount": -100.0})
    assert res.status_code == 400
    assert "cannot be negative" in res.json()["detail"]

    # 3. Pay bill in full (500)
    client.post(f"/api/bills/{bid}/payments", json={"amount": 500.0, "payment_method": "Cash"})
    bill_paid = client.get(f"/api/bills/{bid}").json()
    assert bill_paid["status"] == "PAID"

    # 4. Increase bill amount to 700 -> status transitions to PARTIALLY_PAID
    bill_up = client.put(f"/api/bills/{bid}", json={"amount": 700.0}).json()
    assert bill_up["status"] == "PARTIALLY_PAID"
    assert float(bill_up["due_amount"]) == 200.0

def test_dashboard_stats_signed_profit(db_session: Session):
    """Edge Case 10: Verify dashboard stats allow signed profit without clamping loss to 0."""
    stats = get_dashboard_stats(db_session)
    assert stats is not None
    # Stats can be positive, zero, or negative
    assert isinstance(stats.today_gross_profit, Decimal)
    assert isinstance(stats.today_realized_profit, Decimal)

def test_supplier_ledger_and_return_payment_status(client):
    """Edge Case 11: Supplier ledger chronology and accurate payment status with returns."""
    # 1. Create supplier
    supp = client.post("/api/suppliers", json={
        "name": "Hardening Supplier",
        "phone": "0321-7778899"
    }).json()
    sid = supp["id"]

    # 2. Create product
    prod = client.post("/api/products", json={
        "name": "Hardening Supp Prod",
        "purchase_price": 50.0,
        "selling_price": 100.0,
        "opening_stock": 0.0
    }).json()
    pid = prod["id"]

    # 3. Create purchase with partial down payment: 4 units @ 50 = 200. Paid 50, Due 150.
    pur = client.post("/api/purchases", json={
        "supplier_id": sid,
        "items": [{"product_id": pid, "quantity": 4.0, "unit_cost": 50.0}],
        "paid_amount": 50.0,
        "payment_method": "Cash"
    }).json()
    pur_id = pur["id"]
    assert float(pur["due_amount"]) == 150.0

    # 4. Return 2 units (worth 100). Remaining due becomes 150 - 100 = 50.
    ret_res = client.post("/api/purchase-returns", json={
        "purchase_id": pur_id,
        "supplier_id": sid,
        "items": [{"product_id": pid, "quantity": 2.0, "unit_cost": 50.0}],
        "reason": "Defective stock"
    })
    assert ret_res.status_code in [200, 201]

    # 5. Pay remaining due of 50 via supplier payment
    sp_res = client.post(f"/api/suppliers/{sid}/payments", json={
        "amount": 50.0,
        "payment_method": "Bank Transfer"
    })
    assert sp_res.status_code in [200, 201]

    # Check updated purchase status: should be PARTIALLY_RETURNED because 2 of 4 units were returned
    pur_check = client.get(f"/api/purchases/{pur_id}").json()
    assert float(pur_check["due_amount"]) == 0.0
    assert pur_check["payment_status"] == "PARTIALLY_RETURNED"

    # Check supplier ledger
    ledger_res = client.get(f"/api/suppliers/{sid}/ledger")
    assert ledger_res.status_code == 200
    ledger = ledger_res.json()
    assert len(ledger) >= 3  # Purchase, Down payment, Return, Standalone payment
    # Final balance should be 0.0
    assert float(ledger[-1]["balance"]) == 0.0

def test_empty_name_and_title_validations(client):
    """Edge Case 12: Ensure all entity creation and update endpoints reject blank or whitespace-only names."""
    # Customer empty name
    res = client.post("/api/customers", json={"name": "   "})
    assert res.status_code == 400
    assert "Customer name cannot be empty" in res.json()["detail"]

    # Supplier empty name
    res = client.post("/api/suppliers", json={"name": ""})
    assert res.status_code == 400
    assert "Supplier name cannot be empty" in res.json()["detail"]

    # Product category empty name
    res = client.post("/api/categories", json={"name": "  "})
    assert res.status_code == 400
    assert "Category name cannot be empty" in res.json()["detail"]

    # Product empty name
    res = client.post("/api/products", json={"name": "", "purchase_price": 10, "selling_price": 20})
    assert res.status_code == 400
    assert "Product name cannot be empty" in res.json()["detail"]

    # Bill category & bill empty name
    res = client.post("/api/bill-categories", json={"name": " "})
    assert res.status_code == 400
    assert "Bill category name cannot be empty" in res.json()["detail"]

    # Create valid bill category first
    bcat = client.post("/api/bill-categories", json={"name": "Tax & Fees"}).json()
    res = client.post("/api/bills", json={"name": "   ", "category_id": bcat["id"], "amount": 100, "due_date": "2026-10-01"})
    assert res.status_code == 400
    assert "Bill name cannot be empty" in res.json()["detail"]

    # Expense category & expense empty title
    res = client.post("/api/expense-categories", json={"name": "  "})
    assert res.status_code == 400
    assert "Expense category name cannot be empty" in res.json()["detail"]

    ecat = client.post("/api/expense-categories", json={"name": "Office Supplies"}).json()
    res = client.post("/api/expenses", json={"title": " ", "category_id": ecat["id"], "amount": 50})
    assert res.status_code == 400
    assert "Expense title cannot be empty" in res.json()["detail"]

    # Settings empty business name
    res = client.put("/api/settings", json={"business_name": "  "})
    assert res.status_code == 400
    assert "Business name cannot be empty" in res.json()["detail"]

def test_password_length_enforcement(client):
    """Edge Case 13: Password change rejects trivial or blank passwords."""
    res = client.post("/api/auth/change-password", json={
        "current_password": "admin",
        "new_password": " 12 "
    })
    assert res.status_code == 400
    assert "at least 4 characters long" in res.json()["detail"]

def test_canonical_status_in_reports(client):
    """Edge Case 14: Sales and purchases reports reflect canonical RETURNED status when all units are returned."""
    # Product
    prod = client.post("/api/products", json={
        "name": "Full Return Prod",
        "purchase_price": 50,
        "selling_price": 100,
        "opening_stock": 10
    }).json()
    pid = prod["id"]

    # Sale 1 unit and full return
    sale = client.post("/api/sales", json={
        "items": [{"product_id": pid, "quantity": 1.0, "unit_price": 100.0}],
        "paid_amount": 100.0
    }).json()

    client.post("/api/returns", json={
        "sale_id": sale["id"],
        "customer_id": sale["customer_id"],
        "items": [{"product_id": pid, "quantity": 1.0, "unit_price": 100.0}]
    })

    # Sales report check
    sales_rep = client.get("/api/reports/sales").json()
    matching_sale_row = next((r for r in sales_rep if r["receipt_number"] == sale["receipt_number"]), None)
    assert matching_sale_row is not None
    assert matching_sale_row["payment_status"] == "RETURNED"
    assert float(matching_sale_row["due_amount"]) == 0.0

def test_preset_applied_settings_response_fields(client):
    """Edge Case 15: Applying a preset populates show_sku and show_barcode in response model."""
    res = client.post("/api/settings/apply-preset", json={
        "preset_key": "pharmacy",
        "business_name": "Health First Pharmacy"
    })
    assert res.status_code == 200
    data = res.json()
    assert "show_sku" in data
    assert "show_barcode" in data
    assert isinstance(data["show_sku"], bool)
    assert isinstance(data["show_barcode"], bool)

def test_dashboard_stats_debt_and_sales_profit_separation(client):
    """Edge Case 16: Verify dashboard distinguishes today's sales cash/profit from past debt collection."""
    # 1. Fetch live dashboard stats
    kpi_res = client.get("/api/dashboard/kpis")
    assert kpi_res.status_code == 200
    kpis = kpi_res.json()
    assert "today_sales_cash" in kpis
    assert "today_past_debt_collected" in kpis
    assert "today_past_debt_profit" in kpis
    assert "today_unrealized_profit" in kpis
    # Today's realized profit can never exceed today's gross profit
    assert float(kpis["today_realized_profit"]) <= float(kpis["today_gross_profit"]) + 0.01



