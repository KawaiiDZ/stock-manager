from typing import List
from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.orm import Session

from backend.app.core.database import get_db
from backend.app.schemas.template import (
    BillTemplateCreate, BillTemplateUpdate, BillTemplateResponse
)
from backend.app.services import template_service

router = APIRouter(prefix="/templates", tags=["Bill & Product Templates"])

@router.get("", response_model=List[BillTemplateResponse])
def get_bill_templates(active_only: bool = Query(True), db: Session = Depends(get_db)):
    """List all bill/product templates with items and inventory resolution."""
    return template_service.list_templates(db, active_only=active_only)

@router.get("/{template_id}", response_model=BillTemplateResponse)
def get_bill_template(template_id: int, db: Session = Depends(get_db)):
    """Get a single bill template by ID."""
    return template_service.get_template(db, template_id=template_id)

@router.post("", response_model=BillTemplateResponse, status_code=status.HTTP_201_CREATED)
def create_bill_template(data: BillTemplateCreate, db: Session = Depends(get_db)):
    """Create a new bill template with category-locked items."""
    return template_service.create_template(db, data=data)

@router.put("/{template_id}", response_model=BillTemplateResponse)
def update_bill_template(template_id: int, data: BillTemplateUpdate, db: Session = Depends(get_db)):
    """Update a bill template and its items."""
    return template_service.update_template(db, template_id=template_id, data=data)

@router.delete("/{template_id}")
def delete_bill_template(template_id: int, db: Session = Depends(get_db)):
    """Delete a bill template."""
    template_service.delete_template(db, template_id=template_id)
    return {"message": "Bill template deleted successfully"}
