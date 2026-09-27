from datetime import datetime
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session, joinedload
from app.api.deps import get_db, get_current_user
from app.models.receipt import Receipt, ReceiptItem
from app.models.warehouse import Location, Warehouse
from app.models.user import User
from app.schemas.movement import ReceiptCreate, ReceiptUpdate, ReceiptOut, ReceiptItemOut
from app.services.inventory_engine import validate_receipt

router = APIRouter()


def build_receipt_out(rec: Receipt) -> ReceiptOut:
    return ReceiptOut(
        id=rec.id,
        receipt_number=rec.receipt_number,
        supplier_name=rec.supplier_name,
        status=rec.status,
        receipt_date=rec.receipt_date,
        scheduled_date=rec.scheduled_date,
        responsible_user_id=rec.responsible_user_id,
        responsible_user_name=rec.responsible_user.full_name if rec.responsible_user else None,
        notes=rec.notes,
        created_at=rec.created_at,
        validated_at=rec.validated_at,
        items=[
            ReceiptItemOut(
                id=item.id,
                product_id=item.product_id,
                product_name=item.product.name if item.product else "",
                product_sku=item.product.sku if item.product else "",
                location_id=item.location_id,
                location_name=item.location.name if item.location else "",
                quantity=item.quantity,
                unit_cost=item.unit_cost
            )
            for item in rec.items
        ]
    )


@router.get("", response_model=List[ReceiptOut])
def list_receipts(status_filter: Optional[str] = None, db: Session = Depends(get_db)):
    query = db.query(Receipt).options(
        joinedload(Receipt.responsible_user),
        joinedload(Receipt.items).joinedload(ReceiptItem.product),
        joinedload(Receipt.items).joinedload(ReceiptItem.location)
    )
    if status_filter:
        query = query.filter(Receipt.status == status_filter.upper())
    receipts = query.order_by(Receipt.created_at.desc()).all()
    return [build_receipt_out(r) for r in receipts]


@router.get("/{receipt_id}", response_model=ReceiptOut)
def get_receipt(receipt_id: int, db: Session = Depends(get_db)):
    receipt = db.query(Receipt).options(
        joinedload(Receipt.responsible_user),
        joinedload(Receipt.items).joinedload(ReceiptItem.product),
        joinedload(Receipt.items).joinedload(ReceiptItem.location)
    ).filter(Receipt.id == receipt_id).first()
    if not receipt:
        raise HTTPException(status_code=404, detail="Receipt not found")
    return build_receipt_out(receipt)


@router.post("", response_model=ReceiptOut, status_code=status.HTTP_201_CREATED)
def create_receipt(
    receipt_in: ReceiptCreate,
    db: Session = Depends(get_db),
    user: Optional[User] = Depends(get_current_user)
):
    if not receipt_in.items:
        raise HTTPException(status_code=400, detail="Receipt must contain at least one product item")

    # Determine warehouse prefix from the first item's location, default to "WH"
    wh_code = "WH"
    first_loc = db.query(Location).filter(Location.id == receipt_in.items[0].location_id).first()
    if first_loc and first_loc.warehouse:
        wh_code = first_loc.warehouse.code

    count = db.query(Receipt).count() + 1
    rec_num = f"{wh_code}/IN/{count:04d}"

    responsible_id = receipt_in.responsible_user_id or (user.id if user else None)

    receipt = Receipt(
        receipt_number=rec_num,
        supplier_name=receipt_in.supplier_name,
        status="DRAFT",
        receipt_date=receipt_in.receipt_date or datetime.utcnow(),
        scheduled_date=receipt_in.scheduled_date or datetime.utcnow(),
        responsible_user_id=responsible_id,
        notes=receipt_in.notes
    )
    db.add(receipt)
    db.flush()

    for item in receipt_in.items:
        r_item = ReceiptItem(
            receipt_id=receipt.id,
            product_id=item.product_id,
            location_id=item.location_id,
            quantity=item.quantity,
            unit_cost=item.unit_cost
        )
        db.add(r_item)

    db.commit()
    db.refresh(receipt)
    return build_receipt_out(receipt)


