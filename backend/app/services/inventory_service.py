from decimal import Decimal
from typing import List, Optional
from datetime import datetime
from sqlalchemy.orm import Session, joinedload
from backend.app.models.inventory import InventoryBatch, InventoryMovement
from backend.app.models.product import Product
from backend.app.schemas.inventory import InventoryBatchResponse, InventoryMovementResponse

def get_product_batches(db: Session, product_id: int, remaining_only: bool = True) -> List[InventoryBatchResponse]:
    q = db.query(InventoryBatch).filter(InventoryBatch.product_id == product_id)
    if remaining_only:
        q = q.filter(InventoryBatch.quantity_remaining > Decimal("0.00"))
    batches = q.order_by(InventoryBatch.created_at.asc(), InventoryBatch.id.asc()).all()
    return [InventoryBatchResponse.model_validate(b) for b in batches]

def list_inventory_movements(
    db: Session,
    product_id: Optional[int] = None,
    movement_type: Optional[str] = None,
    start_date: Optional[datetime] = None,
    end_date: Optional[datetime] = None,
    skip: int = 0,
    limit: int = 200
) -> List[InventoryMovementResponse]:
    q = db.query(InventoryMovement).options(joinedload(InventoryMovement.product))
    if product_id:
        q = q.filter(InventoryMovement.product_id == product_id)
    if movement_type:
        q = q.filter(InventoryMovement.movement_type == movement_type)
    if start_date:
        q = q.filter(InventoryMovement.created_at >= start_date)
    if end_date:
        q = q.filter(InventoryMovement.created_at <= end_date)

    movements = q.order_by(InventoryMovement.created_at.desc(), InventoryMovement.id.desc()).offset(skip).limit(limit).all()
    
    result = []
    for m in movements:
        item = InventoryMovementResponse(
            id=m.id,
            product_id=m.product_id,
            product_name=m.product.name if m.product else "Unknown",
            movement_type=m.movement_type,
            quantity=m.quantity,
            unit_cost=m.unit_cost,
            reference_type=m.reference_type,
            reference_id=m.reference_id,
            notes=m.notes,
            created_at=m.created_at
        )
        result.append(item)
    return result
