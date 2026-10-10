from fastapi import APIRouter, Depends, Query, Request
from pydantic import BaseModel
from sqlalchemy.orm import Session
from typing import List, Dict, Any, Optional

from backend.app.core.database import get_db
from backend.app.services.network_service import (
    get_local_lan_ip,
    scan_network,
    check_remote_host,
    record_client_heartbeat,
    get_registered_clients,
    DISCOVERY_UDP_PORT
)
from backend.app.schemas.network import (
    ClientHeartbeatRequest,
    ConnectedClientsResponse,
    ConnectedClientItem
)
from backend.app.models.business import BusinessSettings

router = APIRouter(prefix="/network", tags=["Network Discovery"])

class TestHostRequest(BaseModel):
    url: str

class HostPingResponse(BaseModel):
    service: str
    status: str
    station_name: str
    version: str

@router.get("/info")
def get_network_info(db: Session = Depends(get_db)):
    """
    Get local host networking details to display on screen or share with terminals.
    """
    settings = db.query(BusinessSettings).first()
    station_name = settings.business_name if settings and settings.business_name else "Main Host Register"
    lan_ip = get_local_lan_ip()

    return {
        "service": "stokflow",
        "station_name": station_name,
        "lan_ip": lan_ip,
        "http_port": 8000,
        "udp_port": DISCOVERY_UDP_PORT,
        "url": f"http://{lan_ip}:8000"
    }

@router.get("/ping", response_model=HostPingResponse)
def ping_host(db: Session = Depends(get_db)):
    """
    Lightweight health check endpoint used by remote terminals during discovery.
    """
    settings = db.query(BusinessSettings).first()
    station_name = settings.business_name if settings and settings.business_name else "Main Host Register"

    return {
        "service": "stokflow",
        "status": "ok",
        "station_name": station_name,
        "version": "1.0.0"
    }

@router.post("/discover")
async def trigger_network_discovery(
    subnet_fallback: bool = Query(True, description="Probe /24 subnet if UDP packet is dropped")
):
    """
    Discover active StockFlow hosts on the local network.
    """
    hosts = await scan_network(timeout=1.5, run_subnet_fallback=subnet_fallback)
    return {
        "discovered_count": len(hosts),
        "hosts": hosts
    }

@router.post("/test-host")
async def test_remote_host_connection(request: TestHostRequest):
    """
    Verify reachability of a specific host URL.
    """
    return await check_remote_host(request.url)

@router.post("/heartbeat")
def client_heartbeat(
    payload: ClientHeartbeatRequest,
    request: Request,
    db: Session = Depends(get_db)
):
    """
    Record real-time heartbeat from a secondary client station.
    """
    client_ip = request.client.host if request.client else "127.0.0.1"
    forwarded = request.headers.get("x-forwarded-for")
    if forwarded:
        client_ip = forwarded.split(",")[0].strip()

    record_client_heartbeat(
        client_id=payload.client_id,
        station_name=payload.station_name,
        ip_address=client_ip,
        pending_sync_count=payload.pending_sync_count,
        version=payload.version
    )

    settings = db.query(BusinessSettings).first()
    station_name = settings.business_name if settings and settings.business_name else "Main Counter"

    return {
        "status": "ok",
        "station_name": station_name,
        "registered": True
    }

@router.get("/clients", response_model=ConnectedClientsResponse)
def get_connected_clients():
    """
    Get all active secondary stations reporting to this Main Counter,
    including their IP, online/idle/offline status, and pending sync counts.
    """
    clients = get_registered_clients(online_timeout_seconds=15, idle_timeout_seconds=60)
    online_count = sum(1 for c in clients if c["status"] == "online")

    return ConnectedClientsResponse(
        online_count=online_count,
        total_count=len(clients),
        clients=clients
    )

