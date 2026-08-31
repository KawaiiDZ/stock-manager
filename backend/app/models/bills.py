from datetime import datetime
from sqlalchemy import Column, Integer, String, Text, Boolean, Numeric, Date, DateTime, ForeignKey, CheckConstraint
from sqlalchemy.orm import relationship
from backend.app.core.database import Base

class BillCategory(Base):
    __tablename__ = "bill_categories"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    name = Column(String(100), unique=True, nullable=False, index=True)
    is_active = Column(Boolean, nullable=False, default=True)

    bills = relationship("Bill", back_populates="category")

class Bill(Base):
    __tablename__ = "bills"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    bill_number = Column(String(50), nullable=False, index=True)
    name = Column(String(150), nullable=False)
    category_id = Column(Integer, ForeignKey("bill_categories.id"), nullable=False, index=True)
    amount = Column(Numeric(12, 2), nullable=False)
    paid_amount = Column(Numeric(12, 2), nullable=False, default=0.00)
    due_date = Column(Date, nullable=False, index=True)
    status = Column(String(20), nullable=False, default="TO_PAY", index=True) # TO_PAY, PARTIALLY_PAID, PAID, PENDING
    notes = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    __table_args__ = (
        CheckConstraint('amount > 0', name='check_bill_amount_positive'),
        CheckConstraint('paid_amount >= 0', name='check_bill_paid_amount_non_negative'),
    )

    category = relationship("BillCategory", back_populates="bills")
    payments = relationship("BillPayment", back_populates="bill", cascade="all, delete-orphan")

class BillPayment(Base):
    __tablename__ = "bill_payments"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    bill_id = Column(Integer, ForeignKey("bills.id", ondelete="CASCADE"), nullable=False, index=True)
    amount = Column(Numeric(12, 2), nullable=False)
    payment_method = Column(String(30), nullable=False, default="Cash")
    payment_date = Column(DateTime, default=datetime.utcnow)
    notes = Column(Text, nullable=True)

    __table_args__ = (
        CheckConstraint('amount > 0', name='check_bill_payment_amount_positive'),
    )

    bill = relationship("Bill", back_populates="payments")
