import uuid
from datetime import datetime
from sqlalchemy import Column, String, DateTime, Boolean

class SyncableMixin:
    """
    Standard mixin providing universal UUID, change timestamp, and soft deletion
    for multi-counter offline-first synchronization with Supabase.
    """
    sync_uuid = Column(String(36), unique=True, nullable=False, default=lambda: str(uuid.uuid4()), index=True)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, index=True)
    is_deleted = Column(Boolean, default=False, nullable=False)
