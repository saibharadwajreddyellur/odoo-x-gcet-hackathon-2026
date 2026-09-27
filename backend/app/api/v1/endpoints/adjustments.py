from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session, joinedload
from app.api.deps import get_db, get_current_user
from app.models.adjustment import StockAdjustment
from app.models.product import Product
from app.models.warehouse import Location
from app.models.user import User
from app.schemas.movement import AdjustmentCreate, AdjustmentOut
from app.services.inventory_engine import record_adjustment

router = APIRouter()


def build_adjustment_out(adj: StockAdjustment) -> AdjustmentOut:
    return AdjustmentOut(
        id=adj.id,
        adjustment_number=adj.adjustment_number,
        product_id=adj.product_id,
        product_name=adj.product.name if adj.product else "",
        product_sku=adj.product.sku if adj.product else "",
        location_id=adj.location_id,
        location_name=adj.location.name if adj.location else "",
        recorded_qty=adj.recorded_qty,
        counted_qty=adj.counted_qty,
        diff_qty=adj.diff_qty,
        reason=adj.reason,
        notes=adj.notes,
        adjusted_by=adj.adjusted_by,
        created_at=adj.created_at
    )


@router.get("", response_model=List[AdjustmentOut])
def list_adjustments(db: Session = Depends(get_db)):
    adjustments = db.query(StockAdjustment).options(
        joinedload(StockAdjustment.product),
        joinedload(StockAdjustment.location)
    ).order_by(StockAdjustment.created_at.desc()).all()
    return [build_adjustment_out(a) for a in adjustments]


@router.post("", response_model=AdjustmentOut, status_code=status.HTTP_201_CREATED)
def create_stock_adjustment(
    adj_in: AdjustmentCreate,
    db: Session = Depends(get_db),
    user: Optional[User] = Depends(get_current_user)
):
    """
    Records a stock adjustment:
    - Compares recorded quantity with physical count
    - Updates location stock level to physically counted quantity
    - Generates immutable audit record in StockLedger
    """
    # 1. Validate product exists
    product = db.query(Product).filter(Product.id == adj_in.product_id).first()
    if not product:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Product with id {adj_in.product_id} not found"
        )

    # 2. Validate location exists
    location = db.query(Location).filter(Location.id == adj_in.location_id).first()
    if not location:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Location with id {adj_in.location_id} not found"
        )

    adj_by = adj_in.adjusted_by or (user.full_name if user else "Inventory Staff")
    adjustment = record_adjustment(
        db=db,
        product_id=adj_in.product_id,
        location_id=adj_in.location_id,
        counted_qty=adj_in.counted_qty,
        reason=adj_in.reason,
        notes=adj_in.notes,
        adjusted_by=adj_by,
        user_id=user.id if user else None
    )
    return build_adjustment_out(adjustment)
