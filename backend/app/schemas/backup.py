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

from typing import Optional

class BackupRestoreRequest(BaseModel):
    filename: str
    confirm_pin: Optional[str] = None

class BackupRestoreResponse(BaseModel):
    success: bool
    message: str
