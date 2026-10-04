import pytest
from fastapi.testclient import TestClient
from backend.app.models.user import User

def test_user_crud_and_safety_rules(client: TestClient, db_session):
    # 1. Verify default admin was seeded
    res = client.get("/api/users")
    assert res.status_code == 200
    users = res.json()
    assert len(users) >= 1
    admin = next(u for u in users if u["username"] == "admin")
    assert admin["role"] == "ADMIN"
    assert admin["is_active"] is True

    # 2. Create new warehouse staff user
    new_user_payload = {
        "username": "warehouse_station_1",
        "password": "Password123!",
        "full_name": "Warehouse Scanner 1",
        "role": "RESTOCKER",
        "is_active": True
    }
    create_res = client.post("/api/users", json=new_user_payload)
    assert create_res.status_code == 200
    created = create_res.json()
    assert created["username"] == "warehouse_station_1"
    assert created["role"] == "RESTOCKER"
    assert "password_hash" not in created
    warehouse_user_id = created["id"]

    # 3. Authenticate with the newly created user credentials
    login_res = client.post("/api/auth/login", json={
        "username": "warehouse_station_1",
        "password": "Password123!"
    })
    assert login_res.status_code == 200
    login_data = login_res.json()
    assert login_data["username"] == "warehouse_station_1"
    assert login_data["role"] == "RESTOCKER"
    assert "token" in login_data

    # 4. Deactivate warehouse user and verify login fails
    update_res = client.put(f"/api/users/{warehouse_user_id}", json={
        "is_active": False
    })
    assert update_res.status_code == 200
    assert update_res.json()["is_active"] is False

    fail_login = client.post("/api/auth/login", json={
        "username": "warehouse_station_1",
        "password": "Password123!"
    })
    assert fail_login.status_code == 400
    assert "deactivated" in fail_login.json()["detail"].lower()

    # 5. Safety rule: Attempting to delete the last active ADMIN must fail
    del_admin_res = client.delete(f"/api/users/{admin['id']}")
    assert del_admin_res.status_code == 400
    assert "only admin" in del_admin_res.json()["detail"].lower()

    # 6. Safety rule: Attempting to demote the last active ADMIN must fail
    demote_admin_res = client.put(f"/api/users/{admin['id']}", json={
        "role": "RESTOCKER"
    })
    assert demote_admin_res.status_code == 400
    assert "at least one active admin" in demote_admin_res.json()["detail"].lower()

    # 7. Delete the warehouse user successfully
    del_res = client.delete(f"/api/users/{warehouse_user_id}")
    assert del_res.status_code == 200
    assert del_res.json()["success"] is True
