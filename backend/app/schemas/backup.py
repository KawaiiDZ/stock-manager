from datetime import datetime
from pydantic import BaseModel

class BackupFileResponse(BaseModel):
    filename: str
    size_bytes: int
    size_formatted: str
    created_at: datetime

class BackupCreateResponse(BaseModel):
    success: bool
    filename: str
    message: str

class BackupRestoreRequest(BaseModel):
    filename: str

class BackupRestoreResponse(BaseModel):
    success: bool
    message: str
