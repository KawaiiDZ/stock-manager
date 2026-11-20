import uuid
from datetime import datetime
from sqlalchemy import Column, Integer, String, Text, DateTime
from backend.app.core.database import Base

class SyncOutbox(Base):
    """
    Local outbox queue table in SQLite. Records every local mutation atomically
    so it can be pushed to Supabase when an internet connection is available.
    """
    __tablename__ = "sync_outbox"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    commit_id = Column(String(36), unique=True, nullable=False, index=True, default=lambda: str(uuid.uuid4()))
    entity_type = Column(String(50), nullable=False, index=True)  # e.g. "PRODUCT", "SALE", "CUSTOMER", "EXPENSE", "CATEGORY"
    entity_uuid = Column(String(36), nullable=False, index=True)
    action = Column(String(20), nullable=False)  # "UPSERT", "DELETE", "DELTA"
    payload = Column(Text, nullable=False)  # JSON encoded data
    status = Column(String(20), nullable=False, default="PENDING", index=True)  # "PENDING", "IN_FLIGHT", "SYNCED", "FAILED"
    retry_count = Column(Integer, default=0)
    last_error = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, index=True)
    synced_at = Column(DateTime, nullable=True)

class SyncMetadata(Base):
    """
    Tracks sync watermarks/cursors per entity type for incremental pull replication.
    """
    __tablename__ = "sync_metadata"

    entity_type = Column(String(50), primary_key=True)
    last_synced_at = Column(DateTime, nullable=False, default=datetime.utcnow)
    last_cursor = Column(String(64), nullable=True)
    status = Column(String(20), default="IDLE")
