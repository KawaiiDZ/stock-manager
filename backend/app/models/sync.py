from datetime import datetime
from sqlalchemy import Column, Integer, String, DateTime
from backend.app.core.database import Base

class ProcessedSyncCommit(Base):
    __tablename__ = "processed_sync_commits"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    commit_id = Column(String(64), unique=True, nullable=False, index=True)
    client_id = Column(String(64), nullable=True)
    action = Column(String(50), nullable=False)
    summary = Column(String(255), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
