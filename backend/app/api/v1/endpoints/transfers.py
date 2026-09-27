from datetime import datetime
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session, joinedload
from app.api.deps import get_db, get_current_user
from app.models.transfer import InternalTransfer, TransferItem
from app.models.user import User
from app.schemas.movement import TransferCreate, TransferOut, TransferItemOut
from app.services.inventory_engine import complete_transfer

router = APIRouter()


def build_transfer_out(trf: InternalTransfer) -> TransferOut:
    return TransferOut(
        id=trf.id,
        transfer_number=trf.transfer_number,
        source_location_id=trf.source_location_id,
        source_location_name=trf.source_location.name if trf.source_location else "",
        dest_location_id=trf.dest_location_id,
        dest_location_name=trf.dest_location.name if trf.dest_location else "",
        status=trf.status,
        scheduled_date=trf.scheduled_date,
        notes=trf.notes,
        created_at=trf.created_at,
        completed_at=trf.completed_at,
        items=[
            TransferItemOut(
                id=item.id,
                product_id=item.product_id,
                product_name=item.product.name if item.product else "",
                product_sku=item.product.sku if item.product else "",
                quantity=item.quantity
            )
            for item in trf.items
        ]
    )


@router.get("", response_model=List[TransferOut])
def list_transfers(status_filter: Optional[str] = None, db: Session = Depends(get_db)):
    query = db.query(InternalTransfer).options(
        joinedload(InternalTransfer.source_location),
        joinedload(InternalTransfer.dest_location),
        joinedload(InternalTransfer.items).joinedload(TransferItem.product)
    )
    if status_filter:
        query = query.filter(InternalTransfer.status == status_filter.upper())
    transfers = query.order_by(InternalTransfer.created_at.desc()).all()
    return [build_transfer_out(t) for t in transfers]


@router.get("/{transfer_id}", response_model=TransferOut)
def get_transfer(transfer_id: int, db: Session = Depends(get_db)):
    transfer = db.query(InternalTransfer).options(
        joinedload(InternalTransfer.source_location),
        joinedload(InternalTransfer.dest_location),
        joinedload(InternalTransfer.items).joinedload(TransferItem.product)
    ).filter(InternalTransfer.id == transfer_id).first()
    if not transfer:
        raise HTTPException(status_code=404, detail="Transfer not found")
    return build_transfer_out(transfer)


@router.post("", response_model=TransferOut, status_code=status.HTTP_201_CREATED)
def create_transfer(
    trf_in: TransferCreate,
    db: Session = Depends(get_db),
    user: Optional[User] = Depends(get_current_user)
):
    if trf_in.source_location_id == trf_in.dest_location_id:
        raise HTTPException(status_code=400, detail="Source and destination locations cannot be the same")
    if not trf_in.items:
        raise HTTPException(status_code=400, detail="Transfer must contain at least one item")

    count = db.query(InternalTransfer).count() + 1
    trf_num = f"TRF-{datetime.utcnow().year}-{count:04d}"

    init_status = trf_in.status.upper() if getattr(trf_in, 'status', None) else "DRAFT"
    if init_status not in ["DRAFT", "SCHEDULED"]:
        init_status = "DRAFT"

    transfer = InternalTransfer(
        transfer_number=trf_num,
        source_location_id=trf_in.source_location_id,
        dest_location_id=trf_in.dest_location_id,
        status=init_status,
        scheduled_date=trf_in.scheduled_date or datetime.utcnow(),
        notes=trf_in.notes
    )
    db.add(transfer)
    db.flush()

    for item in trf_in.items:
        t_item = TransferItem(
            transfer_id=transfer.id,
            product_id=item.product_id,
            quantity=item.quantity
        )
        db.add(t_item)

    db.commit()
    db.refresh(transfer)
    return build_transfer_out(transfer)


@router.post("/{transfer_id}/schedule", response_model=TransferOut)
def schedule_transfer_endpoint(
    transfer_id: int,
    db: Session = Depends(get_db),
    user: Optional[User] = Depends(get_current_user)
):
    """
    Transitions a transfer from DRAFT to SCHEDULED status.
    """
    transfer = db.query(InternalTransfer).options(
        joinedload(InternalTransfer.source_location),
        joinedload(InternalTransfer.dest_location),
        joinedload(InternalTransfer.items).joinedload(TransferItem.product)
    ).filter(InternalTransfer.id == transfer_id).first()
    if not transfer:
        raise HTTPException(status_code=404, detail="Transfer not found")
    if transfer.status == "COMPLETED":
        raise HTTPException(status_code=400, detail="Cannot schedule a completed transfer")
    if transfer.status == "CANCELLED":
        raise HTTPException(status_code=400, detail="Cannot schedule a cancelled transfer")
    if transfer.status == "SCHEDULED":
        return build_transfer_out(transfer)

    transfer.status = "SCHEDULED"
    db.commit()
    db.refresh(transfer)
    return build_transfer_out(transfer)


@router.post("/{transfer_id}/cancel", response_model=TransferOut)
def cancel_transfer_endpoint(
    transfer_id: int,
    db: Session = Depends(get_db),
    user: Optional[User] = Depends(get_current_user)
):
    """
    Cancels a DRAFT or SCHEDULED transfer.
    Completed transfers are strictly immutable.
    """
    transfer = db.query(InternalTransfer).options(
        joinedload(InternalTransfer.source_location),
        joinedload(InternalTransfer.dest_location),
        joinedload(InternalTransfer.items).joinedload(TransferItem.product)
    ).filter(InternalTransfer.id == transfer_id).first()
    if not transfer:
        raise HTTPException(status_code=404, detail="Transfer not found")
    if transfer.status == "COMPLETED":
        raise HTTPException(status_code=400, detail="Cannot cancel a completed transfer - stock has already been relocated")
    if transfer.status == "CANCELLED":
        raise HTTPException(status_code=400, detail="Transfer is already cancelled")

    transfer.status = "CANCELLED"
    db.commit()
    db.refresh(transfer)
    return build_transfer_out(transfer)


@router.post("/{transfer_id}/complete", response_model=TransferOut)
def complete_transfer_endpoint(
    transfer_id: int,
    db: Session = Depends(get_db),
    user: Optional[User] = Depends(get_current_user)
):
    """
    Executes transfer completion:
    - Atomically updates source (-Q) and destination (+Q)
    - Total inventory across company remains strictly invariant
    - Writes dual audit trail to StockLedger
    """
    completed = complete_transfer(db=db, transfer_id=transfer_id, user_id=user.id if user else None)
    return build_transfer_out(completed)

