import pytest
from unittest.mock import patch, MagicMock
from types import SimpleNamespace
from backend.app.services.escpos_service import (
    list_system_printers,
    generate_escpos_receipt,
    send_to_thermal_printer,
    ESC,
    GS,
    CMD_INIT,
    CMD_CUT_PARTIAL,
)

def test_settings_thermal_printer_fields(client):
    # 1. Fetch current settings
    res = client.get('/api/settings')
    assert res.status_code == 200, res.text
    initial = res.json()
    assert 'thermal_print_mode' in initial
    assert 'thermal_header_style' in initial
    assert 'selected_thermal_printer' in initial

    # 2. Update with new thermal printer settings
    update_payload = {
        'thermal_print_mode': 'direct_escpos',
        'thermal_header_style': 'text_only',
        'selected_thermal_printer': 'PrinterCMD_ESCPO_POS80_Printer_USB',
    }
    put_res = client.put('/api/settings', json=update_payload)
    assert put_res.status_code == 200, put_res.text
    updated = put_res.json()
    assert updated['thermal_print_mode'] == 'direct_escpos'
    assert updated['thermal_header_style'] == 'text_only'
    assert updated['selected_thermal_printer'] == 'PrinterCMD_ESCPO_POS80_Printer_USB'

    # 3. Verify GET reflects updated values
    verify_res = client.get('/api/settings')
    assert verify_res.status_code == 200
    persisted = verify_res.json()
    assert persisted['thermal_print_mode'] == 'direct_escpos'
    assert persisted['thermal_header_style'] == 'text_only'
    assert persisted['selected_thermal_printer'] == 'PrinterCMD_ESCPO_POS80_Printer_USB'

    # 4. Revert
    client.put('/api/settings', json={
        'thermal_print_mode': 'browser',
        'thermal_header_style': 'logo_text',
        'selected_thermal_printer': '',
    })

def test_list_printers_endpoint(client):
    res = client.get('/api/printing/printers')
    assert res.status_code == 200, res.text
    printers = res.json()
    assert isinstance(printers, list)
    for p in printers:
        assert 'name' in p
        assert 'is_default' in p
        assert 'is_thermal' in p

def test_escpos_raw_receipt_generation_80mm():
    settings = SimpleNamespace(
        business_name="Super Mart",
        phone="0300-1234567",
        address="Commercial Area Phase 5",
        currency="Rs.",
        receipt_header="Official Receipt",
        receipt_footer="Thank you for shopping!",
    )
    sale_data = {
        "receipt_number": "RCP-1001",
        "created_at": "2026-09-28 14:30:00",
        "customer_name": "Walk-in Customer",
        "items": [
            {
                "product_name": "Premium Wireless Mouse",
                "quantity": 2,
                "unit_price": 1200,
                "discount_amount": 100,
                "total_price": 2300,
            }
        ],
        "subtotal": 2400,
        "discount_amount": 100,
        "tax_rate": 5.0,
        "tax_amount": 115,
        "total_amount": 2415,
        "paid_amount": 2500,
        "due_amount": 0,
        "payment_status": "PAID",
    }
    receipt_bytes = generate_escpos_receipt(
        sale_data=sale_data,
        settings=settings,
        paper_width="80mm",
        header_style="logo_text",
        show_barcode=True,
    )

    assert isinstance(receipt_bytes, bytes)
    assert CMD_INIT in receipt_bytes
    assert CMD_CUT_PARTIAL in receipt_bytes
    assert b"Super Mart" in receipt_bytes
    assert b"Premium Wireless Mouse" in receipt_bytes
    assert b"RCP-1001" in receipt_bytes

def test_escpos_raw_receipt_generation_58mm_text_only():
    settings = SimpleNamespace(
        business_name="Corner Store",
        phone="0311-9876543",
        address="Shop #4 Block B",
        currency="$",
        receipt_header="",
        receipt_footer="Visit Again",
    )
    sale_data = {
        "receipt_number": "RCP-5801",
        "created_at": "2026-09-28 15:00:00",
        "customer_name": "Ali Raza",
        "items": [
            {
                "product_name": "USB Cable",
                "quantity": 1,
                "unit_price": 15,
                "discount_amount": 0,
                "total_price": 15,
            }
        ],
        "subtotal": 15,
        "discount_amount": 0,
        "tax_rate": 0,
        "tax_amount": 0,
        "total_amount": 15,
        "paid_amount": 20,
        "due_amount": 0,
        "payment_status": "PAID",
    }
    receipt_bytes = generate_escpos_receipt(
        sale_data=sale_data,
        settings=settings,
        paper_width="58mm",
        header_style="text_only",
        show_barcode=False,
    )

    assert isinstance(receipt_bytes, bytes)
    assert CMD_INIT in receipt_bytes
    assert CMD_CUT_PARTIAL in receipt_bytes
    assert b"Corner Store" in receipt_bytes
    assert b"RCP-5801" in receipt_bytes

