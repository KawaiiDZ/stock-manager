from sqlalchemy import create_engine, event, text
from sqlalchemy.orm import sessionmaker, declarative_base
from backend.app.core.config import settings

# SQLite configuration with foreign key enforcement
engine = create_engine(
    settings.DATABASE_URL,
    connect_args={"check_same_thread": False},
    echo=False
)

# Enforce foreign key constraints, WAL mode, and busy timeout on SQLite
@event.listens_for(engine, "connect")
def set_sqlite_pragma(dbapi_connection, connection_record):
    cursor = dbapi_connection.cursor()
    cursor.execute("PRAGMA foreign_keys=ON")
    cursor.execute("PRAGMA journal_mode=WAL")
    cursor.execute("PRAGMA busy_timeout=5000")
    cursor.close()

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

Base = declarative_base()

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

def auto_upgrade_schema():
    """Safely adds missing columns to existing SQLite tables without data loss."""
    with engine.connect() as conn:
        # Check business_settings table
        try:
            res = conn.execute(text("PRAGMA table_info(business_settings)"))
            cols = [row[1] for row in res.fetchall()]
            if cols:
                if "industry_preset" not in cols:
                    conn.execute(text("ALTER TABLE business_settings ADD COLUMN industry_preset VARCHAR(50) DEFAULT 'general'"))
                if "setup_completed" not in cols:
                    conn.execute(text("ALTER TABLE business_settings ADD COLUMN setup_completed BOOLEAN DEFAULT 0"))
                if "receipt_logo_path" not in cols:
                    conn.execute(text("ALTER TABLE business_settings ADD COLUMN receipt_logo_path TEXT NULL"))
                if "show_sku" not in cols:
                    conn.execute(text("ALTER TABLE business_settings ADD COLUMN show_sku BOOLEAN DEFAULT 1"))
                if "show_barcode" not in cols:
                    conn.execute(text("ALTER TABLE business_settings ADD COLUMN show_barcode BOOLEAN DEFAULT 1"))
                conn.commit()
        except Exception as e:
            print("Auto-upgrade error (business_settings):", e)

        # Check product_custom_fields table
        try:
            res = conn.execute(text("PRAGMA table_info(product_custom_fields)"))
            cols = [row[1] for row in res.fetchall()]
            if cols:
                if "category_id" not in cols:
                    conn.execute(text("ALTER TABLE product_custom_fields ADD COLUMN category_id INTEGER REFERENCES product_categories(id) NULL"))
                if "options" not in cols:
                    conn.execute(text("ALTER TABLE product_custom_fields ADD COLUMN options TEXT NULL"))
                if "show_in_table" not in cols:
                    conn.execute(text("ALTER TABLE product_custom_fields ADD COLUMN show_in_table BOOLEAN DEFAULT 1"))
                if "show_in_pos" not in cols:
                    conn.execute(text("ALTER TABLE product_custom_fields ADD COLUMN show_in_pos BOOLEAN DEFAULT 1"))
                if "show_in_receipt" not in cols:
                    conn.execute(text("ALTER TABLE product_custom_fields ADD COLUMN show_in_receipt BOOLEAN DEFAULT 0"))
                conn.commit()
        except Exception as e:
            print("Auto-upgrade error (product_custom_fields):", e)

        # Check sale_payments table
        try:
            res = conn.execute(text("PRAGMA table_info(sale_payments)"))
            cols = [row[1] for row in res.fetchall()]
            if cols and "customer_payment_id" not in cols:
                conn.execute(text("ALTER TABLE sale_payments ADD COLUMN customer_payment_id INTEGER REFERENCES customer_payments(id) NULL"))
                conn.commit()
        except Exception as e:
            print("Auto-upgrade error (sale_payments):", e)

        # Check purchase_payments table
        try:
            res = conn.execute(text("PRAGMA table_info(purchase_payments)"))
            cols = [row[1] for row in res.fetchall()]
            if cols and "supplier_payment_id" not in cols:
                conn.execute(text("ALTER TABLE purchase_payments ADD COLUMN supplier_payment_id INTEGER REFERENCES supplier_payments(id) NULL"))
                conn.commit()
        except Exception as e:
            print("Auto-upgrade error (purchase_payments):", e)

        # Check purchases table (ensure supplier_id allows NULL)
        try:
            res = conn.execute(text("PRAGMA table_info(purchases)"))
            cols = {r[1]: r for r in res.fetchall()}
            if cols and "supplier_id" in cols and cols["supplier_id"][3] == 1:
                conn.execute(text("PRAGMA foreign_keys=OFF"))
                conn.execute(text("""
                    CREATE TABLE purchases_temp (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        purchase_number VARCHAR(30) UNIQUE NOT NULL,
                        supplier_id INTEGER REFERENCES suppliers(id) NULL,
                        subtotal NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
                        discount_amount NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
                        tax_amount NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
                        total_amount NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
                        paid_amount NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
                        due_amount NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
                        payment_status VARCHAR(20) NOT NULL DEFAULT 'PAID',
                        notes TEXT NULL,
                        created_at DATETIME
                    )
                """))
                conn.execute(text("""
                    INSERT INTO purchases_temp (id, purchase_number, supplier_id, subtotal, discount_amount, tax_amount, total_amount, paid_amount, due_amount, payment_status, notes, created_at)
                    SELECT id, purchase_number, supplier_id, subtotal, discount_amount, tax_amount, total_amount, paid_amount, due_amount, payment_status, notes, created_at FROM purchases
                """))
                conn.execute(text("DROP TABLE purchases"))
                conn.execute(text("ALTER TABLE purchases_temp RENAME TO purchases"))
                conn.execute(text("CREATE INDEX IF NOT EXISTS ix_purchases_id ON purchases (id)"))
                conn.execute(text("CREATE INDEX IF NOT EXISTS ix_purchases_purchase_number ON purchases (purchase_number)"))
                conn.execute(text("CREATE INDEX IF NOT EXISTS ix_purchases_supplier_id ON purchases (supplier_id)"))
                conn.execute(text("CREATE INDEX IF NOT EXISTS ix_purchases_payment_status ON purchases (payment_status)"))
                conn.execute(text("CREATE INDEX IF NOT EXISTS ix_purchases_created_at ON purchases (created_at)"))
                conn.commit()
                conn.execute(text("PRAGMA foreign_keys=ON"))
        except Exception as e:
            print("Auto-upgrade error (purchases):", e)

        # Check purchase_items table (ensure selling_price column exists)
        try:
            res = conn.execute(text("PRAGMA table_info(purchase_items)"))
            cols = [row[1] for row in res.fetchall()]
            if cols and "selling_price" not in cols:
                conn.execute(text("ALTER TABLE purchase_items ADD COLUMN selling_price NUMERIC(12, 2) NULL"))
                conn.commit()
        except Exception as e:
            print("Auto-upgrade error (purchase_items):", e)

