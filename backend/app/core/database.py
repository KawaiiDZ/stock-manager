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

def _get_sqlite_column_def(col, dialect):
    """Generate SQLite-safe column definition with constant defaults for ADD COLUMN."""
    from decimal import Decimal
    from sqlalchemy import Boolean, Integer, Numeric, Float, String, Text as SAText, DateTime, Date
    col_type = col.type.compile(dialect=dialect)
    default_clause = ""
    is_datetime = isinstance(col.type, (DateTime, Date))

    if col.server_default is not None:
        raw_arg = str(col.server_default.arg)
        if any(kw in raw_arg.upper() for kw in ["CURRENT_TIMESTAMP", "CURRENT_DATE", "CURRENT_TIME", "NOW()"]):
            is_datetime = True
        else:
            default_clause = f" DEFAULT {raw_arg}"
    elif col.default is not None and not callable(col.default.arg):
        val = col.default.arg
        if isinstance(val, bool):
            default_clause = f" DEFAULT {1 if val else 0}"
        elif isinstance(val, (int, float, Decimal)):
            default_clause = f" DEFAULT {val}"
        elif isinstance(val, str):
            escaped = val.replace("'", "''")
            default_clause = f" DEFAULT '{escaped}'"
    elif not col.nullable:
        if isinstance(col.type, Boolean):
            default_clause = " DEFAULT 0"
        elif isinstance(col.type, Integer):
            default_clause = " DEFAULT 0"
        elif isinstance(col.type, (Numeric, Float)):
            default_clause = " DEFAULT 0.00"
        elif isinstance(col.type, (String, SAText)):
            default_clause = " DEFAULT ''"
        elif is_datetime:
            default_clause = ""

    if not col.nullable and default_clause and not is_datetime:
        constraint = f"{default_clause} NOT NULL"
    elif default_clause:
        constraint = default_clause
    else:
        constraint = " NULL"

    return f"{col.name} {col_type}{constraint}", is_datetime

def auto_upgrade_schema(target_engine=None):
    """Safely and dynamically upgrades SQLite database schema without data loss.
    Ensures that databases from earlier releases or restored from backups are 100% compatible
    with the current application version and any future extensions.
    """
    from decimal import Decimal
    import backend.app.models  # Ensure all models are registered on Base.metadata
    active_engine = target_engine or engine

    # 1. Create any tables introduced in newer versions that don't exist yet
    Base.metadata.create_all(bind=active_engine)
    dialect = active_engine.dialect

    with active_engine.connect() as conn:
        # 2. Dynamically detect and add any missing columns across all registered models
        for table_name, table in Base.metadata.tables.items():
            try:
                res = conn.execute(text(f"PRAGMA table_info({table_name})"))
                existing_cols = {row[1] for row in res.fetchall()}
                if not existing_cols:
                    continue
                for col in table.columns:
                    if col.name not in existing_cols:
                        col_def, is_dt = _get_sqlite_column_def(col, dialect)
                        conn.execute(text(f"ALTER TABLE {table_name} ADD COLUMN {col_def}"))
                        if is_dt:
                            conn.execute(text(f"UPDATE {table_name} SET {col.name} = datetime('now') WHERE {col.name} IS NULL"))
                conn.commit()
            except Exception as e:
                print(f"Auto-upgrade error on table {table_name}:", e)

        # 3. Check purchases table (ensure supplier_id allows NULL for supplier-less purchases)
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
            print("Auto-upgrade error (purchases constraint rebuild):", e)

        # 4. Auto-heal missing entity identifiers and active flags in legacy tables
        try:
            conn.execute(text("UPDATE products SET product_id = 'P-' || printf('%06d', id) WHERE product_id IS NULL OR product_id = ''"))
            conn.execute(text("UPDATE products SET is_active = 1 WHERE is_active IS NULL"))
            conn.execute(text("UPDATE customers SET customer_id = 'C-' || printf('%06d', id) WHERE customer_id IS NULL OR customer_id = ''"))
            conn.execute(text("UPDATE customers SET is_active = 1 WHERE is_active IS NULL"))
            conn.execute(text("UPDATE suppliers SET supplier_id = 'S-' || printf('%06d', id) WHERE supplier_id IS NULL OR supplier_id = ''"))
            conn.execute(text("UPDATE suppliers SET is_active = 1 WHERE is_active IS NULL"))
            conn.execute(text("UPDATE business_settings SET industry_preset = 'general' WHERE industry_preset IS NULL OR industry_preset = ''"))
            conn.commit()
        except Exception as e:
            print("Auto-upgrade error (identifier auto-healing):", e)

        # 5. FIFO Batch Auto-Healing:
        # If any product has current_stock > total_batch_remaining, create opening batches so POS checkout never fails
        try:
            res = conn.execute(text("""
                SELECT p.id, p.current_stock, p.purchase_price, COALESCE(SUM(b.quantity_remaining), 0) as total_batches
                FROM products p
                LEFT JOIN inventory_batches b ON b.product_id = p.id
                WHERE p.current_stock > 0
                GROUP BY p.id
                HAVING p.current_stock > COALESCE(SUM(b.quantity_remaining), 0)
            """))
            deficits = res.fetchall()
            for row in deficits:
                p_id = row[0]
                cur_stock = Decimal(str(row[1]))
                cost = Decimal(str(row[2] or 0.00))
                tot_batch = Decimal(str(row[3]))
                deficit = cur_stock - tot_batch
                if deficit > Decimal("0.00"):
                    conn.execute(text("""
                        INSERT INTO inventory_batches (product_id, purchase_id, quantity_received, quantity_remaining, unit_cost, created_at)
                        VALUES (:pid, NULL, :qty, :qty, :cost, datetime('now'))
                    """), {'pid': p_id, 'qty': float(deficit), 'cost': float(cost)})
                    conn.execute(text("""
                        INSERT INTO inventory_movements (product_id, movement_type, quantity, unit_cost, reference_type, reference_id, notes, created_at)
                        VALUES (:pid, 'OPENING_STOCK', :qty, :cost, 'OPENING', 'MIGRATION-SYNC', 'Auto-healed opening inventory batch', datetime('now'))
                    """), {'pid': p_id, 'qty': float(deficit), 'cost': float(cost)})
            conn.commit()
        except Exception as e:
            print("Auto-upgrade error (FIFO batch auto-healing):", e)


