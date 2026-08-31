from datetime import date
from decimal import Decimal
from typing import List, Optional
from pydantic import BaseModel
from backend.app.schemas.sales import SaleResponse

class DashboardStatsResponse(BaseModel):
    today_sales_revenue: Decimal
    today_gross_profit: Decimal
    customer_outstanding: Decimal
    supplier_outstanding: Decimal
    bills_needing_attention_count: int

class BillAttentionItem(BaseModel):
    id: int
    bill_number: str
    name: str
    amount: Decimal
    paid_amount: Decimal
    due_amount: Decimal
    due_date: date
    status: str
    urgency_label: str  # "Overdue", "Due Today", "Due in 3 days"

class MonthlySalesDataPoint(BaseModel):
    date: str  # YYYY-MM-DD
    day: int
    sales_revenue: Decimal
    transaction_count: int

class MonthlySalesChartResponse(BaseModel):
    year: int
    month: int
    days_in_month: int
    total_monthly_revenue: Decimal
    daily_sales: List[MonthlySalesDataPoint]

class DaySalesDetailResponse(BaseModel):
    date: str
    sales_revenue: Decimal
    transaction_count: int
    sales: List[SaleResponse]
