import pytest
from fastapi.testclient import TestClient
from backend.app.main import app

def test_dashboard_financial_privacy_settings_and_pin_verification(client):
    # 1. Verify fields are in GET /api/settings
    res = client.get('/api/settings')
    assert res.status_code == 200, res.text
    initial = res.json()
    assert 'lock_dashboard_finances' in initial
    assert 'has_dashboard_financials_pin' in initial

    # 2. Update settings: enable lock and set custom PIN
    update_payload = {
        'lock_dashboard_finances': True,
        'dashboard_financials_pin': '7890',
    }
    put_res = client.put('/api/settings', json=update_payload)
    assert put_res.status_code == 200, put_res.text
    updated = put_res.json()
    assert updated['lock_dashboard_finances'] is True
    assert updated['has_dashboard_financials_pin'] is True
    # Ensure raw pin or hash is not exposed
    assert 'dashboard_financials_pin' not in updated
    assert 'dashboard_financials_pin_hash' not in updated

    # 3. Test verification with correct custom PIN
    verify_res = client.post('/api/auth/verify-dashboard-pin', json={'pin': '7890'})
    assert verify_res.status_code == 200
    assert verify_res.json()['valid'] is True

    # 4. Test verification with incorrect PIN
    bad_res = client.post('/api/auth/verify-dashboard-pin', json={'pin': '0000'})
    assert bad_res.status_code == 200
    assert bad_res.json()['valid'] is False

    # 5. Test fallback with config PIN (default: '1234')
    fallback_pin_res = client.post('/api/auth/verify-dashboard-pin', json={'pin': '1234'})
    assert fallback_pin_res.status_code == 200
    assert fallback_pin_res.json()['valid'] is True

    # 6. Test fallback with admin password (default: 'admin123')
    admin_pass_res = client.post('/api/auth/verify-dashboard-pin', json={'pin': 'admin123'})
    assert admin_pass_res.status_code == 200
    assert admin_pass_res.json()['valid'] is True

    # 7. Clean up: reset lock_dashboard_finances
    revert_res = client.put('/api/settings', json={'lock_dashboard_finances': False})
    assert revert_res.status_code == 200
    assert revert_res.json()['lock_dashboard_finances'] is False
