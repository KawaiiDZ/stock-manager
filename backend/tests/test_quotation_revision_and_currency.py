import pytest
from decimal import Decimal
from fastapi.testclient import TestClient
from backend.app.models.product import Product
from backend.app.models.business import BusinessSettings

def test_quotation_revision_workflow(client: TestClient, db_session):
    # 1. Setup products
    p1 = Product(
        product_id="P-000001",
        name="Solar Panel 550W",
        barcode="SP550",
        purchase_price=Decimal("25000.00"),
        selling_price=Decimal("38000.00"),
        current_stock=Decimal("10.00")
    )
    p2 = Product(
        product_id="P-000002",
        name="Hybrid Inverter 10kW",
        barcode="INV10K",
        purchase_price=Decimal("200000.00"),
        selling_price=Decimal("330000.00"),
        current_stock=Decimal("5.00")
    )
    db_session.add_all([p1, p2])
    db_session.commit()

    # 2. Create initial quotation
    res_orig = client.post("/api/quotations", json={
        "customer_name": "Test Customer Alpha",
        "customer_phone": "03001234567",
        "customer_address": "Sector F-10, Islamabad",
        "items": [
            {
                "product_id": p1.id,
                "quantity": 2,
                "unit_price": 38000.0,
                "discount_amount": 1000.0,
                "notes": "Initial agreed discount"
            }
        ],
        "discount_amount": 0.0,
        "tax_rate": 0.0,
        "notes": "Version 1 proposal"
    })
    assert res_orig.status_code == 201
    orig_q = res_orig.json()
    orig_id = orig_q["id"]
    orig_number = orig_q["quotation_number"]
    assert orig_q["status"] == "PENDING"
    assert orig_q["customer_name"] == "Test Customer Alpha"

    # 3. Revise the quotation (adds second product, changes quantity)
    res_rev = client.post(f"/api/quotations/{orig_id}/revise", json={
        "customer_name": "Test Customer Alpha",
        "customer_phone": "03001234567",
        "customer_address": "Sector F-10, Islamabad",
        "items": [
            {
                "product_id": p1.id,
                "quantity": 3,
                "unit_price": 37500.0,
                "discount_amount": 500.0,
                "notes": "Revised volume pricing"
            },
            {
                "product_id": p2.id,
                "quantity": 1,
                "unit_price": 330000.0,
                "discount_amount": 5000.0,
                "notes": "Added inverter package"
            }
        ],
        "discount_amount": 2000.0,
        "tax_rate": 5.0,
        "notes": "Customer requested package upgrade"
    })
    assert res_rev.status_code == 201
    rev_q = res_rev.json()
    assert rev_q["id"] != orig_id
    assert rev_q["quotation_number"] != orig_number
    assert rev_q["status"] == "PENDING"
    assert f"[Revised from {orig_number}]" in rev_q["notes"]

    # 4. Verify original quotation is now SUPERSEDED
    res_check_orig = client.get(f"/api/quotations/{orig_id}")
    assert res_check_orig.status_code == 200
    orig_checked = res_check_orig.json()
    assert orig_checked["status"] == "SUPERSEDED"
    assert rev_q["quotation_number"] in orig_checked["rejection_reason"]

    # 5. Cannot re-revise an already superseded quotation
    res_fail_superseded = client.post(f"/api/quotations/{orig_id}/revise", json={
        "customer_name": "Test Customer Alpha",
        "customer_phone": "03001234567",
        "items": [{"product_id": p1.id, "quantity": 1, "unit_price": 38000.0}]
    })
    assert res_fail_superseded.status_code == 400
    assert "already been superseded" in res_fail_superseded.json()["detail"]

    # 6. Convert revised quotation to invoice
    res_conv = client.post(f"/api/quotations/{rev_q['id']}/convert", json={
        "price_mode": "quoted",
        "payment_method": "Cash"
    })
    assert res_conv.status_code == 200

    # 7. Cannot revise an approved/converted quotation
    res_fail_approved = client.post(f"/api/quotations/{rev_q['id']}/revise", json={
        "customer_name": "Test Customer Alpha",
        "customer_phone": "03001234567",
        "items": [{"product_id": p1.id, "quantity": 1, "unit_price": 38000.0}]
    })
    assert res_fail_approved.status_code == 400
    assert "already been converted" in res_fail_approved.json()["detail"]
