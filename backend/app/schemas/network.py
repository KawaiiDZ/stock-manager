from pydantic import BaseModel
from typing import List, Optional

class ClientHeartbeatRequest(BaseModel):
    client_id: str
    station_name: str
    pending_sync_count: int = 0
    version: str = "1.0.0"

class ConnectedClientItem(BaseModel):
    client_id: str
    station_name: str
    ip_address: str
    status: str  # "online", "idle", "offline"
    pending_sync_count: int = 0
    version: str = "1.0.0"
    last_seen: str
    last_seen_seconds_ago: int

class ConnectedClientsResponse(BaseModel):
    online_count: int
    total_count: int
    clients: List[ConnectedClientItem] = []
