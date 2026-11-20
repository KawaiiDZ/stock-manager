"""
Supabase Background Synchronization Worker
Continuously monitors internet connection and runs periodic sync cycles
(draining sync_outbox and pulling downstream changes) without blocking main app.
"""
import time
import threading
import logging
from typing import Optional
from backend.app.core.database import SessionLocal
from backend.app.services.supabase_sync_service import (
    is_supabase_configured,
    push_pending_outbox_batch,
    pull_downstream_updates
)

logger = logging.getLogger("uvicorn.error")

_sync_worker_thread: Optional[threading.Thread] = None
_sync_stop_event = threading.Event()

def _sync_worker_loop():
    logger.info("[SupabaseSyncWorker] Background sync daemon started.")
    
    while not _sync_stop_event.is_set():
        try:
            if is_supabase_configured():
                db = SessionLocal()
                try:
                    # 1. Drain pending local outbox commits upstream to Supabase
                    push_res = push_pending_outbox_batch(db, batch_size=50)
                    if push_res.get("pushed", 0) > 0:
                        logger.info(f"[SupabaseSyncWorker] Pushed {push_res['pushed']} outbox items to Supabase cloud.")

                    # 2. Pull downstream updates from cloud
                    pull_res = pull_downstream_updates(db)
                    if pull_res.get("pulled", 0) > 0:
                        logger.info(f"[SupabaseSyncWorker] Pulled {pull_res['pulled']} updates from Supabase cloud.")
                finally:
                    db.close()
        except Exception as e:
            logger.warning(f"[SupabaseSyncWorker] Error during sync cycle: {e}")

        # Sleep with 1-second ticks so stop event responds immediately
        for _ in range(12):
            if _sync_stop_event.is_set():
                break
            time.sleep(1.0)

    logger.info("[SupabaseSyncWorker] Background sync daemon stopped.")

def start_sync_worker():
    global _sync_worker_thread, _sync_stop_event
    if _sync_worker_thread and _sync_worker_thread.is_alive():
        return
    _sync_stop_event.clear()
    _sync_worker_thread = threading.Thread(target=_sync_worker_loop, daemon=True, name="SupabaseSyncWorker")
    _sync_worker_thread.start()

def stop_sync_worker():
    global _sync_worker_thread, _sync_stop_event
    _sync_stop_event.set()
    if _sync_worker_thread and _sync_worker_thread.is_alive():
        _sync_worker_thread.join(timeout=2.0)
