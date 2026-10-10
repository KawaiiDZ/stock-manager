from fastapi.testclient import TestClient

def test_get_and_update_date_format_and_receipt_settings(client: TestClient):
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
        'currency': 'PKR',
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
    assert updated['currency'] == 'PKR'
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
    assert persisted['currency'] == 'PKR'
    assert persisted['date_format'] == 'DD/MM/YYYY'
    assert persisted['format_prices_with_commas'] is False
    assert persisted['receipt_type'] == 'pdf'
    assert persisted['show_letterhead'] is True
    assert persisted['hide_header_text_with_letterhead'] is True

    # 4. Revert to standard defaults
    revert_payload = {
        'currency': 'Rs.',
        'date_format': 'YYYY-MM-DD',
        'format_prices_with_commas': True,
        'receipt_type': 'thermal',
        'show_letterhead': False,
        'hide_header_text_with_letterhead': False,
        'receipt_letterhead_path': '',
    }
    client.put('/api/settings', json=revert_payload)

def test_currency_defaults_to_rs_and_persists_across_changes(client: TestClient):
    # 1. Initial settings must have currency "Rs."
    res = client.get('/api/settings')
    assert res.status_code == 200
    assert res.json()['currency'] == 'Rs.'

    # 2. Making unrelated changes (e.g. updating printer, name, phone) without currency preserves "Rs."
    upd1 = client.put('/api/settings', json={'phone': '0300-9998877', 'business_name': 'My Super Store'})
    assert upd1.status_code == 200
    assert upd1.json()['currency'] == 'Rs.'
    assert upd1.json()['phone'] == '0300-9998877'

    # 3. Passing empty or whitespace currency falls back to "Rs."
    upd2 = client.put('/api/settings', json={'currency': '   '})
    assert upd2.status_code == 200
    assert upd2.json()['currency'] == 'Rs.'

    # 4. Applying a preset without currency keeps "Rs."
    preset_res = client.post('/api/settings/apply-preset', json={'preset_key': 'custom_general'})
    assert preset_res.status_code == 200
    assert preset_res.json()['currency'] == 'Rs.'

    # 5. Explicitly setting another currency (e.g. PKR or EUR) works
    upd3 = client.put('/api/settings', json={'currency': 'PKR'})
    assert upd3.status_code == 200
    assert upd3.json()['currency'] == 'PKR'

    # 6. Reverting or passing empty falls back to "Rs."
    upd4 = client.put('/api/settings', json={'currency': ''})
    assert upd4.status_code == 200
    assert upd4.json()['currency'] == 'Rs.'
