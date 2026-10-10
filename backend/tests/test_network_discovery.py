import pytest
from fastapi.testclient import TestClient
from backend.app.services.network_service import (
    get_local_lan_ip,
    start_discovery_beacon,
    stop_discovery_beacon
)

def test_local_ip_detection():
    ip = get_local_lan_ip()
    assert isinstance(ip, str)
    parts = ip.split(".")
    assert len(parts) == 4
    # All parts should be valid integers
    for part in parts:
        assert 0 <= int(part) <= 255

def test_network_info_and_ping_endpoints(client: TestClient, db_session):
    # Test /api/network/info
    info_res = client.get("/api/network/info")
    assert info_res.status_code == 200
    info_data = info_res.json()
    assert info_data["service"] == "stokflow"
    assert "lan_ip" in info_data
    assert info_data["http_port"] == 8000
    assert info_data["udp_port"] == 41234

    # Test /api/network/ping
    ping_res = client.get("/api/network/ping")
    assert ping_res.status_code == 200
    ping_data = ping_res.json()
    assert ping_data["service"] == "stokflow"
    assert ping_data["status"] == "ok"
    assert "station_name" in ping_data

def test_discovery_beacon_lifecycle():
    # Verify beacon starts and stops cleanly without unhandled exceptions
    start_discovery_beacon(http_port=8000, station_name="Test Station")
    # Calling start again when already running should be idempotent
    start_discovery_beacon(http_port=8000, station_name="Test Station")
    stop_discovery_beacon()

def test_client_heartbeat_and_clients_endpoint(client: TestClient, db_session):
    from backend.app.services.network_service import clear_client_registry, record_client_heartbeat
    from datetime import datetime, timezone

    clear_client_registry()

    # 1. Initially no clients
    initial_res = client.get("/api/network/clients")
    assert initial_res.status_code == 200
    assert initial_res.json()["total_count"] == 0
    assert initial_res.json()["online_count"] == 0

    # 2. Client station 1 sends heartbeat
    hb1 = client.post("/api/network/heartbeat", json={
        "client_id": "station_pad_01",
        "station_name": "Warehouse iPad",
        "pending_sync_count": 3,
        "version": "1.0.0"
    })
    assert hb1.status_code == 200
    assert hb1.json()["registered"] is True

    # 3. Client station 2 sends heartbeat
    hb2 = client.post("/api/network/heartbeat", json={
        "client_id": "station_pc_02",
        "station_name": "Backroom Counter",
        "pending_sync_count": 0,
        "version": "1.0.0"
    })
    assert hb2.status_code == 200

    # 4. Host checks connected clients
    clients_res = client.get("/api/network/clients")
    assert clients_res.status_code == 200
    data = clients_res.json()
    assert data["total_count"] == 2
    assert data["online_count"] == 2

    # Check station details
    station_names = [c["station_name"] for c in data["clients"]]
    assert "Warehouse iPad" in station_names
    assert "Backroom Counter" in station_names

    pad = next(c for c in data["clients"] if c["client_id"] == "station_pad_01")
    assert pad["pending_sync_count"] == 3
    assert pad["status"] == "online"
    assert pad["last_seen_seconds_ago"] <= 5

