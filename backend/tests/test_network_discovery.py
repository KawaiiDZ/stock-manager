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
