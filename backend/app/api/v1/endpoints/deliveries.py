from datetime import datetime
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session, joinedload
from app.api.deps import get_db, get_current_user, require_inventory_manager, require_warehouse_staff
from app.models.delivery import Delivery, DeliveryItem
from app.models.warehouse import Location, Warehouse
from app.models.product import Product, StockLevel
from app.models.user import User
from app.schemas.movement import DeliveryCreate, DeliveryOut, DeliveryItemOut
from app.services.inventory_engine import validate_delivery

router = APIRouter()


def build_delivery_out(deliv: Delivery) -> DeliveryOut:
    return DeliveryOut(
        id=deliv.id,
        delivery_number=deliv.delivery_number,
        customer_name=deliv.customer_name,
        status=deliv.status,
        delivery_date=deliv.delivery_date,
        scheduled_date=deliv.scheduled_date,
        responsible_user_id=deliv.responsible_user_id,
        responsible_user_name=deliv.responsible_user.full_name if deliv.responsible_user else None,
        shipping_address=deliv.shipping_address,
        notes=deliv.notes,
        created_at=deliv.created_at,
        validated_at=deliv.validated_at,
        items=[
            DeliveryItemOut(
                id=item.id,
                product_id=item.product_id,
                product_name=item.product.name if item.product else "",
                product_sku=item.product.sku if item.product else "",
                location_id=item.location_id,
                location_name=item.location.name if item.location else "",
                quantity=item.quantity
            )
            for item in deliv.items
        ]
    )


@router.get("", response_model=List[DeliveryOut])
def list_deliveries(status_filter: Optional[str] = None, db: Session = Depends(get_db)):
    query = db.query(Delivery).options(
        joinedload(Delivery.responsible_user),
        joinedload(Delivery.items).joinedload(DeliveryItem.product),
        joinedload(Delivery.items).joinedload(DeliveryItem.location)
    )
    if status_filter:
        query = query.filter(Delivery.status == status_filter.upper())
    deliveries = query.order_by(Delivery.created_at.desc()).all()
    return [build_delivery_out(d) for d in deliveries]


@router.get("/{delivery_id}", response_model=DeliveryOut)
def get_delivery(delivery_id: int, db: Session = Depends(get_db)):
    delivery = db.query(Delivery).options(
        joinedload(Delivery.responsible_user),
        joinedload(Delivery.items).joinedload(DeliveryItem.product),
        joinedload(Delivery.items).joinedload(DeliveryItem.location)
    ).filter(Delivery.id == delivery_id).first()
    if not delivery:
        raise HTTPException(status_code=404, detail="Delivery order not found")
    return build_delivery_out(delivery)


@router.post("", response_model=DeliveryOut, status_code=status.HTTP_201_CREATED)
def create_delivery(
    delivery_in: DeliveryCreate,
    db: Session = Depends(get_db),
    user: Optional[User] = Depends(require_inventory_manager)
):
    if not delivery_in.items:
        raise HTTPException(status_code=400, detail="Delivery order must contain at least one item")

    # Determine warehouse prefix from first item's location
    wh_code = "WH"
    first_loc = db.query(Location).filter(Location.id == delivery_in.items[0].location_id).first()
    if first_loc and first_loc.warehouse:
        wh_code = first_loc.warehouse.code

    count = db.query(Delivery).count() + 1
    del_num = f"{wh_code}/OUT/{count:04d}"

    responsible_id = delivery_in.responsible_user_id or (user.id if user else None)

    delivery = Delivery(
        delivery_number=del_num,
        customer_name=delivery_in.customer_name,
        status="DRAFT",
        delivery_date=delivery_in.delivery_date or datetime.utcnow(),
        scheduled_date=delivery_in.scheduled_date or datetime.utcnow(),
        responsible_user_id=responsible_id,
        shipping_address=delivery_in.shipping_address,
        notes=delivery_in.notes
    )
    db.add(delivery)
    db.flush()

    for item in delivery_in.items:
        d_item = DeliveryItem(
            delivery_id=delivery.id,
            product_id=item.product_id,
            location_id=item.location_id,
            quantity=item.quantity
        )
        db.add(d_item)

    db.commit()
    db.refresh(delivery)
    return build_delivery_out(delivery)


