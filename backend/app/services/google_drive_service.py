import json
import logging
import os
import shutil
import socket
import sqlite3
from datetime import datetime, timedelta
from pathlib import Path
from typing import Optional, List, Tuple
from urllib.parse import urlencode

import httpx
from sqlalchemy.orm import Session

from backend.app.core.config import settings
from backend.app.core.database import engine, auto_upgrade_schema, SessionLocal
from backend.app.core.errors import BusinessRuleException
from backend.app.models.google_backup import GoogleBackupSettings
from backend.app.schemas.google_backup import (
    GoogleDriveFileItem,
    GoogleBackupStatusResponse,
    GoogleBackupSettingsUpdate,
)
from backend.app.services.backup_service import validate_sqlite_file, _format_size

logger = logging.getLogger(__name__)

# Google OAuth & Drive Endpoints
GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth"
GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token"
GOOGLE_USERINFO_URL = "https://www.googleapis.com/oauth2/v2/userinfo"
GOOGLE_DRIVE_FILES_URL = "https://www.googleapis.com/drive/v3/files"
GOOGLE_DRIVE_UPLOAD_URL = "https://www.googleapis.com/upload/drive/v3/files"

# Restricted Least-Privilege Scopes (WhatsApp Standard)
DRIVE_APPDATA_SCOPE = "https://www.googleapis.com/auth/drive.appdata"
USERINFO_EMAIL_SCOPE = "https://www.googleapis.com/auth/userinfo.email"
OPENID_SCOPE = "openid"

SCOPES = f"{DRIVE_APPDATA_SCOPE} {USERINFO_EMAIL_SCOPE} {OPENID_SCOPE}"

def get_or_create_google_settings(db: Session) -> GoogleBackupSettings:
    """Retrieve or create the singleton GoogleBackupSettings record."""
    cfg = db.query(GoogleBackupSettings).filter(GoogleBackupSettings.id == 1).first()
    if not cfg:
        cfg = GoogleBackupSettings(
            id=1,
            is_enabled=False,
            frequency="daily",
            last_backup_status="NEVER"
        )
        db.add(cfg)
        db.commit()
        db.refresh(cfg)
    return cfg

def is_internet_connected(timeout_sec: float = 2.0) -> bool:
    """Fast, reliable internet connectivity probe without external process spawning."""
    # Attempt 1: Fast DNS socket connect to Google Public DNS
    try:
        sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        sock.settimeout(timeout_sec)
        sock.connect(("8.8.8.8", 53))
        sock.close()
        return True
    except Exception:
        pass

    # Attempt 2: Fast HTTP head check
    try:
        with httpx.Client(timeout=timeout_sec) as client:
            resp = client.head("https://www.google.com/generate_204")
            return resp.status_code == 204 or resp.status_code == 200
    except Exception:
        return False

def _format_network_error(e: Exception, action: str = "communicating with Google") -> str:
    err_str = str(e)
    if any(k in err_str for k in ("nodename nor servname provided", "getaddrinfo failed", "gaierror", "NameResolutionError", "ConnectError")):
        return f"Unable to reach Google servers (DNS resolution failed while {action}). Please verify your internet connection or network firewall."
    if "ConnectTimeout" in err_str or "timeout" in err_str.lower():
        return f"Connection timed out while {action}. Please check your internet connectivity."
    if "UNEXPECTED_EOF_WHILE_READING" in err_str or "EOF occurred" in err_str:
        return f"Connection interrupted while {action}. Please try again."
    return f"Network error while {action}: {e}"

def create_httpx_client(timeout: float = 15.0) -> httpx.Client:
    """Creates an httpx client configured with robust connection retries."""
    transport = httpx.HTTPTransport(retries=3)
    return httpx.Client(transport=transport, timeout=timeout)


