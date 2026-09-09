from sqlalchemy.orm import Session
from sqlalchemy import func
from backend.app.models.product import Product
from backend.app.models.customer import Customer, CustomerPayment
from backend.app.models.supplier import Supplier, SupplierPayment
from backend.app.models.sales import Sale, SalesReturn
from backend.app.models.purchase import Purchase, PurchaseReturn
from backend.app.models.bills import Bill
from backend.app.models.expenses import Expense
from backend.app.models.quotation import Quotation

def _generate_unique_code(db: Session, model, id_column, prefix: str) -> str:
    """
    Safely generates a prefixed sequential code (e.g. P-000001).
    Uses MAX(id) to never collide after record deletions and includes a collision check.
    """
    max_id = db.query(func.coalesce(func.max(model.id), 0)).scalar() or 0
    candidate_num = max_id + 1
    candidate = f"{prefix}-{candidate_num:06d}"
    while db.query(model).filter(id_column == candidate).first() is not None:
        candidate_num += 1
        candidate = f"{prefix}-{candidate_num:06d}"
    return candidate

def generate_product_id(db: Session) -> str:
    return _generate_unique_code(db, Product, Product.product_id, "P")

def generate_customer_id(db: Session) -> str:
    return _generate_unique_code(db, Customer, Customer.customer_id, "C")

def generate_supplier_id(db: Session) -> str:
    return _generate_unique_code(db, Supplier, Supplier.supplier_id, "S")

def generate_receipt_number(db: Session) -> str:
    return _generate_unique_code(db, Sale, Sale.receipt_number, "R")

def generate_purchase_number(db: Session) -> str:
    return _generate_unique_code(db, Purchase, Purchase.purchase_number, "PO")

def generate_sales_return_number(db: Session) -> str:
    return _generate_unique_code(db, SalesReturn, SalesReturn.return_number, "RET")

def generate_purchase_return_number(db: Session) -> str:
    return _generate_unique_code(db, PurchaseReturn, PurchaseReturn.return_number, "PRET")

def generate_customer_payment_number(db: Session) -> str:
    return _generate_unique_code(db, CustomerPayment, CustomerPayment.payment_number, "CP")

def generate_supplier_payment_number(db: Session) -> str:
    return _generate_unique_code(db, SupplierPayment, SupplierPayment.payment_number, "SP")

def generate_expense_number(db: Session) -> str:
    return _generate_unique_code(db, Expense, Expense.expense_number, "EXP")

def generate_bill_number(db: Session) -> str:
    return _generate_unique_code(db, Bill, Bill.bill_number, "B")

def generate_quotation_number(db: Session) -> str:
    return _generate_unique_code(db, Quotation, Quotation.quotation_number, "Q")

