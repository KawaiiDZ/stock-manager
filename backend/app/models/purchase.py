from datetime import datetime
from sqlalchemy import Column, Integer, String, Text, Numeric, DateTime, ForeignKey, CheckConstraint
from sqlalchemy.orm import relationship
from backend.app.core.database import Base

class Purchase(Base):
    __tablename__ = "purchases"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    purchase_number = Column(String(30), unique=True, nullable=False, index=True) # PO-000001
    supplier_id = Column(Integer, ForeignKey("suppliers.id"), nullable=False, index=True)
    subtotal = Column(Numeric(12, 2), nullable=False, default=0.00)
    discount_amount = Column(Numeric(12, 2), nullable=False, default=0.00)
    tax_amount = Column(Numeric(12, 2), nullable=False, default=0.00)
    total_amount = Column(Numeric(12, 2), nullable=False, default=0.00)
    paid_amount = Column(Numeric(12, 2), nullable=False, default=0.00)
    due_amount = Column(Numeric(12, 2), nullable=False, default=0.00)
    payment_status = Column(String(20), nullable=False, default="PAID", index=True) # PAID, PARTIALLY_PAID, UNPAID
    notes = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, index=True)

    supplier = relationship("Supplier", back_populates="purchases")
    items = relationship("PurchaseItem", back_populates="purchase", cascade="all, delete-orphan")
    payments = relationship("PurchasePayment", back_populates="purchase", cascade="all, delete-orphan")
    batches = relationship("InventoryBatch", back_populates="purchase")
    returns = relationship("PurchaseReturn", back_populates="purchase")

class PurchaseItem(Base):
    __tablename__ = "purchase_items"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    purchase_id = Column(Integer, ForeignKey("purchases.id", ondelete="CASCADE"), nullable=False, index=True)
    product_id = Column(Integer, ForeignKey("products.id"), nullable=False, index=True)
    quantity = Column(Numeric(12, 2), nullable=False)
    unit_cost = Column(Numeric(12, 2), nullable=False)
    total_cost = Column(Numeric(12, 2), nullable=False)

    __table_args__ = (
        CheckConstraint('quantity > 0', name='check_purchase_item_quantity_positive'),
        CheckConstraint('unit_cost >= 0', name='check_purchase_item_cost_non_negative'),
    )

    purchase = relationship("Purchase", back_populates="items")
    product = relationship("Product")

class PurchasePayment(Base):
    __tablename__ = "purchase_payments"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    purchase_id = Column(Integer, ForeignKey("purchases.id", ondelete="CASCADE"), nullable=False, index=True)
    amount = Column(Numeric(12, 2), nullable=False)
    payment_method = Column(String(30), nullable=False, default="Cash")
    created_at = Column(DateTime, default=datetime.utcnow)

    __table_args__ = (
        CheckConstraint('amount > 0', name='check_purchase_payment_amount_positive'),
    )

    purchase = relationship("Purchase", back_populates="payments")

class PurchaseReturn(Base):
    __tablename__ = "purchase_returns"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    return_number = Column(String(30), unique=True, nullable=False, index=True) # PRET-000001
    purchase_id = Column(Integer, ForeignKey("purchases.id"), nullable=True, index=True)
    supplier_id = Column(Integer, ForeignKey("suppliers.id"), nullable=False, index=True)
    total_return_amount = Column(Numeric(12, 2), nullable=False)
    reason = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, index=True)

    purchase = relationship("Purchase", back_populates="returns")
    supplier = relationship("Supplier", back_populates="returns")
    items = relationship("PurchaseReturnItem", back_populates="purchase_return", cascade="all, delete-orphan")

class PurchaseReturnItem(Base):
    __tablename__ = "purchase_return_items"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    purchase_return_id = Column(Integer, ForeignKey("purchase_returns.id", ondelete="CASCADE"), nullable=False, index=True)
    product_id = Column(Integer, ForeignKey("products.id"), nullable=False, index=True)
    quantity = Column(Numeric(12, 2), nullable=False)
    unit_cost = Column(Numeric(12, 2), nullable=False)
    total_amount = Column(Numeric(12, 2), nullable=False)

    __table_args__ = (
        CheckConstraint('quantity > 0', name='check_purchase_return_quantity_positive'),
        CheckConstraint('unit_cost >= 0', name='check_purchase_return_cost_non_negative'),
    )

    purchase_return = relationship("PurchaseReturn", back_populates="items")
    product = relationship("Product")