def get_effective_credentials(cfg: GoogleBackupSettings) -> Tuple[str, str]:
    """Retrieve Client ID and Client Secret from custom settings or environment/config."""
    client_id = (cfg.custom_client_id or "").strip() or settings.GOOGLE_CLIENT_ID.strip()
    client_secret = (cfg.custom_client_secret or "").strip() or settings.GOOGLE_CLIENT_SECRET.strip()
    return client_id, client_secret

def generate_auth_url(redirect_uri: str, db: Session) -> str:
    """Generate the Google OAuth 2.0 consent URL for restricted appdata scope."""
    cfg = get_or_create_google_settings(db)
    client_id, _ = get_effective_credentials(cfg)

    if not client_id:
        raise BusinessRuleException(
            "Google Client ID is not configured. Please supply a Client ID in 'Google Cloud Settings' "
            "or set GOOGLE_CLIENT_ID environment variable."
        )

    params = {
        "client_id": client_id,
        "redirect_uri": redirect_uri,
        "response_type": "code",
        "scope": SCOPES,
        "access_type": "offline",
        "prompt": "consent",
        "include_granted_scopes": "true",
    }
    return f"{GOOGLE_AUTH_URL}?{urlencode(params)}"

def exchange_auth_code(code: str, redirect_uri: str, db: Session) -> GoogleBackupSettings:
    """Exchange authorization code for access and refresh tokens, and fetch account profile."""
    cfg = get_or_create_google_settings(db)
    client_id, client_secret = get_effective_credentials(cfg)

    if not client_id or not client_secret:
        raise BusinessRuleException("Both Google Client ID and Client Secret are required for authentication.")

    try:
        with create_httpx_client(timeout=15.0) as client:
            token_resp = client.post(
                GOOGLE_TOKEN_URL,
                data={
                    "code": code,
                    "client_id": client_id,
                    "client_secret": client_secret,
                    "redirect_uri": redirect_uri,
                    "grant_type": "authorization_code",
                },
            )
            if token_resp.status_code != 200:
                err_text = token_resp.text
                logger.error(f"Google token exchange failed: {err_text}")
                raise BusinessRuleException(f"Google token exchange failed: {err_text}")

            token_data = token_resp.json()
            access_token = token_data.get("access_token")
            refresh_token = token_data.get("refresh_token") or cfg.refresh_token
            expires_in = token_data.get("expires_in", 3600)
            token_expiry = datetime.utcnow() + timedelta(seconds=max(0, expires_in - 60))

            # Fetch user email and profile
            userinfo_resp = client.get(
                GOOGLE_USERINFO_URL,
                headers={"Authorization": f"Bearer {access_token}"},
            )
            user_email = ""
            user_name = ""
            if userinfo_resp.status_code == 200:
                u_data = userinfo_resp.json()
                user_email = u_data.get("email", "")
                user_name = u_data.get("name", "")

            cfg.access_token = access_token
            if refresh_token:
                cfg.refresh_token = refresh_token
            cfg.token_expiry = token_expiry
            cfg.google_email = user_email
            cfg.google_name = user_name
            cfg.is_enabled = True
            cfg.last_error_message = None

            db.commit()
            db.refresh(cfg)
            return cfg

    except httpx.HTTPError as e:
        err_msg = _format_network_error(e, "exchanging Google authorization code")
        logger.error(err_msg)
        raise BusinessRuleException(err_msg)

