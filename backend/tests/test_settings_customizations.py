from fastapi.testclient import TestClient
from backend.app.main import app

client = TestClient(app)

def test_get_and_update_date_format_and_receipt_settings():
    # 1. Fetch current settings
    res = client.get('/api/settings')
    assert res.status_code == 200, res.text
    initial = res.json()
    assert 'date_format' in initial
    assert 'format_prices_with_commas' in initial
    assert 'receipt_type' in initial
    assert 'show_letterhead' in initial
    assert 'hide_header_text_with_letterhead' in initial
    assert 'receipt_letterhead_path' in initial

    # 2. Update with new customization values
    update_payload = {
        'business_name': initial.get('business_name', 'Stock Manager'),
        'currency': 'USD',
        'date_format': 'DD/MM/YYYY',
        'format_prices_with_commas': False,
        'receipt_type': 'pdf',
        'show_letterhead': True,
        'hide_header_text_with_letterhead': True,
        'receipt_letterhead_path': 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
    }
    put_res = client.put('/api/settings', json=update_payload)
    assert put_res.status_code == 200, put_res.text
    updated = put_res.json()
    assert updated['date_format'] == 'DD/MM/YYYY'
    assert updated['format_prices_with_commas'] is False
    assert updated['receipt_type'] == 'pdf'
    assert updated['show_letterhead'] is True
    assert updated['hide_header_text_with_letterhead'] is True
    assert updated['receipt_letterhead_path'].startswith('data:image/png;base64')

    # 3. Verify GET returns persisted settings
    verify_res = client.get('/api/settings')
    assert verify_res.status_code == 200
    persisted = verify_res.json()
    assert persisted['date_format'] == 'DD/MM/YYYY'
    assert persisted['format_prices_with_commas'] is False
    assert persisted['receipt_type'] == 'pdf'
    assert persisted['show_letterhead'] is True
    assert persisted['hide_header_text_with_letterhead'] is True

    # 4. Revert to standard defaults
    revert_payload = {
        'date_format': 'YYYY-MM-DD',
        'format_prices_with_commas': True,
        'receipt_type': 'thermal',
        'show_letterhead': False,
        'hide_header_text_with_letterhead': False,
        'receipt_letterhead_path': '',
    }
    client.put('/api/settings', json=revert_payload)
