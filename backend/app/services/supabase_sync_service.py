"""
Supabase Bi-Directional Offline-First Sync Service
Coordinates delta pushes from local SQLite sync_outbox to Supabase cloud,
and pulls downstream catalog/pricing updates into local SQLite.
"""
import os
import time
import json
import logging
from datetime import datetime, timezone
from typing import Dict, Any, List, Optional
from decimal import Decimal
import httpx
from sqlalchemy.orm import Session
from sqlalchemy import text

from backend.app.core.config import settings
from backend.app.models.sync_outbox import SyncOutbox, SyncMetadata
from backend.app.models.product import Product, ProductCategory
from backend.app.models.customer import Customer, CustomerPayment
from backend.app.models.sales import Sale, SaleItem, SalePayment

logger = logging.getLogger("uvicorn.error")

def get_supabase_headers() -> Dict[str, str]:
    key = settings.SUPABASE_SERVICE_ROLE_KEY or settings.SUPABASE_ANON_KEY
    return {
        "apikey": key,
        "Authorization": f"Bearer {key}",
        "Content-Type": "application/json",
        "Prefer": "return=minimal,resolution=merge-duplicates"
    }

def is_supabase_configured() -> bool:
    return bool(settings.SUPABASE_URL and (settings.SUPABASE_SERVICE_ROLE_KEY or settings.SUPABASE_ANON_KEY) and settings.SUPABASE_SYNC_ENABLED)

def check_supabase_connection() -> Dict[str, Any]:
    if not is_supabase_configured():
        return {"connected": False, "reason": "Supabase credentials not configured or sync disabled"}
    
    start_t = time.time()
    try:
        url = f"{settings.SUPABASE_URL}/rest/v1/"
        headers = get_supabase_headers()
        with httpx.Client(timeout=4.0) as client:
            resp = client.get(url, headers=headers)
            latency_ms = round((time.time() - start_t) * 1000, 1)
            if resp.status_code in (200, 204):
                return {
                    "connected": True,
                    "status_code": resp.status_code,
                    "latency_ms": latency_ms,
                    "url": settings.SUPABASE_URL
                }
            return {
                "connected": False,
                "status_code": resp.status_code,
                "latency_ms": latency_ms,
                "error": resp.text[:200]
            }
    except Exception as e:
        return {
            "connected": False,
            "error": str(e)
        }

def enqueue_outbox_mutation(
    db: Session,
    entity_type: str,
    entity_uuid: str,
    action: str,
    payload: Dict[str, Any]
) -> SyncOutbox:
    """Atomic helper to enqueue any local mutation into the SQLite sync_outbox."""
    entry = SyncOutbox(
        entity_type=entity_type.upper(),
        entity_uuid=str(entity_uuid),
        action=action.upper(),
        payload=json.dumps(payload, default=str),
        status="PENDING",
        created_at=datetime.utcnow()
    )
    db.add(entry)
    db.commit()
    return entry

