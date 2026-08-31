from typing import List, Optional
from datetime import datetime
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from backend.app.core.database import get_db
from backend.app.schemas.inventory import InventoryBatchResponse, InventoryMovementResponse
from backend.app.services.inventory_service import get_product_batches, list_inventory_movements

router = APIRouter(prefix="/inventory", tags=["Inventory"])

@router.get("/batches/{product_id}", response_model=List[InventoryBatchResponse])
def get_batches(product_id: int, remaining_only: bool = True, db: Session = Depends(get_db)):
    return get_product_batches(db, product_id, remaining_only=remaining_only)

@router.get("/movements", response_model=List[InventoryMovementResponse])
def get_movements(
    product_id: Optional[int] = None,
    movement_type: Optional[str] = None,
    start_date: Optional[datetime] = None,
    end_date: Optional[datetime] = None,
    skip: int = 0,
    limit: int = 200,
    db: Session = Depends(get_db)
):
    return list_inventory_movements(
        db,
        product_id=product_id,
        movement_type=movement_type,
        start_date=start_date,
        end_date=end_date,
        skip=skip,
        limit=limit
    )
