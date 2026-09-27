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

def test_barcode_settings_defaults_and_updates(client):
    # 1. Fetch settings and check barcode default values
    res = client.get("/api/settings")
    assert res.status_code == 200
    data = res.json()
    assert "enable_barcode_scanner" in data
    assert "enable_barcode_printer" in data
    assert "barcode_label_size" in data
    assert "barcode_label_show_business_name" in data
    assert "barcode_label_show_product_name" in data
    assert "barcode_label_show_price" in data
    assert "barcode_label_show_sku" in data
    assert "barcode_label_custom_text" in data
    assert data["enable_barcode_scanner"] is True
    assert data["enable_barcode_printer"] is True
    assert data["barcode_label_size"] == "50x25mm"

    # 2. Update barcode settings
    update_payload = {
        "enable_barcode_scanner": False,
        "enable_barcode_printer": True,
        "barcode_label_size": "40x30mm",
        "barcode_label_show_business_name": False,
        "barcode_label_show_product_name": True,
        "barcode_label_show_price": True,
        "barcode_label_show_sku": False,
        "barcode_label_custom_text": "Warranty 1 Year - No Exchange without Tag"
    }
    res_update = client.put("/api/settings", json=update_payload)
    assert res_update.status_code == 200
    updated_data = res_update.json()
    assert updated_data["enable_barcode_scanner"] is False
    assert updated_data["barcode_label_size"] == "40x30mm"
    assert updated_data["barcode_label_show_business_name"] is False
    assert updated_data["barcode_label_custom_text"] == "Warranty 1 Year - No Exchange without Tag"

    # 3. Verify persistence on GET
    res_get2 = client.get("/api/settings")
    assert res_get2.status_code == 200
    assert res_get2.json()["barcode_label_size"] == "40x30mm"
    assert res_get2.json()["enable_barcode_scanner"] is False

    # Restore default
    client.put("/api/settings", json={"enable_barcode_scanner": True, "barcode_label_size": "50x25mm"})

def test_get_product_by_barcode_resilience(client):
    import uuid
    uid = uuid.uuid4().hex[:6]
    db = SessionLocal()
    cat = db.query(ProductCategory).filter(ProductCategory.name == "Barcode Test Cat").first()
    if not cat:
        cat = create_category(db, CategoryCreate(name="Barcode Test Cat"))

    unique_code = f"BC{uid}"
    sku_code = f"SKU-{uid}"
    prod = create_product(db, ProductCreate(
        name=f"Wireless Barcode Scanner {uid}",
        category_id=cat.id,
        purchase_price=Decimal("45.00"),
        selling_price=Decimal("85.00"),
        opening_stock=Decimal("15.00"),
        barcode=unique_code,
        sku=sku_code
    ))
    db.close()

    # 1. Lookup by actual barcode
    res_barcode = client.get(f"/api/products/barcode/{unique_code}")
    assert res_barcode.status_code == 200
    data_bc = res_barcode.json()
    assert data_bc is not None
    assert data_bc["id"] == prod["id"]
    assert data_bc["name"] == f"Wireless Barcode Scanner {uid}"

    # 2. Lookup by SKU using the same barcode endpoint
    res_sku = client.get(f"/api/products/barcode/{sku_code}")
    assert res_sku.status_code == 200
    data_sku = res_sku.json()
    assert data_sku is not None
    assert data_sku["id"] == prod["id"]

    # 3. Lookup by Product ID (e.g. P-00000X)
    res_pid = client.get(f"/api/products/barcode/{prod['product_id']}")
    assert res_pid.status_code == 200
    data_pid = res_pid.json()
    assert data_pid is not None
    assert data_pid["id"] == prod["id"]

    # 4. Non-existent barcode
    res_none = client.get("/api/products/barcode/DOES_NOT_EXIST_XYZ")
    assert res_none.status_code == 200
    assert res_none.json() is None

def test_generate_unique_barcode_endpoint(client):
    res = client.get("/api/products/generate-barcode")
    assert res.status_code == 200
    data = res.json()
    assert "barcode" in data
    assert len(data["barcode"]) == 12
    assert data["barcode"].startswith("20")

    # Generate a second one and ensure it's different
    res2 = client.get("/api/products/generate-barcode")
    assert res2.status_code == 200
    assert res2.json()["barcode"] != data["barcode"]
