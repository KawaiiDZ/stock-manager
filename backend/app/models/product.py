from datetime import datetime
from sqlalchemy import Column, Integer, String, Text, Boolean, Numeric, DateTime, ForeignKey, CheckConstraint
from sqlalchemy.orm import relationship
from backend.app.core.database import Base

class ProductCategory(Base):
    __tablename__ = "product_categories"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    name = Column(String(100), unique=True, nullable=False, index=True)
    is_active = Column(Boolean, nullable=False, default=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    products = relationship("Product", back_populates="category")

class Product(Base):
    __tablename__ = "products"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    product_id = Column(String(20), unique=True, nullable=False, index=True) # P-000001
    name = Column(String(150), nullable=False, index=True)
    sku = Column(String(50), nullable=True, index=True)
    barcode = Column(String(100), nullable=True, unique=True, index=True)
    category_id = Column(Integer, ForeignKey("product_categories.id"), nullable=True, index=True)
    purchase_price = Column(Numeric(12, 2), nullable=False, default=0.00)
    selling_price = Column(Numeric(12, 2), nullable=False, default=0.00)
    current_stock = Column(Numeric(12, 2), nullable=False, default=0.00)
    is_active = Column(Boolean, nullable=False, default=True, index=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    __table_args__ = (
        CheckConstraint('purchase_price >= 0', name='check_product_purchase_price_non_negative'),
        CheckConstraint('selling_price >= 0', name='check_product_selling_price_non_negative'),
        CheckConstraint('current_stock >= 0', name='check_product_current_stock_non_negative'),
    )

    category = relationship("ProductCategory", back_populates="products")
    custom_values = relationship("ProductCustomValue", back_populates="product", cascade="all, delete-orphan")
    batches = relationship("InventoryBatch", back_populates="product")
    movements = relationship("InventoryMovement", back_populates="product")

class ProductCustomField(Base):
    __tablename__ = "product_custom_fields"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    name = Column(String(50), nullable=False)  # e.g., Brand, Size, IMEI, Expiry Date
    field_type = Column(String(20), nullable=False, default="text")  # text, select, number, date, boolean
    options = Column(Text, nullable=True)  # Comma-separated list for select/dropdown (e.g. S, M, L, XL)
    is_required = Column(Boolean, nullable=False, default=False)
    show_in_table = Column(Boolean, nullable=False, default=True)
    show_in_pos = Column(Boolean, nullable=False, default=True)
    show_in_receipt = Column(Boolean, nullable=False, default=False)
    display_order = Column(Integer, nullable=False, default=0)
    is_active = Column(Boolean, nullable=False, default=True)

class ProductCustomValue(Base):
    __tablename__ = "product_custom_values"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    product_id = Column(Integer, ForeignKey("products.id", ondelete="CASCADE"), nullable=False, index=True)
    field_id = Column(Integer, ForeignKey("product_custom_fields.id", ondelete="CASCADE"), nullable=False, index=True)
    value = Column(Text, nullable=False)

    product = relationship("Product", back_populates="custom_values")
    custom_field = relationship("ProductCustomField")
