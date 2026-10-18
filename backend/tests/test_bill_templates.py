import pytest
from decimal import Decimal
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from backend.app.main import app
from backend.app.core.database import SessionLocal, Base, engine, auto_upgrade_schema
from backend.app.models.product import ProductCategory, Product
from backend.app.models.customer import Customer
from backend.app.models.template import BillTemplate, BillTemplateItem
from backend.app.models.business import BusinessSettings
from backend.app.services.auth_service import seed_initial_data

client = TestClient(app)

def test_bill_template_crud_and_category_lock():
    Base.metadata.create_all(bind=engine)
    auto_upgrade_schema()
    db_init: Session = SessionLocal()
    try:
        seed_initial_data(db_init)
    finally:
        db_init.close()
    db: Session = SessionLocal()
    try:
        # 1. Setup categories and products
        cat_solar = db.query(ProductCategory).filter(ProductCategory.name == "Solar Test Panels").first()
        if not cat_solar:
            cat_solar = ProductCategory(name="Solar Test Panels")
            db.add(cat_solar)
            db.commit()
            db.refresh(cat_solar)

        cat_battery = db.query(ProductCategory).filter(ProductCategory.name == "Battery Test").first()
        if not cat_battery:
            cat_battery = ProductCategory(name="Battery Test")
            db.add(cat_battery)
            db.commit()
            db.refresh(cat_battery)

        prod_solar = db.query(Product).filter(Product.name == "Jinko 580W Test Panel").first()
        if not prod_solar:
            prod_solar = Product(
                product_id="P-TEST01",
                name="Jinko 580W Test Panel",
                category_id=cat_solar.id,
                purchase_price=Decimal("20000.00"),
                selling_price=Decimal("22000.00"),
                current_stock=Decimal("50.00"),
                is_active=True
            )
            db.add(prod_solar)
            db.commit()
            db.refresh(prod_solar)

        # 2. Create Bill Template via API
        payload = {
            "name": "4kW Hybrid Solar Test Package",
            "items": [
                {
                    "display_order": 1,
                    "slot_name": "Solar Panels",
                    "category_id": cat_solar.id,
                    "category_name": cat_solar.name,
                    "default_product_id": prod_solar.id,
                    "default_quantity": 8.0,
                    "is_optional": False
                },
                {
                    "display_order": 2,
                    "slot_name": "Battery",
                    "category_id": cat_battery.id,
                    "category_name": cat_battery.name,
                    "default_product_id": None,
                    "default_quantity": 2.0,
                    "is_optional": True
                },
                {
                    "display_order": 3,
                    "slot_name": "Earthing",
                    "category_id": None,
                    "category_name": "Services",
                    "default_product_id": None,
                    "default_quantity": 1.0,
                    "is_optional": True
                }
            ]
        }

        # Clean existing if any
        existing_tmpl = db.query(BillTemplate).filter(BillTemplate.name == payload["name"]).first()
        if existing_tmpl:
            db.delete(existing_tmpl)
            db.commit()

        res = client.post("/api/templates", json=payload)
        assert res.status_code == 201, res.text
        data = res.json()
        assert data["name"] == payload["name"]
        assert len(data["items"]) == 3
        template_id = data["id"]

        # Verify resolved product details on response (price strictly fetched from product catalog)
        solar_item = data["items"][0]
        assert solar_item["slot_name"] == "Solar Panels"
        assert solar_item["default_product_name"] == "Jinko 580W Test Panel"
        assert solar_item["category_name"] == "Solar Test Panels"
        assert float(solar_item["default_product_selling_price"]) == 22000.0

        # 3. List templates
        res_list = client.get("/api/templates")
        assert res_list.status_code == 200
        templates_list = res_list.json()
        assert any(t["id"] == template_id for t in templates_list)

        # 4. Update template
        update_payload = {
            "items": [
                {
                    "display_order": 1,
                    "slot_name": "Solar Panels (Updated)",
                    "category_id": cat_solar.id,
                    "category_name": cat_solar.name,
                    "default_product_id": prod_solar.id,
                    "default_quantity": 10.0,
                    "is_optional": False
                }
            ]
        }
        res_update = client.put(f"/api/templates/{template_id}", json=update_payload)
        assert res_update.status_code == 200
        updated_data = res_update.json()
        assert len(updated_data["items"]) == 1
        assert float(updated_data["items"][0]["default_quantity"]) == 10.0

        # 5. Delete template
        res_del = client.delete(f"/api/templates/{template_id}")
        assert res_del.status_code == 200

        res_check = client.get(f"/api/templates/{template_id}")
        assert res_check.status_code == 404

    finally:
        db.close()

