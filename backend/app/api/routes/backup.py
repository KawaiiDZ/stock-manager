from typing import List
from fastapi import APIRouter, UploadFile, File
from fastapi.responses import FileResponse
from backend.app.schemas.backup import (
    BackupFileResponse, BackupCreateResponse, BackupRestoreRequest, BackupRestoreResponse
)
from backend.app.services.backup_service import (
    create_backup, list_backups, restore_backup, get_backup_path, import_backup_file
)

router = APIRouter(prefix="/backup", tags=["Backup & Restore"])

# Support GET /backup, GET /backup/, and GET /backup/list
@router.get("", response_model=List[BackupFileResponse])
@router.get("/", response_model=List[BackupFileResponse])
@router.get("/list", response_model=List[BackupFileResponse])
def get_backup_files():
    return list_backups()

# Support POST /backup, POST /backup/, and POST /backup/create
@router.post("", response_model=BackupCreateResponse)
@router.post("/", response_model=BackupCreateResponse)
@router.post("/create", response_model=BackupCreateResponse)
def trigger_backup():
    return create_backup()

@router.post("/restore", response_model=BackupRestoreResponse)
def trigger_restore(data: BackupRestoreRequest):
    return restore_backup(data.filename)

@router.get("/download/{filename}")
def download_backup_file(filename: str):
    file_path = get_backup_path(filename)
    return FileResponse(
        path=str(file_path),
        filename=filename,
        media_type="application/octet-stream"
    )

@router.post("/upload", response_model=BackupFileResponse)
async def upload_backup_file(file: UploadFile = File(...)):
    content = await file.read()
    return import_backup_file(content, file.filename or "imported_backup.db")
