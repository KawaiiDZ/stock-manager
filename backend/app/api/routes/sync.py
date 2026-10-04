from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from datetime import datetime, timezone
from backend.app.core.database import get_db
from backend.app.schemas.sync import SyncPushRequest, SyncPushResponse, SyncSnapshotResponse
from backend.app.services.sync_service import process_sync_batch
from backend.app.models.sync import ProcessedSyncCommit
from backend.app.services.settings_service import get_settings
from backend.app.schemas.business import BusinessSettingsResponse
from backend.app.services.product_service import (
    list_categories, list_custom_fields, list_products
)
from backend.app.services.customer_service import list_customers
from backend.app.services.supplier_service import list_suppliers

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

@router.get("/snapshot", response_model=SyncSnapshotResponse)
def get_store_snapshot(db: Session = Depends(get_db)):
    """
    Deliver a complete atomic snapshot of store configuration, categories,
    custom fields, and product catalog for offline client replication.
    """
    now_iso = datetime.now(timezone.utc).isoformat()

    # 1. Business settings
    biz_settings = get_settings(db)
    settings_dict = BusinessSettingsResponse.model_validate(biz_settings).model_dump() if biz_settings else {}

    # 2. Categories
    raw_cats = list_categories(db, active_only=True)
    cats_list = [{"id": c.id, "name": c.name, "is_active": c.is_active} for c in raw_cats]

    # 3. Custom Fields
    raw_fields = list_custom_fields(db, active_only=True)
    fields_list = [f.model_dump() if hasattr(f, "model_dump") else f for f in raw_fields]

    # 4. Products (complete catalog with stock and custom fields)
    products_list = list_products(db, is_active=True, limit=10000)

    # 5. Customers & Suppliers
    raw_customers = list_customers(db, is_active=True)
    customers_list = [c.model_dump() if hasattr(c, "model_dump") else c for c in raw_customers]

    raw_suppliers = list_suppliers(db, is_active=True)
    suppliers_list = [s.model_dump() if hasattr(s, "model_dump") else s for s in raw_suppliers]

    return SyncSnapshotResponse(
        timestamp=now_iso,
        settings=settings_dict,
        categories=cats_list,
        custom_fields=fields_list,
        products=products_list,
        customers=customers_list,
        suppliers=suppliers_list,
        products_count=len(products_list)
    )
