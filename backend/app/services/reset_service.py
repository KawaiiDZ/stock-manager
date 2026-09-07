from sqlalchemy.orm import Session
from fastapi import HTTPException
from sqlalchemy import text

from backend.app.models.sales import Sale, SaleItem, SaleItemBatch, SalePayment, SalesReturn, SalesReturnItem
from backend.app.models.purchase import Purchase, PurchaseItem, PurchasePayment, PurchaseReturn, PurchaseReturnItem
from backend.app.models.inventory import InventoryBatch, InventoryMovement
from backend.app.models.product import Product, ProductCustomValue
from backend.app.models.customer import Customer, CustomerPayment
from backend.app.models.supplier import Supplier, SupplierPayment
from backend.app.models.bills import Bill, BillPayment
from backend.app.models.expenses import Expense
from backend.app.services.auth_service import verify_settings_pin

def reset_database_data(db: Session, confirm_pin: str, wipe_mode: str = "inventory_only") -> dict:
    """
    Safely resets inventory, transactions, and data.
    Requires verifying the configuration PIN (default: 1234 or configured admin PIN).
    """
    # 1. Verify PIN
    if not verify_settings_pin(db, str(confirm_pin).strip()):
        raise HTTPException(status_code=400, detail="Incorrect Configuration PIN. Reset aborted.")

    try:
        # Temporarily disable foreign key constraints for safe bulk wipe
        db.execute(text("PRAGMA foreign_keys = OFF;"))

        # 2. Delete in strict foreign-key dependency order
        # Sales item batches and return items first
        db.query(SaleItemBatch).delete(synchronize_session=False)
        db.query(SalesReturnItem).delete(synchronize_session=False)
        db.query(SalesReturn).delete(synchronize_session=False)
        db.query(SalePayment).delete(synchronize_session=False)
        db.query(SaleItem).delete(synchronize_session=False)
        db.query(Sale).delete(synchronize_session=False)

        # Purchases and Inventory
        db.query(PurchaseReturnItem).delete(synchronize_session=False)
        db.query(PurchaseReturn).delete(synchronize_session=False)
        db.query(PurchasePayment).delete(synchronize_session=False)
        db.query(PurchaseItem).delete(synchronize_session=False)
        db.query(InventoryMovement).delete(synchronize_session=False)
        db.query(InventoryBatch).delete(synchronize_session=False)
        db.query(Purchase).delete(synchronize_session=False)

        # Products and custom values
        db.query(ProductCustomValue).delete(synchronize_session=False)
        deleted_products_count = db.query(Product).delete(synchronize_session=False)

        # Customer & Supplier ledger transactions
        db.query(CustomerPayment).delete(synchronize_session=False)
        db.query(SupplierPayment).delete(synchronize_session=False)

        if wipe_mode == "all_data":
            # Bills & Expenses
            db.query(BillPayment).delete(synchronize_session=False)
            db.query(Bill).delete(synchronize_session=False)
            db.query(Expense).delete(synchronize_session=False)

            # Customers and Suppliers
            db.query(Customer).delete(synchronize_session=False)
            db.query(Supplier).delete(synchronize_session=False)

            # Re-seed default Walk-in Customer (C-000001)
            walk_in = Customer(
                customer_id="C-000001",
                name="Walk-in Customer",
                phone=None,
                address="Counter Sale",
                is_active=True
            )
            db.add(walk_in)

        db.commit()

        message = (
            f"Successfully wiped inventory and all sales/purchase transactions ({deleted_products_count} products removed). "
            "You can now add fresh test products."
            if wipe_mode == "inventory_only"
            else "Factory reset completed successfully. All inventory, sales, purchases, bills, and contacts have been cleared."
        )

        return {
            "success": True,
            "wipe_mode": wipe_mode,
            "deleted_products_count": deleted_products_count,
            "message": message,
        }

    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Database reset failed: {str(e)}")
    finally:
        db.execute(text("PRAGMA foreign_keys = ON;"))
