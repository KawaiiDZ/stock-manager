import pytest
from decimal import Decimal

def test_sales_only_reset_preserves_stock_and_products(client):
    """
    Verify that wipe_mode='sales_only' purges sales, payments, returns, quotations,
    while restoring consumed stock quantities and preserving products, categories, and purchases.
    """
    # 1. Create Category and Product with opening stock of 10
    cat = client.post("/api/categories", json={"name": "Demo Reset Cat"}).json()
    prod = client.post("/api/products", json={
        "name": "Demo Reset Product",
        "category_id": cat["id"],
        "purchase_price": 50.0,
        "selling_price": 100.0,
        "opening_stock": 10.0
    }).json()

    assert float(prod["current_stock"]) == 10.0

    # 2. Make a sale of 3 units
    sale_res = client.post("/api/sales", json={
        "items": [{"product_id": prod["id"], "quantity": 3.0, "unit_price": 100.0}],
        "paid_amount": 300.0
    })
    assert sale_res.status_code in [200, 201]

    # Verify stock dropped to 7
    prod_after_sale = client.get(f"/api/products/{prod['id']}").json()
    assert float(prod_after_sale["current_stock"]) == 7.0

    # 3. Create a quotation
    quote_res = client.post("/api/quotations", json={
        "customer_name": "Demo Quote Customer",
        "customer_phone": "0311-0000000",
        "items": [{"product_id": prod["id"], "quantity": 2.0, "unit_price": 100.0}]
    })
    assert quote_res.status_code in [200, 201]

    # 4. Perform sales_only reset with valid PIN 1234
    reset_res = client.post("/api/settings/reset-data", json={
        "confirm_pin": "1234",
        "wipe_mode": "sales_only"
    })
    assert reset_res.status_code == 200
    reset_data = reset_res.json()
    assert reset_data["success"] is True
    assert reset_data["deleted_products_count"] == 0

    # 5. Verify Sales History is completely empty
    sales = client.get("/api/sales").json()
    assert len(sales) == 0

    # 6. Verify Quotations are completely empty
    quotes = client.get("/api/quotations").json()
    assert len(quotes) == 0

    # 7. Verify Product still exists and stock was restored back to 10.0!
    prod_after_reset = client.get(f"/api/products/{prod['id']}").json()
    assert prod_after_reset["name"] == "Demo Reset Product"
    assert float(prod_after_reset["current_stock"]) == 10.0

    # 8. Verify Category still exists
    categories = client.get("/api/categories").json()
    assert any(c["id"] == cat["id"] for c in categories)

    # 9. Verify Walk-in Customer balance is 0.00
    walk_in = client.get("/api/customers").json()[0]
    assert float(walk_in["current_due"]) == 0.0

def test_reorder_custom_fields_batch(client):
    """
    Verify that batch custom field reordering updates display_order correctly and persists.
    """
    cat = client.post("/api/categories", json={"name": "Reorder Cat"}).json()

    # Create 3 fields
    f1 = client.post("/api/custom-fields", json={"category_id": cat["id"], "name": "Field A", "field_type": "text", "display_order": 0}).json()
    f2 = client.post("/api/custom-fields", json={"category_id": cat["id"], "name": "Field B", "field_type": "text", "display_order": 1}).json()
    f3 = client.post("/api/custom-fields", json={"category_id": cat["id"], "name": "Field C", "field_type": "text", "display_order": 2}).json()

    # Reorder to [f3, f1, f2]
    reorder_res = client.put("/api/custom-fields/reorder/batch", json={
        "field_ids": [f3["id"], f1["id"], f2["id"]]
    })
    assert reorder_res.status_code == 200

    # Verify order in response and in list
    fields_list = client.get(f"/api/custom-fields?category_id={cat['id']}&active_only=false").json()
    field_order_ids = [f["id"] for f in fields_list if f["category_id"] == cat["id"]]
    assert field_order_ids == [f3["id"], f1["id"], f2["id"]]
