from datetime import datetime
from typing import Optional
from sqlalchemy.orm import Session, joinedload
from fastapi import HTTPException, status
from app.models.product import Product, StockLevel
from app.models.receipt import Receipt, ReceiptItem
from app.models.delivery import Delivery, DeliveryItem
from app.models.transfer import InternalTransfer, TransferItem
from app.models.adjustment import StockAdjustment
from app.models.ledger import StockLedger


def get_or_create_stock_level(db: Session, product_id: int, location_id: int) -> StockLevel:
    level = db.query(StockLevel).filter(
        StockLevel.product_id == product_id,
        StockLevel.location_id == location_id
    ).first()
    if not level:
        level = StockLevel(
            product_id=product_id,
            location_id=location_id,
            quantity_on_hand=0,
            reserved_quantity=0
        )
        db.add(level)
        db.flush()
    return level


def record_ledger_entry(
    db: Session,
    product_id: int,
    location_id: int,
    change_qty: int,
    balance_after: int,
    action_type: str,
    doc_type: str,
    doc_number: str,
    user_id: Optional[int] = None,
    notes: Optional[str] = None
) -> StockLedger:
    ledger = StockLedger(
        timestamp=datetime.utcnow(),
        product_id=product_id,
        location_id=location_id,
        change_qty=change_qty,
        balance_after=balance_after,
        action_type=action_type,
        reference_doc_type=doc_type,
        reference_doc_number=doc_number,
        user_id=user_id,
        notes=notes
    )
    db.add(ledger)
    db.flush()
    return ledger


def validate_receipt(db: Session, receipt_id: int, user_id: Optional[int] = None) -> Receipt:
    receipt = db.query(Receipt).options(joinedload(Receipt.items)).filter(Receipt.id == receipt_id).first()
    if not receipt:
        raise HTTPException(status_code=404, detail="Receipt not found")
    if receipt.status in ["DONE", "VALIDATED"]:
        raise HTTPException(status_code=400, detail="Receipt is already completed")
    if receipt.status == "CANCELLED":
        raise HTTPException(status_code=400, detail="Cannot validate a cancelled receipt")

    # If responsible user not yet set and user_id is provided, assign
    if not receipt.responsible_user_id and user_id:
        receipt.responsible_user_id = user_id

    # Process each item
    for item in receipt.items:
        level = get_or_create_stock_level(db, item.product_id, item.location_id)
        level.quantity_on_hand += item.quantity
        level.updated_at = datetime.utcnow()
        db.flush()

        record_ledger_entry(
            db=db,
            product_id=item.product_id,
            location_id=item.location_id,
            change_qty=item.quantity,
            balance_after=level.quantity_on_hand,
            action_type="RECEIPT",
            doc_type="Receipt",
            doc_number=receipt.receipt_number,
            user_id=user_id or receipt.responsible_user_id,
            notes=f"Receipt validated from {receipt.supplier_name}"
        )

    receipt.status = "DONE"
    receipt.validated_at = datetime.utcnow()
    db.commit()
    db.refresh(receipt)
    return receipt


def validate_delivery(db: Session, delivery_id: int, user_id: Optional[int] = None) -> Delivery:
    delivery = db.query(Delivery).options(joinedload(Delivery.items)).filter(Delivery.id == delivery_id).first()
    if not delivery:
        raise HTTPException(status_code=404, detail="Delivery order not found")
    if delivery.status in ["DONE", "VALIDATED"]:
        raise HTTPException(status_code=400, detail="Delivery is already completed/shipped")
    if delivery.status == "CANCELLED":
        raise HTTPException(status_code=400, detail="Cannot validate a cancelled delivery")

    # If responsible user not yet set and user_id is provided, assign
    if not delivery.responsible_user_id and user_id:
        delivery.responsible_user_id = user_id

    # Check stock availability for all items before applying deduction
    for item in delivery.items:
        level = get_or_create_stock_level(db, item.product_id, item.location_id)
        if level.quantity_on_hand < item.quantity:
            prod = db.query(Product).filter(Product.id == item.product_id).first()
            p_name = prod.name if prod else f"ID {item.product_id}"
            raise HTTPException(
                status_code=400,
                detail=f"Insufficient stock for {p_name}. Available: {level.quantity_on_hand}, Requested: {item.quantity}"
            )

    # Deduct stock and write to ledger
    for item in delivery.items:
        level = get_or_create_stock_level(db, item.product_id, item.location_id)
        level.quantity_on_hand -= item.quantity
        level.updated_at = datetime.utcnow()
        db.flush()

        record_ledger_entry(
            db=db,
            product_id=item.product_id,
            location_id=item.location_id,
            change_qty=-item.quantity,
            balance_after=level.quantity_on_hand,
            action_type="DELIVERY",
            doc_type="Delivery",
            doc_number=delivery.delivery_number,
            user_id=user_id or delivery.responsible_user_id,
            notes=f"Delivery dispatched to {delivery.customer_name}"
        )

    delivery.status = "DONE"
    delivery.validated_at = datetime.utcnow()
    db.commit()
    db.refresh(delivery)
    return delivery


