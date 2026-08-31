import pytest
from fastapi.testclient import TestClient
from backend.app.main import app

client = TestClient(app)

def test_presets_list_and_structure():
    res = client.get("/api/settings/presets")
    assert res.status_code == 200
    presets = res.json()
    assert len(presets) >= 6
    preset_keys = [p["key"] for p in presets]
    assert "mobile_electronics" in preset_keys
    assert "clothing_apparel" in preset_keys
    assert "pharmacy_medical" in preset_keys
    assert "grocery_supermarket" in preset_keys
    assert "autoparts_hardware" in preset_keys
    assert "custom_general" in preset_keys

    # Verify mobile preset fields
    mobile = next(p for p in presets if p["key"] == "mobile_electronics")
    field_names = [f["name"] for f in mobile["fields"]]
    assert "Brand" in field_names
    assert "Model / Specs" in field_names
    assert "IMEI / Serial" in field_names

def test_apply_mobile_preset():
    payload = {
        "preset_key": "mobile_electronics",
        "business_name": "Apex Mobile Zone",
        "currency": "Rs.",
        "phone": "0300-1112233",
        "address": "Hafeez Center, Lahore"
    }
    res = client.post("/api/settings/apply-preset", json=payload)
    assert res.status_code == 200
    data = res.json()
    assert data["business_name"] == "Apex Mobile Zone"
    assert data["industry_preset"] == "mobile_electronics"
    assert data["setup_completed"] is True

    # Verify custom fields were created
    cf_res = client.get("/api/custom-fields")
    assert cf_res.status_code == 200
    cfs = cf_res.json()
    cf_map = {f["name"]: f for f in cfs}
    assert "Brand" in cf_map
    assert cf_map["Brand"]["show_in_table"] is True
    assert cf_map["Brand"]["field_type"] == "select"
    assert "Apple" in cf_map["Brand"]["options"]

def test_product_creation_with_preset_custom_fields():
    # Get custom fields
    cf_res = client.get("/api/custom-fields")
    cfs = cf_res.json()
    brand_cf = next(f for f in cfs if f["name"] == "Brand")
    model_cf = next(f for f in cfs if f["name"] == "Model / Specs")

    t = int(time.time() * 1000)
    prod_payload = {
        "name": f"Samsung Galaxy S24 Ultra {t}",
        "barcode": f"s24_{t}",
        "purchase_price": 240000.0,
        "selling_price": 275000.0,
        "opening_stock": 5.0,
        "custom_fields": [
            {"field_id": brand_cf["id"], "value": "Samsung"},
            {"field_id": model_cf["id"], "value": "512GB Titanium Grey"}
        ]
    }
    res = client.post("/api/products", json=prod_payload)
    assert res.status_code == 201
    prod = res.json()
    assert "Samsung Galaxy S24 Ultra" in prod["name"]
    assert len(prod["custom_fields"]) == 2
    assert any(cf["value"] == "Samsung" for cf in prod["custom_fields"])

import time

def test_bulk_product_creation_with_custom_fields():
    cf_res = client.get("/api/custom-fields")
    cfs = cf_res.json()
    brand_cf = next(f for f in cfs if f["name"] == "Brand")

    t = int(time.time() * 1000)
    bulk_payload = [
        {
            "name": f"Xiaomi Redmi Note {t}",
            "barcode": f"bc1_{t}",
            "purchase_price": 45000.0,
            "selling_price": 52000.0,
            "opening_stock": 10.0,
            "custom_fields": [
                {"field_id": brand_cf["id"], "value": "Xiaomi"}
            ]
        },
        {
            "name": f"Infinix Note Pro {t}",
            "barcode": f"bc2_{t}",
            "purchase_price": 55000.0,
            "selling_price": 63000.0,
            "opening_stock": 8.0,
            "custom_fields": [
                {"field_id": brand_cf["id"], "value": "Infinix"}
            ]
        }
    ]
    res = client.post("/api/products/bulk", json=bulk_payload)
    assert res.status_code == 201
    data = res.json()
    assert data["count"] == 2
    assert len(data["products"][0]["custom_fields"]) == 1
    assert data["products"][0]["custom_fields"][0]["value"] == "Xiaomi"
