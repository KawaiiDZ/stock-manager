from datetime import datetime
from sqlalchemy import Column, Integer, String, Text, Boolean, Numeric, DateTime
from backend.app.core.database import Base

class BusinessSettings(Base):
    __tablename__ = "business_settings"

    id = Column(Integer, primary_key=True, index=True)
    business_name = Column(String(150), nullable=False, default="My Shop")
    phone = Column(String(50), nullable=False, default="")
    address = Column(Text, nullable=False, default="")
    logo_path = Column(String(255), nullable=True)
    currency = Column(String(20), nullable=False, default="Rs.")
    tax_enabled = Column(Boolean, nullable=False, default=False)
    default_tax_rate = Column(Numeric(5, 2), nullable=False, default=0.00)
    receipt_header = Column(Text, nullable=False, default="")
    receipt_footer = Column(Text, nullable=False, default="Thank you for your business!")
    receipt_printer_type = Column(String(20), nullable=False, default="80mm")  # 58mm, 80mm, standard
    industry_preset = Column(String(50), nullable=True, default="general")  # mobile, clothing, pharmacy, grocery, autoparts, general, custom
    setup_completed = Column(Boolean, nullable=False, default=False)
    config_pin_hash = Column(String(255), nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
