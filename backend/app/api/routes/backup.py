from typing import List
from fastapi import APIRouter
from backend.app.schemas.backup import (
    BackupFileResponse, BackupCreateResponse, BackupRestoreRequest, BackupRestoreResponse
)
from backend.app.services.backup_service import (
    create_backup, list_backups, restore_backup
)

router = APIRouter(prefix="/backup", tags=["Backup & Restore"])

@router.get("/list", response_model=List[BackupFileResponse])
def get_backup_files():
    return list_backups()

@router.post("/create", response_model=BackupCreateResponse)
def trigger_backup():
    return create_backup()

@router.post("/restore", response_model=BackupRestoreResponse)
def trigger_restore(data: BackupRestoreRequest):
    return restore_backup(data.filename)
