from fastapi.testclient import TestClient
from backend.app.main import app

client = TestClient(app)

def test_dashboard_kpis():
    res = client.get("/api/dashboard/kpis")
    assert res.status_code == 200, res.text

def test_dashboard_chart():
    res = client.get("/api/dashboard/monthly-chart?year=2026&month=8")
    assert res.status_code == 200, res.text

def test_bills_attention():
    res = client.get("/api/bills/attention")
    assert res.status_code == 200, res.text

def test_products():
    res = client.get("/api/products?is_active=true")
    assert res.status_code == 200, res.text

def test_categories():
    res = client.get("/api/categories?active_only=true")
    assert res.status_code == 200, res.text

def test_custom_fields():
    res = client.get("/api/custom-fields?active_only=true")
    assert res.status_code == 200, res.text

def test_inventory_movements():
    res = client.get("/api/inventory/movements")
    assert res.status_code == 200, res.text

def test_customers():
    res = client.get("/api/customers?is_active=true")
    assert res.status_code == 200, res.text

def test_suppliers():
    res = client.get("/api/suppliers?is_active=true")
    assert res.status_code == 200, res.text

def test_sales():
    res = client.get("/api/sales")
    assert res.status_code == 200, res.text

def test_expenses():
    res = client.get("/api/expenses")
    assert res.status_code == 200, res.text
