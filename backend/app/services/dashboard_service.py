from datetime import date, datetime, time
from decimal import Decimal
import calendar
from typing import List, Optional
from sqlalchemy.orm import Session
from sqlalchemy import func

from backend.app.models.sales import Sale, SalePayment
from backend.app.models.customer import Customer
from backend.app.models.supplier import Supplier
from backend.app.models.bills import Bill
from backend.app.schemas.dashboard import (
    DashboardStatsResponse, MonthlySalesDataPoint, MonthlySalesChartResponse, DaySalesDetailResponse
)
from backend.app.services.customer_service import list_customers
from backend.app.services.supplier_service import list_suppliers
from backend.app.services.bills_service import get_bills_needing_attention
from backend.app.services.sales_service import _format_sale_response

def get_dashboard_stats(db: Session) -> DashboardStatsResponse:
    today = date.today()
    start_of_today = datetime.combine(today, time.min)
    end_of_today = datetime.combine(today, time.max)

    # 1. Today's Sales Revenue
    today_sales_revenue = db.query(func.coalesce(func.sum(Sale.total_amount), Decimal("0.00")))\
        .filter(Sale.created_at >= start_of_today, Sale.created_at <= end_of_today).scalar()

    # 2. Today's Gross Profit (Gross profit from products sold today; do NOT subtract general expenses)
    today_gross_profit = db.query(func.coalesce(func.sum(Sale.gross_profit), Decimal("0.00")))\
        .filter(Sale.created_at >= start_of_today, Sale.created_at <= end_of_today).scalar()

    # 3. Total Customer Outstanding
    all_customers = list_customers(db, is_active=True)
    customer_outstanding = sum((c.current_due for c in all_customers), Decimal("0.00"))

    # 4. Total Supplier Outstanding
    all_suppliers = list_suppliers(db, is_active=True)
    supplier_outstanding = sum((s.current_due for s in all_suppliers), Decimal("0.00"))

    # 5. Bills Needing Attention Count
    urgent_bills = get_bills_needing_attention(db)
    bills_count = len(urgent_bills)

    return DashboardStatsResponse(
        today_sales_revenue=today_sales_revenue,
        today_gross_profit=today_gross_profit,
        customer_outstanding=customer_outstanding,
        supplier_outstanding=supplier_outstanding,
        bills_needing_attention_count=bills_count
    )

def get_monthly_sales_chart(db: Session, year: int, month: int) -> MonthlySalesChartResponse:
    num_days = calendar.monthrange(year, month)[1]
    
    sales = db.query(Sale).all()

    # Group by day
    day_map = {d: {"revenue": Decimal("0.00"), "count": 0} for d in range(1, num_days + 1)}
    total_revenue = Decimal("0.00")
    for s in sales:
        dt = None
        if isinstance(s.created_at, str):
            try:
                dt = datetime.fromisoformat(s.created_at.replace("Z", "+00:00"))
            except Exception:
                try:
                    dt = datetime.strptime(s.created_at[:10], "%Y-%m-%d")
                except Exception:
                    pass
        elif s.created_at:
            dt = s.created_at

        if dt and dt.year == year and dt.month == month:
            d = dt.day
            if 1 <= d <= num_days:
                day_map[d]["revenue"] += s.total_amount
                day_map[d]["count"] += 1
                total_revenue += s.total_amount

    chart_points = []
    for d in range(1, num_days + 1):
        dt_str = f"{year:04d}-{month:02d}-{d:02d}"
        chart_points.append(MonthlySalesDataPoint(
            date=dt_str,
            day=d,
            sales_revenue=day_map[d]["revenue"],
            transaction_count=day_map[d]["count"]
        ))

    return MonthlySalesChartResponse(
        year=year,
        month=month,
        days_in_month=num_days,
        total_monthly_revenue=total_revenue,
        daily_sales=chart_points
    )

def get_day_sales_detail(db: Session, target_date: date) -> DaySalesDetailResponse:
    target_str = target_date.strftime("%Y-%m-%d")
    sales = db.query(Sale).all()

    matching_sales = []
    for s in sales:
        dt = None
        if isinstance(s.created_at, str):
            if s.created_at.startswith(target_str):
                matching_sales.append(s)
        elif s.created_at:
            if s.created_at.date() == target_date:
                matching_sales.append(s)

    revenue = sum((s.total_amount for s in matching_sales), Decimal("0.00"))
    count = len(matching_sales)

    return DaySalesDetailResponse(
        date=target_date.isoformat(),
        sales_revenue=revenue,
        transaction_count=count,
        sales=[_format_sale_response(s) for s in matching_sales]
    )
