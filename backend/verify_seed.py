"""Verify DB state after seeding."""
import sys, os
sys.path.insert(0, os.path.dirname(__file__))

from app.core.database import SessionLocal
from app.models import (
    Category, Product, StockLevel, Receipt, Delivery,
    InternalTransfer, StockAdjustment, StockLedger, Warehouse, Location, User
)

db = SessionLocal()

print("\n=== CATEGORIES ===")
for c in db.query(Category).order_by(Category.id).all():
    print(f"  [{c.id}] {c.name}")

print("\n=== WAREHOUSES / LOCATIONS ===")
for w in db.query(Warehouse).all():
    locs = db.query(Location).filter(Location.warehouse_id == w.id).all()
    print(f"  {w.code}: {w.name}")
    for l in locs:
        print(f"    -> {l.code}: {l.name}")

print("\n=== PRODUCTS ===")
for p in db.query(Product).order_by(Product.sku).all():
    cat = db.query(Category).filter(Category.id == p.category_id).first()
    total_stock = sum(sl.quantity_on_hand for sl in db.query(StockLevel).filter(StockLevel.product_id == p.id).all())
    status = "OUT" if total_stock == 0 else ("LOW" if total_stock < p.min_stock_alert else "OK ")
    print(f"  [{status}] {p.sku} | {p.name[:40]:<40} | stock={total_stock:<5} | min={p.min_stock_alert}")

cat_count = db.query(Category).count()
prod_count = db.query(Product).count()
sl_count = db.query(StockLevel).count()
total_stock = sum(s.quantity_on_hand for s in db.query(StockLevel).all())
rec_count = db.query(Receipt).count()
del_count = db.query(Delivery).count()
trf_count = db.query(InternalTransfer).count()
adj_count = db.query(StockAdjustment).count()
led_count = db.query(StockLedger).count()
user_count = db.query(User).count()

low_stock_prods = []
out_stock_prods = []
for p in db.query(Product).all():
    total = sum(sl.quantity_on_hand for sl in db.query(StockLevel).filter(StockLevel.product_id == p.id).all())
    if total == 0:
        out_stock_prods.append(p.name)
    elif total < p.min_stock_alert:
        low_stock_prods.append(p.name)

print(f"""
=== VERIFICATION SUMMARY ===
  Categories         : {cat_count}
  Products           : {prod_count}
  Stock Level Rows   : {sl_count}
  Total Stock on Hand: {total_stock}
  Low-stock Products : {len(low_stock_prods)}
  Out-of-stock Prods : {len(out_stock_prods)}
  ---
  Receipts           : {rec_count}
  Deliveries         : {del_count}
  Internal Transfers : {trf_count}
  Stock Adjustments  : {adj_count}
  Ledger Entries     : {led_count}
  ---
  Users (preserved)  : {user_count}
""")

print(f"Low stock: {low_stock_prods}")
print(f"Out of stock: {out_stock_prods}")

# Verify no orphaned stock_levels
bad_sl = [s for s in db.query(StockLevel).all() if s.product_id not in [p.id for p in db.query(Product).all()]]
print(f"\nOrphaned StockLevel rows: {len(bad_sl)}")

# Verify ledger totals match stock_levels
print("\n=== LEDGER vs STOCK_LEVEL RECONCILIATION (sample) ===")
mismatches = 0
for p in db.query(Product).all():
    for sl in db.query(StockLevel).filter(StockLevel.product_id == p.id).all():
        # sum ledger for this product+location
        entries = db.query(StockLedger).filter(
            StockLedger.product_id == p.id,
            StockLedger.location_id == sl.location_id
        ).order_by(StockLedger.timestamp).all()
        if entries:
            last_balance = entries[-1].balance_after
            if last_balance != sl.quantity_on_hand:
                print(f"  MISMATCH: {p.sku} @ loc {sl.location_id}: ledger_last={last_balance}, stock_level={sl.quantity_on_hand}")
                mismatches += 1

if mismatches == 0:
    print("  OK - All ledger final balances match stock_levels.")

db.close()
