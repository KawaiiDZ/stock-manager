import pytest
from unittest.mock import patch, MagicMock
from backend.app.services.escpos_service import (
    generate_escpos_receipt,
    send_to_thermal_printer,
)

def test_settings_thermal_quotations_fields(client):
    """Verify settings endpoint returns and updates thermal quotation fields."""
    res = client.get('/api/settings')
    assert res.status_code == 200, res.text
    initial = res.json()
    assert 'enable_thermal_quotations' in initial
    assert 'quotation_receipt_type' in initial

    # Update settings
    update_payload = {
        'enable_thermal_quotations': False,
        'quotation_receipt_type': 'thermal',
    }
    put_res = client.put('/api/settings', json=update_payload)
    assert put_res.status_code == 200, put_res.text
    updated = put_res.json()
    assert updated['enable_thermal_quotations'] is False
    assert updated['quotation_receipt_type'] == 'thermal'

    # Verify GET reflects updated values
    verify_res = client.get('/api/settings')
    assert verify_res.status_code == 200
    persisted = verify_res.json()
    assert persisted['enable_thermal_quotations'] is False
    assert persisted['quotation_receipt_type'] == 'thermal'

    # Revert back
    client.put('/api/settings', json={
        'enable_thermal_quotations': True,
        'quotation_receipt_type': 'pdf',
    })

def test_escpos_quotation_receipt_generation(db_session):
    """Verify ESC/POS binary receipt contains quotation disclaimers, items, and quote number."""
    from backend.app.models.business import BusinessSettings
    settings = db_session.query(BusinessSettings).filter(BusinessSettings.id == 1).first()

    quotation_data = {
        "receipt_number": "Q-000099",
        "created_at": "2026-10-31T12:00:00Z",
        "valid_until": "2026-11-15T12:00:00Z",
        "customer_name": "Acme Commercial Corp",
        "is_quotation": True,
        "quotation_status": "PENDING",
        "subtotal": 5000.0,
        "discount_amount": 500.0,
        "tax_amount": 0.0,
        "tax_rate": 0.0,
        "total_amount": 4500.0,
        "paid_amount": 0.0,
        "due_amount": 4500.0,
        "payment_status": "ESTIMATE",
        "notes": "Prices guaranteed for 15 days.",
        "terms": "Valid for 15 days upon stock confirmation.",
        "items": [
            {
                "product_name": "Premium Industrial Router",
                "quantity": 2.0,
                "returned_quantity": 0.0,
                "unit_price": 2500.0,
                "discount_amount": 500.0,
                "total_price": 4500.0,
            }
        ],
    }

    raw_bytes = generate_escpos_receipt(
        sale_data=quotation_data,
        settings=settings,
        paper_width="80mm",
        header_style="logo_text",
        receipt_layout="classic",
        show_barcode=True,
    )

    assert isinstance(raw_bytes, bytes)
    text_content = raw_bytes.decode('latin-1', errors='ignore')

    # Must contain commercial quotation title and estimate disclaimer
    assert "COMMERCIAL QUOTATION" in text_content
    assert "ESTIMATE ONLY - NOT A TAX INVOICE" in text_content
    assert "Quote #:" in text_content
    assert "Q-000099" in text_content
    assert "Acme Commercial Corp" in text_content
    assert "Premium Industrial Router" in text_content
    assert "ESTIMATED TOTAL:" in text_content
    assert "Valid for 15 days upon stock confirmation." in text_content

def test_print_thermal_direct_quotation_endpoint(client, db_session):
    """Verify POST /api/printing/receipt with quotation_id formats and sends to printer."""
    from backend.app.models.quotation import Quotation, QuotationItem
    from backend.app.models.product import Product

    # Create dummy product and quotation
    prod = Product(
        product_id="P-TEST-01",
        name="Quotation Test Widget",
        sku="Q-TEST-01",
        selling_price=1200.0,
        purchase_price=800.0,
        current_stock=50.0,
    )
    db_session.add(prod)
    db_session.commit()
    db_session.refresh(prod)

    quote = Quotation(
        quotation_number="Q-000888",
        customer_name="Test Enterprise Buyer",
        customer_phone="03001234567",
        subtotal=2400.0,
        discount_amount=0.0,
        tax_rate=0.0,
        tax_amount=0.0,
        total_amount=2400.0,
        status="PENDING",
    )
    db_session.add(quote)
    db_session.commit()
    db_session.refresh(quote)

    item = QuotationItem(
        quotation_id=quote.id,
        product_id=prod.id,
        product_name=prod.name,
        quantity=2.0,
        unit_price=1200.0,
        discount_amount=0.0,
        total_price=2400.0,
    )
    db_session.add(item)
    db_session.commit()

    with patch('backend.app.api.routes.printing.send_to_thermal_printer') as mock_send:
        mock_send.return_value = {
            "success": True,
            "printer": "Mock Thermal Printer",
            "bytes_sent": 850,
            "message": "Printed successfully to Mock Thermal Printer",
        }

        req_payload = {
            "quotation_id": quote.id,
            "paper_width": "80mm",
            "render_pipeline": "native_text",
        }
        res = client.post('/api/printing/receipt', json=req_payload)
        assert res.status_code == 200, res.text
        data = res.json()
        assert data['success'] is True
        assert data['printer'] == "Mock Thermal Printer"
        assert mock_send.called
