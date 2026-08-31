from datetime import date
from typing import List, Optional
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from backend.app.core.database import get_db
from backend.app.schemas.expenses import (
    ExpenseCategoryCreate, ExpenseCategoryResponse, ExpenseCreate, ExpenseResponse
)
from backend.app.services.expense_service import (
    list_expense_categories, create_expense_category, list_expenses, create_expense, delete_expense
)

router = APIRouter(tags=["Expenses"])

# Categories
@router.get("/expense-categories", response_model=List[ExpenseCategoryResponse])
def get_categories(active_only: bool = True, db: Session = Depends(get_db)):
    return list_expense_categories(db, active_only=active_only)

@router.post("/expense-categories", response_model=ExpenseCategoryResponse)
def add_category(data: ExpenseCategoryCreate, db: Session = Depends(get_db)):
    return create_expense_category(db, data)

# Expenses
@router.get("/expenses", response_model=List[ExpenseResponse])
def get_expenses(
    category_id: Optional[int] = None,
    start_date: Optional[date] = None,
    end_date: Optional[date] = None,
    skip: int = 0,
    limit: int = 200,
    db: Session = Depends(get_db)
):
    return list_expenses(db, category_id=category_id, start_date=start_date, end_date=end_date, skip=skip, limit=limit)

@router.post("/expenses", response_model=ExpenseResponse)
def add_expense(data: ExpenseCreate, db: Session = Depends(get_db)):
    return create_expense(db, data)

@router.delete("/expenses/{id}")
def remove_expense(id: int, db: Session = Depends(get_db)):
    delete_expense(db, id)
    return {"success": True, "message": "Expense removed successfully"}
