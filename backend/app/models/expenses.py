from datetime import datetime
from sqlalchemy import Column, Integer, String, Text, Boolean, Numeric, Date, DateTime, ForeignKey, CheckConstraint
from sqlalchemy.orm import relationship
from backend.app.core.database import Base

class ExpenseCategory(Base):
    __tablename__ = "expense_categories"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    name = Column(String(100), unique=True, nullable=False, index=True)
    is_active = Column(Boolean, nullable=False, default=True)

    expenses = relationship("Expense", back_populates="category")

class Expense(Base):
    __tablename__ = "expenses"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    expense_number = Column(String(30), unique=True, nullable=False, index=True) # EXP-000001
    category_id = Column(Integer, ForeignKey("expense_categories.id"), nullable=False, index=True)
    title = Column(String(150), nullable=False)
    amount = Column(Numeric(12, 2), nullable=False)
    payment_method = Column(String(30), nullable=False, default="Cash")
    expense_date = Column(Date, nullable=False, index=True)
    notes = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    __table_args__ = (
        CheckConstraint('amount > 0', name='check_expense_amount_positive'),
    )

    category = relationship("ExpenseCategory", back_populates="expenses")
