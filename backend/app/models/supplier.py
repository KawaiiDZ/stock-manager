from datetime import datetime
from sqlalchemy import Column, Integer, String, Text, Boolean, Numeric, DateTime, ForeignKey, CheckConstraint
from sqlalchemy.orm import relationship
from backend.app.core.database import Base

class Supplier(Base):
    __tablename__ = "suppliers"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    supplier_id = Column(String(20), unique=True, nullable=False, index=True) # S-000001
    name = Column(String(100), nullable=False, index=True)
    phone = Column(String(50), nullable=True, index=True)
    address = Column(Text, nullable=True)
    is_active = Column(Boolean, nullable=False, default=True, index=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    purchases = relationship("Purchase", back_populates="supplier")
    payments = relationship("SupplierPayment", back_populates="supplier")
    returns = relationship("PurchaseReturn", back_populates="supplier")

class SupplierPayment(Base):
    __tablename__ = "supplier_payments"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    payment_number = Column(String(30), unique=True, nullable=False, index=True) # SP-000001
    supplier_id = Column(Integer, ForeignKey("suppliers.id"), nullable=False, index=True)
    amount = Column(Numeric(12, 2), nullable=False)
    payment_method = Column(String(30), nullable=False, default="Cash")
    notes = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, index=True)

    __table_args__ = (
        CheckConstraint('amount > 0', name='check_supplier_payment_amount_positive'),
    )

    supplier = relationship("Supplier", back_populates="payments")
