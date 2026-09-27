"""
StockSense — Enterprise Data Re-seed (Fix: Correct Ledger Alignment)
=====================================================================
Clears ONLY ledger + stock_levels, then recomputes them correctly
from existing receipts/deliveries/transfers/adjustments using actual
DB IDs for products and locations.

Run from backend/ directory:
    .venv/Scripts/python.exe fix_ledger.py
"""

import sys, os
sys.path.insert(0, os.path.dirname(__file__))

from datetime import datetime, timedelta
from app.core.database import SessionLocal
from app.models import (
    Product, StockLevel, StockLedger,
    Receipt, ReceiptItem,
    Delivery, DeliveryItem,
    InternalTransfer, TransferItem,
    StockAdjustment,
    Location,
)

db = SessionLocal()

# -------------------------------------------------------------------
# 1. Clear ledger and stock_levels only
# -------------------------------------------------------------------
print("[1/4] Clearing ledger and stock_levels ...")
db.query(StockLedger).delete()
db.query(StockLevel).delete()
db.commit()
print("   Done.")

# -------------------------------------------------------------------
# 2. Replay all operations in date order to build running balances
# -------------------------------------------------------------------
print("[2/4] Replaying operations to build ledger ...")

# Running balance: (product_id, location_id) -> int
balance = {}

def get_bal(pid, lid):
    return balance.get((pid, lid), 0)

def apply(pid, lid, delta):
    balance[(pid, lid)] = get_bal(pid, lid) + delta

ledger_rows = []

def ledger_entry(pid, lid, change, action, ref_type, ref_num, ts, notes=""):
    apply(pid, lid, change)
    bal_after = get_bal(pid, lid)
    ledger_rows.append(StockLedger(
        timestamp=ts,
        product_id=pid,
        location_id=lid,
        change_qty=change,
        balance_after=bal_after,
        action_type=action,
        reference_doc_type=ref_type,
        reference_doc_number=ref_num,
        notes=notes,
    ))

# --- DONE Receipts (stock IN) ---
done_receipts = (
    db.query(Receipt)
    .filter(Receipt.status == "DONE")
    .order_by(Receipt.validated_at)
    .all()
)
for rec in done_receipts:
    ts = rec.validated_at or rec.receipt_date
    for item in db.query(ReceiptItem).filter(ReceiptItem.receipt_id == rec.id).all():
        ledger_entry(
            item.product_id, item.location_id, item.quantity,
            "RECEIPT", "Receipt", rec.receipt_number, ts,
            f"Received from {rec.supplier_name}"
        )

# --- DONE Deliveries (stock OUT) ---
done_deliveries = (
    db.query(Delivery)
    .filter(Delivery.status == "DONE")
    .order_by(Delivery.validated_at)
    .all()
)
for d in done_deliveries:
    ts = d.validated_at or d.delivery_date
    for item in db.query(DeliveryItem).filter(DeliveryItem.delivery_id == d.id).all():
        ledger_entry(
            item.product_id, item.location_id, -item.quantity,
            "DELIVERY", "Delivery", d.delivery_number, ts,
            f"Despatched to {d.customer_name}"
        )

# --- COMPLETED Transfers (TRANSFER_OUT then TRANSFER_IN) ---
done_transfers = (
    db.query(InternalTransfer)
    .filter(InternalTransfer.status == "COMPLETED")
    .order_by(InternalTransfer.completed_at)
    .all()
)
for t in done_transfers:
    ts = t.completed_at or t.scheduled_date
    for item in db.query(TransferItem).filter(TransferItem.transfer_id == t.id).all():
        ledger_entry(
            item.product_id, t.source_location_id, -item.quantity,
            "TRANSFER_OUT", "Transfer", t.transfer_number, ts,
            f"Transfer out to location {t.dest_location_id}"
        )
        ledger_entry(
            item.product_id, t.dest_location_id, item.quantity,
            "TRANSFER_IN", "Transfer", t.transfer_number, ts + timedelta(minutes=5),
            f"Transfer in from location {t.source_location_id}"
        )

# --- Stock Adjustments ---
adjs = db.query(StockAdjustment).order_by(StockAdjustment.created_at).all()
for adj in adjs:
    if adj.diff_qty != 0:
        ledger_entry(
            adj.product_id, adj.location_id, adj.diff_qty,
            "ADJUSTMENT", "Adjustment", adj.adjustment_number,
            adj.created_at, adj.notes or adj.reason
        )

print(f"   Computed {len(ledger_rows)} ledger entries from operations.")
print(f"   Computed {len(balance)} product-location stock positions.")

# -------------------------------------------------------------------
# 3. Write stock_levels and ledger to DB
# -------------------------------------------------------------------
print("[3/4] Writing stock_levels and ledger ...")

for (pid, lid), qty in balance.items():
    sl = StockLevel(
        product_id=pid,
        location_id=lid,
        quantity_on_hand=max(0, qty),
        reserved_quantity=0,
    )
    db.add(sl)

for row in ledger_rows:
    db.add(row)

db.commit()
print(f"   {len(balance)} stock_level rows written.")
print(f"   {len(ledger_rows)} ledger rows written.")

# -------------------------------------------------------------------
# 4. Verification
# -------------------------------------------------------------------
print("[4/4] Verification ...")

all_sl = db.query(StockLevel).all()
mismatches = 0
for sl in all_sl:
    entries = (
        db.query(StockLedger)
        .filter(
            StockLedger.product_id == sl.product_id,
            StockLedger.location_id == sl.location_id,
        )
        .order_by(StockLedger.timestamp)
        .all()
    )
    if entries:
        last_bal = entries[-1].balance_after
        if last_bal != sl.quantity_on_hand:
            loc = db.query(Location).filter(Location.id == sl.location_id).first()
            prod = db.query(Product).filter(Product.id == sl.product_id).first()
            print(f"  MISMATCH: {prod.sku} @ {loc.code}: ledger_last={last_bal}, stock_level={sl.quantity_on_hand}")
            mismatches += 1

if mismatches == 0:
    print("  OK - All ledger final balances match stock_levels.")
else:
    print(f"  WARNING: {mismatches} mismatches found.")

# Stock summary
products = db.query(Product).all()
print("\n=== STOCK SUMMARY ===")
for p in sorted(products, key=lambda x: x.sku):
    total = sum(sl.quantity_on_hand for sl in db.query(StockLevel).filter(StockLevel.product_id == p.id).all())
    status = "OUT" if total == 0 else ("LOW" if total < p.min_stock_alert else "OK ")
    print(f"  [{status}] {p.sku} | {p.name[:38]:<38} | qty={total:<5} | min={p.min_stock_alert}")

total_stock = sum(sl.quantity_on_hand for sl in db.query(StockLevel).all())
led_count = db.query(StockLedger).count()
sl_count = db.query(StockLevel).count()

print(f"""
  Total stock on hand : {total_stock}
  StockLevel rows     : {sl_count}
  Ledger entries      : {led_count}
""")

db.close()
print("=== Ledger fix complete. ===")
