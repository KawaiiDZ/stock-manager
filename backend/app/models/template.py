from datetime import datetime
from sqlalchemy import Column, Integer, String, Text, Numeric, DateTime, ForeignKey, Boolean
from sqlalchemy.orm import relationship
from backend.app.core.database import Base

class BillTemplate(Base):
    __tablename__ = "bill_templates"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    name = Column(String(150), nullable=False, unique=True, index=True)
    description = Column(Text, nullable=True)
    is_active = Column(Boolean, nullable=False, default=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    items = relationship(
        "BillTemplateItem",
        back_populates="template",
        cascade="all, delete-orphan",
        order_by="BillTemplateItem.display_order"
    )

class BillTemplateItem(Base):
    __tablename__ = "bill_template_items"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    template_id = Column(Integer, ForeignKey("bill_templates.id", ondelete="CASCADE"), nullable=False, index=True)
    display_order = Column(Integer, nullable=False, default=1)
    slot_name = Column(String(100), nullable=False)  # e.g. "Solar Panels", "Solar Inverter", "Battery"
    category_id = Column(Integer, ForeignKey("product_categories.id", ondelete="SET NULL"), nullable=True, index=True)
    category_name = Column(String(100), nullable=True)  # Persisted category name
    default_product_id = Column(Integer, ForeignKey("products.id", ondelete="SET NULL"), nullable=True)
    default_quantity = Column(Numeric(12, 2), nullable=False, default=1.00)
    default_unit_price = Column(Numeric(12, 2), nullable=True)
    default_description = Column(Text, nullable=True)
    is_optional = Column(Boolean, nullable=False, default=True)

    template = relationship("BillTemplate", back_populates="items")
    category = relationship("ProductCategory")
    default_product = relationship("Product")
