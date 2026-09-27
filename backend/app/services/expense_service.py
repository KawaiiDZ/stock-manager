from datetime import date
from decimal import Decimal
from typing import List, Optional
from sqlalchemy.orm import Session, joinedload
from backend.app.models.expenses import ExpenseCategory, Expense
from backend.app.schemas.expenses import (
    ExpenseCategoryCreate, ExpenseCategoryResponse, ExpenseCreate, ExpenseResponse
)
from backend.app.services.id_generator import generate_expense_number
from backend.app.core.errors import EntityNotFoundException, BusinessRuleException

def list_expense_categories(db: Session, active_only: bool = True) -> List[ExpenseCategoryResponse]:
    q = db.query(ExpenseCategory)
    if active_only:
        q = q.filter(ExpenseCategory.is_active == True)
    cats = q.order_by(ExpenseCategory.name.asc()).all()
    return [ExpenseCategoryResponse.model_validate(c) for c in cats]

def create_expense_category(db: Session, data: ExpenseCategoryCreate) -> ExpenseCategoryResponse:
    if not data.name or not data.name.strip():
        raise BusinessRuleException("Expense category name cannot be empty.")
    existing = db.query(ExpenseCategory).filter(ExpenseCategory.name.ilike(data.name.strip())).first()
    if existing:
        if not existing.is_active:
            existing.is_active = True
            db.commit()
            return ExpenseCategoryResponse.model_validate(existing)
        raise BusinessRuleException(f"Expense category '{data.name}' already exists.")
    cat = ExpenseCategory(name=data.name.strip(), is_active=True)
    db.add(cat)
    db.commit()
    db.refresh(cat)
    return ExpenseCategoryResponse.model_validate(cat)

def _format_expense_response(exp: Expense) -> ExpenseResponse:
    return ExpenseResponse(
        id=exp.id,
        expense_number=exp.expense_number,
        category_id=exp.category_id,
        category_name=exp.category.name if exp.category else "General",
        title=exp.title,
        amount=exp.amount,
        payment_method=exp.payment_method,
        expense_date=exp.expense_date,
        notes=exp.notes,
        created_at=exp.created_at
    )

def list_expenses(
    db: Session,
    category_id: Optional[int] = None,
    start_date: Optional[date] = None,
    end_date: Optional[date] = None,
    skip: int = 0,
    limit: int = 200
) -> List[ExpenseResponse]:
    if start_date is not None and end_date is not None and start_date > end_date:
        start_date, end_date = end_date, start_date
    q = db.query(Expense).options(joinedload(Expense.category))
    if category_id:
        q = q.filter(Expense.category_id == category_id)
    if start_date:
        q = q.filter(Expense.expense_date >= start_date)
    if end_date:
        q = q.filter(Expense.expense_date <= end_date)
    expenses = q.order_by(Expense.expense_date.desc(), Expense.id.desc()).offset(skip).limit(limit).all()
    return [_format_expense_response(e) for e in expenses]

def create_expense(db: Session, data: ExpenseCreate) -> ExpenseResponse:
    cat = db.query(ExpenseCategory).filter(ExpenseCategory.id == data.category_id).first()
    if not cat:
        raise EntityNotFoundException("Expense Category", str(data.category_id))

    if not data.title or not data.title.strip():
        raise BusinessRuleException("Expense title cannot be empty.")

    if data.amount <= Decimal("0.00"):
        raise BusinessRuleException("Expense amount must be greater than zero.")

    e_num = generate_expense_number(db)
    exp = Expense(
        expense_number=e_num,
        category_id=cat.id,
        title=data.title.strip(),
        amount=data.amount,
        payment_method=data.payment_method or "Cash",
        expense_date=data.expense_date or date.today(),
        notes=data.notes
    )
    db.add(exp)
    db.commit()
    db.refresh(exp)
    return _format_expense_response(exp)

def delete_expense(db: Session, expense_id: int) -> bool:
    exp = db.query(Expense).filter(Expense.id == expense_id).first()
    if not exp:
        raise EntityNotFoundException("Expense", str(expense_id))
    db.delete(exp)
    db.commit()
    return True