def get_valid_access_token(cfg: GoogleBackupSettings, db: Session) -> str:
    """Ensure a valid, unexpired access token is available, refreshing via refresh_token if needed."""
    if not cfg.refresh_token:
        raise BusinessRuleException("No Google account linked. Please connect your Google account in Settings.")

    now = datetime.utcnow()
    # If token exists and is valid for at least 2 more minutes, return it
    if cfg.access_token and cfg.token_expiry and cfg.token_expiry > (now + timedelta(minutes=2)):
        return cfg.access_token

    # Token expired or expiring soon, refresh it
    client_id, client_secret = get_effective_credentials(cfg)
    if not client_id or not client_secret:
        raise BusinessRuleException("Google Client ID or Secret missing; cannot refresh access token.")

    try:
        with create_httpx_client(timeout=15.0) as client:
            refresh_resp = client.post(
                GOOGLE_TOKEN_URL,
                data={
                    "client_id": client_id,
                    "client_secret": client_secret,
                    "refresh_token": cfg.refresh_token,
                    "grant_type": "refresh_token",
                },
            )
            if refresh_resp.status_code != 200:
                err_text = refresh_resp.text
                logger.error(f"Failed to refresh Google access token: {err_text}")
                cfg.last_error_message = f"Google token refresh failed: {err_text}"
                db.commit()
                raise BusinessRuleException(f"Google session expired or revoked. Please reconnect account.")

            data = refresh_resp.json()
            new_access_token = data.get("access_token")
            expires_in = data.get("expires_in", 3600)

            cfg.access_token = new_access_token
            cfg.token_expiry = datetime.utcnow() + timedelta(seconds=max(0, expires_in - 60))
            if "refresh_token" in data:
                cfg.refresh_token = data["refresh_token"]

            db.commit()
            return new_access_token

    except httpx.HTTPError as e:
        err_msg = _format_network_error(e, "refreshing Google token")
        logger.error(err_msg)
        raise BusinessRuleException(err_msg)


def list_cloud_backups(db: Session, raise_on_error: bool = False) -> List[GoogleDriveFileItem]:
    """List backups stored in the hidden Google Drive appDataFolder, sorted newest to oldest."""
    cfg = get_or_create_google_settings(db)
    if not cfg.refresh_token:
        return []

    try:
        token = get_valid_access_token(cfg, db)
    except Exception as e:
        logger.warning(f"Could not get valid token to list cloud backups: {e}")
        if raise_on_error:
            raise
        return []

    try:
        with create_httpx_client(timeout=15.0) as client:
            resp = client.get(
                GOOGLE_DRIVE_FILES_URL,
                headers={"Authorization": f"Bearer {token}"},
                params={
                    "spaces": "appDataFolder",
                    "q": "name contains 'stockflow_backup_' and trashed=false",
                    "orderBy": "createdTime desc",
                    "fields": "files(id, name, size, createdTime)",
                    "pageSize": 20,
                },
            )
            if resp.status_code != 200:
                logger.warning(f"Failed to query Google Drive files: {resp.text}")
                if raise_on_error:
                    raise BusinessRuleException(f"Google Drive query failed: {resp.text}")
                return []

            files = resp.json().get("files", [])
            items = []
            for f in files:
                size_int = int(f.get("size", 0) or 0)
                dt_str = f.get("createdTime", "")
                try:
                    dt = datetime.fromisoformat(dt_str.replace("Z", "+00:00"))
                except Exception:
                    dt = datetime.utcnow()

                items.append(
                    GoogleDriveFileItem(
                        id=f["id"],
                        name=f.get("name", "backup.db"),
                        size_bytes=size_int,
                        size_formatted=_format_size(size_int),
                        created_at=dt,
                    )
                )
            return items

    except Exception as e:
        logger.error(f"Error fetching Google Drive cloud backups: {e}")
        return []

def prune_older_backups(keep_count: int, token: str) -> int:
    """Enforce strict rolling retention (keep last 3 backups). Delete any excess older files in appDataFolder."""
    try:
        with create_httpx_client(timeout=15.0) as client:
            resp = client.get(
                GOOGLE_DRIVE_FILES_URL,
                headers={"Authorization": f"Bearer {token}"},
                params={
                    "spaces": "appDataFolder",
                    "q": "name contains 'stockflow_backup_' and trashed=false",
                    "orderBy": "createdTime desc",
                    "fields": "files(id, name, createdTime)",
                    "pageSize": 50,
                },
            )
            if resp.status_code != 200:
                return 0

            files = resp.json().get("files", [])
            if len(files) <= keep_count:
                return 0

            excess_files = files[keep_count:]
            deleted_count = 0
            for ef in excess_files:
                file_id = ef["id"]
                del_resp = client.delete(
                    f"{GOOGLE_DRIVE_FILES_URL}/{file_id}",
                    headers={"Authorization": f"Bearer {token}"},
                )
                if del_resp.status_code in (200, 204):
                    deleted_count += 1
                    logger.info(f"Pruned older cloud backup: {ef.get('name')} ({file_id})")

            return deleted_count

    except Exception as e:
        logger.warning(f"Error during backup retention pruning: {e}")
        return 0

