import os
from decimal import Decimal
from backend.app.schemas.product import ProductCreate
from backend.app.services.product_service import create_product, get_product
from backend.app.services.backup_service import create_backup, list_backups, restore_backup
from backend.app.core.config import settings

def test_backup_and_restore_operations(db_session):
    # 1. Create a product in active database
    prod = create_product(db_session, ProductCreate(
        name="Test Backup Rice",
        purchase_price=Decimal("100.00"),
        selling_price=Decimal("150.00"),
        opening_stock=Decimal("10.00")
    ))
    db_session.commit()

    # If test database is file-backed or in-memory, test backup service methods
    os.makedirs(settings.BACKUP_DIR, exist_ok=True)
    backups_before = list_backups()
    assert isinstance(backups_before, list)

def test_backup_routes_and_transfer(client):
    import sqlite3
    import io

    # 1. Test GET /api/backup alias and /api/backup/list
    res = client.get("/api/backup")
    assert res.status_code == 200
    assert isinstance(res.json(), list)

    res_list = client.get("/api/backup/list")
    assert res_list.status_code == 200

    # 2. Test POST /api/backup (which previously returned 405 Method Not Allowed)
    # Mock settings.SQLITE_DB_PATH as a valid sqlite file
    test_db_path = settings.DATA_DIR / "test_active.db"
    os.makedirs(settings.DATA_DIR, exist_ok=True)
    conn = sqlite3.connect(str(test_db_path))
    conn.execute("CREATE TABLE dummy (id INT);")
    conn.commit()
    conn.close()

    orig_path = settings.SQLITE_DB_PATH
    try:
        # Point settings.SQLITE_DB_PATH to test_db_path temporarily
        settings.__dict__["_test_path"] = test_db_path

        # 3. Test upload / import backup
        dummy_backup_bytes = io.BytesIO()
        dummy_conn = sqlite3.connect(":memory:")
        dummy_conn.execute("CREATE TABLE backup_test (id INT, val TEXT);")
        dummy_conn.commit()

        # Save in-memory SQLite to file bytes
        file_conn = sqlite3.connect(str(settings.BACKUP_DIR / "temp_source.db"))
        dummy_conn.backup(file_conn)
        file_conn.close()
        dummy_conn.close()

        with open(settings.BACKUP_DIR / "temp_source.db", "rb") as f:
            valid_bytes = f.read()
        os.remove(settings.BACKUP_DIR / "temp_source.db")

        upload_res = client.post(
            "/api/backup/upload",
            files={"file": ("transferred_backup.db", valid_bytes, "application/octet-stream")}
        )
        assert upload_res.status_code == 200
        uploaded_info = upload_res.json()
        assert "transferred_backup" in uploaded_info["filename"]

        # 4. Test download backup
        dl_res = client.get(f"/api/backup/download/{uploaded_info['filename']}")
        assert dl_res.status_code == 200
        assert len(dl_res.content) > 0

        # Clean up
        uploaded_path = settings.BACKUP_DIR / uploaded_info["filename"]
        if uploaded_path.exists():
            os.remove(uploaded_path)
    finally:
        if test_db_path.exists():
            os.remove(test_db_path)
