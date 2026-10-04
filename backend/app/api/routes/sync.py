from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from backend.app.core.database import get_db
from backend.app.schemas.sync import SyncPushRequest, SyncPushResponse
from backend.app.services.sync_service import process_sync_batch
from backend.app.models.sync import ProcessedSyncCommit

router = APIRouter(prefix="/sync", tags=["Sync"])

@router.post("/push", response_model=SyncPushResponse)
def push_offline_commits(
    request: SyncPushRequest,
    db: Session = Depends(get_db)
):
    """
    Receive offline commits from a remote terminal and reconcile them additively.
    """
    return process_sync_batch(db, request)

@router.get("/status")
def get_sync_status(db: Session = Depends(get_db)):
    """
    Return basic sync status and total processed commits on this host.
    """
    total_commits = db.query(ProcessedSyncCommit).count()
    return {
        "status": "online",
        "processed_commits_count": total_commits,
    }