@patch('backend.app.api.routes.printing.send_to_thermal_printer')
def test_direct_thermal_print_endpoint_sample(mock_send, client):
    mock_send.return_value = {
        'success': True,
        'printer': 'Test_POS80',
        'bytes_sent': 512,
        'message': 'Successfully sent 512 bytes',
    }

    payload = {
        'printer_name': 'Test_POS80',
        'paper_width': '80mm',
        'header_style': 'logo_text',
        'show_barcode': True,
        'is_sample': True,
    }
    res = client.post('/api/printing/receipt', json=payload)
    assert res.status_code == 200, res.text
    data = res.json()
    assert data['success'] is True
    assert data['printer'] == 'Test_POS80'
    assert mock_send.called

@patch('backend.app.api.routes.printing.clear_printer_queue')
def test_clear_printer_queue_endpoint(mock_clear, client):
    mock_clear.return_value = {
        'success': True,
        'message': "Print queue for 'Test_POS80' successfully cleared and reset.",
    }

    res = client.post('/api/printing/clear-queue', json={'printer_name': 'Test_POS80'})
    assert res.status_code == 200, res.text
    data = res.json()
    assert data['success'] is True
    assert 'Test_POS80' in data['message']
    assert mock_clear.called

@patch('backend.app.api.routes.printing.send_to_thermal_printer')
def test_direct_thermal_print_offline_warning(mock_send, client):
    mock_send.return_value = {
        'success': True,
        'printer': 'Test_Offline_POS',
        'bytes_sent': 512,
        'is_online': False,
        'warning': 'Printer is currently OFFLINE / Powered Off.',
        'message': 'Queued but offline',
    }

    payload = {
        'printer_name': 'Test_Offline_POS',
        'is_sample': True,
    }
    res = client.post('/api/printing/receipt', json=payload)
    assert res.status_code == 200, res.text
    data = res.json()
    assert data['success'] is True
    assert data['is_online'] is False
    assert data['warning'] is not None

def test_windows_send_raw_via_win32print():
    from backend.app.services.escpos_service import _send_windows_raw
    mock_win32 = MagicMock()
    mock_win32.OpenPrinter.return_value = 1234
    mock_win32.StartDocPrinter.return_value = 5678
    mock_win32.WritePrinter.return_value = 42

    with patch.dict('sys.modules', {'win32print': mock_win32}):
        bytes_sent = _send_windows_raw("POS-80", b"\x1b@Hello World", "Test Receipt")
        assert bytes_sent == 42
        mock_win32.OpenPrinter.assert_called_with("POS-80")
        mock_win32.StartDocPrinter.assert_called_with(1234, 1, ("Test Receipt", None, "RAW"))
        mock_win32.WritePrinter.assert_called_with(1234, b"\x1b@Hello World")
        mock_win32.ClosePrinter.assert_called_with(1234)

def test_windows_send_raw_via_ctypes():
    from backend.app.services.escpos_service import _send_windows_raw
    mock_dll = MagicMock()
    mock_dll.OpenPrinterW.return_value = 1
    mock_dll.StartDocPrinterW.return_value = 1
    mock_dll.StartPagePrinter.return_value = 1
    mock_dll.WritePrinter.return_value = 1
    mock_dll.EndPagePrinter.return_value = 1
    mock_dll.EndDocPrinter.return_value = 1
    mock_dll.ClosePrinter.return_value = 1

    with patch.dict('sys.modules', {'win32print': None}):
        with patch('ctypes.WinDLL', create=True, return_value=mock_dll):
            bytes_sent = _send_windows_raw("POS-80", b"\x1b@Hello World", "Test Receipt")
            assert bytes_sent == len(b"\x1b@Hello World")
            assert mock_dll.OpenPrinterW.called
            assert mock_dll.StartDocPrinterW.called
            assert mock_dll.WritePrinter.called
            assert mock_dll.ClosePrinter.called