@router.post("/{delivery_id}/check_availability", response_model=DeliveryOut)
def check_and_advance_to_waiting_or_ready(
    delivery_id: int,
    db: Session = Depends(get_db),
    user: Optional[User] = Depends(require_warehouse_staff)
):
    """
    Checks stock availability for all items and advances status:
    - DRAFT → WAITING  (if any item has insufficient stock)
    - DRAFT → READY    (if all items have sufficient stock)

    No stock is reserved or deducted at this stage.
    """
    delivery = db.query(Delivery).filter(Delivery.id == delivery_id).first()
    if not delivery:
        raise HTTPException(status_code=404, detail="Delivery order not found")
    if delivery.status != "DRAFT":
        raise HTTPException(
            status_code=400,
            detail=f"Availability check only applies to DRAFT deliveries. Current status: {delivery.status}"
        )

    # Assign responsible user if not yet set
    if not delivery.responsible_user_id and user:
        delivery.responsible_user_id = user.id

    # Check all items against current stock levels
    all_available = True
    for item in delivery.items:
        level = db.query(StockLevel).filter(
            StockLevel.product_id == item.product_id,
            StockLevel.location_id == item.location_id
        ).first()
        available_qty = level.quantity_on_hand if level else 0
        if available_qty < item.quantity:
            all_available = False
            break

    delivery.status = "READY" if all_available else "WAITING"
    db.commit()
    db.refresh(delivery)
    return build_delivery_out(delivery)


@router.post("/{delivery_id}/mark_ready", response_model=DeliveryOut)
def mark_delivery_ready(
    delivery_id: int,
    db: Session = Depends(get_db),
    user: Optional[User] = Depends(require_warehouse_staff)
):
    """
    Manually marks a WAITING delivery as READY after stock becomes available.
    Re-checks availability before allowing the transition.
    WAITING → READY (if stock is now sufficient)
    """
    delivery = db.query(Delivery).filter(Delivery.id == delivery_id).first()
    if not delivery:
        raise HTTPException(status_code=404, detail="Delivery order not found")
    if delivery.status != "WAITING":
        raise HTTPException(
            status_code=400,
            detail=f"Only WAITING deliveries can be marked Ready. Current status: {delivery.status}"
        )

    # Re-check stock availability before allowing transition to READY
    insufficient = []
    for item in delivery.items:
        level = db.query(StockLevel).filter(
            StockLevel.product_id == item.product_id,
            StockLevel.location_id == item.location_id
        ).first()
        available_qty = level.quantity_on_hand if level else 0
        if available_qty < item.quantity:
            prod = db.query(Product).filter(Product.id == item.product_id).first()
            p_name = prod.name if prod else f"ID {item.product_id}"
            insufficient.append(
                f"{p_name}: need {item.quantity}, have {available_qty}"
            )

    if insufficient:
        raise HTTPException(
            status_code=400,
            detail=f"Insufficient stock — cannot mark as Ready. Shortfalls: {'; '.join(insufficient)}"
        )

    delivery.status = "READY"
    db.commit()
    db.refresh(delivery)
    return build_delivery_out(delivery)


@router.post("/{delivery_id}/validate", response_model=DeliveryOut)
def validate_delivery_endpoint(
    delivery_id: int,
    db: Session = Depends(get_db),
    user: Optional[User] = Depends(require_warehouse_staff)
):
    """
    Validates a delivery: READY → DONE.
    - Requires READY status (enforces proper workflow)
    - Verifies stock availability one final time
    - Atomically deducts stock from each pick location
    - Generates immutable StockLedger audit records
    Stock changes happen exactly once here.
    """
    delivery = db.query(Delivery).filter(Delivery.id == delivery_id).first()
    if not delivery:
        raise HTTPException(status_code=404, detail="Delivery order not found")
    if delivery.status != "READY":
        raise HTTPException(
            status_code=400,
            detail=f"Only READY deliveries can be validated. Current status: {delivery.status}. "
                   f"Complete the availability check first."
        )
    updated_delivery = validate_delivery(db=db, delivery_id=delivery_id, user_id=user.id if user else None)
    return build_delivery_out(updated_delivery)


@router.post("/{delivery_id}/cancel", response_model=DeliveryOut)
def cancel_delivery(
    delivery_id: int,
    db: Session = Depends(get_db),
    user: Optional[User] = Depends(require_inventory_manager)
):
    """
    Cancels a delivery. Only allowed when the delivery has NOT been validated (DONE).
    No stock rollback is required because stock was never deducted.
    """
    delivery = db.query(Delivery).filter(Delivery.id == delivery_id).first()
    if not delivery:
        raise HTTPException(status_code=404, detail="Delivery order not found")
    if delivery.status == "DONE":
        raise HTTPException(
            status_code=400,
            detail="Cannot cancel a completed delivery — stock has already been deducted."
        )
    if delivery.status == "CANCELLED":
        raise HTTPException(status_code=400, detail="Delivery is already cancelled")

    delivery.status = "CANCELLED"
    db.commit()
    db.refresh(delivery)
    return build_delivery_out(delivery)
