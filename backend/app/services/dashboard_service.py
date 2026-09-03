from datetime import date, datetime, time
from decimal import Decimal
import calendar
from typing import List, Optional
from sqlalchemy.orm import Session
from sqlalchemy import func

from backend.app.models.sales import Sale, SalePayment, SalesReturn, SalesReturnItem
from backend.app.models.product import Product
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

    # 1. Today's Gross Sales Revenue
    gross_sales_revenue = db.query(func.coalesce(func.sum(Sale.total_amount), Decimal("0.00")))\
        .filter(Sale.created_at >= start_of_today, Sale.created_at <= end_of_today).scalar()

    # 1b. Today's Customer Returns
    returns_revenue = db.query(func.coalesce(func.sum(SalesReturn.total_return_amount), Decimal("0.00")))\
        .filter(SalesReturn.created_at >= start_of_today, SalesReturn.created_at <= end_of_today).scalar()

    # Net Sales Revenue (Returns deducted)
    today_sales_revenue = max(Decimal("0.00"), gross_sales_revenue - returns_revenue)

    # 1c. Today's Cash Collected (Direct sale payments + debt collections today)
    today_payments = db.query(SalePayment).filter(
        SalePayment.created_at >= start_of_today, SalePayment.created_at <= end_of_today
    ).all()
    today_gross_cash = sum((p.amount for p in today_payments), Decimal("0.00"))

    # 2. Today's Invoiced Gross Profit from Sales
    sales_gross_profit = db.query(func.coalesce(func.sum(Sale.gross_profit), Decimal("0.00")))\
        .filter(Sale.created_at >= start_of_today, Sale.created_at <= end_of_today).scalar()

    # 2b. Calculate Profit Reversed on Returns today and Cash Refunds
    today_returns = db.query(SalesReturn).filter(
        SalesReturn.created_at >= start_of_today, SalesReturn.created_at <= end_of_today
    ).all()
    reversed_profit = Decimal("0.00")
    cash_refunds_today = Decimal("0.00")
    for ret in today_returns:
        cash_refunds_today += ret.cash_refund_amount
        for it in ret.items:
            prod_cost = it.product.purchase_price if it.product else Decimal("0.00")
            item_profit = max(Decimal("0.00"), it.unit_price - prod_cost) * it.quantity
            reversed_profit += item_profit

    # Net Cash Collected Today
    today_collected_cash = max(Decimal("0.00"), today_gross_cash - cash_refunds_today)

    # Net Invoiced Gross Profit (Profit from returns is reversed)
    today_gross_profit = max(Decimal("0.00"), sales_gross_profit - reversed_profit)

    # 2c. Realized Gross Profit on Cash Collected Today
    today_realized_profit_raw = Decimal("0.00")
    for p in today_payments:
        if p.sale and p.sale.total_amount > Decimal("0.00"):
            margin_ratio = max(Decimal("0.00"), p.sale.gross_profit / p.sale.total_amount)
            today_realized_profit_raw += (p.amount * margin_ratio)
        elif p.sale:
            today_realized_profit_raw += p.sale.gross_profit

    today_realized_profit = max(Decimal("0.00"), today_realized_profit_raw - reversed_profit).quantize(Decimal("0.01"))

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
        today_collected_cash=today_collected_cash,
        today_gross_profit=today_gross_profit,
        today_realized_profit=today_realized_profit,
        customer_outstanding=customer_outstanding,
        supplier_outstanding=supplier_outstanding,
        bills_needing_attention_count=bills_count
    )

def _parse_item_date(val) -> Optional[datetime]:
    if isinstance(val, str):
        try:
            return datetime.fromisoformat(val.replace("Z", "+00:00"))
        except Exception:
            try:
                return datetime.strptime(val[:10], "%Y-%m-%d")
            except Exception:
                return None
    elif isinstance(val, (datetime, date)):
        return val if isinstance(val, datetime) else datetime.combine(val, time.min)
    return None

def get_monthly_sales_chart(db: Session, year: int, month: int) -> MonthlySalesChartResponse:
    num_days = calendar.monthrange(year, month)[1]
    
    sales = db.query(Sale).all()
    returns = db.query(SalesReturn).all()

    # Group by day
    day_sales_map = {d: {"revenue": Decimal("0.00"), "count": 0} for d in range(1, num_days + 1)}
    day_returns_map = {d: Decimal("0.00") for d in range(1, num_days + 1)}

    for s in sales:
        dt = _parse_item_date(s.created_at)
        if dt and dt.year == year and dt.month == month:
            d = dt.day
            if 1 <= d <= num_days:
                day_sales_map[d]["revenue"] += s.total_amount
                day_sales_map[d]["count"] += 1

    for r in returns:
        dt = _parse_item_date(r.created_at)
        if dt and dt.year == year and dt.month == month:
            d = dt.day
            if 1 <= d <= num_days:
                day_returns_map[d] += r.total_return_amount

    chart_points = []
    total_net_revenue = Decimal("0.00")
    for d in range(1, num_days + 1):
        dt_str = f"{year:04d}-{month:02d}-{d:02d}"
        # Net sales revenue = Gross Sales - Returns on that day
        net_revenue = max(Decimal("0.00"), day_sales_map[d]["revenue"] - day_returns_map[d])
        total_net_revenue += net_revenue

        chart_points.append(MonthlySalesDataPoint(
            date=dt_str,
            day=d,
            sales_revenue=net_revenue,
            transaction_count=day_sales_map[d]["count"]
        ))

    return MonthlySalesChartResponse(
        year=year,
        month=month,
        days_in_month=num_days,
        total_monthly_revenue=total_net_revenue,
        daily_sales=chart_points
    )

def get_day_sales_detail(db: Session, target_date: date) -> DaySalesDetailResponse:
    target_str = target_date.strftime("%Y-%m-%d")
    sales = db.query(Sale).all()
    returns = db.query(SalesReturn).all()

    matching_sales = []
    for s in sales:
        dt = _parse_item_date(s.created_at)
        if dt and dt.date() == target_date:
            matching_sales.append(s)

    matching_returns = []
    for r in returns:
        dt = _parse_item_date(r.created_at)
        if dt and dt.date() == target_date:
            matching_returns.append(r)

    gross_revenue = sum((s.total_amount for s in matching_sales), Decimal("0.00"))
    ret_revenue = sum((r.total_return_amount for r in matching_returns), Decimal("0.00"))
    net_revenue = max(Decimal("0.00"), gross_revenue - ret_revenue)
    count = len(matching_sales)

    return DaySalesDetailResponse(
        date=target_date.isoformat(),
        sales_revenue=net_revenue,
        transaction_count=count,
        sales=[_format_sale_response(s) for s in matching_sales]
    )
