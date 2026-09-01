from datetime import date
from fastapi.testclient import TestClient

def test_dashboard_stats_and_monthly_sales(client: TestClient):
    # 1. Check stats when empty
    r = client.get("/api/dashboard/stats")
    assert r.status_code == 200
    data = r.json()
    assert float(data["today_sales_revenue"]) == 0.0
    assert float(data["today_gross_profit"]) == 0.0

    # 2. Check kpis alias
    r_kpis = client.get("/api/dashboard/kpis")
    assert r_kpis.status_code == 200
    assert float(r_kpis.json()["today_sales_revenue"]) == 0.0

    # 3. Create a product and customer
    client.post("/api/customers", json={"name": "Alice Customer", "phone": "03001111111"})
    client.post("/api/products", json={
        "name": "Samsung S24",
        "purchase_price": 500.0,
        "selling_price": 750.0,
        "opening_stock": 10.0
    })

    # 4. Make a sale
    sale_payload = {
        "customer_id": 1,
        "items": [{"product_id": 1, "quantity": 2, "unit_price": 750.0}],
        "paid_amount": 1500.0,
        "payment_method": "Cash"
    }
    r_sale = client.post("/api/sales", json=sale_payload)
    assert r_sale.status_code == 200

    # 5. Check stats after sale
    r_after = client.get("/api/dashboard/stats")
    assert r_after.status_code == 200
    stats_after = r_after.json()
    assert float(stats_after["today_sales_revenue"]) == 1500.0
    assert float(stats_after["today_gross_profit"]) == 500.0

    # 6. Check monthly sales chart
    today = date.today()
    r_chart = client.get(f"/api/dashboard/monthly-sales?year={today.year}&month={today.month}")
    assert r_chart.status_code == 200
    chart_data = r_chart.json()
    assert chart_data["year"] == today.year
    assert chart_data["month"] == today.month
    assert float(chart_data["total_monthly_revenue"]) == 1500.0
    assert len(chart_data["daily_sales"]) > 0

    # 7. Check day sales detail
    r_day = client.get(f"/api/dashboard/day-sales/{today.isoformat()}")
    assert r_day.status_code == 200
    day_data = r_day.json()
    assert float(day_data["sales_revenue"]) == 1500.0
    assert day_data["transaction_count"] == 1
    assert len(day_data["sales"]) == 1

def test_reset_inventory_and_data(client: TestClient):
    # 1. Add customer, supplier, product, purchase, sale, return, bills
    r_cust = client.post("/api/customers", json={"name": "Bob", "phone": "03002222222"})
    bob_id = r_cust.json()["id"]
    client.post("/api/suppliers", json={"name": "Supplier X", "phone": "03001111111"})
    client.post("/api/products", json={
        "name": "Test iPhone",
        "purchase_price": 800.0,
        "selling_price": 1000.0,
        "opening_stock": 5.0
    })
    
    # Add a purchase order
    client.post("/api/purchases", json={
        "supplier_id": 1,
        "items": [{"product_id": 1, "quantity": 10, "unit_cost": 750.0}],
        "paid_amount": 7500.0,
        "payment_method": "Cash"
    })

    # Add a sale
    r_sale = client.post("/api/sales", json={
        "customer_id": bob_id,
        "items": [{"product_id": 1, "quantity": 2, "unit_price": 1000.0}],
        "paid_amount": 1000.0,
        "payment_method": "Cash"
    })
    sale_id = r_sale.json()["id"]

    # Add a return
    client.post("/api/returns/sales", json={
        "sale_id": sale_id,
        "customer_id": bob_id,
        "items": [{"product_id": 1, "quantity": 1, "unit_price": 1000.0}]
    })

    # Verify 1 product exists
    products_before = client.get("/api/products").json()
    assert len(products_before) == 1

    # 2. Try reset with wrong PIN
    r_bad_pin = client.post("/api/settings/reset-data", json={
        "confirm_pin": "9999",
        "wipe_mode": "inventory_only"
    })
    assert r_bad_pin.status_code == 400
    assert "Incorrect" in r_bad_pin.json()["detail"]

    # 3. Reset with correct PIN (1234)
    r_reset = client.post("/api/settings/reset-data", json={
        "confirm_pin": "1234",
        "wipe_mode": "inventory_only"
    })
    assert r_reset.status_code == 200
    reset_resp = r_reset.json()
    assert reset_resp["success"] is True
    assert reset_resp["deleted_products_count"] == 1

    # 4. Verify products, sales, purchases are wiped
    products_after = client.get("/api/products").json()
    assert len(products_after) == 0

    sales_after = client.get("/api/sales").json()
    assert len(sales_after) == 0

    purchases_after = client.get("/api/purchases").json()
    assert len(purchases_after) == 0