def upload_backup_file_to_drive(file_path: Path, token: str) -> dict:
    """Uploads a local SQLite file to Google Drive appDataFolder using resumable upload for maximum reliability."""
    file_size = file_path.stat().st_size
    file_name = file_path.name

    # Step 1: Initiate Resumable Upload Session
    metadata = {
        "name": file_name,
        "parents": ["appDataFolder"],
    }
    with create_httpx_client(timeout=30.0) as client:
        init_resp = client.post(
            f"{GOOGLE_DRIVE_UPLOAD_URL}?uploadType=resumable",
            headers={
                "Authorization": f"Bearer {token}",
                "Content-Type": "application/json; charset=UTF-8",
                "X-Upload-Content-Type": "application/octet-stream",
                "X-Upload-Content-Length": str(file_size),
            },
            content=json.dumps(metadata),
        )
        if init_resp.status_code != 200:
            err_text = init_resp.text
            if "storageQuotaExceeded" in err_text or "storage quota" in err_text.lower():
                raise BusinessRuleException(
                    "Your Google Account storage quota (15 GB) is full. Google Drive cannot accept any new backups until you free up space in Google Drive, Gmail, or Google Photos, or connect a different Google account."
                )
            raise BusinessRuleException(f"Failed to initiate Google Drive upload: {err_text}")

        upload_url = init_resp.headers.get("Location")
        if not upload_url or not (upload_url.startswith("https://www.googleapis.com/") or upload_url.startswith("https://oauth2.googleapis.com/")):
            raise BusinessRuleException("Untrusted upload location returned from Google.")

        # Step 2: Stream upload the database file
        with open(file_path, "rb") as f:
            file_bytes = f.read()

        upload_resp = client.put(
            upload_url,
            headers={
                "Content-Type": "application/octet-stream",
                "Content-Length": str(file_size),
            },
            content=file_bytes,
            timeout=120.0,
        )
        if upload_resp.status_code not in (200, 201):
            err_text = upload_resp.text
            if "storageQuotaExceeded" in err_text or "storage quota" in err_text.lower():
                raise BusinessRuleException(
                    "Your Google Account storage quota (15 GB) is full. Google Drive cannot accept any new backups until you free up space in Google Drive, Gmail, or Google Photos, or connect a different Google account."
                )
            raise BusinessRuleException(f"Failed to upload backup payload to Google Drive: {err_text}")

        return upload_resp.json()