def complete_transfer(db: Session, transfer_id: int, user_id: Optional[int] = None) -> InternalTransfer:
    transfer = db.query(InternalTransfer).options(joinedload(InternalTransfer.items)).filter(InternalTransfer.id == transfer_id).first()
    if not transfer:
        raise HTTPException(status_code=404, detail="Transfer not found")
    if transfer.status == "COMPLETED":
        raise HTTPException(status_code=400, detail="Transfer is already completed")
    if transfer.status == "CANCELLED":
        raise HTTPException(status_code=400, detail="Cannot complete a cancelled transfer")
    if transfer.source_location_id == transfer.dest_location_id:
        raise HTTPException(status_code=400, detail="Source and destination locations cannot be identical")

    # Check source availability
    for item in transfer.items:
        src_level = get_or_create_stock_level(db, item.product_id, transfer.source_location_id)
        if src_level.quantity_on_hand < item.quantity:
            prod = db.query(Product).filter(Product.id == item.product_id).first()
            p_name = prod.name if prod else f"ID {item.product_id}"
            raise HTTPException(
                status_code=400,
                detail=f"Insufficient source stock for {p_name}. Available: {src_level.quantity_on_hand}, Requested: {item.quantity}"
            )

    # Execute atomic transfer
    for item in transfer.items:
        src_level = get_or_create_stock_level(db, item.product_id, transfer.source_location_id)
        dest_level = get_or_create_stock_level(db, item.product_id, transfer.dest_location_id)

        src_level.quantity_on_hand -= item.quantity
        dest_level.quantity_on_hand += item.quantity
        src_level.updated_at = datetime.utcnow()
        dest_level.updated_at = datetime.utcnow()
        db.flush()

        # Log TRANSFER_OUT
        record_ledger_entry(
            db=db,
            product_id=item.product_id,
            location_id=transfer.source_location_id,
            change_qty=-item.quantity,
            balance_after=src_level.quantity_on_hand,
            action_type="TRANSFER_OUT",
            doc_type="Transfer",
            doc_number=transfer.transfer_number,
            user_id=user_id,
            notes=f"Transferred to destination location ID {transfer.dest_location_id}"
        )

        # Log TRANSFER_IN
        record_ledger_entry(
            db=db,
            product_id=item.product_id,
            location_id=transfer.dest_location_id,
            change_qty=item.quantity,
            balance_after=dest_level.quantity_on_hand,
            action_type="TRANSFER_IN",
            doc_type="Transfer",
            doc_number=transfer.transfer_number,
            user_id=user_id,
            notes=f"Transferred from source location ID {transfer.source_location_id}"
        )

    transfer.status = "COMPLETED"
    transfer.completed_at = datetime.utcnow()
    db.commit()
    db.refresh(transfer)
    return transfer


def record_adjustment(
    db: Session,
    product_id: int,
    location_id: int,
    counted_qty: int,
    reason: str,
    notes: Optional[str] = None,
    adjusted_by: Optional[str] = None,
    user_id: Optional[int] = None
) -> StockAdjustment:
    level = get_or_create_stock_level(db, product_id, location_id)
    recorded_qty = level.quantity_on_hand
    diff_qty = counted_qty - recorded_qty

    # Generate sequential adjustment number
    count = db.query(StockAdjustment).count() + 1
    adj_num = f"ADJ-{datetime.utcnow().year}-{count:04d}"

    adjustment = StockAdjustment(
        adjustment_number=adj_num,
        product_id=product_id,
        location_id=location_id,
        recorded_qty=recorded_qty,
        counted_qty=counted_qty,
        diff_qty=diff_qty,
        reason=reason,
        notes=notes,
        adjusted_by=adjusted_by
    )
    db.add(adjustment)

    # Set new stock level
    level.quantity_on_hand = counted_qty
    level.updated_at = datetime.utcnow()
    db.flush()

    # Record to ledger
    record_ledger_entry(
        db=db,
        product_id=product_id,
        location_id=location_id,
        change_qty=diff_qty,
        balance_after=counted_qty,
        action_type="ADJUSTMENT",
        doc_type="Adjustment",
        doc_number=adj_num,
        user_id=user_id,
        notes=f"Stock adjusted ({reason}). Physical Count: {counted_qty}, Recorded: {recorded_qty}"
    )

    db.commit()
    db.refresh(adjustment)
    return adjustment
