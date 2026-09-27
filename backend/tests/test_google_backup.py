import json
import os
import sqlite3
from datetime import datetime, timedelta
from pathlib import Path
from unittest.mock import patch, MagicMock

import pytest
from fastapi.testclient import TestClient

from backend.app.main import app
from backend.app.core.config import settings
from backend.app.core.database import SessionLocal, auto_upgrade_schema, Base, engine
from backend.app.models.google_backup import GoogleBackupSettings
from backend.app.services.google_drive_service import (
    get_or_create_google_settings,
    generate_auth_url,
    get_effective_credentials,
    prune_older_backups,
    execute_google_backup,
    disconnect_google_account,
    update_google_settings,
    get_google_backup_status,
)
from backend.app.schemas.google_backup import GoogleBackupSettingsUpdate

@pytest.fixture
def db_session():
    db = SessionLocal()
    try:
        # Reset settings row
        cfg = db.query(GoogleBackupSettings).filter(GoogleBackupSettings.id == 1).first()
        if cfg:
            cfg.is_enabled = False
            cfg.frequency = "daily"
            cfg.google_email = None
            cfg.google_name = None
            cfg.access_token = None
            cfg.refresh_token = None
            cfg.token_expiry = None
            cfg.custom_client_id = None
            cfg.custom_client_secret = None
            cfg.last_backup_status = "NEVER"
            cfg.last_error_message = None
            db.commit()
        yield db
    finally:
        db.close()

@pytest.fixture
def client():
    with TestClient(app) as c:
        yield c

def test_singleton_settings_creation(db_session):
    cfg = get_or_create_google_settings(db_session)
    assert cfg.id == 1
    assert cfg.frequency == "daily"
    assert cfg.is_enabled is False

def test_generate_auth_url(db_session):
    cfg = get_or_create_google_settings(db_session)
    cfg.custom_client_id = "test-client-id.apps.googleusercontent.com"
    cfg.custom_client_secret = "test-client-secret"
    db_session.commit()

    url = generate_auth_url("http://localhost:8000/api/backup/google/callback", db_session)
    assert "https://accounts.google.com/o/oauth2/v2/auth" in url
    assert "client_id=test-client-id.apps.googleusercontent.com" in url
    assert "drive.appdata" in url
    assert "userinfo.email" in url
    assert "access_type=offline" in url

def test_update_settings_and_status(client, db_session):
    resp = client.post("/api/backup/google/settings", json={
        "frequency": "6h",
        "custom_client_id": "custom-id-123",
        "custom_client_secret": "custom-secret-456",
        "is_enabled": True
    })
    assert resp.status_code == 200
    data = resp.json()
    assert data["frequency"] == "6h"
    assert data["has_custom_credentials"] is True
    assert data["client_id_configured"] is True

    # Test status endpoint
    status_resp = client.get("/api/backup/google/status")
    assert status_resp.status_code == 200
    s_data = status_resp.json()
    assert s_data["frequency"] == "6h"
    assert s_data["is_connected"] is False

def test_prune_older_backups_strict_3_retention():
    """Verify that when 5 backups exist in Google Drive, the 2 oldest are deleted, retaining strictly 3."""
    mock_files = [
        {"id": "file-1", "name": "stockflow_backup_2026-09-27_100000.db"},
        {"id": "file-2", "name": "stockflow_backup_2026-09-26_100000.db"},
        {"id": "file-3", "name": "stockflow_backup_2026-09-25_100000.db"},
        {"id": "file-4", "name": "stockflow_backup_2026-09-24_100000.db"},
        {"id": "file-5", "name": "stockflow_backup_2026-09-23_100000.db"},
    ]

    deleted_ids = []

    def mock_request(method, url, **kwargs):
        resp = MagicMock()
        if method == "GET":
            resp.status_code = 200
            resp.json.return_value = {"files": mock_files}
        elif method == "DELETE":
            file_id = url.split("/")[-1]
            deleted_ids.append(file_id)
            resp.status_code = 204
        return resp

    with patch("httpx.Client.get", side_effect=lambda url, **kw: mock_request("GET", url, **kw)), \
         patch("httpx.Client.delete", side_effect=lambda url, **kw: mock_request("DELETE", url, **kw)):
        pruned_count = prune_older_backups(keep_count=3, token="fake-token")

    assert pruned_count == 2
    assert deleted_ids == ["file-4", "file-5"]

