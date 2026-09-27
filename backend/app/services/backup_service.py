import os
import shutil
import sqlite3
from datetime import datetime
from typing import List, Optional, Any
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

    # Ensure WAL pages are checkpointed into main database before backup
    try:
        source_conn = sqlite3.connect(str(db_path))
        source_conn.execute("PRAGMA wal_checkpoint(TRUNCATE);")
        source_conn.commit()
    except Exception:
        source_conn = None

    try:
        if source_conn is None:
            source_conn = sqlite3.connect(str(db_path))
        dest_conn = sqlite3.connect(str(destination_path))
        with dest_conn:
            source_conn.backup(dest_conn)
        dest_conn.close()
        source_conn.close()
    except Exception as e:
        if source_conn:
            try:
                source_conn.close()
            except Exception:
                pass
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

def restore_backup(backup_filename: str, confirm_pin: Optional[str] = None, db: Optional[Any] = None) -> BackupRestoreResponse:
    safe_filename = os.path.basename(backup_filename.strip())
    if not safe_filename.endswith(".db"):
        raise BusinessRuleException("Invalid backup file extension. Only .db files can be restored.", status_code=400)


    backup_path = (settings.BACKUP_DIR / safe_filename).resolve()
    if backup_path.parent != settings.BACKUP_DIR.resolve() or not backup_path.exists():
        raise BusinessRuleException(f"Backup file '{safe_filename}' was not found in backups directory.", status_code=400)

    from backend.app.core.database import SessionLocal
    from backend.app.services.auth_service import verify_settings_pin

    check_db = db or SessionLocal()
    try:
        if not verify_settings_pin(check_db, str(confirm_pin or "").strip()):
            raise BusinessRuleException("Incorrect or missing Configuration PIN. Database restore denied.", status_code=403)
    finally:
        if not db:
            check_db.close()


    if not validate_sqlite_file(backup_path):
        raise BusinessRuleException(f"Backup file '{safe_filename}' is corrupted or not a valid database.")

    db_path = settings.SQLITE_DB_PATH

    # Dispose active SQLAlchemy connection pool before replacing database file
    engine.dispose(close=True)

    # 1. Create safety rollback backup of current state
    if db_path.exists():
        ts_now = datetime.now().strftime("%Y-%m-%d_%H%M%S")
        pre_restore_backup = settings.BACKUP_DIR / f"backup_prerestore_{ts_now}.db"
        try:
            shutil.copy2(db_path, pre_restore_backup)
        except Exception:
            pass
        try:
            curr_c = sqlite3.connect(str(db_path))
            curr_c.execute("PRAGMA wal_checkpoint(TRUNCATE);")
            curr_c.execute("PRAGMA journal_mode=DELETE;")
            curr_c.close()
        except Exception:
            pass

    # 2. Restore database from backup
    try:
        source_conn = sqlite3.connect(str(backup_path))
        dest_conn = sqlite3.connect(str(db_path))
        with dest_conn:
            source_conn.backup(dest_conn)
        dest_conn.execute("PRAGMA journal_mode=WAL;")
        dest_conn.execute("PRAGMA wal_checkpoint(TRUNCATE);")
        dest_conn.close()
        source_conn.close()
    except Exception as e:
        shutil.copy2(backup_path, db_path)

    # 3. Dispose connections to flush file handles and run universal migrations
    engine.dispose(close=True)
    try:
        auto_upgrade_schema()
    except Exception as e:
        print("Schema auto-upgrade error upon restore:", e)

    # 4. Seed or heal baseline records (admin, default PIN, walk-in customer)
    from backend.app.core.database import SessionLocal
    from backend.app.services.auth_service import seed_initial_data
    heal_db = SessionLocal()
    try:
        seed_initial_data(heal_db)
    except Exception as e:
        print("Baseline data seeding error upon restore:", e)
    finally:
        heal_db.close()

    return BackupRestoreResponse(
        success=True,
        message=f"Database restored successfully from '{backup_filename}'."
    )

def get_backup_path(backup_filename: str) -> Path:
    safe_filename = os.path.basename(backup_filename.strip())
    if not safe_filename.endswith(".db"):
        raise BusinessRuleException("Invalid backup file extension. Only .db files are supported.")
    backup_path = (settings.BACKUP_DIR / safe_filename).resolve()
    if backup_path.parent != settings.BACKUP_DIR.resolve() or not backup_path.exists():
        raise BusinessRuleException(f"Backup file '{safe_filename}' not found.")
    return backup_path

def import_backup_file(file_content: bytes, original_filename: str) -> BackupFileResponse:
    os.makedirs(settings.BACKUP_DIR, exist_ok=True)
    clean_name = os.path.basename(original_filename.strip())
    if not clean_name.endswith(".db"):
        raise BusinessRuleException("Only .db SQLite database files can be imported as backups.")

    # Prevent overwriting existing backups by suffixing if needed
    dest_path = settings.BACKUP_DIR / clean_name
    if dest_path.exists():
        stem = clean_name[:-3]
        clean_name = f"{stem}_imported_{int(datetime.now().timestamp())}.db"
        dest_path = settings.BACKUP_DIR / clean_name

    with open(dest_path, "wb") as f:
        f.write(file_content)

    if not validate_sqlite_file(dest_path):
        if dest_path.exists():
            os.remove(dest_path)
        raise BusinessRuleException("Import failed: The selected file is not a valid SQLite database or is corrupted.")

    stat = dest_path.stat()
    return BackupFileResponse(
        filename=clean_name,
        size_bytes=stat.st_size,
        size_formatted=_format_size(stat.st_size),
        created_at=datetime.fromtimestamp(stat.st_mtime)
    )
