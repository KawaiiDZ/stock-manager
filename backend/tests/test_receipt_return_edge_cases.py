from decimal import Decimal
from fastapi.testclient import TestClient
from backend.app.main import app
from backend.app.schemas.product import ProductCreate
from backend.app.schemas.customer import CustomerCreate
from backend.app.schemas.sales import SaleCreate, SaleItemCreate, SalesReturnCreate, SalesReturnItemCreate
from backend.app.services.product_service import create_product
from backend.app.services.customer_service import create_customer
from backend.app.services.sales_service import create_sale, get_sale
from backend.app.services.returns_service import create_sales_return

client = TestClient(app)

def test_fully_returned_credit_sale_due_is_zero(db_session):
    cust = create_customer(db_session, CustomerCreate(name='Return Test Cust', phone='03007776655'))
    prod = create_product(db_session, ProductCreate(
        name='A4 Product Demo',
        purchase_price=Decimal('200.00'),
        selling_price=Decimal('500.00'),
        opening_stock=Decimal('20.00')
    ))

    # 1. Unpaid credit sale: 2 units @ 500 = 1000. Paid 0, Due 1000
    sale = create_sale(db_session, SaleCreate(
        customer_id=cust.id,
        items=[SaleItemCreate(
            product_id=prod['id'],
            quantity=Decimal('2.00'),
            unit_price=Decimal('500.00')
        )],
        paid_amount=Decimal('0.00')
    ))
    assert sale.due_amount == Decimal('1000.00')
    assert sale.payment_status == 'UNPAID'

    # 2. Return all 2 units
    ret = create_sales_return(db_session, SalesReturnCreate(
        sale_id=sale.id,
        customer_id=cust.id,
        items=[SalesReturnItemCreate(
            product_id=prod['id'],
            quantity=Decimal('2.00'),
            unit_price=Decimal('500.00')
        )],
        reason='Customer changed mind'
    ))

    # 3. Verify get_sale has due_amount = 0 and payment_status = RETURNED
    sale_dto = get_sale(db_session, sale.id)
    assert sale_dto.payment_status == 'RETURNED'
    assert sale_dto.due_amount == Decimal('0.00')
    assert sale_dto.total_returned_amount == Decimal('1000.00')
    assert sale_dto.items[0].returned_quantity == Decimal('2.00')
    assert sale_dto.items[0].remaining_returnable_quantity == Decimal('0.00')

def test_partial_return_due_and_line_items(db_session):
    cust = create_customer(db_session, CustomerCreate(name='Partial Cust', phone='03004443322'))
    prod1 = create_product(db_session, ProductCreate(
        name='Keyboard',
        purchase_price=Decimal('300.00'),
        selling_price=Decimal('600.00'),
        opening_stock=Decimal('10.00')
    ))
    prod2 = create_product(db_session, ProductCreate(
        name='Headset',
        purchase_price=Decimal('400.00'),
        selling_price=Decimal('800.00'),
        opening_stock=Decimal('10.00')
    ))

    # Sale: 1 Keyboard (600) + 1 Headset (800) = 1400. Paid 400, Due 1000.
    sale = create_sale(db_session, SaleCreate(
        customer_id=cust.id,
        items=[
            SaleItemCreate(product_id=prod1['id'], quantity=Decimal('1.00'), unit_price=Decimal('600.00')),
            SaleItemCreate(product_id=prod2['id'], quantity=Decimal('1.00'), unit_price=Decimal('800.00')),
        ],
        paid_amount=Decimal('400.00')
    ))
    assert sale.due_amount == Decimal('1000.00')

    # Return the Keyboard (600)
    ret = create_sales_return(db_session, SalesReturnCreate(
        sale_id=sale.id,
        customer_id=cust.id,
        items=[SalesReturnItemCreate(product_id=prod1['id'], quantity=Decimal('1.00'), unit_price=Decimal('600.00'))]
    ))

    sale_dto = get_sale(db_session, sale.id)
    assert sale_dto.total_returned_amount == Decimal('600.00')
    # Keyboard is returned
    kb_item = next(it for it in sale_dto.items if it.product_id == prod1['id'])
    assert kb_item.returned_quantity == Decimal('1.00')
    assert kb_item.remaining_returnable_quantity == Decimal('0.00')
    # Headset is retained
    hs_item = next(it for it in sale_dto.items if it.product_id == prod2['id'])
    assert hs_item.returned_quantity == Decimal('0.00')
    assert hs_item.remaining_returnable_quantity == Decimal('1.00')

def test_invoice_title_customization_api(client):
    # Update settings with custom invoice title
    res = client.put('/api/settings', json={'invoice_title': 'COMMERCIAL INVOICE'})
    assert res.status_code == 200, res.text
    data = res.json()
    assert data['invoice_title'] == 'COMMERCIAL INVOICE'

    # GET verifies persistence
    get_res = client.get('/api/settings')
    assert get_res.status_code == 200
    assert get_res.json()['invoice_title'] == 'COMMERCIAL INVOICE'

    # Revert back to TAX INVOICE
    client.put('/api/settings', json={'invoice_title': 'TAX INVOICE'})
