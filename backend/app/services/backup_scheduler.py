import logging
import threading
import time
from datetime import datetime, timedelta

from backend.app.core.database import SessionLocal
from backend.app.services.google_drive_service import (
    get_or_create_google_settings,
    is_internet_connected,
    execute_google_backup,
)

logger = logging.getLogger(__name__)

_scheduler_thread: threading.Thread = None
_stop_event = threading.Event()
_backup_lock = threading.Lock()

INTERVAL_MAP = {
    "6h": timedelta(hours=6),
    "daily": timedelta(hours=24),
    "weekly": timedelta(days=7),
}

def _check_and_run_scheduled_backup():
    """Evaluates whether an automated cloud backup is due and runs it safely without blocking sales."""
    if not _backup_lock.acquire(blocking=False):
        logger.debug("Backup job already in progress, skipping scheduled check.")
        return

    db = SessionLocal()
    try:
        cfg = get_or_create_google_settings(db)
        if not cfg.is_enabled or not cfg.refresh_token:
            return

        freq = (cfg.frequency or "daily").lower()
        if freq == "manual":
            return

        interval = INTERVAL_MAP.get(freq, timedelta(hours=24))
        now = datetime.utcnow()

        # Check if due
        if cfg.last_backup_at is not None:
            time_elapsed = now - cfg.last_backup_at
            if time_elapsed < interval:
                return

        # Check internet connectivity
        if not is_internet_connected(timeout_sec=2.0):
            logger.info("Internet connection not available during scheduled cloud backup. Skipping gracefully.")
            cfg.last_backup_status = "OFFLINE_SKIPPED"
            cfg.last_error_message = "Internet disconnected. Cloud backup will resume automatically once connected."
            db.commit()
            return

        logger.info(f"Running scheduled Google Drive backup (frequency={freq})...")
        execute_google_backup(db)
        logger.info("Scheduled Google Drive backup completed successfully.")

    except Exception as e:
        logger.error(f"Error in scheduled Google Drive backup: {e}", exc_info=True)
    finally:
        db.close()
        _backup_lock.release()

def _scheduler_loop():
    """Background daemon loop that wakes up periodically to evaluate cloud backup jobs."""
    logger.info("Google Drive background backup scheduler started.")
    # Short initial sleep so application startup completes cleanly
    for _ in range(6):
        if _stop_event.is_set():
            return
        time.sleep(5)

    while not _stop_event.is_set():
        try:
            _check_and_run_scheduled_backup()
        except Exception as e:
            logger.error(f"Unexpected exception in backup scheduler loop: {e}")

        # Sleep in 10-second slices up to 10 minutes (600 seconds) so shutdown is immediate
        for _ in range(60):
            if _stop_event.is_set():
                break
            time.sleep(10)

def start_backup_scheduler():
    """Starts the background backup scheduler daemon thread if not already running."""
    global _scheduler_thread
    if _scheduler_thread is not None and _scheduler_thread.is_alive():
        return

    _stop_event.clear()
    _scheduler_thread = threading.Thread(target=_scheduler_loop, name="GoogleDriveBackupScheduler", daemon=True)
    _scheduler_thread.start()

def stop_backup_scheduler():
    """Signals the scheduler daemon thread to stop."""
    global _scheduler_thread
    _stop_event.set()
    if _scheduler_thread is not None:
        _scheduler_thread.join(timeout=2.0)
        _scheduler_thread = None

def trigger_cloud_backup_synchronous():
    """Thread-safe synchronous trigger used by user-initiated 'Backup Now' button."""
    with _backup_lock:
        db = SessionLocal()
        try:
            return execute_google_backup(db)
        finally:
            db.close()
