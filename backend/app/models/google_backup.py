from datetime import datetime
from sqlalchemy import Column, Integer, String, Text, Boolean, DateTime
from backend.app.core.database import Base

class GoogleBackupSettings(Base):
    __tablename__ = "google_backup_settings"

    id = Column(Integer, primary_key=True, index=True)
    is_enabled = Column(Boolean, nullable=False, default=False)
    frequency = Column(String(20), nullable=False, default="daily")  # "6h", "daily", "weekly", "manual"
    google_email = Column(String(255), nullable=True)
    google_name = Column(String(255), nullable=True)
    google_picture = Column(Text, nullable=True)
    access_token = Column(Text, nullable=True)
    refresh_token = Column(Text, nullable=True)
    token_expiry = Column(DateTime, nullable=True)
    custom_client_id = Column(String(255), nullable=True)
    custom_client_secret = Column(String(255), nullable=True)
    last_backup_at = Column(DateTime, nullable=True)
    last_backup_status = Column(String(50), nullable=False, default="NEVER")  # NEVER, SUCCESS, FAILED, OFFLINE_SKIPPED, IN_PROGRESS
    last_backup_size_bytes = Column(Integer, nullable=True, default=0)
    last_error_message = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
