from decimal import Decimal
from backend.app.schemas.product import ProductCreate
from backend.app.schemas.supplier import SupplierCreate, SupplierPaymentCreate
from backend.app.schemas.purchase import PurchaseCreate, PurchaseItemCreate, PurchaseReturnCreate, PurchaseReturnItemCreate
from backend.app.services.product_service import create_product, get_product
from backend.app.services.supplier_service import create_supplier, get_supplier, record_supplier_payment
from backend.app.services.purchase_service import create_purchase
from backend.app.services.returns_service import create_purchase_return

def test_purchases_and_supplier_ledger(db_session):
    supp = create_supplier(db_session, SupplierCreate(name="ABC Wholesale", phone="03121234567"))
    prod = create_product(db_session, ProductCreate(
        name="Sugar 1kg",
        purchase_price=Decimal("150.00"),
        selling_price=Decimal("180.00"),
        opening_stock=Decimal("0.00")
    ))

    # 1. Purchase 20 units @ Rs. 150 = Rs. 3000. Paid Rs. 1000, Due Rs. 2000
    po = create_purchase(db_session, PurchaseCreate(
        supplier_id=supp.id,
        items=[PurchaseItemCreate(
            product_id=prod["id"],
            quantity=Decimal("20.00"),
            unit_cost=Decimal("150.00")
        )],
        paid_amount=Decimal("1000.00")
    ))

    assert po.purchase_number == "PO-000001"
    assert po.total_amount == Decimal("3000.00")
    assert po.due_amount == Decimal("2000.00")
    assert po.payment_status == "PARTIALLY_PAID"

    # Stock increased to 20
    assert get_product(db_session, prod["id"])["current_stock"] == Decimal("20.00")

    # Supplier due is 2000
    supp_state1 = get_supplier(db_session, supp.id)
    assert supp_state1.current_due == Decimal("2000.00")

    # 2. Standalone payment of Rs. 500 to supplier
    record_supplier_payment(db_session, supp.id, SupplierPaymentCreate(amount=Decimal("500.00")))
    supp_state2 = get_supplier(db_session, supp.id)
    assert supp_state2.current_due == Decimal("1500.00")

    # 3. Return 5 units @ Rs. 150 = Rs. 750 to supplier
    ret = create_purchase_return(db_session, PurchaseReturnCreate(
        purchase_id=po.id,
        supplier_id=supp.id,
        items=[PurchaseReturnItemCreate(
            product_id=prod["id"],
            quantity=Decimal("5.00"),
            unit_cost=Decimal("150.00")
        )],
        reason="Damaged bags"
    ))
    assert ret.total_return_amount == Decimal("750.00")

    # Stock decreased from 20 to 15
    assert get_product(db_session, prod["id"])["current_stock"] == Decimal("15.00")

    # Supplier due is now 1500 - 750 = Rs. 750
    supp_state3 = get_supplier(db_session, supp.id)
    assert supp_state3.current_due == Decimal("750.00")
