from sqlalchemy.orm import Session
from sqlalchemy import func
from backend.app.models.product import Product
from backend.app.models.customer import Customer, CustomerPayment
from backend.app.models.supplier import Supplier, SupplierPayment
from backend.app.models.sales import Sale, SalesReturn
from backend.app.models.purchase import Purchase, PurchaseReturn
from backend.app.models.bills import Bill
from backend.app.models.expenses import Expense

def generate_product_id(db: Session) -> str:
    count = db.query(func.count(Product.id)).scalar() or 0
    return f"P-{(count + 1):06d}"

def generate_customer_id(db: Session) -> str:
    count = db.query(func.count(Customer.id)).scalar() or 0
    return f"C-{(count + 1):06d}"

def generate_supplier_id(db: Session) -> str:
    count = db.query(func.count(Supplier.id)).scalar() or 0
    return f"S-{(count + 1):06d}"

def generate_receipt_number(db: Session) -> str:
    count = db.query(func.count(Sale.id)).scalar() or 0
    return f"R-{(count + 1):06d}"

def generate_purchase_number(db: Session) -> str:
    count = db.query(func.count(Purchase.id)).scalar() or 0
    return f"PO-{(count + 1):06d}"

def generate_sales_return_number(db: Session) -> str:
    count = db.query(func.count(SalesReturn.id)).scalar() or 0
    return f"RET-{(count + 1):06d}"

def generate_purchase_return_number(db: Session) -> str:
    count = db.query(func.count(PurchaseReturn.id)).scalar() or 0
    return f"PRET-{(count + 1):06d}"

def generate_customer_payment_number(db: Session) -> str:
    count = db.query(func.count(CustomerPayment.id)).scalar() or 0
    return f"CP-{(count + 1):06d}"

def generate_supplier_payment_number(db: Session) -> str:
    count = db.query(func.count(SupplierPayment.id)).scalar() or 0
    return f"SP-{(count + 1):06d}"

def generate_expense_number(db: Session) -> str:
    count = db.query(func.count(Expense.id)).scalar() or 0
    return f"EXP-{(count + 1):06d}"

def generate_bill_number(db: Session) -> str:
    count = db.query(func.count(Bill.id)).scalar() or 0
    return f"B-{(count + 1):06d}"