def enqueue_sale_mutation(db: Session, sale: Sale) -> SyncOutbox:
    """Helper to enqueue a completed Sale and its line items / payments."""
    payload = {
        "sale": {
            "sync_uuid": sale.sync_uuid,
            "receipt_number": sale.receipt_number,
            "customer_id": sale.customer_id,
            "subtotal": float(sale.subtotal or 0.0),
            "discount_amount": float(sale.discount_amount or 0.0),
            "tax_rate": float(sale.tax_rate or 0.0),
            "tax_amount": float(sale.tax_amount or 0.0),
            "total_amount": float(sale.total_amount or 0.0),
            "paid_amount": float(sale.paid_amount or 0.0),
            "due_amount": float(sale.due_amount or 0.0),
            "payment_status": sale.payment_status,
            "total_cost": float(sale.total_cost or 0.0),
            "gross_profit": float(sale.gross_profit or 0.0),
            "notes": sale.notes,
            "is_external": bool(sale.is_external),
            "created_at": sale.created_at.isoformat() if sale.created_at else None,
            "is_deleted": False
        },
        "items": [
            {
                "sync_uuid": it.sync_uuid,
                "product_id": it.product_id,
                "product_name": it.product_name,
                "quantity": float(it.quantity or 0.0),
                "unit_price": float(it.unit_price or 0.0),
                "discount_amount": float(it.discount_amount or 0.0),
                "total_price": float(it.total_price or 0.0),
                "unit_cost": float(it.unit_cost or 0.0),
                "total_cost": float(it.total_cost or 0.0),
                "gross_profit": float(it.gross_profit or 0.0),
                "is_external": bool(it.is_external),
                "notes": it.notes,
                "is_deleted": False
            }
            for it in (sale.items or [])
        ],
        "payments": [
            {
                "sync_uuid": p.sync_uuid,
                "amount": float(p.amount or 0.0),
                "payment_method": p.payment_method,
                "customer_payment_id": p.customer_payment_id,
                "created_at": p.created_at.isoformat() if p.created_at else None,
                "is_deleted": False
            }
            for p in (sale.payments or [])
        ]
    }
    return enqueue_outbox_mutation(db, "SALE", sale.sync_uuid, "INSERT", payload)

def enqueue_product_mutation(db: Session, product: Product, action: str = "UPSERT") -> SyncOutbox:
    """Helper to enqueue a product creation or update."""
    payload = {
        "sync_uuid": product.sync_uuid,
        "product_id": product.product_id,
        "name": product.name,
        "sku": product.sku,
        "barcode": product.barcode,
        "purchase_price": float(product.purchase_price or 0.0),
        "selling_price": float(product.selling_price or 0.0),
        "current_stock": float(product.current_stock or 0.0),
        "is_service": bool(product.is_service),
        "is_active": bool(product.is_active),
        "created_at": product.created_at.isoformat() if product.created_at else None,
        "updated_at": product.updated_at.isoformat() if hasattr(product, "updated_at") and product.updated_at else None,
        "is_deleted": bool(getattr(product, "is_deleted", False))
    }
    return enqueue_outbox_mutation(db, "PRODUCT", product.sync_uuid, action, payload)

def enqueue_customer_mutation(db: Session, customer: Customer, action: str = "UPSERT") -> SyncOutbox:
    """Helper to enqueue a customer mutation."""
    payload = {
        "sync_uuid": customer.sync_uuid,
        "customer_id": customer.customer_id,
        "name": customer.name,
        "phone": customer.phone,
        "address": customer.address,
        "is_active": bool(customer.is_active),
        "created_at": customer.created_at.isoformat() if customer.created_at else None,
        "updated_at": customer.updated_at.isoformat() if hasattr(customer, "updated_at") and customer.updated_at else None,
        "is_deleted": bool(getattr(customer, "is_deleted", False))
    }
    return enqueue_outbox_mutation(db, "CUSTOMER", customer.sync_uuid, action, payload)

def enqueue_category_mutation(db: Session, category: ProductCategory, action: str = "UPSERT") -> SyncOutbox:
    """Helper to enqueue a category mutation."""
    payload = {
        "sync_uuid": category.sync_uuid,
        "name": category.name,
        "is_active": bool(category.is_active),
        "created_at": category.created_at.isoformat() if category.created_at else None,
        "updated_at": category.updated_at.isoformat() if hasattr(category, "updated_at") and category.updated_at else None,
        "is_deleted": bool(getattr(category, "is_deleted", False))
    }
    return enqueue_outbox_mutation(db, "CATEGORY", category.sync_uuid, action, payload)