def test_windows_printer_enumeration_offline_detection():
    from backend.app.services.escpos_service import list_system_printers
    import json
    fake_printers = [
        {
            "Name": "POS-80",
            "PortName": "USB001",
            "Type": "Local",
            "IsDefault": True,
            "PrinterStatus": "Normal",
            "WorkOffline": False
        },
        {
            "Name": "Office_Receipt_58",
            "PortName": "USB002",
            "Type": "Local",
            "IsDefault": False,
            "PrinterStatus": "Offline",
            "WorkOffline": True
        }
    ]
    fake_res = MagicMock()
    fake_res.returncode = 0
    fake_res.stdout = json.dumps(fake_printers)

    with patch('platform.system', return_value='Windows'):
        with patch('subprocess.run', return_value=fake_res):
            printers = list_system_printers()
            assert len(printers) == 2
            pos80 = next(p for p in printers if p['name'] == 'POS-80')
            assert pos80['is_online'] is True
            assert pos80['status'] == 'Ready'
            assert pos80['is_thermal'] is True

            off_pos = next(p for p in printers if p['name'] == 'Office_Receipt_58')
            assert off_pos['is_online'] is False
            assert off_pos['status'] == 'Offline'
            assert off_pos['is_thermal'] is True


def test_resolve_target_printer():
    from backend.app.services.escpos_service import resolve_target_printer

    available = [
        {"name": "HP LaserJet Pro", "is_thermal": False, "is_default": False, "is_online": True},
        {"name": "POS-80 Thermal Printer", "is_thermal": True, "is_default": False, "is_online": True},
        {"name": "Epson TM-T20II (Copy 1)", "is_thermal": True, "is_default": True, "is_online": True},
    ]

    # Exact match
    target, info = resolve_target_printer("HP LaserJet Pro", available)
    assert target == "HP LaserJet Pro"
    assert info is not None

    # Case-insensitive
    target, info = resolve_target_printer("pos-80 thermal printer", available)
    assert target == "POS-80 Thermal Printer"

    # Alphanumeric slug match
    target, info = resolve_target_printer("POS80ThermalPrinter", available)
    assert target == "POS-80 Thermal Printer"

    # Substring match (e.g. user selected "Epson TM-T20II" but Windows renamed to "(Copy 1)")
    target, info = resolve_target_printer("Epson TM-T20II", available)
    assert target == "Epson TM-T20II (Copy 1)"

    # Fallback to detected thermal printer when None requested
    target, info = resolve_target_printer(None, available)
    assert target in ["POS-80 Thermal Printer", "Epson TM-T20II (Copy 1)"]
    assert info["is_thermal"] is True

    # Fallback to default when no thermal available
    non_thermal = [
        {"name": "Canon Inactive", "is_thermal": False, "is_default": False, "is_online": True},
        {"name": "Default Office DeskJet", "is_thermal": False, "is_default": True, "is_online": True},
    ]
    target, info = resolve_target_printer(None, non_thermal)
    assert target == "Default Office DeskJet"


def test_safe_escpos_text():
    from backend.app.services.escpos_service import safe_escpos_text

    # Currency replacements
    assert safe_escpos_text("Total: ₨ 1,500.00") == b"Total: Rs. 1,500.00"
    assert safe_escpos_text("Price: ₹ 250") == b"Price: Rs. 250"
    assert safe_escpos_text("Amount: € 45.00") == b"Amount: EUR 45.00"
    assert safe_escpos_text("Fee: £ 10.00") == b"Fee: GBP 10.00"

    # Smart quotes and dashes (em-dash translates to --)
    assert safe_escpos_text("“Best Store” — ‘Discount’") == b'"Best Store" -- \'Discount\''

    # Arbitrary unicode characters should safely encode without throwing
    res = safe_escpos_text("Special item ★ ♠ ☕")
    assert isinstance(res, bytes)


