from datetime import date, timedelta
from decimal import Decimal
from backend.app.schemas.product import ProductCreate
from backend.app.schemas.customer import CustomerCreate, CustomerPaymentCreate
from backend.app.schemas.supplier import SupplierCreate, SupplierPaymentCreate
from backend.app.schemas.purchase import PurchaseCreate, PurchaseItemCreate, PurchaseReturnCreate, PurchaseReturnItemCreate
from backend.app.schemas.sales import SaleCreate, SaleItemCreate, SalesReturnCreate, SalesReturnItemCreate
from backend.app.schemas.bills import BillCategoryCreate, BillCreate, BillPaymentCreate
from backend.app.schemas.expenses import ExpenseCategoryCreate, ExpenseCreate
from backend.app.services.product_service import create_product, get_product
from backend.app.services.customer_service import create_customer, get_customer, record_customer_payment
from backend.app.services.supplier_service import create_supplier, get_supplier, record_supplier_payment
from backend.app.services.purchase_service import create_purchase
from backend.app.services.sales_service import create_sale, get_receipt_print_data
from backend.app.services.returns_service import create_sales_return, create_purchase_return
from backend.app.services.bills_service import create_bill_category, create_bill, record_bill_payment
from backend.app.services.expense_service import create_expense_category, create_expense
from backend.app.services.dashboard_service import get_dashboard_stats
from backend.app.services.reports_service import (
    get_sales_report, get_sales_detail_report, get_purchases_report, get_inventory_report
)

