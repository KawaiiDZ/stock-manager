from datetime import date, timedelta
from decimal import Decimal
from backend.app.schemas.bills import BillCategoryCreate, BillCreate, BillPaymentCreate
from backend.app.schemas.expenses import ExpenseCategoryCreate, ExpenseCreate
from backend.app.services.bills_service import (
    create_bill_category, create_bill, record_bill_payment, get_bills_needing_attention, get_bill
)
from backend.app.services.expense_service import (
    create_expense_category, create_expense, list_expenses
)

def test_bills_and_expenses_lifecycle(db_session):
    # 1. Bill category & Bill creation
    cat = create_bill_category(db_session, BillCategoryCreate(name="Utilities"))
    bill = create_bill(db_session, BillCreate(
        name="Electricity Bill",
        category_id=cat.id,
        amount=Decimal("8000.00"),
        due_date=date.today() + timedelta(days=3),
        notes="Shop meter"
    ))

    assert bill.status == "TO_PAY"
    assert bill.paid_amount == Decimal("0.00")
    assert bill.due_amount == Decimal("8000.00")

    # Check urgent reminders
    attention = get_bills_needing_attention(db_session)
    assert len(attention) == 1
    assert "Due in 3 days" in attention[0].urgency_label

    # Partial payment Rs. 3000
    updated = record_bill_payment(db_session, bill.id, BillPaymentCreate(amount=Decimal("3000.00")))
    assert updated.status == "PARTIALLY_PAID"
    assert updated.paid_amount == Decimal("3000.00")
    assert updated.due_amount == Decimal("5000.00")

    # Full remaining payment Rs. 5000
    final_bill = record_bill_payment(db_session, bill.id, BillPaymentCreate(amount=Decimal("5000.00")))
    assert final_bill.status == "PAID"
    assert final_bill.due_amount == Decimal("0.00")

    # Paid bills no longer appear in attention reminders
    assert len(get_bills_needing_attention(db_session)) == 0

    # 2. Expense tracking
    exp_cat = create_expense_category(db_session, ExpenseCategoryCreate(name="Transport"))
    exp = create_expense(db_session, ExpenseCreate(
        category_id=exp_cat.id,
        title="Delivery Fuel",
        amount=Decimal("1200.00"),
        payment_method="Cash",
        notes="Rickshaw delivery"
    ))
    assert exp.expense_number == "EXP-000001"
    assert exp.amount == Decimal("1200.00")

    all_exp = list_expenses(db_session)
    assert len(all_exp) == 1
