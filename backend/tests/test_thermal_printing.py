import pytest
from unittest.mock import patch, MagicMock
from types import SimpleNamespace
from backend.app.services.escpos_service import (
    list_system_printers,
    generate_escpos_receipt,
    generate_code128_raster_escpos,
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


def test_windows_printer_merge_win32_and_powershell():
    from backend.app.services.escpos_service import list_system_printers
    import json

    mock_win32 = MagicMock()
    mock_win32.GetDefaultPrinter.return_value = "Canon LBP2900"
    mock_win32.PRINTER_ENUM_LOCAL = 2
    mock_win32.PRINTER_ENUM_CONNECTIONS = 4
    # Level 2 returns Canon LBP2900, Level 4 returns empty
    mock_win32.EnumPrinters.side_effect = [
        [{"pPrinterName": "Canon LBP2900", "pPortName": "USB001", "Status": 0, "Attributes": 0}],
        [],
    ]

    # PowerShell returns POS-80 and Microsoft Print to PDF that win32 missed
    ps_printers = [
        {"Name": "Canon LBP2900", "PortName": "USB001", "IsDefault": True, "PrinterStatus": "Normal", "WorkOffline": False},
        {"Name": "POS-80", "PortName": "USB002", "IsDefault": False, "PrinterStatus": "Normal", "WorkOffline": False},
        {"Name": "Microsoft Print to PDF", "PortName": "PORTPROMPT:", "IsDefault": False, "PrinterStatus": "Normal", "WorkOffline": False},
    ]
    fake_res = MagicMock()
    fake_res.returncode = 0
    fake_res.stdout = json.dumps(ps_printers)

    with patch('platform.system', return_value='Windows'):
        with patch.dict('sys.modules', {'win32print': mock_win32}):
            with patch('subprocess.run', return_value=fake_res):
                printers = list_system_printers()
                assert len(printers) == 3
                names = [p['name'] for p in printers]
                assert "Canon LBP2900" in names
                assert "POS-80" in names
                assert "Microsoft Print to PDF" in names

                canon = next(p for p in printers if p['name'] == 'Canon LBP2900')
                assert canon['is_default'] is True
                assert canon['is_thermal'] is False

                pos = next(p for p in printers if p['name'] == 'POS-80')
                assert pos['is_thermal'] is True


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
    assert b"TOTAL DUE:" in modern_bytes

    # Tabular layout
    tabular_bytes = generate_escpos_receipt(sale_data, settings=settings, receipt_layout="tabular")
    assert b"ITEM" in tabular_bytes
    assert b"QTY" in tabular_bytes
    assert b"PRICE" in tabular_bytes
    assert b"TOTAL AMOUNT:" in tabular_bytes

    # Compact layout
    compact_bytes = generate_escpos_receipt(sale_data, settings=settings, receipt_layout="compact")
    assert b">>> TOTAL:" in compact_bytes
    assert b"SUB:" in compact_bytes

    # Elegant layout (with custom or default boutique subtitle)
    settings.receipt_header = "~ Boutique Guest Receipt ~"
    elegant_bytes = generate_escpos_receipt(sale_data, settings=settings, receipt_layout="elegant")
    assert b"Boutique Guest Receipt" in elegant_bytes
    assert b"NET AMOUNT PAYABLE" in elegant_bytes

    # Elegant layout with user customized subtitle
    settings.receipt_header = "Fine Dining Guest Bill"
    elegant_custom = generate_escpos_receipt(sale_data, settings=settings, receipt_layout="elegant")
    assert b"Fine Dining Guest Bill" in elegant_custom

    # Elegant layout with subtitle removed (empty string)
    settings.receipt_header = ""
    elegant_removed = generate_escpos_receipt(sale_data, settings=settings, receipt_layout="elegant")
    assert b"Boutique Guest Receipt" not in elegant_removed
    assert b"NET AMOUNT PAYABLE" in elegant_removed


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
    assert b"\x1dv0\x00" in buf_logo  # ESC/POS raster command present

    # Without Logo (header_style="text_only")
    buf_no_logo = generate_escpos_receipt(sale_data, settings=settings, header_style="text_only")
    # Logo inclusion adds significant raster image payload compared to text-only mode
    assert len(buf_logo) > len(buf_no_logo)


@patch('backend.app.api.routes.printing.send_to_thermal_printer')
def test_direct_thermal_print_deduplication(mock_send, client):
    mock_send.return_value = {
        'success': True,
        'printer': 'Test_Dedup_POS',
        'bytes_sent': 512,
        'message': 'Successfully sent 512 bytes',
    }

    payload = {
        'printer_name': 'Test_Dedup_POS',
        'paper_width': '80mm',
        'header_style': 'logo_text',
        'show_barcode': True,
        'is_sample': True,
        'layout': 'modern',
    }

    # First call: should reach the printer
    res1 = client.post('/api/printing/receipt', json=payload)
    assert res1.status_code == 200, res1.text
    assert mock_send.call_count == 1

    # Immediate second call with identical payload: should be deduplicated (return cached response, NOT calling printer again)
    res2 = client.post('/api/printing/receipt', json=payload)
    assert res2.status_code == 200, res2.text
    assert mock_send.call_count == 1
    assert res2.json()['success'] is True


def test_universal_printer_profiles():
    from backend.app.services.escpos_service import (
        generate_escpos_receipt,
        CMD_HEATING_MAX,
        CMD_DENSITY_MAX,
        CMD_STAR_CUT_PARTIAL,
        CMD_CUT_PARTIAL,
        ESC,
    )
    settings = SimpleNamespace(
        business_name="Universal POS Store",
        phone="0300-1112223",
        address="Main Boulevard",
        currency="Rs.",
        receipt_header="",
        receipt_footer="Visit again",
    )
    sale_data = {
        "receipt_number": "UNI-001",
        "created_at": "2026-09-30 20:00:00",
        "items": [],
        "total_amount": 500,
        "paid_amount": 500,
    }

    # 1. Standard ESC/POS (Epson/Bixolon/Citizen/Universal default): Clean standard codes, no vendor-specific ESC 7 / DC2
    std_bytes = generate_escpos_receipt(
        sale_data, settings=settings, printer_profile="standard_escpos", darkness="maximum"
    )
    assert CMD_HEATING_MAX not in std_bytes
    assert CMD_DENSITY_MAX not in std_bytes
    assert CMD_CUT_PARTIAL in std_bytes

    # 2. Xprinter Enhanced: Hardware heating booster included in maximum darkness
    xp_bytes = generate_escpos_receipt(
        sale_data, settings=settings, printer_profile="xprinter_enhanced", darkness="maximum"
    )
    assert CMD_HEATING_MAX in xp_bytes
    assert CMD_DENSITY_MAX in xp_bytes

    # 3. Star Line mode: Uses Star Micronics cut command (ESC d 2)
    star_bytes = generate_escpos_receipt(
        sale_data, settings=settings, printer_profile="star_line", cut_mode="partial"
    )
    assert CMD_STAR_CUT_PARTIAL in star_bytes

    # 4. Generic Plain text mode: Zero binary ESC control codes
    plain_bytes = generate_escpos_receipt(
        sale_data, settings=settings, printer_profile="generic_plain"
    )
    assert ESC not in plain_bytes
    assert b"Universal POS Store" in plain_bytes
    assert b"TOTAL:" in plain_bytes


def test_universal_column_geometries():
    from backend.app.services.escpos_service import generate_escpos_receipt

    settings = SimpleNamespace(
        business_name="Width Geometry Store",
        phone="123",
        address="",
        currency="$",
        receipt_header="",
        receipt_footer="",
    )
    sale_data = {
        "receipt_number": "WIDTH-001",
        "created_at": "2026-09-30 20:00:00",
        "items": [],
        "total_amount": 100,
        "paid_amount": 100,
    }

    # 80mm compact (42 cols)
    compact_80 = generate_escpos_receipt(sale_data, settings=settings, paper_width="80mm_compact")
    assert b"\x1dv0\x00" in compact_80
    assert b"WIDTH-001" in compact_80

    # 58mm narrow (30 cols)
    narrow_58 = generate_escpos_receipt(sale_data, settings=settings, paper_width="58mm_narrow")
    assert b"\x1dv0\x00" in narrow_58
    assert b"WIDTH-001" in narrow_58


def test_network_printer_target_detection():
    from backend.app.services.escpos_service import is_network_printer_target

    assert is_network_printer_target("192.168.1.100") is True
    assert is_network_printer_target("192.168.1.200:9100") is True
    assert is_network_printer_target("tcp://10.0.0.5:9100") is True
    assert is_network_printer_target("socket://192.168.0.50") is True
    assert is_network_printer_target("PrinterCMD_ESCPO_POS80_Printer_USB") is False
    assert is_network_printer_target("HP_LaserJet_M2727nf") is False
    assert is_network_printer_target("") is False
    assert is_network_printer_target(None) is False


def test_generate_diagnostic_receipt():
    from backend.app.services.escpos_service import generate_diagnostic_receipt

    settings = SimpleNamespace(
        business_name="Calibration Diagnostic Lab",
        receipt_logo_path=None,
        logo_path=None,
    )

    diag_bytes = generate_diagnostic_receipt(
        settings=settings,
        paper_width="80mm",
        printer_profile="standard_escpos",
        printer_name="POS-80-Test",
        darkness="normal",
        cut_mode="partial",
        feed_lines=4,
    )

    assert isinstance(diag_bytes, bytes)
    assert b"THERMAL CALIBRATION & DIAGNOSTIC" in diag_bytes
    assert b"COLUMN ALIGNMENT RULER" in diag_bytes
    assert b"PRINT HEAD DENSITY TEST" in diag_bytes
    assert b"HARDWARE BARCODE TEST" in diag_bytes
    assert b"CALIBRATION OK - PRINTER READY" in diag_bytes


@patch('backend.app.api.routes.printing.send_to_thermal_printer')
def test_diagnostic_endpoint(mock_send, client):
    mock_send.return_value = {
        'success': True,
        'printer': 'Test_POS_Printer',
        'bytes_sent': 850,
        'message': 'Successfully sent calibration receipt',
    }

    payload = {
        'printer_name': 'Test_POS_Printer',
        'paper_width': '80mm',
        'printer_profile': 'standard_escpos',
        'darkness': 'normal',
        'cut_mode': 'partial',
        'feed_lines': 4,
    }

    res = client.post('/api/printing/diagnostic', json=payload)
    assert res.status_code == 200, res.text
    data = res.json()
    assert data['success'] is True
    assert data['printer'] == 'Test_POS_Printer'
    assert mock_send.called


def test_generate_code128_raster_escpos():
    # 80mm roll width
    bc_80 = generate_code128_raster_escpos("TEST-POS-001", paper_width="80mm", height_dots=56, include_text=True)
    assert isinstance(bc_80, bytes)
    assert bc_80.startswith(b"\x1d\x76\x30\x00")  # GS v 0 raster header
    assert b"TEST-POS-001" in bc_80  # HRI text included

    # 58mm roll width
    bc_58 = generate_code128_raster_escpos("TEST-POS-001", paper_width="58mm", height_dots=40, include_text=True)
    assert isinstance(bc_58, bytes)
    assert bc_58.startswith(b"\x1d\x76\x30\x00")
    assert b"TEST-POS-001" in bc_58

    # Empty text returns empty bytes
    assert generate_code128_raster_escpos("") == b""


def test_raster_image_to_escpos_and_raster_endpoint(client, db_session):
    import base64
    import io
    from PIL import Image, ImageDraw
    from backend.app.services.escpos_service import raster_image_to_escpos

    # Create dummy receipt image
    img = Image.new('RGB', (576, 200), (255, 255, 255))
    d = ImageDraw.Draw(img)
    d.text((10, 10), "Receipt Test", fill=(0, 0, 0))
    buf = io.BytesIO()
    img.save(buf, format='PNG')
    b64_png = "data:image/png;base64," + base64.b64encode(buf.getvalue()).decode('ascii')

    # Test 80mm raster conversion
    escpos_80 = raster_image_to_escpos(b64_png, paper_width="80mm", darkness="high")
    assert isinstance(escpos_80, bytes)
    assert b"\x1d\x76\x30\x00" in escpos_80  # GS v 0 raster header
    assert b"\x1b@" in escpos_80  # ESC @ init
    assert b"\x1dV\x42\x00" in escpos_80  # Cut partial

    # Test 58mm raster conversion
    escpos_58 = raster_image_to_escpos(b64_png, paper_width="58mm", darkness="normal")
    assert isinstance(escpos_58, bytes)
    assert b"\x1d\x76\x30\x00" in escpos_58

    # Test /api/printing/raster endpoint with mocked printer
    with patch('backend.app.api.routes.printing.send_to_thermal_printer') as mock_send:
        mock_send.return_value = {
            'success': True,
            'printer': 'Test_Raster_Printer',
            'bytes_sent': len(escpos_80),
            'is_online': True,
            'warning': None,
            'message': 'Raster receipt spooled successfully',
        }
        res = client.post('/api/printing/raster', json={
            'image_data': b64_png,
            'printer_name': 'Test_Raster_Printer',
            'paper_width': '80mm',
        })
        assert res.status_code == 200, res.text
        data = res.json()
        assert data['success'] is True
        assert data['printer'] == 'Test_Raster_Printer'
        assert mock_send.called

    # Test /api/printing/receipt with raster_image payload
    with patch('backend.app.api.routes.printing.send_to_thermal_printer') as mock_send_receipt:
        mock_send_receipt.return_value = {
            'success': True,
            'printer': 'Test_Raster_Printer',
            'bytes_sent': len(escpos_80),
            'is_online': True,
            'warning': None,
            'message': 'Receipt spooled via raster mode',
        }
        res_receipt = client.post('/api/printing/receipt', json={
            'raster_image': b64_png,
            'printer_name': 'Test_Raster_Printer',
            'paper_width': '80mm',
            'render_pipeline': 'raster_canvas',
        })
        assert res_receipt.status_code == 200, res_receipt.text
        assert res_receipt.json()['success'] is True
        assert mock_send_receipt.called


def test_hardware_buzzer_and_render_pipeline(client):
    from backend.app.services.escpos_service import CMD_BEEP, generate_escpos_receipt, raster_image_to_escpos

    # 1. Verify CMD_BEEP in generate_escpos_receipt when beep_enabled=True
    sample_sale = {
        'receipt_number': 'REC-BEEP-001',
        'items': [{'product_name': 'Item 1', 'quantity': 1, 'unit_price': 100, 'total_price': 100}],
        'subtotal': 100,
        'total_amount': 100,
        'paid_amount': 100,
    }
    raw_with_beep = generate_escpos_receipt(sample_sale, beep_enabled=True)
    assert CMD_BEEP in raw_with_beep

    raw_no_beep = generate_escpos_receipt(sample_sale, beep_enabled=False)
    assert CMD_BEEP not in raw_no_beep

    # 2. Blank image guard prevents runaway empty feeds
    from PIL import Image
    import io, pytest
    blank_white = Image.new("RGB", (200, 200), (255, 255, 255))
    buf = io.BytesIO()
    blank_white.save(buf, format="PNG")
    blank_bytes = buf.getvalue()

    with pytest.raises(ValueError, match="blank white"):
        raster_image_to_escpos(blank_bytes)

    # 3. Native text pipeline ignores raster_image payload and uses text engine
    with patch('backend.app.api.routes.printing.send_to_thermal_printer') as mock_send, \
         patch('backend.app.api.routes.printing.generate_escpos_receipt') as mock_gen:
        mock_gen.return_value = b"\x1b@NATIVE_TEXT_RECEIPT"
        mock_send.return_value = {
            'success': True,
            'printer': 'Test_POS',
            'bytes_sent': 25,
            'is_online': True,
            'warning': None,
            'message': 'Printed',
        }
        res = client.post('/api/printing/receipt', json={
            'is_sample': True,
            'render_pipeline': 'native_text',
            'raster_image': 'data:image/png;base64,fakeimage',
        })
        assert res.status_code == 200
        assert mock_gen.called


def test_printer_diagnostics_route(client):
    res = client.get('/api/printing/diagnose')
    assert res.status_code == 200, res.text
    data = res.json()
    assert 'status' in data
    assert 'spooler_running' in data
    assert 'is_online' in data
    assert 'queue_job_count' in data
    assert 'issues' in data
    assert 'recommendations' in data
    assert 'printers' in data


def test_compact_bitmap_fast_path():
    import base64
    from backend.app.services.escpos_service import raster_image_to_escpos

    # 576 dots width = 72 bytes per row. 10 rows = 720 bytes.
    # Create non-blank 1-bit bytes (alternating 0xAA patterns)
    test_bytes = bytes([0xAA] * 720)
    compact_b64 = base64.b64encode(test_bytes).decode('ascii')

    escpos = raster_image_to_escpos(
        compact_bitmap=compact_b64,
        bitmap_width=576,
        bitmap_height=10,
        paper_width="80mm",
    )
    assert len(escpos) > 0
    # Must contain GS v 0 raster header
    assert b"\x1dv0" in escpos


def test_send_to_thermal_printer_windows_fast_path():
    from backend.app.services.escpos_service import send_to_thermal_printer

    with patch('platform.system', return_value='Windows'):
        with patch('backend.app.services.escpos_service._send_windows_raw', return_value=128) as mock_send_raw:
            with patch('backend.app.services.escpos_service.list_system_printers') as mock_list:
                res = send_to_thermal_printer(b"\x1b@Hello", printer_name="POS80-Receipt")
                assert res["success"] is True
                assert res["printer"] == "POS80-Receipt"
                assert res["bytes_sent"] == 128
                assert mock_send_raw.called
                # Ensure slow list_system_printers was NOT called on fast-path!
                assert not mock_list.called


def test_send_to_thermal_printer_cups_fast_path():
    from backend.app.services.escpos_service import send_to_thermal_printer

    mock_proc = MagicMock()
    mock_proc.returncode = 0
    mock_proc.communicate.return_value = (b"", b"")

    with patch('platform.system', return_value='Darwin'):
        with patch('subprocess.Popen', return_value=mock_proc) as mock_popen:
            with patch('backend.app.services.escpos_service.list_system_printers') as mock_list:
                res = send_to_thermal_printer(b"\x1b@Hello", printer_name="Office_Thermal")
                assert res["success"] is True
                assert res["printer"] == "Office_Thermal"
                assert mock_popen.called
                assert not mock_list.called


def test_image_to_escpos_raster_proportional_and_aligned():
    from PIL import Image
    from backend.app.services.escpos_service import image_to_escpos_raster

    # Create dummy 500x200 RGBA test image
    img = Image.new("RGBA", (500, 200), (0, 0, 0, 255))
    escpos_logo = image_to_escpos_raster(img, paper_width="80mm")
    assert escpos_logo is not None
    assert escpos_logo.startswith(b"\x1dv0\x00")
    # Verify xL, xH width definition
    xL = escpos_logo[4]
    xH = escpos_logo[5]
    total_bytes = xL + (xH << 8)
    assert total_bytes == 72  # 72 bytes * 8 = 576 dots (80mm standard width)
    height_80 = escpos_logo[6] + (escpos_logo[7] << 8)
    assert height_80 <= 64  # Constrained height matching preview proportions

    # Verify 58mm paper width produces 48 bytes (384 dots) and <= 56 dots height
    escpos_logo_58 = image_to_escpos_raster(img, paper_width="58mm")
    assert escpos_logo_58 is not None
    xL_58 = escpos_logo_58[4]
    xH_58 = escpos_logo_58[5]
    assert (xL_58 + (xH_58 << 8)) == 48  # 48 bytes * 8 = 384 dots (58mm width)
    height_58 = escpos_logo_58[6] + (escpos_logo_58[7] << 8)
    assert height_58 <= 56

    # Verify square 512x512 brand mark scales to 64x64 dots without vertical distortion
    img_square = Image.new("RGBA", (512, 512), (0, 0, 0, 255))
    escpos_sq = image_to_escpos_raster(img_square, paper_width="80mm")
    assert escpos_sq is not None
    h_sq = escpos_sq[6] + (escpos_sq[7] << 8)
    assert h_sq == 64  # Scaled to clean 64 dots, not blown up to 320 dots!





