from fastapi.testclient import TestClient

def test_dashboard_kpis(client: TestClient):
    res = client.get("/api/dashboard/kpis")
    assert res.status_code == 200, res.text

def test_dashboard_chart(client: TestClient):
    res = client.get("/api/dashboard/monthly-chart?year=2026&month=8")
    assert res.status_code == 200, res.text

def test_bills_attention(client: TestClient):
    res = client.get("/api/bills/attention")
    assert res.status_code == 200, res.text

def test_products(client: TestClient):
    res = client.get("/api/products?is_active=true")
    assert res.status_code == 200, res.text

def test_categories(client: TestClient):
    res = client.get("/api/categories?active_only=true")
    assert res.status_code == 200, res.text

def test_custom_fields(client: TestClient):
    res = client.get("/api/custom-fields?active_only=true")
    assert res.status_code == 200, res.text

def test_inventory_movements(client: TestClient):
    res = client.get("/api/inventory/movements")
    assert res.status_code == 200, res.text

def test_customers(client: TestClient):
    res = client.get("/api/customers?is_active=true")
    assert res.status_code == 200, res.text

def test_suppliers(client: TestClient):
    res = client.get("/api/suppliers?is_active=true")
    assert res.status_code == 200, res.text

def test_sales(client: TestClient):
    res = client.get("/api/sales")
    assert res.status_code == 200, res.text

def test_expenses(client: TestClient):
    res = client.get("/api/expenses")
    assert res.status_code == 200, res.text
