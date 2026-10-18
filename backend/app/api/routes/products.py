from typing import List, Optional
from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.orm import Session

from backend.app.core.database import get_db
from backend.app.schemas.product import (
    ProductCreate, ProductUpdate, ProductResponse,
    CategoryCreate, CategoryResponse,
    CustomFieldCreate, CustomFieldUpdate, CustomFieldResponse, CustomFieldReorderRequest,
    StockAdjustmentRequest, BulkProductsResponse,
    ProductBulkUpdateItem, BulkProductUpdateResponse
)
from backend.app.services import product_service

router = APIRouter(tags=["Products & Inventory"])

# Product Categories
@router.get("/categories", response_model=List[CategoryResponse])
def get_categories(active_only: bool = Query(True), db: Session = Depends(get_db)):
    return product_service.list_categories(db, active_only=active_only)

@router.post("/categories", response_model=CategoryResponse, status_code=status.HTTP_201_CREATED)
def create_category(data: CategoryCreate, db: Session = Depends(get_db)):
    return product_service.create_category(db, data)

@router.put("/categories/{category_id}", response_model=CategoryResponse)
def update_category(category_id: int, data: CategoryCreate, db: Session = Depends(get_db)):
    return product_service.update_category(db, category_id, data.name)

@router.delete("/categories/{category_id}")
def delete_category(category_id: int, db: Session = Depends(get_db)):
    product_service.delete_category(db, category_id)
    return {"message": "Category and all its associated products were permanently deleted"}

# Custom Fields
@router.get("/custom-fields", response_model=List[CustomFieldResponse])
def get_custom_fields(
    category_id: Optional[int] = Query(None),
    active_only: bool = Query(True),
    db: Session = Depends(get_db)
):
    return product_service.list_custom_fields(db, category_id=category_id, active_only=active_only)

@router.post("/custom-fields", response_model=CustomFieldResponse, status_code=status.HTTP_201_CREATED)
def create_custom_field(data: CustomFieldCreate, db: Session = Depends(get_db)):
    return product_service.create_custom_field(db, data)

@router.put("/custom-fields/reorder/batch", response_model=List[CustomFieldResponse])
def reorder_custom_fields(data: CustomFieldReorderRequest, db: Session = Depends(get_db)):
    return product_service.reorder_custom_fields(db, data.field_ids)

@router.put("/custom-fields/{field_id}", response_model=CustomFieldResponse)
def update_custom_field(field_id: int, data: CustomFieldUpdate, db: Session = Depends(get_db)):
    return product_service.update_custom_field(db, field_id, data)

@router.delete("/custom-fields/{field_id}")
def delete_custom_field(field_id: int, db: Session = Depends(get_db)):
    product_service.delete_custom_field(db, field_id)
    return {"message": "Custom field deleted successfully"}

# Products
@router.get("/products", response_model=List[ProductResponse])
def get_products(
    search: Optional[str] = Query(None),
    category_id: Optional[int] = Query(None),
    is_active: Optional[bool] = Query(True),
    skip: int = Query(0, ge=0),
    limit: int = Query(500, ge=1, le=1000),
    db: Session = Depends(get_db)
):
    return product_service.list_products(
        db, search=search, category_id=category_id, is_active=is_active, skip=skip, limit=limit
    )

@router.post("/products", response_model=ProductResponse, status_code=status.HTTP_201_CREATED)
def create_product(data: ProductCreate, db: Session = Depends(get_db)):
    return product_service.create_product(db, data)

@router.post("/products/bulk", response_model=BulkProductsResponse, status_code=status.HTTP_201_CREATED)
def create_products_bulk(products: List[ProductCreate], db: Session = Depends(get_db)):
    return product_service.create_products_bulk(db, products)

@router.put("/products/bulk", response_model=BulkProductUpdateResponse)
def update_products_bulk(updates: List[ProductBulkUpdateItem], db: Session = Depends(get_db)):
    return product_service.update_products_bulk(db, updates)

@router.get("/products/generate-barcode")
def generate_barcode(db: Session = Depends(get_db)):
    code = product_service.generate_unique_barcode(db)
    return {"barcode": code}

@router.get("/products/barcode/{barcode:path}", response_model=Optional[ProductResponse])
def get_product_by_barcode(barcode: str, db: Session = Depends(get_db)):
    return product_service.get_product_by_barcode(db, barcode)

@router.get("/products/{product_id}", response_model=ProductResponse)
def get_product(product_id: int, db: Session = Depends(get_db)):
    return product_service.get_product(db, product_id)

@router.put("/products/{product_id}", response_model=ProductResponse)
def update_product(product_id: int, data: ProductUpdate, db: Session = Depends(get_db)):
    return product_service.update_product(db, product_id, data)

@router.post("/products/{product_id}/adjust-stock", response_model=ProductResponse)
def adjust_stock(product_id: int, data: StockAdjustmentRequest, db: Session = Depends(get_db)):
    return product_service.adjust_stock(db, product_id, data)

@router.delete("/products/{product_id}", response_model=ProductResponse)
def deactivate_product(product_id: int, db: Session = Depends(get_db)):
    return product_service.deactivate_product(db, product_id)

@router.delete("/products/{product_id}/permanent")
def delete_product_permanent(product_id: int, db: Session = Depends(get_db)):
    product_service.delete_product_permanent(db, product_id)
    return {"message": "Product permanently deleted successfully"}

@router.post("/products/{product_id}/restore", response_model=ProductResponse)
def restore_product(product_id: int, db: Session = Depends(get_db)):
    return product_service.restore_product(db, product_id)