@router.put("/{receipt_id}", response_model=ReceiptOut)
def update_receipt(
    receipt_id: int,
    receipt_in: ReceiptUpdate,
    db: Session = Depends(get_db),
    user: Optional[User] = Depends(get_current_user)
):
    """
    Updates a DRAFT receipt.
    Only DRAFT receipts can be modified.
    DONE and CANCELLED receipts are strictly immutable.
    """
    receipt = db.query(Receipt).options(
        joinedload(Receipt.responsible_user),
        joinedload(Receipt.items).joinedload(ReceiptItem.product),
        joinedload(Receipt.items).joinedload(ReceiptItem.location)
    ).filter(Receipt.id == receipt_id).first()
    if not receipt:
        raise HTTPException(status_code=404, detail="Receipt not found")
    if receipt.status != "DRAFT":
        raise HTTPException(
            status_code=400,
            detail=f"Only DRAFT receipts can be edited. Current status: {receipt.status}"
        )

    if receipt_in.supplier_name is not None:
        receipt.supplier_name = receipt_in.supplier_name
    if receipt_in.scheduled_date is not None:
        receipt.scheduled_date = receipt_in.scheduled_date
    if receipt_in.receipt_date is not None:
        receipt.receipt_date = receipt_in.receipt_date
    if receipt_in.responsible_user_id is not None:
        receipt.responsible_user_id = receipt_in.responsible_user_id
    if receipt_in.notes is not None:
        receipt.notes = receipt_in.notes

    if receipt_in.items is not None:
        if not receipt_in.items:
            raise HTTPException(status_code=400, detail="Receipt must contain at least one product item")
        db.query(ReceiptItem).filter(ReceiptItem.receipt_id == receipt.id).delete()
        for item in receipt_in.items:
            r_item = ReceiptItem(
                receipt_id=receipt.id,
                product_id=item.product_id,
                location_id=item.location_id,
                quantity=item.quantity,
                unit_cost=item.unit_cost
            )
            db.add(r_item)

    db.commit()
    db.refresh(receipt)
    return build_receipt_out(receipt)


@router.post("/{receipt_id}/mark_ready", response_model=ReceiptOut)
def mark_receipt_ready(
    receipt_id: int,
    db: Session = Depends(get_db),
    user: Optional[User] = Depends(get_current_user)
):
    """
    Transitions DRAFT → READY.
    Kept for backward compatibility.
    """
    receipt = db.query(Receipt).filter(Receipt.id == receipt_id).first()
    if not receipt:
        raise HTTPException(status_code=404, detail="Receipt not found")
    if receipt.status == "DONE":
        raise HTTPException(status_code=400, detail="Receipt is already completed")
    if receipt.status == "CANCELLED":
        raise HTTPException(status_code=400, detail="Cannot mark a cancelled receipt as ready")
    if receipt.status == "READY":
        raise HTTPException(status_code=400, detail="Receipt is already marked as ready")

    # Assign responsible user on first status change if not yet set
    if not receipt.responsible_user_id and user:
        receipt.responsible_user_id = user.id

    receipt.status = "READY"
    db.commit()
    db.refresh(receipt)
    return build_receipt_out(receipt)


@router.post("/{receipt_id}/validate", response_model=ReceiptOut)
def validate_receipt_endpoint(
    receipt_id: int,
    db: Session = Depends(get_db),
    user: Optional[User] = Depends(get_current_user)
):
    """
    Validates a receipt: DRAFT (or READY) → DONE.
    - Atomically credits stock at each line-item location
    - Generates immutable StockLedger audit records
    - Sets validated_at timestamp
    Stock changes happen exactly once here.
    """
    receipt = db.query(Receipt).filter(Receipt.id == receipt_id).first()
    if not receipt:
        raise HTTPException(status_code=404, detail="Receipt not found")
    if receipt.status not in ["DRAFT", "READY"]:
        raise HTTPException(
            status_code=400,
            detail=f"Only DRAFT receipts can be validated/received. Current status: {receipt.status}."
        )
    updated_receipt = validate_receipt(db=db, receipt_id=receipt_id, user_id=user.id if user else None)
    return build_receipt_out(updated_receipt)


@router.post("/{receipt_id}/cancel", response_model=ReceiptOut)
def cancel_receipt(
    receipt_id: int,
    db: Session = Depends(get_db),
    user: Optional[User] = Depends(get_current_user)
):
    """
    Cancels a receipt. Only allowed when status is DRAFT or READY (not DONE).
    No stock rollback is needed because stock was never credited.
    """
    receipt = db.query(Receipt).filter(Receipt.id == receipt_id).first()
    if not receipt:
        raise HTTPException(status_code=404, detail="Receipt not found")
    if receipt.status == "DONE":
        raise HTTPException(
            status_code=400,
            detail="Cannot cancel a completed receipt — stock has already been credited to inventory."
        )
    if receipt.status == "CANCELLED":
        raise HTTPException(status_code=400, detail="Receipt is already cancelled")

    receipt.status = "CANCELLED"
    db.commit()
    db.refresh(receipt)
    return build_receipt_out(receipt)
