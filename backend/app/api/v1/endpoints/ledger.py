from typing import List, Optional
from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session, joinedload
from app.api.deps import get_db
from app.models.ledger import StockLedger
from app.models.warehouse import Location
from app.schemas.ledger import StockLedgerOut

router = APIRouter()


@router.get("", response_model=List[StockLedgerOut])
def get_stock_ledger(
    product_id: Optional[int] = None,
    location_id: Optional[int] = None,
    action_type: Optional[str] = None,
    search: Optional[str] = None,
    limit: int = Query(100, le=500),
    offset: int = 0,
    db: Session = Depends(get_db)
):
    """
    Query the immutable stock ledger with comprehensive filtering.
    """
    query = db.query(StockLedger).options(
        joinedload(StockLedger.product),
        joinedload(StockLedger.location).joinedload(Location.warehouse),
        joinedload(StockLedger.user)
    )

    if product_id:
        query = query.filter(StockLedger.product_id == product_id)
    if location_id:
        query = query.filter(StockLedger.location_id == location_id)
    if action_type:
        query = query.filter(StockLedger.action_type == action_type.upper())
    if search:
        search_fmt = f"%{search}%"
        query = query.filter(
            (StockLedger.reference_doc_number.ilike(search_fmt)) |
            (StockLedger.notes.ilike(search_fmt))
        )

    entries = query.order_by(StockLedger.timestamp.desc()).offset(offset).limit(limit).all()

    return [
        StockLedgerOut(
            id=e.id,
            timestamp=e.timestamp,
            product_id=e.product_id,
            product_name=e.product.name if e.product else "",
            product_sku=e.product.sku if e.product else "",
            location_id=e.location_id,
            location_name=e.location.name if e.location else "",
            warehouse_name=e.location.warehouse.name if (e.location and e.location.warehouse) else "",
            change_qty=e.change_qty,
            balance_after=e.balance_after,
            action_type=e.action_type,
            reference_doc_type=e.reference_doc_type,
            reference_doc_number=e.reference_doc_number,
            user_id=e.user_id,
            user_email=e.user.email if e.user else "System",
            notes=e.notes
        )
        for e in entries
    ]