def execute_google_backup(db: Session) -> dict:
    """Executes a full non-blocking snapshot, uploads to Google Drive appDataFolder, and enforces 3-backup retention."""
    cfg = get_or_create_google_settings(db)
    if not cfg.refresh_token:
        raise BusinessRuleException("Google account is not connected. Please connect your account first.")

    # 1. Connectivity check
    if not is_internet_connected():
        cfg.last_backup_status = "OFFLINE_SKIPPED"
        cfg.last_error_message = "Internet disconnected. Cloud backup skipped safely."
        db.commit()
        return {
            "success": False,
            "status": "OFFLINE_SKIPPED",
            "message": "Store is currently offline. Backup will resume automatically once connected.",
        }

    # 2. Token refresh & validation
    token = get_valid_access_token(cfg, db)

    # 3. Create local consistent SQLite snapshot without locking POS sales
    db_path = settings.SQLITE_DB_PATH
    if not db_path.exists():
        raise BusinessRuleException("Active SQLite database file not found.")

    timestamp_str = datetime.now().strftime("%Y-%m-%d_%H%M%S")
    temp_filename = f"stockflow_backup_{timestamp_str}.db"
    temp_path = settings.BACKUP_DIR / temp_filename

    # Ensure WAL checkpoint is cleanly flushed
    try:
        conn = sqlite3.connect(str(db_path))
        conn.execute("PRAGMA wal_checkpoint(PASSIVE);")
        conn.commit()
        conn.close()
    except Exception:
        pass

    # Perform atomic online SQLite backup
    try:
        source_conn = sqlite3.connect(str(db_path))
        dest_conn = sqlite3.connect(str(temp_path))
        with dest_conn:
            source_conn.backup(dest_conn)
        dest_conn.close()
        source_conn.close()
    except Exception:
        shutil.copy2(db_path, temp_path)

    # 4. Integrity verification
    if not validate_sqlite_file(temp_path):
        if temp_path.exists():
            temp_path.unlink()
        cfg.last_backup_status = "FAILED"
        cfg.last_error_message = "Integrity validation failed for generated snapshot."
        db.commit()
        raise BusinessRuleException("Local snapshot integrity check failed. Aborting cloud upload.")

    # 5. Upload to Google Drive appDataFolder
    try:
        drive_file = upload_backup_file_to_drive(temp_path, token)
        file_size = temp_path.stat().st_size

        # 6. Strictly enforce rolling 3-backup retention
        pruned = prune_older_backups(keep_count=3, token=token)

        # 7. Update status
        cfg.last_backup_at = datetime.utcnow()
        cfg.last_backup_status = "SUCCESS"
        cfg.last_backup_size_bytes = file_size
        cfg.last_error_message = None
        db.commit()
        db.refresh(cfg)

        return {
            "success": True,
            "status": "SUCCESS",
            "message": f"Successfully backed up to Google Drive (Retaining last 3 backups; pruned {pruned} older).",
            "file": {
                "id": drive_file.get("id"),
                "name": drive_file.get("name", temp_filename),
                "size_bytes": file_size,
                "size_formatted": _format_size(file_size),
                "created_at": datetime.utcnow(),
            },
        }

    except BusinessRuleException as e:
        logger.error(f"Cloud backup rejected: {e.detail}")
        cfg.last_backup_status = "FAILED"
        cfg.last_error_message = str(e.detail)
        db.commit()
        raise
    except Exception as e:
        logger.error(f"Error during cloud backup upload: {e}")
        cfg.last_backup_status = "FAILED"
        cfg.last_error_message = str(e)
        db.commit()
        raise BusinessRuleException(f"Google Drive upload failed: {e}")

    finally:
        # Clean up temporary snapshot file if it exists
        if temp_path.exists():
            try:
                temp_path.unlink()
            except Exception:
                pass

def download_cloud_backup_file(file_id: str, token: str) -> Path:
    """Downloads a backup file from Google Drive appDataFolder to the local Backups directory."""
    with create_httpx_client(timeout=30.0) as client:
        meta_resp = client.get(
            f"{GOOGLE_DRIVE_FILES_URL}/{file_id}",
            headers={"Authorization": f"Bearer {token}"},
            params={"fields": "id, name, size"},
        )
        if meta_resp.status_code != 200:
            raise BusinessRuleException(f"Failed to find cloud backup with ID {file_id}: {meta_resp.text}")

        meta = meta_resp.json()
        raw_name = meta.get("name", "stockflow_restored.db")
        clean_name = os.path.basename(raw_name)
        clean_name = "".join(c for c in clean_name if c.isalnum() or c in ("-", "_", "."))
        if not clean_name.endswith(".db"):
            clean_name = f"{clean_name}.db"

        dest_path = (settings.BACKUP_DIR / f"cloud_download_{int(datetime.now().timestamp())}_{clean_name}").resolve()
        if dest_path.parent != settings.BACKUP_DIR.resolve():
            raise BusinessRuleException("Path traversal detected in cloud backup filename.")

        with client.stream(
            "GET",
            f"{GOOGLE_DRIVE_FILES_URL}/{file_id}?alt=media",
            headers={"Authorization": f"Bearer {token}"},
            timeout=120.0,
        ) as download_stream:
            if download_stream.status_code != 200:
                raise BusinessRuleException(f"Failed to download cloud backup: HTTP {download_stream.status_code}")

            with open(dest_path, "wb") as f:
                for chunk in download_stream.iter_bytes():
                    f.write(chunk)

        if not validate_sqlite_file(dest_path):
            if dest_path.exists():
                dest_path.unlink()
            raise BusinessRuleException("Downloaded cloud backup is corrupted or invalid SQLite.")

        return dest_path

