from typing import List, Dict, Any, Optional
from pydantic import BaseModel

class SyncCommitDto(BaseModel):
    id: str
    action: str  # ADD_PRODUCT, RESTOCK_DELTA, CREATE_PURCHASE
    timestamp: Optional[str] = None
    data: Dict[str, Any]

class SyncPushRequest(BaseModel):
    client_id: str
    station_name: Optional[str] = None
    commits: List[SyncCommitDto]

class MergedItemSummary(BaseModel):
    commit_id: str
    action: str
    status: str  # CREATED_NEW, ADDITIVE_MERGED, ALREADY_PROCESSED, FAILED
    product_name: Optional[str] = None
    delta_quantity: Optional[float] = None
    new_stock: Optional[float] = None
    message: Optional[str] = None

class SyncPushResponse(BaseModel):
    success: bool
    processed_count: int
    skipped_count: int
    results: List[MergedItemSummary]
    message: str
