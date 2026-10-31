import pytest
from backend.app.models.business import BusinessSettings
from backend.app.services.settings_service import get_settings, update_settings
from backend.app.schemas.business import BusinessSettingsUpdate

def test_ui_zoom_default_value(db_session):
    """Verify that newly initialized BusinessSettings has ui_zoom = 100 by default."""
    settings = get_settings(db_session)
    assert settings.ui_zoom == 100

def test_ui_zoom_update_and_persistence(db_session):
    """Verify that updating ui_zoom persists correctly."""
    # Update to 125%
    updated = update_settings(db_session, BusinessSettingsUpdate(ui_zoom=125))
    assert updated.ui_zoom == 125

    # Re-fetch from session
    db_session.expire_all()
    reloaded = get_settings(db_session)
    assert reloaded.ui_zoom == 125

def test_ui_zoom_clamping(db_session):
    """Verify that values below 70 and above 160 are clamped safely."""
    # Out of bounds low: 40 -> clamped to 70
    low_updated = update_settings(db_session, BusinessSettingsUpdate(ui_zoom=40))
    assert low_updated.ui_zoom == 70

    # Out of bounds high: 250 -> clamped to 160
    high_updated = update_settings(db_session, BusinessSettingsUpdate(ui_zoom=250))
    assert high_updated.ui_zoom == 160

    # Boundary exact values
    exact_min = update_settings(db_session, BusinessSettingsUpdate(ui_zoom=70))
    assert exact_min.ui_zoom == 70

    exact_max = update_settings(db_session, BusinessSettingsUpdate(ui_zoom=160))
    assert exact_max.ui_zoom == 160

def test_ui_zoom_api_endpoints(client):
    """Verify GET /api/settings and PUT /api/settings with ui_zoom."""
    # Fetch settings
    res = client.get("/api/settings")
    assert res.status_code == 200
    data = res.json()
    assert "ui_zoom" in data
    assert data["ui_zoom"] == 100

    # Update via PUT
    put_res = client.put("/api/settings", json={"ui_zoom": 110})
    assert put_res.status_code == 200
    put_data = put_res.json()
    assert put_data["ui_zoom"] == 110

    # Verify persistence via GET
    res2 = client.get("/api/settings")
    assert res2.status_code == 200
    assert res2.json()["ui_zoom"] == 110
