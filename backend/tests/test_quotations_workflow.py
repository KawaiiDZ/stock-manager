import pytest
from decimal import Decimal
from fastapi.testclient import TestClient
from backend.app.main import app
from backend.app.core.database import SessionLocal, Base, engine, auto_upgrade_schema
from backend.app.models.product import ProductCategory
from backend.app.services.auth_service import seed_initial_data
from backend.app.services.product_service import create_product, create_category
from backend.app.schemas.product import ProductCreate, CategoryCreate

@pytest.fixture(scope="function")
def client():
    Base.metadata.create_all(bind=engine)
    auto_upgrade_schema()
    db = SessionLocal()
    seed_initial_data(db)
    db.close()
    with TestClient(app) as c:
        yield c

def test_quotation_creation_and_stock_isolation(client):
    db = SessionLocal()
    cat = db.query(ProductCategory).filter(ProductCategory.name == "Electronics").first()
    if not cat:
        cat = create_category(db, CategoryCreate(name="Electronics"))
    
    prod = create_product(db, ProductCreate(
        name="Quote Laptop 2",
        category_id=cat.id,
        purchase_price=Decimal("400.00"),
        selling_price=Decimal("500.00"),
        opening_stock=Decimal("10.00")
    ))
    db.close()
    prod_id = prod["id"]

    # 2. Try creating quotation without customer name or phone -> should fail
    res_bad = client.post("/api/quotations", json={
        "customer_name": "",
        "customer_phone": "",
        "items": [{"product_id": prod_id, "quantity": 2, "unit_price": 500}]
    })
    assert res_bad.status_code == 400 or res_bad.status_code == 422

    # 3. Create valid quotation
    res = client.post("/api/quotations", json={
        "customer_name": "Ahmed Corporate",
        "customer_phone": "0311-9876543",
        "customer_address": "Office 402, Blue Area",
        "items": [
            {"product_id": prod_id, "quantity": 3, "unit_price": 500, "discount_amount": 0}
        ],
        "discount_amount": 50,
        "notes": "Valid for 14 days"
    })
    assert res.status_code == 201, res.text
    q_data = res.json()
    assert q_data["quotation_number"].startswith("Q-")
    assert q_data["status"] == "PENDING"
    assert Decimal(str(q_data["subtotal"])) == Decimal("1500.00")
    assert Decimal(str(q_data["total_amount"])) == Decimal("1450.00")

    # 4. Verify product stock is STILL 10 (quotation does NOT deduct stock)
    prod_check = client.get(f"/api/products/{prod_id}").json()
    assert Decimal(str(prod_check["current_stock"])) == Decimal("10.00")

def test_quotation_conversion_and_price_discrepancy(client):
    db = SessionLocal()
    cat = db.query(ProductCategory).first()
    prod = create_product(db, ProductCreate(
        name="Fluctuating Phone 2",
        category_id=cat.id,
        purchase_price=Decimal("800.00"),
        selling_price=Decimal("1000.00"),
        opening_stock=Decimal("5.00")
    ))
    db.close()
    prod_id = prod["id"]

    # Create quotation at original price 1000
    res_quote = client.post("/api/quotations", json={
        "customer_name": "Tech Buyer",
        "customer_phone": "0322-1112233",
        "items": [{"product_id": prod_id, "quantity": 2, "unit_price": 1000}]
    })
    q_id = res_quote.json()["id"]

    # Now change product price in catalog to 1200
    res_upd = client.put(f"/api/products/{prod_id}", json={
        "selling_price": 1200.00
    })
    assert res_upd.status_code == 200

    # Check conversion API: should detect price difference (+200)
    res_check = client.get(f"/api/quotations/{q_id}/check-conversion")
    assert res_check.status_code == 200
    check_data = res_check.json()
    assert check_data["has_price_changes"] is True
    assert check_data["has_stock_shortages"] is False
    item_check = check_data["items"][0]
    assert Decimal(str(item_check["quoted_price"])) == Decimal("1000.00")
    assert Decimal(str(item_check["current_price"])) == Decimal("1200.00")
    assert Decimal(str(item_check["price_difference"])) == Decimal("200.00")

    # Convert with price_mode = 'quoted' (honor quoted price 1000)
    res_conv = client.post(f"/api/quotations/{q_id}/convert", json={
        "price_mode": "quoted",
        "payment_method": "CASH",
        "amount_paid": 2000.00
    })
    assert res_conv.status_code == 200, res_conv.text
    sale_data = res_conv.json()
    assert sale_data["receipt_number"].startswith("R-")
    assert Decimal(str(sale_data["total_amount"])) == Decimal("2000.00")

    # Quotation should now be APPROVED
    res_q_final = client.get(f"/api/quotations/{q_id}")
    assert res_q_final.json()["status"] == "APPROVED"
    assert res_q_final.json()["sale_id"] == sale_data["id"]

    # Stock should now be deducted from 5 to 3
    prod_post = client.get(f"/api/products/{prod_id}").json()
    assert Decimal(str(prod_post["current_stock"])) == Decimal("3.00")

def test_quotation_rejection_workflow(client):
    db = SessionLocal()
    cat = db.query(ProductCategory).first()
    prod = create_product(db, ProductCreate(
        name="Rejected Item 2",
        category_id=cat.id,
        purchase_price=Decimal("100.00"),
        selling_price=Decimal("150.00"),
        opening_stock=Decimal("5.00")
    ))
    db.close()
    prod_id = prod["id"]

    res_quote = client.post("/api/quotations", json={
        "customer_name": "Reject Customer",
        "customer_phone": "0345-0000000",
        "items": [{"product_id": prod_id, "quantity": 1, "unit_price": 150}]
    })
    q_id = res_quote.json()["id"]

    # Disapprove quotation
    res_rej = client.post(f"/api/quotations/{q_id}/reject", json={
        "reason": "Customer found cheaper alternative elsewhere"
    })
    assert res_rej.status_code == 200
    assert res_rej.json()["status"] == "REJECTED"
    assert res_rej.json()["rejection_reason"] == "Customer found cheaper alternative elsewhere"

    # Cannot convert rejected quotation
    res_conv = client.post(f"/api/quotations/{q_id}/convert", json={
        "price_mode": "quoted"
    })
    assert res_conv.status_code == 400
