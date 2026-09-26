"""Quick DB inspection — run before seeding."""
import sys, os
sys.path.insert(0, os.path.dirname(__file__))

from app.core.database import SessionLocal
from app.models import (
    User, Category, Product, Warehouse, Location,
    Receipt, Delivery, InternalTransfer, StockAdjustment, StockLedger, StockLevel
)

db = SessionLocal()

sections = {
    "USERS":        db.query(User).all(),
    "CATEGORIES":   db.query(Category).all(),
    "WAREHOUSES":   db.query(Warehouse).all(),
    "LOCATIONS":    db.query(Location).all(),
    "PRODUCTS":     db.query(Product).all(),
}

for title, rows in sections.items():
    print(f"\n=== {title} ({len(rows)}) ===")
    for r in rows:
        if title == "USERS":
            print(f"  [{r.id}] {r.email}  role={r.role}")
        elif title == "CATEGORIES":
            print(f"  [{r.id}] {r.name}")
        elif title == "WAREHOUSES":
            print(f"  [{r.id}] {r.code}  {r.name}")
        elif title == "LOCATIONS":
            print(f"  [{r.id}] {r.code}  wh={r.warehouse_id}")
        elif title == "PRODUCTS":
            print(f"  [{r.id}] {r.sku}  {r.name}  cat={r.category_id}")

counts = [
    ("stock_levels", StockLevel), ("receipts", Receipt), ("deliveries", Delivery),
    ("internal_transfers", InternalTransfer), ("stock_adjustments", StockAdjustment),
    ("stock_ledger", StockLedger),
]
print("\n=== TABLE COUNTS ===")
for name, model in counts:
    print(f"  {name}: {db.query(model).count()}")

db.close()
