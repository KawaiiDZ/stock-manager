from datetime import date
from typing import List, Optional
from fastapi import APIRouter, Depends, Query, HTTPException
from sqlalchemy.orm import Session
from backend.app.core.database import get_db
from backend.app.schemas.dashboard import (
    DashboardStatsResponse, BillAttentionItem, MonthlySalesDataPoint, MonthlySalesChartResponse, DaySalesDetailResponse
)
from backend.app.services.dashboard_service import (
    get_dashboard_stats, get_monthly_sales_chart, get_day_sales_detail
)
from backend.app.services.bills_service import get_bills_needing_attention

router = APIRouter(prefix="/dashboard", tags=["Dashboard"])

@router.get("/stats", response_model=DashboardStatsResponse)
@router.get("/kpis", response_model=DashboardStatsResponse)
def get_stats(db: Session = Depends(get_db)):
    return get_dashboard_stats(db)

@router.get("/bills-attention", response_model=List[BillAttentionItem])
def get_attention_bills(db: Session = Depends(get_db)):
    return get_bills_needing_attention(db)

@router.get("/monthly-sales", response_model=MonthlySalesChartResponse)
@router.get("/monthly-chart", response_model=MonthlySalesChartResponse)
def get_monthly_sales(
    year: Optional[int] = Query(None, ge=2000, le=2100),
    month: Optional[int] = Query(None, ge=1, le=12),
    db: Session = Depends(get_db)
):
    current_date = date.today()
    target_year = year if year is not None else current_date.year
    target_month = month if month is not None else current_date.month
    return get_monthly_sales_chart(db, target_year, target_month)

@router.get("/day-sales", response_model=DaySalesDetailResponse)
def get_day_sales_query(
    date: Optional[date] = None,
    target_date: Optional[date] = None,
    db: Session = Depends(get_db)
):
    dt = date or target_date or date.today()
    return get_day_sales_detail(db, dt)

@router.get("/day-sales/{target_date}", response_model=DaySalesDetailResponse)
def get_day_sales_path(target_date: date, db: Session = Depends(get_db)):
    return get_day_sales_detail(db, target_date)
