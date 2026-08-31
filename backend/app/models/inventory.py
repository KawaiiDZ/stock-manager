from datetime import datetime
from sqlalchemy import Column, Integer, String, Text, Numeric, DateTime, ForeignKey, CheckConstraint
from sqlalchemy.orm import relationship
from backend.app.core.database import Base

class InventoryBatch(Base):
    __tablename__ = "inventory_batches"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    product_id = Column(Integer, ForeignKey("products.id"), nullable=False, index=True)
    purchase_id = Column(Integer, ForeignKey("purchases.id"), nullable=True, index=True) # Null for opening stock / adjustment
    quantity_received = Column(Numeric(12, 2), nullable=False)
    quantity_remaining = Column(Numeric(12, 2), nullable=False)
    unit_cost = Column(Numeric(12, 2), nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow, index=True)

    __table_args__ = (
        CheckConstraint('quantity_received >= 0', name='check_batch_quantity_received_non_negative'),
        CheckConstraint('quantity_remaining >= 0', name='check_batch_quantity_remaining_non_negative'),
        CheckConstraint('unit_cost >= 0', name='check_batch_unit_cost_non_negative'),
    )

    product = relationship("Product", back_populates="batches")
    purchase = relationship("Purchase", back_populates="batches")
    sale_item_batches = relationship("SaleItemBatch", back_populates="batch")

class InventoryMovement(Base):
    __tablename__ = "inventory_movements"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    product_id = Column(Integer, ForeignKey("products.id"), nullable=False, index=True)
    movement_type = Column(String(30), nullable=False)  # OPENING_STOCK, PURCHASE, SALE, CUSTOMER_RETURN, SUPPLIER_RETURN, ADJUSTMENT
    quantity = Column(Numeric(12, 2), nullable=False)   # Positive for addition, negative for deduction
    unit_cost = Column(Numeric(12, 2), nullable=False, default=0.00)
    reference_type = Column(String(30), nullable=False) # SALE, PURCHASE, CUSTOMER_RETURN, SUPPLIER_RETURN, OPENING
    reference_id = Column(String(50), nullable=False)   # e.g., R-000001, PO-000001, RET-000001
    notes = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, index=True)

    product = relationship("Product", back_populates="movements")
