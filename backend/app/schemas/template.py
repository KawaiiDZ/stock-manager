from decimal import Decimal
from typing import List, Optional
from datetime import datetime
from pydantic import BaseModel, Field

class BillTemplateItemBase(BaseModel):
    display_order: int = 1
    slot_name: str = Field(..., min_length=1, max_length=100)
    category_id: Optional[int] = None
    category_name: Optional[str] = None
    default_product_id: Optional[int] = None
    default_quantity: Decimal = Field(Decimal("1.00"), ge=Decimal("1.00"))
    is_optional: bool = True

class BillTemplateItemCreate(BillTemplateItemBase):
    pass

class BillTemplateItemResponse(BillTemplateItemBase):
    id: int
    template_id: int
    default_product_name: Optional[str] = None
    default_product_sku: Optional[str] = None
    default_product_selling_price: Optional[Decimal] = None
    default_product_current_stock: Optional[Decimal] = None

    class Config:
        from_attributes = True

class BillTemplateCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=150)
    description: Optional[str] = None
    items: List[BillTemplateItemCreate] = []

class BillTemplateUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    is_active: Optional[bool] = None
    items: Optional[List[BillTemplateItemCreate]] = None

class BillTemplateResponse(BaseModel):
    id: int
    name: str
    description: Optional[str] = None
    is_active: bool = True
    items: List[BillTemplateItemResponse] = []
    created_at: datetime
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True
