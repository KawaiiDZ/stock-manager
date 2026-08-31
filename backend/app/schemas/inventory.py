from datetime import datetime
from decimal import Decimal
from typing import Optional
from pydantic import BaseModel

class InventoryBatchResponse(BaseModel):
    id: int
    product_id: int
    purchase_id: Optional[int] = None
    quantity_received: Decimal
    quantity_remaining: Decimal
    unit_cost: Decimal
    created_at: datetime

    class Config:
        from_attributes = True

class InventoryMovementResponse(BaseModel):
    id: int
    product_id: int
    product_name: Optional[str] = None
    movement_type: str
    quantity: Decimal
    unit_cost: Decimal
    reference_type: str
    reference_id: str
    notes: Optional[str] = None
    created_at: datetime

    class Config:
        from_attributes = True
