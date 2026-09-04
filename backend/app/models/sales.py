from datetime import datetime
from sqlalchemy import Column, Integer, String, Text, Numeric, DateTime, ForeignKey, CheckConstraint
from sqlalchemy.orm import relationship
from backend.app.core.database import Base

class Sale(Base):
    __tablename__ = "sales"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    receipt_number = Column(String(30), unique=True, nullable=False, index=True) # R-000001
    customer_id = Column(Integer, ForeignKey("customers.id"), nullable=False, index=True)
    subtotal = Column(Numeric(12, 2), nullable=False, default=0.00)
    discount_amount = Column(Numeric(12, 2), nullable=False, default=0.00)
    tax_rate = Column(Numeric(5, 2), nullable=False, default=0.00)
    tax_amount = Column(Numeric(12, 2), nullable=False, default=0.00)
    total_amount = Column(Numeric(12, 2), nullable=False, default=0.00)
    paid_amount = Column(Numeric(12, 2), nullable=False, default=0.00)
    due_amount = Column(Numeric(12, 2), nullable=False, default=0.00)
    payment_status = Column(String(20), nullable=False, default="PAID", index=True) # PAID, PARTIALLY_PAID, UNPAID
    total_cost = Column(Numeric(12, 2), nullable=False, default=0.00)
    gross_profit = Column(Numeric(12, 2), nullable=False, default=0.00)
    notes = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, index=True)

    customer = relationship("Customer", back_populates="sales")
    items = relationship("SaleItem", back_populates="sale", cascade="all, delete-orphan")
    payments = relationship("SalePayment", back_populates="sale", cascade="all, delete-orphan")
    returns = relationship("SalesReturn", back_populates="sale")

class SaleItem(Base):
    __tablename__ = "sale_items"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    sale_id = Column(Integer, ForeignKey("sales.id", ondelete="CASCADE"), nullable=False, index=True)
    product_id = Column(Integer, ForeignKey("products.id"), nullable=False, index=True)
    product_name = Column(String(150), nullable=False)
    quantity = Column(Numeric(12, 2), nullable=False)
    unit_price = Column(Numeric(12, 2), nullable=False)
    discount_amount = Column(Numeric(12, 2), nullable=False, default=0.00)
    total_price = Column(Numeric(12, 2), nullable=False)
    unit_cost = Column(Numeric(12, 2), nullable=False, default=0.00)
    total_cost = Column(Numeric(12, 2), nullable=False, default=0.00)
    gross_profit = Column(Numeric(12, 2), nullable=False, default=0.00)

    __table_args__ = (
        CheckConstraint('quantity > 0', name='check_sale_item_quantity_positive'),
        CheckConstraint('unit_price >= 0', name='check_sale_item_price_non_negative'),
    )

    sale = relationship("Sale", back_populates="items")
    product = relationship("Product")
    batch_links = relationship("SaleItemBatch", back_populates="sale_item", cascade="all, delete-orphan")

class SaleItemBatch(Base):
    __tablename__ = "sale_item_batches"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    sale_item_id = Column(Integer, ForeignKey("sale_items.id", ondelete="CASCADE"), nullable=False, index=True)
    inventory_batch_id = Column(Integer, ForeignKey("inventory_batches.id"), nullable=False, index=True)
    quantity = Column(Numeric(12, 2), nullable=False)
    unit_cost = Column(Numeric(12, 2), nullable=False)

    __table_args__ = (
        CheckConstraint('quantity > 0', name='check_sale_batch_quantity_positive'),
    )

    sale_item = relationship("SaleItem", back_populates="batch_links")
    batch = relationship("InventoryBatch", back_populates="sale_item_batches")

class SalePayment(Base):
    __tablename__ = "sale_payments"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    sale_id = Column(Integer, ForeignKey("sales.id", ondelete="CASCADE"), nullable=False, index=True)
    amount = Column(Numeric(12, 2), nullable=False)
    payment_method = Column(String(30), nullable=False, default="Cash")
    customer_payment_id = Column(Integer, ForeignKey("customer_payments.id", ondelete="SET NULL"), nullable=True, index=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    __table_args__ = (
        CheckConstraint('amount > 0', name='check_sale_payment_amount_positive'),
    )

    sale = relationship("Sale", back_populates="payments")
    customer_payment = relationship("CustomerPayment")

class SalesReturn(Base):
    __tablename__ = "sales_returns"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    return_number = Column(String(30), unique=True, nullable=False, index=True) # RET-000001
    sale_id = Column(Integer, ForeignKey("sales.id"), nullable=True, index=True)
    customer_id = Column(Integer, ForeignKey("customers.id"), nullable=False, index=True)
    total_return_amount = Column(Numeric(12, 2), nullable=False)
    cash_refund_amount = Column(Numeric(12, 2), nullable=False, default=0.00)
    balance_credit_amount = Column(Numeric(12, 2), nullable=False, default=0.00)
    reason = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, index=True)

    sale = relationship("Sale", back_populates="returns")
    customer = relationship("Customer", back_populates="returns")
    items = relationship("SalesReturnItem", back_populates="sales_return", cascade="all, delete-orphan")

class SalesReturnItem(Base):
    __tablename__ = "sales_return_items"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    sales_return_id = Column(Integer, ForeignKey("sales_returns.id", ondelete="CASCADE"), nullable=False, index=True)
    product_id = Column(Integer, ForeignKey("products.id"), nullable=False, index=True)
    quantity = Column(Numeric(12, 2), nullable=False)
    unit_price = Column(Numeric(12, 2), nullable=False)
    total_amount = Column(Numeric(12, 2), nullable=False)

    __table_args__ = (
        CheckConstraint('quantity > 0', name='check_sales_return_quantity_positive'),
    )

    sales_return = relationship("SalesReturn", back_populates="items")
    product = relationship("Product")
