from decimal import Decimal
from typing import List, Optional
from sqlalchemy.orm import Session
from sqlalchemy import or_

from backend.app.models.sync import ProcessedSyncCommit
from backend.app.models.product import Product, ProductCategory
from backend.app.models.inventory import InventoryBatch, InventoryMovement
from backend.app.schemas.sync import (
    SyncPushRequest, SyncPushResponse, MergedItemSummary
)
from backend.app.services.product_service import create_product
from backend.app.schemas.product import ProductCreate

def process_sync_batch(db: Session, request: SyncPushRequest) -> SyncPushResponse:
    results: List[MergedItemSummary] = []
    processed_count = 0
    skipped_count = 0

    client_tag = request.station_name or request.client_id or "Remote Terminal"

    for commit in request.commits:
        # 1. Idempotency check: Skip if already applied
        existing_commit = db.query(ProcessedSyncCommit).filter(
            ProcessedSyncCommit.commit_id == commit.id
        ).first()

        if existing_commit:
            skipped_count += 1
            results.append(MergedItemSummary(
                commit_id=commit.id,
                action=commit.action,
                status="ALREADY_PROCESSED",
                message="Commit already merged previously."
            ))
            continue

        try:
            data = commit.data or {}

            if commit.action == "ADD_PRODUCT":
                name = (data.get("name") or "").strip()
                barcode = (data.get("barcode") or "").strip() or None
                sku = (data.get("sku") or "").strip() or None
                selling_price = Decimal(str(data.get("selling_price") or "0.00"))
                purchase_price = Decimal(str(data.get("purchase_price") or "0.00"))
                add_qty = Decimal(str(data.get("opening_stock") or data.get("quantity") or "0.00"))

                # Check if product already exists on Host (match by barcode, SKU, or exact name)
                query = db.query(Product)
                conditions = []
                if barcode:
                    conditions.append(Product.barcode == barcode)
                if sku:
                    conditions.append(Product.sku == sku)
                if name:
                    conditions.append(Product.name.ilike(name))

                matched_product: Optional[Product] = None
                if conditions:
                    matched_product = query.filter(or_(*conditions)).first()

                if matched_product:
                    # ADDITIVE MERGE: Do not overwrite! Add to existing stock and create FIFO batch
                    if add_qty > Decimal("0.00"):
                        matched_product.current_stock += add_qty

                        batch = InventoryBatch(
                            product_id=matched_product.id,
                            purchase_id=None,
                            quantity_received=add_qty,
                            quantity_remaining=add_qty,
                            unit_cost=purchase_price if purchase_price > Decimal("0.00") else matched_product.purchase_price
                        )
                        db.add(batch)

                        movement = InventoryMovement(
                            product_id=matched_product.id,
                            movement_type="PURCHASE",
                            quantity=add_qty,
                            unit_cost=purchase_price if purchase_price > Decimal("0.00") else matched_product.purchase_price,
                            reference_type="RESTOCK",
                            reference_id=f"SYNC-{commit.id[:8]}",
                            notes=f"Additive offline sync from {client_tag}"
                        )
                        db.add(movement)

                    db.flush()
                    summary_text = f"Merged into {matched_product.name} (+{add_qty} units)"
                    results.append(MergedItemSummary(
                        commit_id=commit.id,
                        action=commit.action,
                        status="ADDITIVE_MERGED",
                        product_name=matched_product.name,
                        delta_quantity=float(add_qty),
                        new_stock=float(matched_product.current_stock),
                        message=f"Added {add_qty} units to existing stock (New total: {matched_product.current_stock})"
                    ))
                else:
                    # Brand new product on Host: Create fresh product
                    # Ensure category exists or default to first category
                    cat_id = data.get("category_id")
                    if not cat_id or not db.query(ProductCategory).filter(ProductCategory.id == cat_id).first():
                        first_cat = db.query(ProductCategory).first()
                        cat_id = first_cat.id if first_cat else None

                    new_prod_dto = ProductCreate(
                        name=name or f"Synced Product {commit.id[:6]}",
                        sku=sku,
                        barcode=barcode,
                        category_id=cat_id,
                        purchase_price=purchase_price,
                        selling_price=selling_price,
                        opening_stock=add_qty
                    )
                    created_resp = create_product(db, new_prod_dto)
                    created_name = created_resp.get("name") if isinstance(created_resp, dict) else getattr(created_resp, "name", "")
                    created_stock = created_resp.get("current_stock") if isinstance(created_resp, dict) else getattr(created_resp, "current_stock", add_qty)
                    summary_text = f"Created new product {created_name} ({add_qty} units)"
                    results.append(MergedItemSummary(
                        commit_id=commit.id,
                        action=commit.action,
                        status="CREATED_NEW",
                        product_name=created_name,
                        delta_quantity=float(add_qty),
                        new_stock=float(created_stock),
                        message=f"Created new product with {add_qty} opening units"
                    ))

            elif commit.action == "RESTOCK_DELTA":
                barcode = (data.get("barcode") or "").strip() or None
                sku = (data.get("sku") or "").strip() or None
                name = (data.get("name") or "").strip()
                prod_ref = data.get("product_id")
                delta_qty = Decimal(str(data.get("delta_quantity") or data.get("quantity") or "0.00"))
                unit_cost = Decimal(str(data.get("unit_cost") or "0.00"))

                query = db.query(Product)
                conditions = []
                if prod_ref:
                    if isinstance(prod_ref, int) or (isinstance(prod_ref, str) and prod_ref.isdigit()):
                        conditions.append(Product.id == int(prod_ref))
                    else:
                        conditions.append(Product.product_id == str(prod_ref))
                if barcode:
                    conditions.append(Product.barcode == barcode)
                if sku:
                    conditions.append(Product.sku == sku)
                if name:
                    conditions.append(Product.name.ilike(name))

                product: Optional[Product] = None
                if conditions:
                    product = query.filter(or_(*conditions)).first()

                if product:
                    product.current_stock += delta_qty

                    cost = unit_cost if unit_cost > Decimal("0.00") else product.purchase_price
                    batch = InventoryBatch(
                        product_id=product.id,
                        purchase_id=None,
                        quantity_received=delta_qty,
                        quantity_remaining=delta_qty,
                        unit_cost=cost
                    )
                    db.add(batch)

                    movement = InventoryMovement(
                        product_id=product.id,
                        movement_type="PURCHASE",
                        quantity=delta_qty,
                        unit_cost=cost,
                        reference_type="RESTOCK",
                        reference_id=f"SYNC-{commit.id[:8]}",
                        notes=f"Offline restock delta from {client_tag}. {data.get('notes') or ''}".strip()
                    )
                    db.add(movement)
                    db.flush()

                    summary_text = f"Restocked {product.name} (+{delta_qty} units)"
                    results.append(MergedItemSummary(
                        commit_id=commit.id,
                        action=commit.action,
                        status="ADDITIVE_MERGED",
                        product_name=product.name,
                        delta_quantity=float(delta_qty),
                        new_stock=float(product.current_stock),
                        message=f"Added {delta_qty} units to {product.name}"
                    ))
                else:
                    # If product wasn't found, auto-create it with this stock
                    new_dto = ProductCreate(
                        name=name or f"Restocked Item {commit.id[:6]}",
                        sku=sku,
                        barcode=barcode,
                        purchase_price=unit_cost,
                        selling_price=unit_cost * Decimal("1.25"),
                        opening_stock=delta_qty
                    )
                    created = create_product(db, new_dto)
                    created_name = created.get("name") if isinstance(created, dict) else getattr(created, "name", "")
                    created_stock = created.get("current_stock") if isinstance(created, dict) else getattr(created, "current_stock", delta_qty)
                    summary_text = f"Auto-created {created_name} (+{delta_qty} units)"
                    results.append(MergedItemSummary(
                        commit_id=commit.id,
                        action=commit.action,
                        status="CREATED_NEW",
                        product_name=created_name,
                        delta_quantity=float(delta_qty),
                        new_stock=float(created_stock),
                        message=f"Product auto-created with {delta_qty} units"
                    ))
            else:
                summary_text = f"Unsupported action: {commit.action}"
                results.append(MergedItemSummary(
                    commit_id=commit.id,
                    action=commit.action,
                    status="FAILED",
                    message=summary_text
                ))

            # Record commit as processed
            db.add(ProcessedSyncCommit(
                commit_id=commit.id,
                client_id=request.client_id,
                action=commit.action,
                summary=summary_text
            ))
            processed_count += 1

        except Exception as e:
            results.append(MergedItemSummary(
                commit_id=commit.id,
                action=commit.action,
                status="FAILED",
                message=str(e)
            ))

    db.commit()

    return SyncPushResponse(
        success=True,
        processed_count=processed_count,
        skipped_count=skipped_count,
        results=results,
        message=f"Sync complete. Processed {processed_count} commits, skipped {skipped_count} duplicates."
    )