def test_sale_checkout_with_template_omission():
    """Verify that when a template is used, only filled items are sold and empty slots are omitted."""
    db: Session = SessionLocal()
    try:
        # Create test customer
        cust = db.query(Customer).filter(Customer.name == "Solar Customer Test").first()
        if not cust:
            cust = Customer(
                customer_id="C-SOLAR01",
                name="Solar Customer Test",
                phone="0300-9999999"
            )
            db.add(cust)
            db.commit()
            db.refresh(cust)

        prod = db.query(Product).filter(Product.name == "Jinko 580W Test Panel").first()
        assert prod is not None

        # Post sale with 1 filled item (other template slots like battery/earthing were left out)
        sale_payload = {
            "customer_id": cust.id,
            "items": [
                {
                    "product_id": prod.id,
                    "quantity": 8.0,
                    "unit_price": 22000.0,
                    "notes": "PV Module: Brand: JA/Jinko N Type 580w Tier-1"
                }
            ],
            "paid_amount": 176000.0,
            "payment_method": "Cash",
            "notes": "Sold via 4kW Hybrid Solar Template"
        }

        res = client.post("/api/sales", json=sale_payload)
        assert res.status_code == 200, res.text
        sale_data = res.json()
        assert len(sale_data["items"]) == 1
        assert sale_data["items"][0]["notes"] == "PV Module: Brand: JA/Jinko N Type 580w Tier-1"
        assert sale_data["items"][0]["product_name"] == prod.name
    finally:
        db.close()


def test_enable_bill_templates_setting_toggle():
    """Verify that enable_bill_templates can be toggled via settings API and persists."""
    # 1. Fetch current settings
    res = client.get("/api/settings")
    assert res.status_code == 200
    initial_settings = res.json()
    orig_val = initial_settings.get("enable_bill_templates", True)

    try:
        # 2. Toggle off
        res_off = client.put("/api/settings", json={"enable_bill_templates": False})
        assert res_off.status_code == 200
        assert res_off.json()["enable_bill_templates"] is False

        # Verify get
        res_get = client.get("/api/settings")
        assert res_get.status_code == 200
        assert res_get.json()["enable_bill_templates"] is False

        # 3. Toggle back on
        res_on = client.put("/api/settings", json={"enable_bill_templates": True})
        assert res_on.status_code == 200
        assert res_on.json()["enable_bill_templates"] is True

        # Verify get
        res_get_on = client.get("/api/settings")
        assert res_get_on.status_code == 200
        assert res_get_on.json()["enable_bill_templates"] is True
    finally:
        # Restore original value
        client.put("/api/settings", json={"enable_bill_templates": orig_val})


def test_bill_template_rejects_zero_or_negative_quantity():
    """Verify that BillTemplate creation rejects 0 or negative default_quantity with 422."""
    payload_zero = {
        "name": "Zero Qty Invalid Template",
        "items": [
            {
                "display_order": 1,
                "slot_name": "Zero Item",
                "default_quantity": 0,
            }
        ]
    }
    res_zero = client.post("/api/templates", json=payload_zero)
    assert res_zero.status_code == 422

    payload_negative = {
        "name": "Negative Qty Invalid Template",
        "items": [
            {
                "display_order": 1,
                "slot_name": "Negative Item",
                "default_quantity": -5,
            }
        ]
    }
    res_neg = client.post("/api/templates", json=payload_negative)
    assert res_neg.status_code == 422



