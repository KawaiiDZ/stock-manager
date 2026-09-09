from datetime import datetime
from decimal import Decimal
from sqlalchemy import Column, Integer, String, Text, Numeric, DateTime, ForeignKey, CheckConstraint
from sqlalchemy.orm import relationship
from backend.app.core.database import Base

class Quotation(Base):
    __tablename__ = "quotations"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    quotation_number = Column(String(30), unique=True, nullable=False, index=True) # Q-000001
    customer_id = Column(Integer, ForeignKey("customers.id"), nullable=True, index=True)
    customer_name = Column(String(150), nullable=False)
    customer_phone = Column(String(50), nullable=False)
    customer_address = Column(Text, nullable=True)

    subtotal = Column(Numeric(12, 2), nullable=False, default=0.00)
    discount_amount = Column(Numeric(12, 2), nullable=False, default=0.00)
    tax_rate = Column(Numeric(5, 2), nullable=False, default=0.00)
    tax_amount = Column(Numeric(12, 2), nullable=False, default=0.00)
    total_amount = Column(Numeric(12, 2), nullable=False, default=0.00)

    # Status: PENDING (active offer), APPROVED (converted to invoice), REJECTED (disapproved), EXPIRED
    status = Column(String(20), nullable=False, default="PENDING", index=True)
    sale_id = Column(Integer, ForeignKey("sales.id"), nullable=True, index=True)
    converted_at = Column(DateTime, nullable=True)
    rejection_reason = Column(Text, nullable=True)
    valid_until = Column(DateTime, nullable=True)
    notes = Column(Text, nullable=True)

    created_at = Column(DateTime, default=datetime.utcnow, index=True)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    __table_args__ = (
        CheckConstraint('subtotal >= 0', name='check_quotation_subtotal_non_negative'),
        CheckConstraint('discount_amount >= 0', name='check_quotation_discount_non_negative'),
        CheckConstraint('tax_rate >= 0', name='check_quotation_tax_rate_non_negative'),
        CheckConstraint('tax_amount >= 0', name='check_quotation_tax_amount_non_negative'),
        CheckConstraint('total_amount >= 0', name='check_quotation_total_non_negative'),
    )

    customer = relationship("Customer")
    sale = relationship("Sale")
    items = relationship("QuotationItem", back_populates="quotation", cascade="all, delete-orphan")

class QuotationItem(Base):
    __tablename__ = "quotation_items"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    quotation_id = Column(Integer, ForeignKey("quotations.id", ondelete="CASCADE"), nullable=False, index=True)
    product_id = Column(Integer, ForeignKey("products.id"), nullable=False, index=True)
    product_name = Column(String(150), nullable=False)
    quantity = Column(Numeric(12, 2), nullable=False, default=1.00)
    unit_price = Column(Numeric(12, 2), nullable=False, default=0.00)
    discount_amount = Column(Numeric(12, 2), nullable=False, default=0.00)
    total_price = Column(Numeric(12, 2), nullable=False, default=0.00)
    notes = Column(Text, nullable=True)

    __table_args__ = (
        CheckConstraint('quantity > 0', name='check_quotation_item_qty_positive'),
        CheckConstraint('unit_price >= 0', name='check_quotation_item_unit_price_non_negative'),
        CheckConstraint('discount_amount >= 0', name='check_quotation_item_discount_non_negative'),
        CheckConstraint('total_price >= 0', name='check_quotation_item_total_non_negative'),
    )

    quotation = relationship("Quotation", back_populates="items")
    product = relationship("Product")
