import pytest
from fastapi.testclient import TestClient
from backend.app.main import app

client = TestClient(app)

def test_presets_list_and_structure(client):
    res = client.get("/api/settings/presets")
    assert res.status_code == 200
    presets = res.json()
    assert len(presets) >= 6
    preset_keys = [p["key"] for p in presets]
    assert "custom_general" in preset_keys
    assert "mobile_electronics" in preset_keys
    assert "clothing_apparel" in preset_keys
    assert "pharmacy_medical" in preset_keys
    assert "grocery_supermarket" in preset_keys
    assert "autoparts_hardware" in preset_keys

    # Verify mobile preset fields
    mobile = next(p for p in presets if p["key"] == "mobile_electronics")
    field_names = [f["name"] for f in mobile["fields"]]
    assert "Brand" in field_names
    assert "Model / Specs" in field_names

def test_apply_mobile_preset(client):
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

def test_product_creation_with_preset_custom_fields(client):
    # Apply preset first
    client.post("/api/settings/apply-preset", json={"preset_key": "mobile_electronics"})

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

def test_bulk_product_creation_with_custom_fields(client):
    client.post("/api/settings/apply-preset", json={"preset_key": "mobile_electronics"})
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

def test_custom_category_creation_and_dynamic_schemas(client):
    # 1. User creates categories on their own
    b_res = client.post("/api/categories", json={"name": "Battery"})
    assert b_res.status_code == 201
    battery_cat = b_res.json()

    p_res = client.post("/api/categories", json={"name": "Panel"})
    assert p_res.status_code == 201
    panel_cat = p_res.json()

    # 2. User creates a Global field (e.g. Brand / Warranty)
    g_res = client.post("/api/custom-fields", json={
        "name": "Brand",
        "category_id": None,
        "field_type": "text",
        "show_in_table": True,
        "show_in_pos": True,
        "is_required": True
    })
    assert g_res.status_code == 201
    global_brand = g_res.json()
    assert global_brand["category_id"] is None
    assert global_brand["category_name"] == "All Categories (Global)"

    # 3. User creates a field specific to "Battery"
    bat_field_res = client.post("/api/custom-fields", json={
        "category_id": battery_cat["id"],
        "name": "Ah Capacity",
        "field_type": "number",
        "show_in_table": True,
        "show_in_pos": True,
        "is_required": True
    })
    assert bat_field_res.status_code == 201
    bat_field = bat_field_res.json()
    assert bat_field["category_id"] == battery_cat["id"]
    assert bat_field["category_name"] == "Battery"

    # 4. User creates a field specific to "Panel"
    panel_field_res = client.post("/api/custom-fields", json={
        "category_id": panel_cat["id"],
        "name": "Watts",
        "field_type": "number",
        "show_in_table": True,
        "show_in_pos": True,
        "is_required": True
    })
    assert panel_field_res.status_code == 201
    panel_field = panel_field_res.json()
    assert panel_field["category_id"] == panel_cat["id"]
    assert panel_field["category_name"] == "Panel"

    # 5. Query custom fields for "Panel" category
    panel_query_res = client.get(f"/api/custom-fields?category_id={panel_cat['id']}")
    assert panel_query_res.status_code == 200
    panel_fields = panel_query_res.json()
    panel_field_names = [f["name"] for f in panel_fields]
    assert "Brand" in panel_field_names
    assert "Watts" in panel_field_names
    assert "Ah Capacity" not in panel_field_names  # Battery-only field must not show

    # 6. Query custom fields for "Battery" category
    battery_query_res = client.get(f"/api/custom-fields?category_id={battery_cat['id']}")
    assert battery_query_res.status_code == 200
    battery_fields = battery_query_res.json()
    battery_field_names = [f["name"] for f in battery_fields]
    assert "Brand" in battery_field_names
    assert "Ah Capacity" in battery_field_names
    assert "Watts" not in battery_field_names  # Panel-only field must not show

    # 7. Create product under "Battery" with its specific fields
    t = int(time.time() * 1000)
    prod_res = client.post("/api/products", json={
        "name": f"Tubular 220Ah Battery {t}",
        "category_id": battery_cat["id"],
        "purchase_price": 42000.0,
        "selling_price": 48000.0,
        "opening_stock": 12.0,
        "custom_fields": [
            {"field_id": global_brand["id"], "value": "Phoenix"},
            {"field_id": bat_field["id"], "value": "220"}
        ]
    })
    assert prod_res.status_code == 201
    prod = prod_res.json()
    assert prod["category_name"] == "Battery"
    assert len(prod["custom_fields"]) == 2

def test_category_deletion_cascades_products_and_schemas(client):
    # 1. Create a category
    c_res = client.post("/api/categories", json={"name": "Special Items"})
    assert c_res.status_code == 201
    cat = c_res.json()
    cat_id = cat["id"]

    # 2. Create category-specific custom field
    cf_res = client.post("/api/custom-fields", json={
        "category_id": cat_id,
        "name": "Special Grade",
        "field_type": "text",
        "show_in_table": True,
        "show_in_pos": True,
        "is_required": False
    })
    assert cf_res.status_code == 201
    cf = cf_res.json()

    # 3. Create products in this category
    t = int(time.time() * 1000)
    p1_res = client.post("/api/products", json={
        "name": f"Product 1 {t}",
        "category_id": cat_id,
        "purchase_price": 100.0,
        "selling_price": 150.0,
        "opening_stock": 5.0,
        "custom_fields": [{"field_id": cf["id"], "value": "Grade A"}]
    })
    assert p1_res.status_code == 201
    p1 = p1_res.json()

    p2_res = client.post("/api/products", json={
        "name": f"Product 2 {t}",
        "category_id": cat_id,
        "purchase_price": 200.0,
        "selling_price": 250.0,
        "opening_stock": 10.0
    })
    assert p2_res.status_code == 201
    p2 = p2_res.json()

    # 4. Verify products exist
    prods_before = client.get(f"/api/products?category_id={cat_id}").json()
    assert len(prods_before) == 2

    # 5. Delete category
    del_res = client.delete(f"/api/categories/{cat_id}")
    assert del_res.status_code == 200

    # 6. Verify category is gone
    cats = client.get("/api/categories").json()
    assert not any(c["id"] == cat_id for c in cats)

    # 7. Verify all products in this category were deleted
    prods_after = client.get("/api/products").json()
    assert not any(p["id"] in [p1["id"], p2["id"]] for p in prods_after)

    # 8. Verify category-specific custom field was deleted
    cfs = client.get("/api/custom-fields").json()
    assert not any(f["id"] == cf["id"] for f in cfs)

def test_custom_general_preset_is_empty_blank_slate(client):
    # 1. Apply mobile preset first
    client.post("/api/settings/apply-preset", json={"preset_key": "mobile_electronics"})
    cfs_before = client.get("/api/custom-fields").json()
    assert len(cfs_before) > 0

    # 2. Apply Custom / Build Your Own
    res = client.post("/api/settings/apply-preset", json={"preset_key": "custom_general"})
    assert res.status_code == 200

    # 3. Verify custom fields are 100% empty
    cfs_after = client.get("/api/custom-fields").json()
    assert len(cfs_after) == 0



