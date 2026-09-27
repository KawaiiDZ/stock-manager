from datetime import datetime
from typing import Optional, List
from pydantic import BaseModel

class GoogleDriveFileItem(BaseModel):
    id: str
    name: str
    size_bytes: int
    size_formatted: str
    created_at: datetime

class GoogleBackupStatusResponse(BaseModel):
    is_connected: bool
    is_enabled: bool
    frequency: str
    google_email: Optional[str] = None
    google_name: Optional[str] = None
    last_backup_at: Optional[datetime] = None
    last_backup_status: Optional[str] = None
    last_backup_size_bytes: Optional[int] = None
    last_backup_size_formatted: Optional[str] = None
    last_error_message: Optional[str] = None
    cloud_backups: List[GoogleDriveFileItem] = []
    has_custom_credentials: bool = False
    client_id_configured: bool = False
    quota_used_bytes: Optional[int] = None
    quota_limit_bytes: Optional[int] = None
    quota_used_formatted: Optional[str] = None
    quota_limit_formatted: Optional[str] = None
    is_quota_exceeded: bool = False

class GoogleBackupSettingsUpdate(BaseModel):
    is_enabled: Optional[bool] = None
    frequency: Optional[str] = None
    custom_client_id: Optional[str] = None
    custom_client_secret: Optional[str] = None

class GoogleAuthUrlResponse(BaseModel):
    auth_url: str

class GoogleBackupActionResponse(BaseModel):
    success: bool
    message: str
    file: Optional[GoogleDriveFileItem] = None

class GoogleBackupRestoreRequest(BaseModel):
    confirm_pin: Optional[str] = None

