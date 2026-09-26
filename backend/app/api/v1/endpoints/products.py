from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session, joinedload
from app.api.deps import get_db, get_current_user, require_inventory_manager
from app.models.product import Product, StockLevel
from app.models.category import Category
from app.models.warehouse import Location
from app.models.user import User
from app.schemas.product import (
    ProductCreate, ProductUpdate, ProductOut, StockLevelOut,
    CategoryCreate, CategoryOut
)
from app.services.inventory_engine import get_or_create_stock_level, record_ledger_entry

router = APIRouter()


# --- Categories ---
@router.get("/categories", response_model=List[CategoryOut])
def list_categories(db: Session = Depends(get_db)):
    return db.query(Category).order_by(Category.name.asc()).all()


@router.post("/categories", response_model=CategoryOut, status_code=status.HTTP_201_CREATED)
def create_category(
    category_in: CategoryCreate,
    db: Session = Depends(get_db),
    user: User = Depends(require_inventory_manager)
):
    existing = db.query(Category).filter(Category.name == category_in.name).first()
    if existing:
        raise HTTPException(status_code=400, detail="Category already exists")
    cat = Category(name=category_in.name, description=category_in.description)
    db.add(cat)
    db.commit()
    db.refresh(cat)
    return cat


# --- Products ---
def build_product_out(p: Product) -> ProductOut:
    prod_stock = sum(sl.quantity_on_hand for sl in p.stock_levels)
    if prod_stock == 0:
        stock_status = "OUT_OF_STOCK"
    elif prod_stock <= p.min_stock_alert:
        stock_status = "LOW_STOCK"
    else:
        stock_status = "IN_STOCK"

    return ProductOut(
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
        stock_status=stock_status,
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
            for sl in p.stock_levels
        ]
    )


@router.get("", response_model=List[ProductOut])
def list_products(
    search: Optional[str] = None,
    category_id: Optional[int] = None,
    stock_status: Optional[str] = None,
    db: Session = Depends(get_db)
):
    query = db.query(Product).options(
        joinedload(Product.category),
        joinedload(Product.stock_levels).joinedload(StockLevel.location).joinedload(Location.warehouse)
    )
    if search:
        search_fmt = f"%{search}%"
        query = query.filter((Product.name.ilike(search_fmt)) | (Product.sku.ilike(search_fmt)))
    if category_id:
        query = query.filter(Product.category_id == category_id)

    products = query.order_by(Product.name.asc()).all()
    results = [build_product_out(p) for p in products]

    if stock_status:
        results = [r for r in results if r.stock_status.upper() == stock_status.upper()]

    return results


@router.post("", response_model=ProductOut, status_code=status.HTTP_201_CREATED)
def create_product(
    prod_in: ProductCreate,
    db: Session = Depends(get_db),
    user: User = Depends(require_inventory_manager)
):
    existing = db.query(Product).filter(Product.sku == prod_in.sku).first()
    if existing:
        raise HTTPException(status_code=400, detail=f"Product with SKU '{prod_in.sku}' already exists")

    product = Product(
        name=prod_in.name,
        sku=prod_in.sku,
        category_id=prod_in.category_id,
        uom=prod_in.uom,
        unit_price=prod_in.unit_price,
        initial_stock=prod_in.initial_stock,
        min_stock_alert=prod_in.min_stock_alert,
        reorder_quantity=prod_in.reorder_quantity,
        description=prod_in.description
    )
    db.add(product)
    db.flush()

    # If initial stock is specified with a location, assign it and log to ledger
    if prod_in.initial_stock > 0 and prod_in.initial_location_id:
        level = get_or_create_stock_level(db, product.id, prod_in.initial_location_id)
        level.quantity_on_hand = prod_in.initial_stock
        db.flush()

        record_ledger_entry(
            db=db,
            product_id=product.id,
            location_id=prod_in.initial_location_id,
            change_qty=prod_in.initial_stock,
            balance_after=prod_in.initial_stock,
            action_type="INITIAL",
            doc_type="ProductCreation",
            doc_number=product.sku,
            user_id=user.id if user else None,
            notes="Initial stock allocation on product creation"
        )

    db.commit()
    db.refresh(product)
    return build_product_out(product)


@router.get("/{product_id}", response_model=ProductOut)
def get_product(product_id: int, db: Session = Depends(get_db)):
    product = db.query(Product).options(
        joinedload(Product.category),
        joinedload(Product.stock_levels).joinedload(StockLevel.location).joinedload(Location.warehouse)
    ).filter(Product.id == product_id).first()
    if not product:
        raise HTTPException(status_code=404, detail="Product not found")
    return build_product_out(product)


@router.put("/{product_id}", response_model=ProductOut)
def update_product(
    product_id: int,
    prod_in: ProductUpdate,
    db: Session = Depends(get_db),
    user: User = Depends(require_inventory_manager)
):
    product = db.query(Product).filter(Product.id == product_id).first()
    if not product:
        raise HTTPException(status_code=404, detail="Product not found")

    update_data = prod_in.model_dump(exclude_unset=True)
    for field, val in update_data.items():
        setattr(product, field, val)

    db.commit()
    db.refresh(product)
    return build_product_out(product)


@router.delete("/{product_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_product(
    product_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(require_inventory_manager)
):
    product = db.query(Product).filter(Product.id == product_id).first()
    if not product:
        raise HTTPException(status_code=404, detail="Product not found")
    db.delete(product)
    db.commit()
    return None
