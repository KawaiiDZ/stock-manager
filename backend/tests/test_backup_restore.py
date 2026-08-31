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