def test_cash_drawer_kick_in_escpos_payload():
    from backend.app.services.escpos_service import CMD_CASH_DRAWER_KICK, CMD_CASH_DRAWER_KICK_PIN2, CMD_CASH_DRAWER_KICK_PIN5

    assert CMD_CASH_DRAWER_KICK_PIN2 in CMD_CASH_DRAWER_KICK
    assert CMD_CASH_DRAWER_KICK_PIN5 in CMD_CASH_DRAWER_KICK

    settings = SimpleNamespace(
        business_name="Test Store",
        phone="123",
        address="Test Addr",
        currency="Rs.",
        receipt_header="",
        receipt_footer="",
    )
    sale_data = {
        "receipt_number": "RCP-KD",
        "created_at": "2026-09-28 14:00:00",
        "items": [],
        "total_amount": 100,
        "paid_amount": 100,
    }

    # Without drawer kick
    buf_no_kick = generate_escpos_receipt(sale_data, settings=settings, kick_drawer=False)
    assert CMD_CASH_DRAWER_KICK not in buf_no_kick

    # With drawer kick
    buf_kick = generate_escpos_receipt(sale_data, settings=settings, kick_drawer=True)
    assert CMD_CASH_DRAWER_KICK in buf_kick


def test_image_to_escpos_raster():
    from backend.app.services.escpos_service import image_to_escpos_raster
    from PIL import Image

    # Test with generated PIL Image
    img = Image.new("RGBA", (100, 40), (255, 255, 255, 0))
    # Draw simple black square
    for x in range(20, 80):
        for y in range(10, 30):
            img.putpixel((x, y), (0, 0, 0, 255))

    raster_bytes_80 = image_to_escpos_raster(img, paper_width="80mm")
    assert raster_bytes_80 is not None
    assert raster_bytes_80.startswith(b"\x1dv0\x00")

    raster_bytes_58 = image_to_escpos_raster(img, paper_width="58mm")
    assert raster_bytes_58 is not None
    assert raster_bytes_58.startswith(b"\x1dv0\x00")
    # 58mm should be narrower than 80mm
    assert len(raster_bytes_58) < len(raster_bytes_80)


def test_generate_escpos_receipt_classic_vs_modern_layouts():
    settings = SimpleNamespace(
        business_name="Solar Solutions",
        phone="0321-1234567",
        address="Bypass Road",
        currency="Rs.",
        receipt_header="",
        receipt_footer="Visit again",
    )
    sale_data = {
        "receipt_number": "TEST-LAYOUT-01",
        "created_at": "2026-09-30 17:00:00",
        "items": [
            {
                "product_name": "Inverter 3kW",
                "quantity": 1,
                "unit_price": 50000,
                "discount_amount": 1000,
                "total_price": 49000,
            }
        ],
        "total_amount": 49000,
        "paid_amount": 50000,
    }

    # Classic layout
    classic_bytes = generate_escpos_receipt(sale_data, settings=settings, receipt_layout="classic")
    assert b"Description" in classic_bytes
    assert b"Lines / Units:" in classic_bytes
    assert b"-> Disc:" in classic_bytes
    assert b"Paid Amount:" in classic_bytes
    assert b"Change:" in classic_bytes

    # Modern layout
    modern_bytes = generate_escpos_receipt(sale_data, settings=settings, receipt_layout="modern")
    assert b"DESCRIPTION" in modern_bytes
    assert b"Items / Units:" in modern_bytes
    assert b"Paid:" in modern_bytes


def test_generate_escpos_receipt_logo_inclusion_and_omission():
    settings = SimpleNamespace(
        business_name="Logo Test Store",
        phone="123",
        address="Test",
        currency="Rs.",
        receipt_header="",
        receipt_footer="",
        receipt_logo_path=None,
        logo_path=None,
    )
    sale_data = {
        "receipt_number": "TEST-LOGO-01",
        "created_at": "2026-09-30 17:00:00",
        "items": [],
        "total_amount": 100,
        "paid_amount": 100,
    }

    # With Logo (header_style="logo_text")
    buf_logo = generate_escpos_receipt(sale_data, settings=settings, header_style="logo_text")
    assert b"\x1dv0\x00" in buf_logo  # ESC/POS raster image command present

    # Without Logo (header_style="text_only")
    buf_no_logo = generate_escpos_receipt(sale_data, settings=settings, header_style="text_only")
    assert b"\x1dv0\x00" not in buf_no_logo  # ESC/POS raster image command completely omitted




