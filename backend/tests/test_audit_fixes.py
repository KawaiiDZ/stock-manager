import pytest
from decimal import Decimal

def test_id_generator_collision_resilience(client):
    """Verify that deleting an item does not cause subsequent created items to collide."""
    # 1. Create three products
    p1 = client.post("/api/products", json={"name": "Audit Prod 1", "purchase_price": 10, "selling_price": 20, "opening_stock": 5}).json()
    p2 = client.post("/api/products", json={"name": "Audit Prod 2", "purchase_price": 10, "selling_price": 20, "opening_stock": 5}).json()
    p3 = client.post("/api/products", json={"name": "Audit Prod 3", "purchase_price": 10, "selling_price": 20, "opening_stock": 5}).json()

    # Product IDs should be unique
    assert len({p1["product_id"], p2["product_id"], p3["product_id"]}) == 3

    # 2. Create another product, verify its product_id is new and unique
    p4 = client.post("/api/products", json={"name": "Audit Prod 4", "purchase_price": 10, "selling_price": 20, "opening_stock": 5}).json()
    assert p4["product_id"] not in [p1["product_id"], p2["product_id"], p3["product_id"]]

def test_category_deletion_with_sales_history_does_not_crash(client):
    """Verify that deleting a category containing products with sales history succeeds cleanly."""
    # 1. Create a category
    cat = client.post("/api/categories", json={"name": "Audit Test Cat"}).json()

    # 2. Create a product in that category
    prod = client.post("/api/products", json={
        "name": "Audit History Prod",
        "category_id": cat["id"],
        "purchase_price": 15.0,
        "selling_price": 30.0,
        "opening_stock": 10.0
    }).json()

    # 3. Complete a sale for this product
    sale_res = client.post("/api/sales", json={
        "items": [{"product_id": prod["id"], "quantity": 2.0, "unit_price": 30.0}],
        "paid_amount": 60.0
    })
    assert sale_res.status_code in [200, 201]

    # 4. Delete the category - must succeed with 200 without foreign key integrity crash
    del_res = client.delete(f"/api/categories/{cat['id']}")
    assert del_res.status_code == 200

    # 5. Category must be gone
    categories = client.get("/api/categories").json()
    assert not any(c["id"] == cat["id"] for c in categories)

    # 6. Product should no longer appear in active product catalog
    active_prods = client.get("/api/products?is_active=true").json()
    assert not any(p["id"] == prod["id"] for p in active_prods)

def test_backup_restore_rejects_path_traversal(client):
    """Verify that restore_backup rejects path traversal payloads."""
    # Attempt directory traversal
    res = client.post("/api/backup/restore", json={"filename": "../../etc/passwd"})
    assert res.status_code == 400

    # Attempt absolute path
    res2 = client.post("/api/backup/restore", json={"filename": "/tmp/evil.db"})
    assert res2.status_code == 400

    # Attempt non-.db extension
    res3 = client.post("/api/backup/restore", json={"filename": "backup.txt"})
    assert res3.status_code == 400

def test_change_pin_validates_minimum_digits(client):
    """Verify that change_pin rejects empty, short, or non-numeric PINs."""
    # Rejects empty/short PIN
    res1 = client.post("/api/auth/change-pin", json={"current_pin": "1234", "new_pin": "12"})
    assert res1.status_code == 400

    # Rejects non-numeric PIN
    res2 = client.post("/api/auth/change-pin", json={"current_pin": "1234", "new_pin": "abcd"})
    assert res2.status_code == 400

def test_negative_unit_price_rejected_in_sale(client):
    """Verify that negative unit prices return a 400 business rule error."""
    prod = client.post("/api/products", json={"name": "Price Check Prod", "purchase_price": 10, "selling_price": 20, "opening_stock": 5}).json()

    res = client.post("/api/sales", json={
        "items": [{"product_id": prod["id"], "quantity": 1.0, "unit_price": -20.0}],
        "paid_amount": 0.0
    })
    assert res.status_code == 400
    assert "cannot be negative" in res.json()["detail"].lower()

def test_delete_product_permanent_success_for_clean_product(client):
    """Verify that a deactivated product without transaction history can be permanently deleted."""
    prod = client.post("/api/products", json={"name": "Clean Deactivate Prod", "purchase_price": 10, "selling_price": 20, "opening_stock": 5}).json()
    prod_id = prod["id"]

    # Deactivate product
    client.delete(f"/api/products/{prod_id}")

    # Permanently delete product
    del_res = client.delete(f"/api/products/{prod_id}/permanent")
    assert del_res.status_code == 200

    # Ensure product is completely gone from DB
    get_res = client.get(f"/api/products/{prod_id}")
    assert get_res.status_code == 404

def test_delete_product_permanent_blocked_if_sales_exist(client):
    """Verify that permanent deletion is blocked if the product is linked to completed sales invoices."""
    prod = client.post("/api/products", json={"name": "Sold Deactivate Prod", "purchase_price": 10, "selling_price": 20, "opening_stock": 5}).json()
    prod_id = prod["id"]

    # Complete a sale
    sale_res = client.post("/api/sales", json={
        "items": [{"product_id": prod_id, "quantity": 1.0, "unit_price": 20.0}],
        "paid_amount": 20.0
    })
    assert sale_res.status_code in [200, 201]

    # Deactivate product
    client.delete(f"/api/products/{prod_id}")

    # Attempting permanent deletion must be rejected to preserve invoice integrity
    del_res = client.delete(f"/api/products/{prod_id}/permanent")
    assert del_res.status_code == 400
    assert "transaction history" in del_res.json()["detail"].lower()

def test_partially_paid_sale_profit_and_payment_settlement(client):
    """Verify that gross profit is tracked proportionally on partial payments and fully settled on customer debt payment."""
    # 1. Create a customer and product
    cust = client.post("/api/customers", json={"name": "Profit Test Customer", "phone": "03120000000"}).json()
    cust_id = cust["id"]

    prod = client.post("/api/products", json={"name": "Profit Item", "purchase_price": 60, "selling_price": 100, "opening_stock": 10}).json()
    prod_id = prod["id"]

    # 2. Sale: 1 unit @ 100, cost 60, gross profit 40. Paid 50 (50%), Due 50.
    sale_res = client.post("/api/sales", json={
        "customer_id": cust_id,
        "items": [{"product_id": prod_id, "quantity": 1.0, "unit_price": 100.0}],
        "paid_amount": 50.0
    })
    assert sale_res.status_code in [200, 201]
    sale_data = sale_res.json()

    assert float(sale_data["gross_profit"]) == 40.0
    assert float(sale_data["realized_profit"]) == 20.0 # 50% of 40 profit realized
    assert float(sale_data["unrealized_profit"]) == 20.0
    assert sale_data["payment_status"] == "PARTIALLY_PAID"
    assert float(sale_data["due_amount"]) == 50.0

    # 3. Pay remaining Rs. 50 via customer payment
    pay_res = client.post(f"/api/customers/{cust_id}/payments", json={"amount": 50.0, "payment_method": "Cash"})
    assert pay_res.status_code in [200, 201]

    # 4. Fetch the sale again: it must now be marked PAID with 100% realized profit
    refetched_sale = client.get(f"/api/sales/{sale_data['id']}").json()
    assert float(refetched_sale["paid_amount"]) == 100.0
    assert float(refetched_sale["due_amount"]) == 0.0
    assert refetched_sale["payment_status"] == "PAID"
    assert float(refetched_sale["realized_profit"]) == 40.0
    assert float(refetched_sale["unrealized_profit"]) == 0.0


