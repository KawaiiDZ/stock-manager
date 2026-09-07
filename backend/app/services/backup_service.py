import os
import shutil
import sqlite3
from datetime import datetime
from typing import List
from pathlib import Path

from backend.app.core.config import settings
from backend.app.core.database import engine, auto_upgrade_schema
from backend.app.core.errors import BusinessRuleException
from backend.app.schemas.backup import BackupFileResponse, BackupCreateResponse, BackupRestoreResponse

def _format_size(size_bytes: int) -> str:
    if size_bytes < 1024:
        return f"{size_bytes} B"
    elif size_bytes < 1024 * 1024:
        return f"{size_bytes / 1024:.1f} KB"
    else:
        return f"{size_bytes / (1024 * 1024):.2f} MB"

def validate_sqlite_file(file_path: Path) -> bool:
    if not file_path.exists() or file_path.stat().st_size == 0:
        return False
    try:
        conn = sqlite3.connect(str(file_path))
        cursor = conn.cursor()
        cursor.execute("PRAGMA integrity_check;")
        res = cursor.fetchone()
        conn.close()
        return res and res[0] == "ok"
    except Exception:
        return False

def create_backup() -> BackupCreateResponse:
    os.makedirs(settings.BACKUP_DIR, exist_ok=True)
    db_path = settings.SQLITE_DB_PATH

    if not db_path.exists():
        raise BusinessRuleException("Active database file does not exist to backup.")

    timestamp_str = datetime.now().strftime("%Y-%m-%d_%H%M%S")
    backup_filename = f"backup_{timestamp_str}.db"
    destination_path = settings.BACKUP_DIR / backup_filename

    # Use sqlite3 backup API to create a live-safe consistent backup
    try:
        source_conn = sqlite3.connect(str(db_path))
        dest_conn = sqlite3.connect(str(destination_path))
        with dest_conn:
            source_conn.backup(dest_conn)
        dest_conn.close()
        source_conn.close()
    except Exception as e:
        # Fallback to copy if file is idle
        shutil.copy2(db_path, destination_path)

    if not validate_sqlite_file(destination_path):
        if destination_path.exists():
            os.remove(destination_path)
        raise BusinessRuleException("Backup validation failed. Backup could not be created.")

    return BackupCreateResponse(
        success=True,
        filename=backup_filename,
        message=f"Backup '{backup_filename}' created successfully."
    )

def list_backups() -> List[BackupFileResponse]:
    os.makedirs(settings.BACKUP_DIR, exist_ok=True)
    backups = []
    for f in settings.BACKUP_DIR.glob("*.db"):
        stat = f.stat()
        created_at = datetime.fromtimestamp(stat.st_mtime)
        backups.append(BackupFileResponse(
            filename=f.name,
            size_bytes=stat.st_size,
            size_formatted=_format_size(stat.st_size),
            created_at=created_at
        ))
    backups.sort(key=lambda x: x.created_at, reverse=True)
    return backups

def restore_backup(backup_filename: str) -> BackupRestoreResponse:
    safe_filename = os.path.basename(backup_filename.strip())
    if not safe_filename.endswith(".db"):
        raise BusinessRuleException("Invalid backup file extension. Only .db files can be restored.")

    backup_path = (settings.BACKUP_DIR / safe_filename).resolve()
    if backup_path.parent != settings.BACKUP_DIR.resolve() or not backup_path.exists():
        raise BusinessRuleException(f"Backup file '{safe_filename}' was not found in backups directory.")

    if not validate_sqlite_file(backup_path):
        raise BusinessRuleException(f"Backup file '{safe_filename}' is corrupted or not a valid database.")

    db_path = settings.SQLITE_DB_PATH

    # Dispose active SQLAlchemy connection pool before replacing database file
    engine.dispose()

    # 1. Create safety rollback backup of current state
    if db_path.exists():
        ts_now = datetime.now().strftime("%Y-%m-%d_%H%M%S")
        pre_restore_backup = settings.BACKUP_DIR / f"backup_prerestore_{ts_now}.db"
        try:
            shutil.copy2(db_path, pre_restore_backup)
        except Exception:
            pass

    # 2. Restore database from backup
    try:
        source_conn = sqlite3.connect(str(backup_path))
        dest_conn = sqlite3.connect(str(db_path))
        with dest_conn:
            source_conn.backup(dest_conn)
        dest_conn.close()
        source_conn.close()
    except Exception as e:
        shutil.copy2(backup_path, db_path)

    # Dispose connections to flush file handles and run any required migrations
    engine.dispose()
    try:
        auto_upgrade_schema()
    except Exception:
        pass

    return BackupRestoreResponse(
        success=True,
        message=f"Database restored successfully from '{backup_filename}'."
    )
