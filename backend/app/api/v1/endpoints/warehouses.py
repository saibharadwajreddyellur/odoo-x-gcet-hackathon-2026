from typing import List
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session, joinedload
from app.api.deps import get_db, require_inventory_manager
from app.models.warehouse import Warehouse, Location
from app.models.user import User
from app.schemas.warehouse import (
    WarehouseCreate, WarehouseUpdate, WarehouseOut, LocationCreate, LocationUpdate, LocationOut
)

router = APIRouter()


@router.get("", response_model=List[WarehouseOut])
def list_warehouses(db: Session = Depends(get_db)):
    return db.query(Warehouse).options(joinedload(Warehouse.locations)).filter(Warehouse.is_active == True).all()


@router.post("", response_model=WarehouseOut, status_code=status.HTTP_201_CREATED)
def create_warehouse(
    wh_in: WarehouseCreate,
    db: Session = Depends(get_db),
    user: User = Depends(require_inventory_manager)
):
    existing = db.query(Warehouse).filter(Warehouse.code == wh_in.code).first()
    if existing:
        raise HTTPException(status_code=400, detail=f"Warehouse code '{wh_in.code}' already exists")
    wh = Warehouse(name=wh_in.name, code=wh_in.code, address=wh_in.address, is_active=wh_in.is_active)
    db.add(wh)
    db.commit()
    db.refresh(wh)
    return wh


@router.get("/locations", response_model=List[LocationOut])
def list_locations(warehouse_id: int = None, db: Session = Depends(get_db)):
    query = db.query(Location).filter(Location.is_active == True)
    if warehouse_id:
        query = query.filter(Location.warehouse_id == warehouse_id)
    return query.all()


@router.post("/locations", response_model=LocationOut, status_code=status.HTTP_201_CREATED)
def create_location(
    loc_in: LocationCreate,
    db: Session = Depends(get_db),
    user: User = Depends(require_inventory_manager)
):
    wh = db.query(Warehouse).filter(Warehouse.id == loc_in.warehouse_id).first()
    if not wh:
        raise HTTPException(status_code=404, detail="Warehouse not found")
    loc = Location(warehouse_id=loc_in.warehouse_id, name=loc_in.name, code=loc_in.code, is_active=loc_in.is_active)
    db.add(loc)
    db.commit()
    db.refresh(loc)
    return loc


@router.put("/locations/{location_id}", response_model=LocationOut)
def update_location(
    location_id: int,
    loc_in: LocationUpdate,
    db: Session = Depends(get_db),
    user: User = Depends(require_inventory_manager)
):
    loc = db.query(Location).filter(Location.id == location_id).first()
    if not loc:
        raise HTTPException(status_code=404, detail="Location not found")
    
    if loc_in.warehouse_id is not None:
        wh = db.query(Warehouse).filter(Warehouse.id == loc_in.warehouse_id).first()
        if not wh:
            raise HTTPException(status_code=404, detail="Warehouse not found")
        loc.warehouse_id = loc_in.warehouse_id

    if loc_in.name is not None:
        loc.name = loc_in.name
    if loc_in.code is not None:
        loc.code = loc_in.code
    if loc_in.is_active is not None:
        loc.is_active = loc_in.is_active

    db.commit()
    db.refresh(loc)
    return loc


@router.put("/{warehouse_id}", response_model=WarehouseOut)
def update_warehouse(
    warehouse_id: int,
    wh_in: WarehouseUpdate,
    db: Session = Depends(get_db),
    user: User = Depends(require_inventory_manager)
):
    wh = db.query(Warehouse).filter(Warehouse.id == warehouse_id).first()
    if not wh:
        raise HTTPException(status_code=404, detail="Warehouse not found")

    if wh_in.code is not None and wh_in.code != wh.code:
        existing = db.query(Warehouse).filter(Warehouse.code == wh_in.code).first()
        if existing:
            raise HTTPException(status_code=400, detail=f"Warehouse code '{wh_in.code}' already exists")
        wh.code = wh_in.code

    if wh_in.name is not None:
        wh.name = wh_in.name
    if wh_in.address is not None:
        wh.address = wh_in.address
    if wh_in.is_active is not None:
        wh.is_active = wh_in.is_active

    db.commit()
    db.refresh(wh)
    return wh


@router.delete("/{warehouse_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_warehouse(
    warehouse_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(require_inventory_manager)
):
    wh = db.query(Warehouse).filter(Warehouse.id == warehouse_id).first()
    if not wh:
        raise HTTPException(status_code=404, detail="Warehouse not found")
    wh.is_active = False
    db.commit()
    return None


@router.delete("/locations/{location_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_location(
    location_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(require_inventory_manager)
):
    loc = db.query(Location).filter(Location.id == location_id).first()
    if not loc:
        raise HTTPException(status_code=404, detail="Location not found")
    loc.is_active = False
    db.commit()
    return None
