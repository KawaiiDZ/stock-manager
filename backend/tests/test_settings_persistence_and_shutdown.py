import pytest
from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker
from fastapi.testclient import TestClient

from backend.app.core.database import Base, auto_upgrade_schema
from backend.app.models.business import BusinessSettings
from backend.app.services.settings_service import get_settings, update_settings
from backend.app.schemas.business import BusinessSettingsUpdate
from backend.app.main import app

def test_settings_persist_across_auto_upgrade():
    """Verify that user settings (such as native_text pipeline and browser mode) are not reverted by auto_upgrade_schema()."""
    test_engine = create_engine("sqlite:///:memory:")
    Base.metadata.create_all(bind=test_engine)
    TestingSession = sessionmaker(bind=test_engine)
    db = TestingSession()

    # Seed initial business settings with user custom values
    biz = BusinessSettings(
        id=1,
        business_name="Custom Store",
        thermal_render_pipeline="native_text",
        thermal_print_mode="browser",
        receipt_printer_type="58mm",
        config_pin_hash="dummy_hash",
    )
    db.add(biz)
    db.commit()

    # Simulate app launch calling auto_upgrade_schema
    auto_upgrade_schema(target_engine=test_engine)

    # Re-query and verify that the user's custom settings were preserved intact
    db.expire_all()
    loaded = db.query(BusinessSettings).filter(BusinessSettings.id == 1).first()
    assert loaded is not None
    assert loaded.thermal_render_pipeline == "native_text", "thermal_render_pipeline was reverted!"
    assert loaded.thermal_print_mode == "browser", "thermal_print_mode was reverted!"
    assert loaded.receipt_printer_type == "58mm", "receipt_printer_type was reverted!"
    db.close()

def test_shutdown_endpoint_structure():
    """Verify that POST /api/settings/shutdown returns success and proper payload."""
    client = TestClient(app)
    # The endpoint spawns a background thread with delay before os._exit,
    # so in TestClient it should return 200 before the exit occurs.
    # We patch os._exit and terminate_kiosk_browser so the test process does not terminate.
    import unittest.mock as mock
    with mock.patch("os._exit") as mock_exit, \
         mock.patch("backend.app.services.kiosk_service.terminate_kiosk_browser") as mock_term:
        response = client.post("/api/settings/shutdown")
        assert response.status_code == 200
        data = response.json()
        assert data.get("success") is True
        assert "shutting down safely" in data.get("message", "")