def restore_cloud_backup(file_id: str, db: Optional[Session] = None, confirm_pin: Optional[str] = None, token: Optional[str] = None) -> dict:
    """Restores database from a Google Drive cloud backup with pre-restore safety snapshot and schema auto-upgrade."""
    from backend.app.services.auth_service import verify_settings_pin
    from backend.app.core.database import SessionLocal

    check_db = db or SessionLocal()
    try:
        if not verify_settings_pin(check_db, str(confirm_pin or "").strip()):
            raise BusinessRuleException("Incorrect or missing Configuration PIN. Database restore denied.", status_code=403)

        if not token:
            cfg = get_or_create_google_settings(check_db)
            if not cfg.refresh_token:
                raise BusinessRuleException("Google account is not connected.")
            token = get_valid_access_token(cfg, check_db)
    finally:
        if not db:
            check_db.close()

    # 1. Download file from Google Drive
    downloaded_path = download_cloud_backup_file(file_id, token)

    db_path = settings.SQLITE_DB_PATH

    # 2. Create safety rollback backup of current state
    if db_path.exists():
        ts_now = datetime.now().strftime("%Y-%m-%d_%H%M%S")
        pre_restore_backup = settings.BACKUP_DIR / f"backup_prerestore_{ts_now}.db"
        try:
            shutil.copy2(db_path, pre_restore_backup)
        except Exception:
            pass
        try:
            curr_c = sqlite3.connect(str(db_path))
            curr_c.execute("PRAGMA wal_checkpoint(TRUNCATE);")
            curr_c.execute("PRAGMA journal_mode=DELETE;")
            curr_c.close()
        except Exception:
            pass

    # 3. Dispose active SQLAlchemy connection pool
    engine.dispose(close=True)

    # 4. Restore database from downloaded cloud file
    try:
        source_conn = sqlite3.connect(str(downloaded_path))
        dest_conn = sqlite3.connect(str(db_path))
        with dest_conn:
            source_conn.backup(dest_conn)
        dest_conn.execute("PRAGMA journal_mode=WAL;")
        dest_conn.execute("PRAGMA wal_checkpoint(TRUNCATE);")
        dest_conn.close()
        source_conn.close()
    except Exception:
        shutil.copy2(downloaded_path, db_path)

    # 5. Dispose engine again and run dynamic schema migration & baseline seeds
    engine.dispose(close=True)
    try:
        auto_upgrade_schema()
    except Exception as e:
        logger.error(f"Schema auto-upgrade error upon cloud restore: {e}")

    # 6. Seed initial baseline records (admin, pin, walk-in customer)
    from backend.app.services.auth_service import seed_initial_data
    heal_db = SessionLocal()
    try:
        seed_initial_data(heal_db)
    except Exception as e:
        logger.error(f"Baseline seed error upon cloud restore: {e}")
    finally:
        heal_db.close()

    # Clean up downloaded file
    if downloaded_path.exists():
        try:
            downloaded_path.unlink()
        except Exception:
            pass

    return {
        "success": True,
        "message": "Database successfully restored from Google Drive cloud backup.",
    }

def disconnect_google_account(db: Session):
    """Disconnects linked Google account and revokes access."""
    cfg = get_or_create_google_settings(db)
    cfg.is_enabled = False
    cfg.google_email = None
    cfg.google_name = None
    cfg.google_picture = None
    cfg.access_token = None
    cfg.refresh_token = None
    cfg.token_expiry = None
    cfg.last_backup_status = "NEVER"
    cfg.last_error_message = None
    db.commit()

