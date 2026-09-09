from typing import List, Optional
from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.orm import Session

from backend.app.core.database import get_db
from backend.app.schemas.quotation import (
    QuotationCreate, QuotationResponse, QuotationConversionCheckResponse,
    QuotationConvertRequest, QuotationRejectRequest
)
from backend.app.schemas.sales import SaleResponse
from backend.app.services.quotation_service import (
    create_quotation, get_quotation, list_quotations,
    check_quotation_conversion, convert_quotation_to_sale,
    reject_quotation, delete_quotation
)

router = APIRouter(prefix="/quotations", tags=["Quotations"])

@router.get("", response_model=List[QuotationResponse])
def get_quotations(
    status: Optional[str] = None,
    search: Optional[str] = None,
    limit: int = 100,
    offset: int = 0,
    db: Session = Depends(get_db)
):
    return list_quotations(db, status=status, search=search, limit=limit, offset=offset)

@router.post("", response_model=QuotationResponse, status_code=status.HTTP_201_CREATED)
def make_quotation(data: QuotationCreate, db: Session = Depends(get_db)):
    return create_quotation(db, data)

@router.get("/{id}", response_model=QuotationResponse)
def get_single_quotation(id: int, db: Session = Depends(get_db)):
    return get_quotation(db, id)

@router.get("/{id}/check-conversion", response_model=QuotationConversionCheckResponse)
def check_conversion(id: int, db: Session = Depends(get_db)):
    return check_quotation_conversion(db, id)

@router.post("/{id}/convert", response_model=SaleResponse)
def convert_to_sale(id: int, request: QuotationConvertRequest, db: Session = Depends(get_db)):
    return convert_quotation_to_sale(db, id, request)

@router.post("/{id}/reject", response_model=QuotationResponse)
def disapprove_quotation(id: int, request: QuotationRejectRequest, db: Session = Depends(get_db)):
    return reject_quotation(db, id, request)

@router.delete("/{id}", status_code=status.HTTP_204_NO_CONTENT)
def remove_quotation(id: int, db: Session = Depends(get_db)):
    delete_quotation(db, id)
    return None
