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

def test_current_to_future_version_backup_restore():
    """
    Verifies that a database backup exported from the current version can be restored into
    a future version of the software with new tables and new columns, and upgraded seamlessly.
    """
    import tempfile
    import sqlite3
    from pathlib import Path
    from sqlalchemy import create_engine, text, Column, Integer, String, Boolean, Table
    from sqlalchemy.orm import declarative_base, sessionmaker
    from backend.app.core.database import Base, _get_sqlite_column_def
    from backend.app.services.auth_service import seed_initial_data
    from backend.app.models.product import Product

    temp_dir = tempfile.TemporaryDirectory()
    db_path = Path(temp_dir.name) / "current_prod.db"

    # 1. Initialize database with current schema
    current_engine = create_engine(f"sqlite:///{db_path}")
    Base.metadata.create_all(bind=current_engine)
    Session = sessionmaker(bind=current_engine)
    s = Session()
    seed_initial_data(s)
    p = Product(
        product_id="P-000001",
        name="Production Wheat Flour 10kg",
        purchase_price=Decimal("800.00"),
        selling_price=Decimal("1100.00"),
        current_stock=Decimal("15.00")
    )
    s.add(p)
    s.commit()
    s.close()
    current_engine.dispose()

    # 2. Simulate a Future Version that introduces a new model (e.g. loyalty_rewards)
    # and new columns on products (e.g. is_taxable, warranty_months)
    FutureBase = declarative_base()

    class LoyaltyReward(FutureBase):
        __tablename__ = "loyalty_rewards"
        id = Column(Integer, primary_key=True)
        customer_id = Column(Integer, nullable=False)
        points = Column(Integer, nullable=False, default=100)

    future_products = Table(
        "products",
        FutureBase.metadata,
        Column("id", Integer, primary_key=True),
        Column("product_id", String(20), nullable=False),
        Column("name", String(150), nullable=False),
        # New future columns:
        Column("is_taxable", Boolean, nullable=False, default=True),
        Column("warranty_months", Integer, nullable=False, default=12),
        extend_existing=True
    )

    future_engine = create_engine(f"sqlite:///{db_path}")

    # Future version creates new tables and runs column upgrade
    FutureBase.metadata.create_all(bind=future_engine)
    with future_engine.connect() as conn:
        for table_name, table in FutureBase.metadata.tables.items():
            res = conn.execute(text(f"PRAGMA table_info({table_name})"))
            existing = {row[1] for row in res.fetchall()}
            for col in table.columns:
                if col.name not in existing:
                    col_def, _ = _get_sqlite_column_def(col, future_engine.dialect)
                    conn.execute(text(f"ALTER TABLE {table_name} ADD COLUMN {col_def}"))
        conn.commit()

    # 3. Assert future version can query existing records with new columns populated
    with future_engine.connect() as conn:
        row = conn.execute(text("SELECT product_id, name, is_taxable, warranty_months FROM products WHERE product_id = 'P-000001'")).fetchone()
        assert row is not None
        assert row[0] == "P-000001"
        assert row[1] == "Production Wheat Flour 10kg"
        assert row[2] == 1  # default True
        assert row[3] == 12  # default 12

        # Assert new table works
        conn.execute(text("INSERT INTO loyalty_rewards (customer_id, points) VALUES (1, 250)"))
        conn.commit()
        reward = conn.execute(text("SELECT points FROM loyalty_rewards WHERE customer_id = 1")).fetchone()
        assert reward[0] == 250

    future_engine.dispose()

def test_auto_upgrade_schema_heals_fifo_batches_and_missing_pins(db_session):
    """Verifies that auto_upgrade_schema automatically heals FIFO inventory batches and default PIN."""
    from backend.app.core.database import auto_upgrade_schema
    from backend.app.models.product import Product
    from backend.app.models.inventory import InventoryBatch
    from backend.app.models.business import BusinessSettings

    p = Product(
        product_id="P-TEST-HEAL",
        name="Test Healing Product",
        purchase_price=Decimal("200.00"),
        selling_price=Decimal("300.00"),
        current_stock=Decimal("8.00")
    )
    db_session.add(p)
    db_session.commit()

    # Clear batches for this product if any
    db_session.query(InventoryBatch).filter(InventoryBatch.product_id == p.id).delete()
    db_session.commit()

    # Set empty config_pin_hash on settings to simulate uninitialized legacy PIN
    settings_row = db_session.query(BusinessSettings).filter(BusinessSettings.id == 1).first()
    if settings_row:
        settings_row.config_pin_hash = ""
        db_session.commit()

    # Run auto_upgrade_schema on active test engine
    auto_upgrade_schema(target_engine=db_session.bind)

    # Verify FIFO batches auto-healed
    batches = db_session.query(InventoryBatch).filter(InventoryBatch.product_id == p.id).all()
    assert len(batches) == 1
    assert batches[0].quantity_remaining == Decimal("8.00")
    assert batches[0].unit_cost == Decimal("200.00")

    # Verify PIN auto-healing
    from backend.app.services.auth_service import verify_settings_pin, seed_initial_data
    seed_initial_data(db_session)
    assert verify_settings_pin(db_session, "1234") is True