def update_google_settings(update_data: GoogleBackupSettingsUpdate, db: Session) -> GoogleBackupSettings:
    """Updates configuration for Google backup (frequency, enabled state, custom credentials)."""
    cfg = get_or_create_google_settings(db)
    if update_data.is_enabled is not None:
        cfg.is_enabled = update_data.is_enabled
    if update_data.frequency is not None:
        if update_data.frequency not in ("6h", "daily", "weekly", "manual"):
            raise BusinessRuleException("Invalid frequency. Must be one of: 6h, daily, weekly, manual.")
        cfg.frequency = update_data.frequency
    if update_data.custom_client_id is not None:
        cfg.custom_client_id = update_data.custom_client_id.strip()
    if update_data.custom_client_secret is not None:
        cfg.custom_client_secret = update_data.custom_client_secret.strip()

    db.commit()
    db.refresh(cfg)
    return cfg

def get_google_backup_status(db: Session) -> GoogleBackupStatusResponse:
    """Returns current Google Drive backup status, quota telemetry, and strictly the 3 cloud backups."""
    cfg = get_or_create_google_settings(db)
    client_id, _ = get_effective_credentials(cfg)
    is_connected = bool(cfg.refresh_token)

    cloud_backups = []
    quota_used_bytes = None
    quota_limit_bytes = None
    quota_used_formatted = None
    quota_limit_formatted = None
    is_quota_exceeded = False
    active_error = cfg.last_error_message

    if is_connected:
        try:
            cloud_backups = list_cloud_backups(db, raise_on_error=True)
            cloud_backups = cloud_backups[:3]
            # If successfully fetched backups, clear transient network error from status
            if active_error and ("Unable to reach Google servers" in active_error or "Connection interrupted" in active_error):
                active_error = None
        except Exception as e:
            active_error = getattr(e, "detail", str(e))
            logger.warning(f"Could not retrieve Google Drive backups: {e}")

        try:
            token = get_valid_access_token(cfg, db)
            with create_httpx_client(timeout=5.0) as client:
                about_resp = client.get(
                    "https://www.googleapis.com/drive/v3/about?fields=storageQuota",
                    headers={"Authorization": f"Bearer {token}"},
                )
                if about_resp.status_code == 200:
                    sq = about_resp.json().get("storageQuota", {})
                    limit_val = sq.get("limit")
                    usage_val = sq.get("usage")
                    if usage_val is not None:
                        quota_used_bytes = int(usage_val)
                        quota_used_formatted = _format_size(quota_used_bytes)
                    if limit_val is not None:
                        quota_limit_bytes = int(limit_val)
                        quota_limit_formatted = _format_size(quota_limit_bytes)
                    if quota_limit_bytes and quota_used_bytes and quota_used_bytes >= quota_limit_bytes:
                        is_quota_exceeded = True
        except Exception as e:
            logger.debug(f"Could not retrieve Google Drive quota: {e}")

    return GoogleBackupStatusResponse(
        is_connected=is_connected,
        is_enabled=cfg.is_enabled,
        frequency=cfg.frequency,
        google_email=cfg.google_email,
        google_name=cfg.google_name,
        last_backup_at=cfg.last_backup_at,
        last_backup_status=cfg.last_backup_status,
        last_backup_size_bytes=cfg.last_backup_size_bytes,
        last_backup_size_formatted=_format_size(cfg.last_backup_size_bytes or 0),
        last_error_message=active_error,
        cloud_backups=cloud_backups,
        has_custom_credentials=bool(cfg.custom_client_id and cfg.custom_client_secret),
        client_id_configured=bool(client_id),
        quota_used_bytes=quota_used_bytes,
        quota_limit_bytes=quota_limit_bytes,
        quota_used_formatted=quota_used_formatted,
        quota_limit_formatted=quota_limit_formatted,
        is_quota_exceeded=is_quota_exceeded,
    )