def enqueue_customer_payment_mutation(db: Session, payment: CustomerPayment, action: str = "INSERT") -> SyncOutbox:
    """Helper to enqueue a customer payment mutation."""
    payload = {
        "sync_uuid": payment.sync_uuid,
        "payment_number": payment.payment_number,
        "customer_id": payment.customer_id,
        "amount": float(payment.amount or 0.0),
        "payment_method": payment.payment_method,
        "notes": payment.notes,
        "created_at": payment.created_at.isoformat() if payment.created_at else None,
        "is_deleted": bool(getattr(payment, "is_deleted", False))
    }
    return enqueue_outbox_mutation(db, "CUSTOMER_PAYMENT", payment.sync_uuid, action, payload)

def push_pending_outbox_batch(db: Session, batch_size: int = 50) -> Dict[str, Any]:
    """Pushes a batch of pending local outbox commits upstream to Supabase."""
    if not is_supabase_configured():
        return {"pushed": 0, "status": "NOT_CONFIGURED"}

    pending_items = db.query(SyncOutbox).filter(
        SyncOutbox.status == "PENDING"
    ).order_by(SyncOutbox.id.asc()).limit(batch_size).all()

    if not pending_items:
        return {"pushed": 0, "status": "UP_TO_DATE"}

    # Check connection quickly
    health = check_supabase_connection()
    if not health.get("connected"):
        return {"pushed": 0, "status": "OFFLINE", "reason": health.get("error")}

    headers = get_supabase_headers()
    headers["Prefer"] = "return=representation,resolution=merge-duplicates"

    pushed_count = 0
    failed_count = 0

    with httpx.Client(timeout=10.0) as client:
        for item in pending_items:
            item.status = "IN_FLIGHT"
            db.commit()

            try:
                data = json.loads(item.payload)
                success = False

                if item.entity_type == "SALE":
                    sale_data = data.get("sale", data)
                    resp = client.post(f"{settings.SUPABASE_URL}/rest/v1/sales?on_conflict=sync_uuid", json=sale_data, headers=headers)
                    if resp.status_code in (200, 201, 204):
                        res_list = resp.json() if resp.status_code != 204 else []
                        supabase_sale_id = res_list[0]["id"] if res_list else None

                        # If sale id retrieved, push items and payments
                        if supabase_sale_id:
                            for it in data.get("items", []):
                                it["sale_id"] = supabase_sale_id
                                client.post(f"{settings.SUPABASE_URL}/rest/v1/sale_items?on_conflict=sync_uuid", json=it, headers=headers)
                            for pay in data.get("payments", []):
                                pay["sale_id"] = supabase_sale_id
                                client.post(f"{settings.SUPABASE_URL}/rest/v1/sale_payments?on_conflict=sync_uuid", json=pay, headers=headers)
                        success = True
                    else:
                        item.status = "FAILED"
                        item.retry_count += 1
                        item.last_error = f"HTTP {resp.status_code}: {resp.text[:200]}"
                        failed_count += 1

                elif item.entity_type == "CATEGORY":
                    resp = client.post(f"{settings.SUPABASE_URL}/rest/v1/product_categories?on_conflict=sync_uuid", json=data, headers=headers)
                    success = resp.status_code in (200, 201, 204)
                elif item.entity_type == "CUSTOMER":
                    resp = client.post(f"{settings.SUPABASE_URL}/rest/v1/customers?on_conflict=sync_uuid", json=data, headers=headers)
                    success = resp.status_code in (200, 201, 204)
                elif item.entity_type == "PRODUCT":
                    resp = client.post(f"{settings.SUPABASE_URL}/rest/v1/products?on_conflict=sync_uuid", json=data, headers=headers)
                    success = resp.status_code in (200, 201, 204)
                elif item.entity_type == "CUSTOMER_PAYMENT":
                    resp = client.post(f"{settings.SUPABASE_URL}/rest/v1/customer_payments?on_conflict=sync_uuid", json=data, headers=headers)
                    success = resp.status_code in (200, 201, 204)
                elif item.entity_type == "EXPENSE":
                    resp = client.post(f"{settings.SUPABASE_URL}/rest/v1/expenses?on_conflict=sync_uuid", json=data, headers=headers)
                    success = resp.status_code in (200, 201, 204)
                else:
                    success = True

                if success:
                    item.status = "SYNCED"
                    item.synced_at = datetime.utcnow()
                    item.last_error = None
                    pushed_count += 1
                else:
                    item.status = "FAILED"
                    item.retry_count += 1
                    failed_count += 1

            except Exception as e:
                item.status = "FAILED"
                item.retry_count += 1
                item.last_error = str(e)
                failed_count += 1

            db.commit()

    # Update metadata
    meta = db.query(SyncMetadata).filter(SyncMetadata.entity_type == "UPSTREAM_SYNC").first()
    if meta:
        meta.last_synced_at = datetime.utcnow()
    else:
        db.add(SyncMetadata(entity_type="UPSTREAM_SYNC", last_synced_at=datetime.utcnow()))
    db.commit()

    return {
        "pushed": pushed_count,
        "failed": failed_count,
        "remaining": db.query(SyncOutbox).filter(SyncOutbox.status == "PENDING").count()
    }

