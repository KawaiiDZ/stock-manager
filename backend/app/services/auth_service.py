from sqlalchemy.orm import Session
from backend.app.core.security import hash_password, verify_password
from backend.app.core.errors import BusinessRuleException
from backend.app.models.user import User
from backend.app.models.business import BusinessSettings
from backend.app.models.customer import Customer
from backend.app.services.id_generator import generate_customer_id

def seed_initial_data(db: Session):
    """Seed default admin user, business settings, and Walk-in Customer if not present."""
    # 1. Admin User
    user = db.query(User).filter(User.username == "admin").first()
    if not user:
        admin_user = User(
            username="admin",
            password_hash=hash_password("admin123"),
            full_name="Business Owner"
        )
        db.add(admin_user)

    # 2. Business Settings
    settings = db.query(BusinessSettings).filter(BusinessSettings.id == 1).first()
    if not settings:
        default_settings = BusinessSettings(
            id=1,
            business_name="My Business",
            phone="0300-1234567",
            address="Main Market, Shop #1",
            currency="Rs.",
            tax_enabled=False,
            default_tax_rate=0.00,
            receipt_header="Welcome to My Business",
            receipt_footer="Thank you for shopping with us!",
            receipt_printer_type="80mm",
            config_pin_hash=hash_password("1234")  # Default PIN 1234
        )
        db.add(default_settings)

    # 3. Default Walk-in Customer
    walk_in = db.query(Customer).filter(Customer.customer_id == "C-000001").first()
    if not walk_in:
        default_customer = Customer(
            customer_id="C-000001",
            name="Walk-in Customer",
            phone=None,
            address="Counter Sale",
            is_active=True
        )
        db.add(default_customer)

    db.commit()

def authenticate_user(db: Session, username: str, password: str) -> User:
    user = db.query(User).filter(User.username == username).first()
    if not user or not verify_password(user.password_hash, password):
        raise BusinessRuleException("Invalid username or password. Please try again.")
    return user

def verify_settings_pin(db: Session, pin: str) -> bool:
    settings = db.query(BusinessSettings).filter(BusinessSettings.id == 1).first()
    if not settings:
        return pin == "1234"
    return verify_password(settings.config_pin_hash, pin)

def change_user_password(db: Session, user_id: int, current_pass: str, new_pass: str) -> bool:
    user = db.query(User).filter(User.id == user_id).first()
    if not user or not verify_password(user.password_hash, current_pass):
        raise BusinessRuleException("Current password does not match.")
    user.password_hash = hash_password(new_pass)
    db.commit()
    return True

def change_settings_pin(db: Session, current_pin: str, new_pin: str) -> bool:
    clean_pin = (new_pin or "").strip()
    if len(clean_pin) < 4 or not clean_pin.isdigit():
        raise BusinessRuleException("New PIN must be at least 4 numeric digits.")

    settings = db.query(BusinessSettings).filter(BusinessSettings.id == 1).first()
    if not settings:
        raise BusinessRuleException("Settings not found.")
    if not verify_password(settings.config_pin_hash, current_pin):
        raise BusinessRuleException("Current PIN is incorrect.")
    settings.config_pin_hash = hash_password(clean_pin)
    db.commit()
    return True

