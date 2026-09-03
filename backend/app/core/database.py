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