def pull_downstream_updates(db: Session) -> Dict[str, Any]:
    """
    Downstream sync: pulls product catalog or customer updates made in Supabase
    (e.g., from web admin dashboard or another counter) down into local SQLite.
    """
    if not is_supabase_configured():
        return {"pulled": 0, "status": "NOT_CONFIGURED"}

    meta = db.query(SyncMetadata).filter(SyncMetadata.entity_type == "DOWNSTREAM_SYNC").first()
    last_pulled = meta.last_synced_at.isoformat() if meta and meta.last_synced_at else None

    headers = get_supabase_headers()
    pulled_stats = {"products": 0, "customers": 0, "categories": 0}

    try:
        with httpx.Client(timeout=8.0) as client:
            # 1. Pull updated products if timestamp exists
            query_params = "select=*&order=updated_at.asc"
            if last_pulled:
                query_params += f"&updated_at=gt.{last_pulled}"

            resp = client.get(f"{settings.SUPABASE_URL}/rest/v1/products?{query_params}", headers=headers)
            if resp.status_code == 200:
                remote_products = resp.json()
                for rp in remote_products:
                    # Match by sync_uuid
                    p = db.query(Product).filter(Product.sync_uuid == rp.get("sync_uuid")).first()
                    if p:
                        # Remote update: update local if remote is newer
                        p.name = rp.get("name", p.name)
                        p.selling_price = Decimal(str(rp.get("selling_price", p.selling_price)))
                        p.purchase_price = Decimal(str(rp.get("purchase_price", p.purchase_price)))
                        p.current_stock = Decimal(str(rp.get("current_stock", p.current_stock)))
                        p.barcode = rp.get("barcode", p.barcode)
                        p.sku = rp.get("sku", p.sku)
                        p.is_active = rp.get("is_active", p.is_active)
                        pulled_stats["products"] += 1
                db.commit()

            # Record latest pull timestamp
            if meta:
                meta.last_synced_at = datetime.utcnow()
            else:
                db.add(SyncMetadata(entity_type="DOWNSTREAM_SYNC", last_synced_at=datetime.utcnow()))
            db.commit()

    except Exception as e:
        logger.warning(f"Error pulling downstream updates: {e}")
        return {"pulled": 0, "error": str(e)}

    return {"pulled": sum(pulled_stats.values()), "stats": pulled_stats}

