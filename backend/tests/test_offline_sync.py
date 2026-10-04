import pytest
from decimal import Decimal
from fastapi.testclient import TestClient
from backend.app.models.product import Product
from backend.app.models.inventory import InventoryBatch, InventoryMovement

def test_sync_push_new_product(client: TestClient, db_session):
    commit_payload = {
        "client_id": "terminal_station_b",
        "station_name": "Warehouse Shelf 4",
        "commits": [
            {
                "id": "commit-uuid-001",
                "action": "ADD_PRODUCT",
                "timestamp": "2026-10-04T10:00:00Z",
                "data": {
                    "name": "Wireless Ergonomic Mouse",
                    "barcode": "8901234567890",
                    "sku": "MOUSE-ERG-01",
                    "purchase_price": "25.00",
                    "selling_price": "45.00",
                    "opening_stock": "30.00",
                    "min_stock_alert": "5.00"
                }
            }
        ]
    }

    res = client.post("/api/sync/push", json=commit_payload)
    assert res.status_code == 200
    data = res.json()
    assert data["success"] is True
    assert data["processed_count"] == 1
    assert data["skipped_count"] == 0
    assert data["results"][0]["status"] == "CREATED_NEW"

    # Verify database state
    prod = db_session.query(Product).filter(Product.barcode == "8901234567890").first()
    assert prod is not None
    assert prod.name == "Wireless Ergonomic Mouse"
    assert Decimal(str(prod.current_stock)) == Decimal("30.00")

    batches = db_session.query(InventoryBatch).filter(InventoryBatch.product_id == prod.id).all()
    assert len(batches) == 1
    assert Decimal(str(batches[0].quantity_remaining)) == Decimal("30.00")

def test_sync_push_additive_merge_collision(client: TestClient, db_session):
    """
    Edge case: Host already has 'USB-C Cable' with 10 units in stock.
    Warehouse terminal was offline and added 'USB-C Cable' with 20 units.
    Sync MUST add 20 units to Host's 10 units = total 30 units, NOT overwrite to 20!
    """
    # 1. Host creates product with 10 units
    host_prod_res = client.post("/api/products", json={
        "name": "Braided USB-C Cable 2M",
        "barcode": "1122334455667",
        "sku": "CABLE-USBC-2M",
        "purchase_price": "3.00",
        "selling_price": "8.00",
        "opening_stock": "10.00",
        "min_stock_alert": "2.00"
    })
    assert host_prod_res.status_code in [200, 201]
    host_prod_id = host_prod_res.json()["id"]

    # 2. Remote terminal pushes commit with 20 units of the same barcode
    push_payload = {
        "client_id": "terminal_station_c",
        "station_name": "Backroom Restock Station",
        "commits": [
            {
                "id": "commit-uuid-002",
                "action": "ADD_PRODUCT",
                "timestamp": "2026-10-04T10:15:00Z",
                "data": {
                    "name": "Braided USB-C Cable 2M",
                    "barcode": "1122334455667",
                    "sku": "CABLE-USBC-2M",
                    "purchase_price": "3.50",
                    "selling_price": "8.00",
                    "opening_stock": "20.00"
                }
            }
        ]
    }
    push_res = client.post("/api/sync/push", json=push_payload)
    assert push_res.status_code == 200
    push_data = push_res.json()
    assert push_data["processed_count"] == 1
    assert push_data["results"][0]["status"] == "ADDITIVE_MERGED"
    assert Decimal(str(push_data["results"][0]["new_stock"])) == Decimal("30.00")

    # Verify product current_stock on Host is 10 + 20 = 30
    db_session.expire_all()
    prod = db_session.query(Product).filter(Product.id == host_prod_id).first()
    assert Decimal(str(prod.current_stock)) == Decimal("30.00")

    # Verify FIFO batches: Should have initial 10 batch + incoming 20 batch
    batches = db_session.query(InventoryBatch).filter(InventoryBatch.product_id == host_prod_id).all()
    assert len(batches) == 2
    total_batch_qty = sum(Decimal(str(b.quantity_remaining)) for b in batches)
    assert total_batch_qty == Decimal("30.00")

def test_sync_push_restock_delta(client: TestClient, db_session):
    # Host creates product with 5 units
    prod_res = client.post("/api/products", json={
        "name": "Mechanic Gloves L",
        "barcode": "9988776655443",
        "sku": "GLOVES-L",
        "purchase_price": "5.00",
        "selling_price": "12.00",
        "opening_stock": "5.00"
    })
    assert prod_res.status_code in [200, 201]
    prod_id = prod_res.json()["id"]

    # Remote terminal pushes RESTOCK_DELTA of +15 units
    delta_payload = {
        "client_id": "terminal_station_b",
        "station_name": "Warehouse Station",
        "commits": [
            {
                "id": "commit-uuid-003",
                "action": "RESTOCK_DELTA",
                "timestamp": "2026-10-04T10:30:00Z",
                "data": {
                    "product_id": prod_id,
                    "barcode": "9988776655443",
                    "delta_quantity": "15.00",
                    "unit_cost": "5.25"
                }
            }
        ]
    }
    res = client.post("/api/sync/push", json=delta_payload)
    assert res.status_code == 200
    res_data = res.json()
    assert res_data["results"][0]["status"] == "ADDITIVE_MERGED"
    assert Decimal(str(res_data["results"][0]["new_stock"])) == Decimal("20.00")

    db_session.expire_all()
    prod = db_session.query(Product).filter(Product.id == prod_id).first()
    assert Decimal(str(prod.current_stock)) == Decimal("20.00")

def test_sync_idempotency_prevents_duplicate_restock(client: TestClient, db_session):
    """
    Submitting the same commit_id twice must be safely ignored and not double-restock!
    """
    prod_res = client.post("/api/products", json={
        "name": "Industrial Tape 50m",
        "barcode": "7766554433221",
        "purchase_price": "2.00",
        "selling_price": "5.00",
        "opening_stock": "10.00"
    })
    assert prod_res.status_code in [200, 201]
    prod_id = prod_res.json()["id"]

    commit_payload = {
        "client_id": "scanner_station_1",
        "station_name": "Receiving Dock",
        "commits": [
            {
                "id": "commit-idempotent-999",
                "action": "RESTOCK_DELTA",
                "data": {
                    "product_id": prod_id,
                    "delta_quantity": "25.00"
                }
            }
        ]
    }

    # First push
    res1 = client.post("/api/sync/push", json=commit_payload)
    assert res1.status_code == 200
    assert res1.json()["processed_count"] == 1
    assert res1.json()["skipped_count"] == 0

    db_session.expire_all()
    prod = db_session.query(Product).filter(Product.id == prod_id).first()
    assert Decimal(str(prod.current_stock)) == Decimal("35.00")

    # Second push with identical commit id (e.g. network retry)
    res2 = client.post("/api/sync/push", json=commit_payload)
    assert res2.status_code == 200
    assert res2.json()["processed_count"] == 0
    assert res2.json()["skipped_count"] == 1
    assert res2.json()["results"][0]["status"] == "ALREADY_PROCESSED"

    # Stock must STILL be 35.00, NOT 60.00!
    db_session.expire_all()
    prod = db_session.query(Product).filter(Product.id == prod_id).first()
    assert Decimal(str(prod.current_stock)) == Decimal("35.00")
