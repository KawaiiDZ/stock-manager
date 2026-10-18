from datetime import datetime
from sqlalchemy import Column, Integer, String, Text, Numeric, DateTime, CheckConstraint
from backend.app.core.database import Base

class AccountTransfer(Base):
    __tablename__ = "account_transfers"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    transfer_number = Column(String(30), unique=True, nullable=False, index=True) # TR-000001
    from_account = Column(String(100), nullable=False, index=True)
    to_account = Column(String(100), nullable=False, index=True)
    amount = Column(Numeric(12, 2), nullable=False)
    transfer_date = Column(DateTime, default=datetime.now, index=True)
    notes = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.now)

    __table_args__ = (
        CheckConstraint('amount > 0', name='check_transfer_amount_positive'),
    )