def initial_seed_upload(db: Session) -> Dict[str, Any]:
    """
    Pushes all existing local SQLite categories, products, customers,
    customer payments, and sales directly to Supabase cloud.
    """
    if not is_supabase_configured():
        return {"success": False, "message": "Supabase credentials not configured."}

    health = check_supabase_connection()
    if not health.get("connected"):
        return {"success": False, "message": f"Cannot connect to Supabase: {health.get('error')}"}

    headers = get_supabase_headers()
    headers["Prefer"] = "return=representation,resolution=merge-duplicates"

    stats = {"categories": 0, "products": 0, "customers": 0, "sales": 0, "payments": 0}

    with httpx.Client(timeout=20.0) as client:
        # 1. Categories
        categories = db.query(ProductCategory).all()
        for c in categories:
            payload = {
                "sync_uuid": c.sync_uuid,
                "name": c.name,
                "is_active": c.is_active,
                "created_at": c.created_at.isoformat() if c.created_at else None,
                "updated_at": c.updated_at.isoformat() if hasattr(c, "updated_at") and c.updated_at else None,
                "is_deleted": False
            }
            res = client.post(f"{settings.SUPABASE_URL}/rest/v1/product_categories?on_conflict=sync_uuid", json=payload, headers=headers)
            if res.status_code in (200, 201, 204):
                stats["categories"] += 1

        # 2. Customers
        customers = db.query(Customer).all()
        for cust in customers:
            payload = {
                "sync_uuid": cust.sync_uuid,
                "customer_id": cust.customer_id,
                "name": cust.name,
                "phone": cust.phone,
                "address": cust.address,
                "is_active": cust.is_active,
                "created_at": cust.created_at.isoformat() if cust.created_at else None,
                "updated_at": cust.updated_at.isoformat() if cust.updated_at else None,
                "is_deleted": False
            }
            res = client.post(f"{settings.SUPABASE_URL}/rest/v1/customers?on_conflict=sync_uuid", json=payload, headers=headers)
            if res.status_code in (200, 201, 204):
                stats["customers"] += 1

        # 3. Products
        products = db.query(Product).all()
        for p in products:
            payload = {
                "sync_uuid": p.sync_uuid,
                "product_id": p.product_id,
                "name": p.name,
                "sku": p.sku,
                "barcode": p.barcode,
                "purchase_price": float(p.purchase_price or 0.0),
                "selling_price": float(p.selling_price or 0.0),
                "current_stock": float(p.current_stock or 0.0),
                "is_service": bool(p.is_service),
                "is_active": bool(p.is_active),
                "created_at": p.created_at.isoformat() if p.created_at else None,
                "updated_at": p.updated_at.isoformat() if p.updated_at else None,
                "is_deleted": False
            }
            res = client.post(f"{settings.SUPABASE_URL}/rest/v1/products?on_conflict=sync_uuid", json=payload, headers=headers)
            if res.status_code in (200, 201, 204):
                stats["products"] += 1

        # 4. Customer Payments
        cust_payments = db.query(CustomerPayment).all()
        for cp in cust_payments:
            payload = {
                "sync_uuid": cp.sync_uuid,
                "payment_number": cp.payment_number,
                "customer_id": cp.customer_id,
                "amount": float(cp.amount or 0.0),
                "payment_method": cp.payment_method,
                "notes": cp.notes,
                "created_at": cp.created_at.isoformat() if cp.created_at else None,
                "is_deleted": False
            }
            res = client.post(f"{settings.SUPABASE_URL}/rest/v1/customer_payments?on_conflict=sync_uuid", json=payload, headers=headers)
            if res.status_code in (200, 201, 204):
                stats["payments"] += 1

        # 5. Sales (with line items and payments)
        sales = db.query(Sale).all()
        for s in sales:
            sale_payload = {
                "sync_uuid": s.sync_uuid,
                "receipt_number": s.receipt_number,
                "customer_id": s.customer_id,
                "subtotal": float(s.subtotal or 0.0),
                "discount_amount": float(s.discount_amount or 0.0),
                "tax_rate": float(s.tax_rate or 0.0),
                "tax_amount": float(s.tax_amount or 0.0),
                "total_amount": float(s.total_amount or 0.0),
                "paid_amount": float(s.paid_amount or 0.0),
                "due_amount": float(s.due_amount or 0.0),
                "payment_status": s.payment_status,
                "total_cost": float(s.total_cost or 0.0),
                "gross_profit": float(s.gross_profit or 0.0),
                "notes": s.notes,
                "is_external": bool(s.is_external),
                "created_at": s.created_at.isoformat() if s.created_at else None,
                "is_deleted": False
            }
            res = client.post(f"{settings.SUPABASE_URL}/rest/v1/sales?on_conflict=sync_uuid", json=sale_payload, headers=headers)
            if res.status_code in (200, 201, 204):
                stats["sales"] += 1
                res_data = res.json() if res.status_code != 204 else []
                supa_id = res_data[0]["id"] if res_data else None
                if supa_id:
                    for it in s.items:
                        item_payload = {
                            "sync_uuid": it.sync_uuid,
                            "sale_id": supa_id,
                            "product_id": it.product_id,
                            "product_name": it.product_name,
                            "quantity": float(it.quantity or 0.0),
                            "unit_price": float(it.unit_price or 0.0),
                            "discount_amount": float(it.discount_amount or 0.0),
                            "total_price": float(it.total_price or 0.0),
                            "unit_cost": float(it.unit_cost or 0.0),
                            "total_cost": float(it.total_cost or 0.0),
                            "gross_profit": float(it.gross_profit or 0.0),
                            "is_external": bool(it.is_external),
                            "notes": it.notes,
                            "is_deleted": False
                        }
                        client.post(f"{settings.SUPABASE_URL}/rest/v1/sale_items?on_conflict=sync_uuid", json=item_payload, headers=headers)
                    for pay in s.payments:
                        pay_payload = {
                            "sync_uuid": pay.sync_uuid,
                            "sale_id": supa_id,
                            "amount": float(pay.amount or 0.0),
                            "payment_method": pay.payment_method,
                            "customer_payment_id": pay.customer_payment_id,
                            "created_at": pay.created_at.isoformat() if pay.created_at else None,
                            "is_deleted": False
                        }
                        client.post(f"{settings.SUPABASE_URL}/rest/v1/sale_payments?on_conflict=sync_uuid", json=pay_payload, headers=headers)

    # Set last sync timestamp
    meta = db.query(SyncMetadata).filter(SyncMetadata.entity_type == "UPSTREAM_SYNC").first()
    if meta:
        meta.last_synced_at = datetime.utcnow()
    else:
        db.add(SyncMetadata(entity_type="UPSTREAM_SYNC", last_synced_at=datetime.utcnow()))
    db.commit()

    return {
        "success": True,
        "stats": stats,
        "message": f"Successfully seeded {stats['categories']} categories, {stats['products']} products, {stats['customers']} customers, and {stats['sales']} sales to Supabase cloud!"
    }

def get_sync_status_summary(db: Session) -> Dict[str, Any]:
    """Returns complete real-time Supabase sync status for frontend UI badge/settings."""
    configured = is_supabase_configured()
    pending_count = db.query(SyncOutbox).filter(SyncOutbox.status == "PENDING").count()
    failed_count = db.query(SyncOutbox).filter(SyncOutbox.status == "FAILED").count()

    meta = db.query(SyncMetadata).filter(SyncMetadata.entity_type == "UPSTREAM_SYNC").first()
    last_synced_at = meta.last_synced_at.isoformat() if meta and meta.last_synced_at else None

    health = check_supabase_connection() if configured else {"connected": False, "reason": "Not configured"}

    return {
        "enabled": bool(settings.SUPABASE_SYNC_ENABLED),
        "configured": configured,
        "connected": health.get("connected", False),
        "latency_ms": health.get("latency_ms"),
        "pending_outbox_count": pending_count,
        "failed_outbox_count": failed_count,
        "last_synced_at": last_synced_at,
        "url": settings.SUPABASE_URL,
        "error": health.get("error") if not health.get("connected") else None
    }
