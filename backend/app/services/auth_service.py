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
            industry_preset="general",
            date_format="YYYY-MM-DD",
            format_prices_with_commas=True,
            receipt_type="thermal",
            show_letterhead=False,
            hide_header_text_with_letterhead=False,
            invoice_title="TAX INVOICE",
            enable_quotations=True,
            invoice_terms="1. Goods once sold will be accepted for return within 7 days in original condition.\n2. Warranty claims require presenting this invoice.\n3. Thank you for your business!",
            quotation_terms="1. This quotation is an estimate and valid for 15 days from issue date.\n2. Stock is subject to physical availability upon confirmation.\n3. This document does not constitute a tax invoice until approved.",
            enable_barcode_scanner=True,
            enable_barcode_printer=True,
            barcode_label_size="50x25mm",
            barcode_label_show_business_name=True,
            barcode_label_show_product_name=True,
            barcode_label_show_price=True,
            barcode_label_show_sku=True,
            barcode_label_custom_text="",
            config_pin_hash=hash_password("1234")  # Default PIN 1234
        )
        db.add(default_settings)
    else:
        if not settings.config_pin_hash:
            settings.config_pin_hash = hash_password("1234")
        if not settings.industry_preset:
            settings.industry_preset = "general"
        if not getattr(settings, "date_format", None):
            settings.date_format = "YYYY-MM-DD"
        if getattr(settings, "format_prices_with_commas", None) is None:
            settings.format_prices_with_commas = True
        if not getattr(settings, "receipt_type", None):
            settings.receipt_type = "thermal"
        if not getattr(settings, "invoice_title", None):
            settings.invoice_title = "TAX INVOICE"
        if getattr(settings, "enable_quotations", None) is None:
            settings.enable_quotations = True
        if not getattr(settings, "invoice_terms", None):
            settings.invoice_terms = "1. Goods once sold will be accepted for return within 7 days in original condition.\n2. Warranty claims require presenting this invoice.\n3. Thank you for your business!"
        if not getattr(settings, "quotation_terms", None):
            settings.quotation_terms = "1. This quotation is an estimate and valid for 15 days from issue date.\n2. Stock is subject to physical availability upon confirmation.\n3. This document does not constitute a tax invoice until approved."
        if getattr(settings, "enable_barcode_scanner", None) is None:
            settings.enable_barcode_scanner = True
        if getattr(settings, "enable_barcode_printer", None) is None:
            settings.enable_barcode_printer = True
        if not getattr(settings, "barcode_label_size", None):
            settings.barcode_label_size = "50x25mm"
        if getattr(settings, "barcode_label_show_business_name", None) is None:
            settings.barcode_label_show_business_name = True
        if getattr(settings, "barcode_label_show_product_name", None) is None:
            settings.barcode_label_show_product_name = True
        if getattr(settings, "barcode_label_show_price", None) is None:
            settings.barcode_label_show_price = True
        if getattr(settings, "barcode_label_show_sku", None) is None:
            settings.barcode_label_show_sku = True
        if getattr(settings, "barcode_label_custom_text", None) is None:
            settings.barcode_label_custom_text = ""

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
    clean_pin = str(pin or "").strip()
    settings = db.query(BusinessSettings).filter(BusinessSettings.id == 1).first() or db.query(BusinessSettings).first()
    if not settings or not settings.config_pin_hash:
        return clean_pin == "1234"
    return verify_password(settings.config_pin_hash, clean_pin)

def change_user_password(db: Session, user_id: int, current_pass: str, new_pass: str) -> bool:
    clean_pass = (new_pass or "").strip()
    if len(clean_pass) < 4:
        raise BusinessRuleException("New password must be at least 4 characters long.")
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        user = db.query(User).filter(User.username == "admin").first() or db.query(User).first()
    if not user or not verify_password(user.password_hash, current_pass):
        raise BusinessRuleException("Current password does not match.")
    user.password_hash = hash_password(clean_pass)
    db.commit()
    return True

def change_settings_pin(db: Session, current_pin: str, new_pin: str) -> bool:
    clean_current = str(current_pin or "").strip()
    clean_pin = str(new_pin or "").strip()
    if len(clean_pin) < 4 or not clean_pin.isdigit():
        raise BusinessRuleException("New PIN must be at least 4 numeric digits.")

    settings = db.query(BusinessSettings).filter(BusinessSettings.id == 1).first() or db.query(BusinessSettings).first()
    if not settings:
        raise BusinessRuleException("Settings not found.")
    if not verify_password(settings.config_pin_hash, clean_current):
        raise BusinessRuleException("Current PIN is incorrect.")
    settings.config_pin_hash = hash_password(clean_pin)
    db.commit()
    return True