def test_offline_skip_graceful(db_session):
    cfg = get_or_create_google_settings(db_session)
    cfg.refresh_token = "valid-refresh-token"
    cfg.is_enabled = True
    db_session.commit()

    with patch("backend.app.services.google_drive_service.is_internet_connected", return_value=False):
        result = execute_google_backup(db_session)

    assert result["success"] is False
    assert result["status"] == "OFFLINE_SKIPPED"
    db_session.refresh(cfg)
    assert cfg.last_backup_status == "OFFLINE_SKIPPED"

def test_full_google_backup_upload_flow(db_session):
    cfg = get_or_create_google_settings(db_session)
    cfg.custom_client_id = "test-id"
    cfg.custom_client_secret = "test-secret"
    cfg.refresh_token = "valid-refresh-token"
    cfg.access_token = "valid-access-token"
    cfg.token_expiry = datetime.utcnow() + timedelta(hours=1)
    cfg.is_enabled = True
    db_session.commit()

    mock_init_resp = MagicMock()
    mock_init_resp.status_code = 200
    mock_init_resp.headers = {"Location": "https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable&upload_id=session123"}

    mock_upload_resp = MagicMock()
    mock_upload_resp.status_code = 200
    mock_upload_resp.json.return_value = {"id": "new-drive-file-id", "name": "stockflow_backup_test.db"}

    mock_list_resp = MagicMock()
    mock_list_resp.status_code = 200
    mock_list_resp.json.return_value = {"files": [{"id": "new-drive-file-id"}]}

    with patch("backend.app.services.google_drive_service.is_internet_connected", return_value=True), \
         patch("httpx.Client.post", return_value=mock_init_resp), \
         patch("httpx.Client.put", return_value=mock_upload_resp), \
         patch("httpx.Client.get", return_value=mock_list_resp):
        res = execute_google_backup(db_session)

    assert res["success"] is True
    assert res["status"] == "SUCCESS"
    db_session.refresh(cfg)
    assert cfg.last_backup_status == "SUCCESS"
    assert cfg.last_backup_size_bytes > 0
    assert cfg.last_backup_at is not None

def test_disconnect_google(db_session):
    cfg = get_or_create_google_settings(db_session)
    cfg.refresh_token = "some-refresh-token"
    cfg.access_token = "some-access-token"
    cfg.google_email = "owner@store.com"
    cfg.is_enabled = True
    db_session.commit()

    disconnect_google_account(db_session)
    db_session.refresh(cfg)

    assert cfg.refresh_token is None
    assert cfg.access_token is None
    assert cfg.google_email is None
    assert cfg.is_enabled is False
    assert cfg.last_backup_status == "NEVER"

def test_upload_backup_ssrf_protection(db_session):
    """Verify that if an attacker or rogue server returns an internal URL for resumable upload, it is blocked."""
    from backend.app.core.errors import BusinessRuleException
    from backend.app.services.google_drive_service import upload_backup_file_to_drive

    test_file = settings.BACKUP_DIR / "test_ssrf.db"
    test_file.touch()

    # Mock response returning an internal metadata service IP
    mock_ssrf_resp = MagicMock()
    mock_ssrf_resp.status_code = 200
    mock_ssrf_resp.headers = {"Location": "http://169.254.169.254/latest/meta-data/"}

    try:
        with patch("httpx.Client.post", return_value=mock_ssrf_resp):
            with pytest.raises(BusinessRuleException) as exc_info:
                upload_backup_file_to_drive(test_file, "fake-token")
            assert "Untrusted upload location" in str(exc_info.value)
    finally:
        if test_file.exists():
            test_file.unlink()

def test_cloud_and_local_restore_requires_pin(client, db_session):
    """Verify that restoring either a cloud backup or local backup strictly requires a valid Configuration PIN."""
    dummy_backup = settings.BACKUP_DIR / "test_pin_restore.db"
    dummy_backup.touch()
    try:
        # 1. Attempt restore without PIN
        res_no_pin = client.post("/api/backup/restore", json={"filename": "test_pin_restore.db"})
        assert res_no_pin.status_code == 403
        assert "Configuration PIN" in res_no_pin.json()["detail"]

        # 2. Attempt restore with wrong PIN
        res_wrong_pin = client.post("/api/backup/restore", json={"filename": "test_pin_restore.db", "confirm_pin": "9999"})
        assert res_wrong_pin.status_code == 403

        # 3. Attempt cloud restore without PIN
        res_cloud_no_pin = client.post("/api/backup/google/restore/drive-file-123", json={})
        assert res_cloud_no_pin.status_code == 403

        # 4. Attempt cloud restore with wrong PIN
        res_cloud_wrong_pin = client.post("/api/backup/google/restore/drive-file-123", json={"confirm_pin": "0000"})
        assert res_cloud_wrong_pin.status_code == 403
    finally:
        if dummy_backup.exists():
            dummy_backup.unlink()


