from datetime import datetime
from sqlalchemy import Column, Integer, String, Text, Boolean, Numeric, DateTime, ForeignKey, CheckConstraint
from sqlalchemy.orm import relationship
from backend.app.core.database import Base

class Customer(Base):
    __tablename__ = "customers"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    customer_id = Column(String(20), unique=True, nullable=False, index=True)  # C-000001
    name = Column(String(100), nullable=False, index=True)
    phone = Column(String(50), nullable=True, index=True)
    address = Column(Text, nullable=True)
    is_active = Column(Boolean, nullable=False, default=True, index=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    sales = relationship("Sale", back_populates="customer")
    payments = relationship("CustomerPayment", back_populates="customer")
    returns = relationship("SalesReturn", back_populates="customer")

class CustomerPayment(Base):
    __tablename__ = "customer_payments"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    payment_number = Column(String(30), unique=True, nullable=False, index=True) # CP-000001
    customer_id = Column(Integer, ForeignKey("customers.id"), nullable=False, index=True)
    amount = Column(Numeric(12, 2), nullable=False)
    payment_method = Column(String(30), nullable=False, default="Cash")
    notes = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, index=True)

    __table_args__ = (
        CheckConstraint('amount > 0', name='check_customer_payment_amount_positive'),
    )

    customer = relationship("Customer", back_populates="payments")
