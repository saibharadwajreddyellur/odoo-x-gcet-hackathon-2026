from datetime import datetime, timedelta
from typing import List, Optional, Set
from sqlalchemy.orm import Session, joinedload
from sqlalchemy import func
from app.models.product import Product, StockLevel
from app.models.category import Category
from app.models.warehouse import Warehouse, Location
from app.models.receipt import Receipt, ReceiptItem
from app.models.delivery import Delivery, DeliveryItem
from app.models.transfer import InternalTransfer, TransferItem
from app.models.adjustment import StockAdjustment
from app.models.ledger import StockLedger
from app.schemas.dashboard import (
    DashboardKPI, DashboardSummary, CategoryStock, MovementTrend,
    OperationSummary, DashboardDocumentItem
)
from app.schemas.product import ProductOut, StockLevelOut
from app.schemas.ledger import StockLedgerOut


def get_dashboard_summary(
    db: Session,
    warehouse_id: Optional[int] = None,
    location_id: Optional[int] = None,
    category_id: Optional[int] = None,
    document_type: Optional[str] = None,
    status: Optional[str] = None
) -> DashboardSummary:
    now = datetime.utcnow()

    # 1. Resolve Target Locations for filtering
    target_loc_ids: Optional[Set[int]] = None
    if location_id is not None:
        target_loc_ids = {location_id}
    elif warehouse_id is not None:
        locs = db.query(Location).filter(Location.warehouse_id == warehouse_id).all()
        target_loc_ids = {loc.id for loc in locs}

    # 2. Products Query (respecting category filter)
    prod_query = db.query(Product).options(
        joinedload(Product.category),
        joinedload(Product.stock_levels).joinedload(StockLevel.location).joinedload(Location.warehouse)
    )
    if category_id is not None:
        prod_query = prod_query.filter(Product.category_id == category_id)
    products = prod_query.all()
    total_products = len(products)

    # 3. Stock Aggregations (respecting warehouse/location and category filters)
    total_units = 0
    low_stock_count = 0
    out_of_stock_count = 0
    low_stock_items: List[ProductOut] = []

    for p in products:
        relevant_stock_levels = [
            sl for sl in p.stock_levels
            if target_loc_ids is None or sl.location_id in target_loc_ids
        ]

        if target_loc_ids is not None:
            prod_stock = sum(sl.quantity_on_hand for sl in relevant_stock_levels)
        else:
            prod_stock = sum(sl.quantity_on_hand for sl in p.stock_levels)
        
        total_units += prod_stock

        has_low_location = False
        has_out_location = False

        if relevant_stock_levels:
            for sl in relevant_stock_levels:
                if sl.quantity_on_hand == 0:
                    out_of_stock_count += 1
                    has_out_location = True
                elif sl.quantity_on_hand <= p.min_stock_alert:
                    low_stock_count += 1
                    has_low_location = True
        else:
            if prod_stock == 0:
                out_of_stock_count += 1
                has_out_location = True
            elif prod_stock <= p.min_stock_alert:
                low_stock_count += 1
                has_low_location = True

        if has_low_location or has_out_location:
            p_out = ProductOut(
                id=p.id,
                name=p.name,
                sku=p.sku,
                category_id=p.category_id,
                category_name=p.category.name if p.category else "Uncategorized",
                uom=p.uom,
                unit_price=p.unit_price,
                initial_stock=p.initial_stock,
                min_stock_alert=p.min_stock_alert,
                reorder_quantity=p.reorder_quantity,
                description=p.description,
                total_stock=prod_stock,
                stock_status="OUT_OF_STOCK" if has_out_location else "LOW_STOCK",
                created_at=p.created_at,
                updated_at=p.updated_at,
                stock_levels=[
                    StockLevelOut(
                        id=sl.id,
                        location_id=sl.location_id,
                        location_code=sl.location.code if sl.location else "",
                        location_name=sl.location.name if sl.location else "",
                        warehouse_name=sl.location.warehouse.name if (sl.location and sl.location.warehouse) else "",
                        quantity_on_hand=sl.quantity_on_hand,
                        reserved_quantity=sl.reserved_quantity
                    )
                    for sl in relevant_stock_levels
                ]
            )
            low_stock_items.append(p_out)

    # 4. Receipts Processing
    all_receipts = db.query(Receipt).options(
        joinedload(Receipt.items).joinedload(ReceiptItem.location).joinedload(Location.warehouse),
        joinedload(Receipt.items).joinedload(ReceiptItem.product).joinedload(Product.category)
    ).order_by(Receipt.created_at.desc()).all()
    receipts_total = 0
    receipts_to_receive = 0
    receipts_late = 0
    receipt_doc_items: List[DashboardDocumentItem] = []

    for rec in all_receipts:
        # Check location match
        rec_loc_ids = {item.location_id for item in rec.items}
        if target_loc_ids is not None and not (rec_loc_ids & target_loc_ids):
            continue
        # Check category match
        if category_id is not None:
            if not any(item.product and item.product.category_id == category_id for item in rec.items):
                continue

        receipts_total += 1
        is_to_receive = rec.status in ["DRAFT", "READY"]
        if is_to_receive:
            receipts_to_receive += 1

        is_late = bool(rec.scheduled_date and rec.scheduled_date < now and is_to_receive)
        if is_late:
            receipts_late += 1

        # Check status filter for document pipeline display
        if status and rec.status.upper() != status.upper():
            continue

        first_loc = rec.items[0].location if rec.items and rec.items[0].location else None
        first_wh = first_loc.warehouse if first_loc else None
        first_prod = rec.items[0].product if rec.items and rec.items[0].product else None

        receipt_doc_items.append(
            DashboardDocumentItem(
                id=rec.id,
                document_type="Receipt",
                document_number=rec.receipt_number,
                status=rec.status,
                partner_or_reference=rec.supplier_name,
                warehouse_id=first_wh.id if first_wh else None,
                warehouse_name=first_wh.name if first_wh else None,
                location_id=first_loc.id if first_loc else None,
                location_name=first_loc.name if first_loc else None,
                category_id=first_prod.category_id if first_prod else None,
                category_name=first_prod.category.name if (first_prod and first_prod.category) else None,
                scheduled_date=rec.scheduled_date,
                is_late=is_late,
                items_count=len(rec.items),
                total_quantity=sum(item.quantity for item in rec.items),
                created_at=rec.created_at
            )
        )

    # 5. Deliveries Processing
    all_deliveries = db.query(Delivery).options(
        joinedload(Delivery.items).joinedload(DeliveryItem.location).joinedload(Location.warehouse),
        joinedload(Delivery.items).joinedload(DeliveryItem.product).joinedload(Product.category)
    ).order_by(Delivery.created_at.desc()).all()
    deliveries_total = 0
    deliveries_to_deliver = 0
    deliveries_late = 0
    deliveries_waiting = 0
    delivery_doc_items: List[DashboardDocumentItem] = []

    for deliv in all_deliveries:
        del_loc_ids = {item.location_id for item in deliv.items}
        if target_loc_ids is not None and not (del_loc_ids & target_loc_ids):
            continue
        if category_id is not None:
            if not any(item.product and item.product.category_id == category_id for item in deliv.items):
                continue

        deliveries_total += 1
        is_to_deliver = deliv.status in ["DRAFT", "WAITING", "READY", "PICKING", "PACKING"]
        if is_to_deliver:
            deliveries_to_deliver += 1

        if deliv.status == "WAITING":
            deliveries_waiting += 1

        is_late = bool(deliv.scheduled_date and deliv.scheduled_date < now and is_to_deliver)
        if is_late:
            deliveries_late += 1

        if status and deliv.status.upper() != status.upper():
            continue

        first_loc = deliv.items[0].location if deliv.items and deliv.items[0].location else None
        first_wh = first_loc.warehouse if first_loc else None
        first_prod = deliv.items[0].product if deliv.items and deliv.items[0].product else None

        delivery_doc_items.append(
            DashboardDocumentItem(
                id=deliv.id,
                document_type="Delivery",
                document_number=deliv.delivery_number,
                status=deliv.status,
                partner_or_reference=deliv.customer_name,
                warehouse_id=first_wh.id if first_wh else None,
                warehouse_name=first_wh.name if first_wh else None,
                location_id=first_loc.id if first_loc else None,
                location_name=first_loc.name if first_loc else None,
                category_id=first_prod.category_id if first_prod else None,
                category_name=first_prod.category.name if (first_prod and first_prod.category) else None,
                scheduled_date=deliv.scheduled_date,
                is_late=is_late,
                items_count=len(deliv.items),
                total_quantity=sum(item.quantity for item in deliv.items),
                created_at=deliv.created_at
            )
        )

    # 6. Internal Transfers Processing
    all_transfers = db.query(InternalTransfer).options(
        joinedload(InternalTransfer.source_location).joinedload(Location.warehouse),
        joinedload(InternalTransfer.dest_location),
        joinedload(InternalTransfer.items).joinedload(TransferItem.product).joinedload(Product.category)
    ).order_by(InternalTransfer.created_at.desc()).all()
    transfers_total = 0
    transfers_to_process = 0
    transfers_late = 0
    transfer_doc_items: List[DashboardDocumentItem] = []

    for trf in all_transfers:
        if target_loc_ids is not None:
            if trf.source_location_id not in target_loc_ids and trf.dest_location_id not in target_loc_ids:
                continue
        if category_id is not None:
            if not any(item.product and item.product.category_id == category_id for item in trf.items):
                continue

        transfers_total += 1
        is_to_process = trf.status in ["DRAFT", "SCHEDULED"]
        if is_to_process:
            transfers_to_process += 1

        is_late = bool(trf.scheduled_date and trf.scheduled_date < now and is_to_process)
        if is_late:
            transfers_late += 1

        if status and trf.status.upper() != status.upper():
            continue

        src_wh = trf.source_location.warehouse if trf.source_location else None
        partner_ref = f"{trf.source_location.name if trf.source_location else 'Src'} → {trf.dest_location.name if trf.dest_location else 'Dest'}"
        first_prod = trf.items[0].product if trf.items and trf.items[0].product else None

        transfer_doc_items.append(
            DashboardDocumentItem(
                id=trf.id,
                document_type="Internal",
                document_number=trf.transfer_number,
                status=trf.status,
                partner_or_reference=partner_ref,
                warehouse_id=src_wh.id if src_wh else None,
                warehouse_name=src_wh.name if src_wh else None,
                location_id=trf.source_location_id,
                location_name=trf.source_location.name if trf.source_location else None,
                category_id=first_prod.category_id if first_prod else None,
                category_name=first_prod.category.name if (first_prod and first_prod.category) else None,
                scheduled_date=trf.scheduled_date,
                is_late=is_late,
                items_count=len(trf.items),
                total_quantity=sum(item.quantity for item in trf.items),
                created_at=trf.created_at
            )
        )

    # 7. Stock Adjustments Processing
    all_adjustments = db.query(StockAdjustment).options(
        joinedload(StockAdjustment.location).joinedload(Location.warehouse),
        joinedload(StockAdjustment.product).joinedload(Product.category)
    ).order_by(StockAdjustment.created_at.desc()).all()
    adjustment_doc_items: List[DashboardDocumentItem] = []

    for adj in all_adjustments:
        if target_loc_ids is not None and adj.location_id not in target_loc_ids:
            continue
        if category_id is not None and adj.product and adj.product.category_id != category_id:
            continue

        # Adjustments are immediate, completed actions
        adj_status = "DONE"
        if status and status.upper() not in ["DONE", "COMPLETED"]:
            continue

        adj_loc = adj.location
        adj_wh = adj_loc.warehouse if adj_loc else None
        adj_prod = adj.product

        adjustment_doc_items.append(
            DashboardDocumentItem(
                id=adj.id,
                document_type="Adjustment",
                document_number=adj.adjustment_number,
                status=adj_status,
                partner_or_reference=f"{adj.reason} (By: {adj.adjusted_by or 'Staff'})",
                warehouse_id=adj_wh.id if adj_wh else None,
                warehouse_name=adj_wh.name if adj_wh else None,
                location_id=adj.location_id,
                location_name=adj_loc.name if adj_loc else None,
                category_id=adj_prod.category_id if adj_prod else None,
                category_name=adj_prod.category.name if (adj_prod and adj_prod.category) else None,
                scheduled_date=adj.created_at,
                is_late=False,
                items_count=1,
                total_quantity=abs(adj.diff_qty),
                created_at=adj.created_at
            )
        )

    # 8. Filter combined operations list by document_type if requested
    combined_docs: List[DashboardDocumentItem] = []
    clean_doc_type = document_type.strip().lower() if document_type else ""

    if not clean_doc_type or clean_doc_type in ["all", ""]:
        combined_docs = receipt_doc_items + delivery_doc_items + transfer_doc_items + adjustment_doc_items
    elif clean_doc_type in ["receipt", "receipts"]:
        combined_docs = receipt_doc_items
    elif clean_doc_type in ["delivery", "deliveries"]:
        combined_docs = delivery_doc_items
    elif clean_doc_type in ["internal", "transfer", "transfers"]:
        combined_docs = transfer_doc_items
    elif clean_doc_type in ["adjustment", "adjustments"]:
        combined_docs = adjustment_doc_items

    # Sort unified operations by created_at descending
    combined_docs.sort(key=lambda d: d.created_at, reverse=True)

    # 9. Operation Summaries (Kanban / Overview)
    operation_summaries = [
        OperationSummary(
            operation_type="Receipts",
            total_count=receipts_total,
            to_process=receipts_to_receive,
            late_count=receipts_late,
            waiting_count=0
        ),
        OperationSummary(
            operation_type="Deliveries",
            total_count=deliveries_total,
            to_process=deliveries_to_deliver,
            late_count=deliveries_late,
            waiting_count=deliveries_waiting
        ),
        OperationSummary(
            operation_type="Internal Transfers",
            total_count=transfers_total,
            to_process=transfers_to_process,
            late_count=transfers_late,
            waiting_count=0
        )
    ]

    # 10. Category Distribution (respecting warehouse filter)
    all_categories = db.query(Category).options(
        joinedload(Category.products).joinedload(Product.stock_levels)
    ).all()
    category_distribution: List[CategoryStock] = []
    for c in all_categories:
        c_prods = c.products
        if category_id is not None and c.id != category_id:
            continue
        c_qty = 0
        for prod in c_prods:
            if target_loc_ids is not None:
                c_qty += sum(sl.quantity_on_hand for sl in prod.stock_levels if sl.location_id in target_loc_ids)
            else:
                c_qty += sum(sl.quantity_on_hand for sl in prod.stock_levels)
        category_distribution.append(
            CategoryStock(
                category_name=c.name,
                product_count=len(c_prods),
                total_quantity=c_qty
            )
        )

    # 11. Real Movement Trends calculated from StockLedger (Last 7 days in 1 batch query)
    seven_days_ago = datetime.combine((now - timedelta(days=6)).date(), datetime.min.time())
    all_week_entries = db.query(StockLedger).filter(StockLedger.timestamp >= seven_days_ago).all()

    movement_trends: List[MovementTrend] = []
    for i in range(6, -1, -1):
        day_date = (now - timedelta(days=i)).date()
        day_entries = [e for e in all_week_entries if e.timestamp and e.timestamp.date() == day_date]

        r_cnt = sum(1 for e in day_entries if e.reference_doc_type == "Receipt")
        d_cnt = sum(1 for e in day_entries if e.reference_doc_type == "Delivery")
        t_cnt = sum(1 for e in day_entries if e.reference_doc_type == "Transfer")

        movement_trends.append(
            MovementTrend(
                date=day_date.strftime("%a"),
                receipts=r_cnt,
                deliveries=d_cnt,
                transfers=t_cnt
            )
        )

    # 12. Recent movements from StockLedger
    recent_ledger_q = db.query(StockLedger).options(
        joinedload(StockLedger.product),
        joinedload(StockLedger.location).joinedload(Location.warehouse),
        joinedload(StockLedger.user)
    ).order_by(StockLedger.timestamp.desc())
    if target_loc_ids is not None:
        recent_ledger_q = recent_ledger_q.filter(StockLedger.location_id.in_(target_loc_ids))
    recent_ledger = recent_ledger_q.limit(10).all()

    recent_movements = [
        StockLedgerOut(
            id=entry.id,
            timestamp=entry.timestamp,
            product_id=entry.product_id,
            product_name=entry.product.name if entry.product else "",
            product_sku=entry.product.sku if entry.product else "",
            location_id=entry.location_id,
            location_name=entry.location.name if entry.location else "",
            warehouse_name=entry.location.warehouse.name if (entry.location and entry.location.warehouse) else "",
            change_qty=entry.change_qty,
            balance_after=entry.balance_after,
            action_type=entry.action_type,
            reference_doc_type=entry.reference_doc_type,
            reference_doc_number=entry.reference_doc_number,
            user_id=entry.user_id,
            user_email=entry.user.email if entry.user else "System",
            notes=entry.notes
        )
        for entry in recent_ledger
    ]

    total_late = receipts_late + deliveries_late + transfers_late

    return DashboardSummary(
        kpis=DashboardKPI(
            total_products=total_products,
            total_units_in_stock=total_units,
            low_stock_count=low_stock_count,
            out_of_stock_count=out_of_stock_count,
            pending_receipts=receipts_to_receive,
            pending_deliveries=deliveries_to_deliver,
            scheduled_transfers=transfers_to_process,
            receipts_to_receive=receipts_to_receive,
            deliveries_to_deliver=deliveries_to_deliver,
            late_operations=total_late,
            waiting_operations=deliveries_waiting
        ),
        operation_summaries=operation_summaries,
        operations=combined_docs[:50],
        low_stock_items=low_stock_items,
        category_distribution=category_distribution,
        movement_trends=movement_trends,
        recent_movements=recent_movements
    )