def test_complete_section_77_end_to_end_workflow(db_session):
    # 1. Create product with opening stock (10 units @ cost 200, selling 250)
    product = create_product(db_session, ProductCreate(
        name="Basmati Rice 5kg",
        sku="RICE-5KG",
        barcode="8901234567890",
        purchase_price=Decimal("200.00"),
        selling_price=Decimal("250.00"),
        opening_stock=Decimal("10.00")
    ))
    assert product["current_stock"] == Decimal("10.00")

    # 2. Supplier setup & Purchase additional stock (20 units @ cost 210)
    supplier = create_supplier(db_session, SupplierCreate(name="Punjab Grain Traders", phone="03217778899"))
    po1 = create_purchase(db_session, PurchaseCreate(
        supplier_id=supplier.id,
        items=[PurchaseItemCreate(product_id=product["id"], quantity=Decimal("20.00"), unit_cost=Decimal("210.00"))],
        paid_amount=Decimal("4200.00") # Fully paid
    ))
    assert get_product(db_session, product["id"])["current_stock"] == Decimal("30.00")

    # 3. Purchase another batch at a different cost (10 units @ cost 220, unpaid)
    po2 = create_purchase(db_session, PurchaseCreate(
        supplier_id=supplier.id,
        items=[PurchaseItemCreate(product_id=product["id"], quantity=Decimal("10.00"), unit_cost=Decimal("220.00"))],
        paid_amount=Decimal("0.00") # Unpaid (Supplier Due: 2200)
    ))
    assert get_product(db_session, product["id"])["current_stock"] == Decimal("40.00")
    assert get_supplier(db_session, supplier.id).current_due == Decimal("2200.00")

    # 4. Customer setup
    customer = create_customer(db_session, CustomerCreate(name="Tariq Mahmood", phone="03335556677"))

    # 5. Normal Sale (5 units @ normal price 250 = 1250, Fully Paid)
    # FIFO will consume from opening stock batch (cost 200). FIFO cost = 1000, Gross Profit = 250.
    sale1 = create_sale(db_session, SaleCreate(
        customer_id=customer.id,
        items=[SaleItemCreate(product_id=product["id"], quantity=Decimal("5.00"), unit_price=Decimal("250.00"))],
        paid_amount=Decimal("1250.00")
    ))
    assert sale1.total_cost == Decimal("1000.00")
    assert sale1.gross_profit == Decimal("250.00")

    # 6. Special Price Sale (7 units @ custom price 240 = 1680, Fully Paid)
    # FIFO: remaining 5 units of opening stock @ 200 (1000) + 2 units of PO1 @ 210 (420) = 1420 cost.
    # Gross Profit = 1680 - 1420 = 260.
    sale2 = create_sale(db_session, SaleCreate(
        customer_id=customer.id,
        items=[SaleItemCreate(product_id=product["id"], quantity=Decimal("7.00"), unit_price=Decimal("240.00"))],
        paid_amount=Decimal("1680.00")
    ))
    assert sale2.total_cost == Decimal("1420.00")
    assert sale2.gross_profit == Decimal("260.00")

    # 7. Partially Paid Sale (4 units @ 250 = 1000. Paid 400, Due 600)
    # FIFO: consumes 4 units of PO1 @ 210 = 840 cost. Gross profit = 1000 - 840 = 160.
    sale3 = create_sale(db_session, SaleCreate(
        customer_id=customer.id,
        items=[SaleItemCreate(product_id=product["id"], quantity=Decimal("4.00"), unit_price=Decimal("250.00"))],
        paid_amount=Decimal("400.00")
    ))
    assert sale3.due_amount == Decimal("600.00")
    assert get_customer(db_session, customer.id).current_due == Decimal("600.00")

    # 8. Customer Payment Later (Customer pays Rs. 200 towards due)
    record_customer_payment(db_session, customer.id, CustomerPaymentCreate(amount=Decimal("200.00")))
    assert get_customer(db_session, customer.id).current_due == Decimal("400.00")

    # 9. Return part of sale3 (Return 1 unit @ 250 = 250)
    # Original sale3: Total 1000, Paid 400, Due was 600. Customer had paid 400.
    # Return 250: Max refund is 400 -> Cash refund 250, Balance Credit 0.
    ret_sale = create_sales_return(db_session, SalesReturnCreate(
        sale_id=sale3.id,
        customer_id=customer.id,
        items=[SalesReturnItemCreate(product_id=product["id"], quantity=Decimal("1.00"), unit_price=Decimal("250.00"))]
    ))
    assert ret_sale.cash_refund_amount == Decimal("250.00")

    # 10. Supplier return (Return 3 units @ 220 = 660 to supplier)
    ret_po = create_purchase_return(db_session, PurchaseReturnCreate(
        purchase_id=po2.id,
        supplier_id=supplier.id,
        items=[PurchaseReturnItemCreate(product_id=product["id"], quantity=Decimal("3.00"), unit_cost=Decimal("220.00"))]
    ))
    # Supplier due was 2200 - 660 = 1540
    assert get_supplier(db_session, supplier.id).current_due == Decimal("1540.00")

    # 11. Pay supplier Rs. 1000
    record_supplier_payment(db_session, supplier.id, SupplierPaymentCreate(amount=Decimal("1000.00")))
    assert get_supplier(db_session, supplier.id).current_due == Decimal("540.00")

    # 12. Create expense
    exp_c = create_expense_category(db_session, ExpenseCategoryCreate(name="Shop Maintenance"))
    create_expense(db_session, ExpenseCreate(
        category_id=exp_c.id,
        title="Light bulbs replacement",
        amount=Decimal("450.00")
    ))

    # 13. Create bill & partially pay
    bill_c = create_bill_category(db_session, BillCategoryCreate(name="Internet"))
    bill = create_bill(db_session, BillCreate(
        name="Fiber Broadband",
        category_id=bill_c.id,
        amount=Decimal("3500.00"),
        due_date=date.today() + timedelta(days=5)
    ))
    record_bill_payment(db_session, bill.id, BillPaymentCreate(amount=Decimal("1500.00")))

    # 14. Verify Dashboard KPIs (Customer returns must deduct from revenue and gross profit)
    dash = get_dashboard_stats(db_session)
    assert dash.today_sales_revenue == Decimal("3680.00") # 3930 gross - 250 return = 3680 net
    assert dash.today_gross_profit == Decimal("640.00")   # 670 gross profit - 30 return profit = 640 net
    assert dash.customer_outstanding == Decimal("400.00")
    assert dash.supplier_outstanding == Decimal("540.00")
    assert dash.bills_needing_attention_count == 1

    # 15. Verify Reports
    sales_rep = get_sales_report(db_session)
    assert len(sales_rep) == 3

    detail_rep = get_sales_detail_report(db_session)
    assert len(detail_rep) == 3

    inv_rep = get_inventory_report(db_session)
    assert len(inv_rep) == 1

    # 16. Verify Receipt Print Data
    receipt_data = get_receipt_print_data(db_session, sale1.receipt_number)
    assert receipt_data.receipt_number == "R-000001"
    assert receipt_data.total_amount == Decimal("1250.00")
