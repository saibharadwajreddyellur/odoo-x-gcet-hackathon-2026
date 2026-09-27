"""
StockSense — Final Ledger + Stock Level Reconciliation
======================================================
Uses operations as source of truth. Clears stock_levels and ledger,
replays all DONE/COMPLETED operations in date order,
writes consistent stock_levels equal to computed balances.

Run from backend/ directory:
    .venv/Scripts/python.exe fix_ledger_final.py
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
    StockAdjustment, Location,
)

db = SessionLocal()

# Step 1: Clear
print("[1/4] Clearing stock_levels and ledger ...")
db.query(StockLedger).delete()
db.query(StockLevel).delete()
db.commit()

# Step 2: Replay all completed operations in chronological order
print("[2/4] Replaying operations ...")

balance = {}  # (product_id, location_id) -> qty

def get_bal(pid, lid):
    return balance.get((pid, lid), 0)

def apply_delta(pid, lid, delta):
    balance[(pid, lid)] = get_bal(pid, lid) + delta

ledger_rows = []

def add_ledger(pid, lid, change, action, ref_type, ref_num, ts, notes=""):
    apply_delta(pid, lid, change)
    ledger_rows.append(dict(
        timestamp=ts,
        product_id=pid,
        location_id=lid,
        change_qty=change,
        balance_after=get_bal(pid, lid),
        action_type=action,
        reference_doc_type=ref_type,
        reference_doc_number=ref_num,
        notes=notes,
    ))

# Build a chronological event list
events = []

# DONE receipts
for rec in db.query(Receipt).filter(Receipt.status == "DONE").all():
    ts = rec.validated_at or rec.receipt_date
    for item in db.query(ReceiptItem).filter(ReceiptItem.receipt_id == rec.id).all():
        events.append((ts, "RECEIPT", rec, item, None))

# DONE deliveries
for d in db.query(Delivery).filter(Delivery.status == "DONE").all():
    ts = d.validated_at or d.delivery_date
    for item in db.query(DeliveryItem).filter(DeliveryItem.delivery_id == d.id).all():
        events.append((ts, "DELIVERY", d, item, None))

# COMPLETED transfers
for t in db.query(InternalTransfer).filter(InternalTransfer.status == "COMPLETED").all():
    ts = t.completed_at or t.scheduled_date
    for item in db.query(TransferItem).filter(TransferItem.transfer_id == t.id).all():
        events.append((ts, "TRANSFER", t, item, None))

# Adjustments
for adj in db.query(StockAdjustment).all():
    if adj.diff_qty != 0:
        events.append((adj.created_at, "ADJUSTMENT", adj, None, None))

# Sort everything by timestamp
events.sort(key=lambda e: e[0])

# Process events
for ts, kind, doc, item, _ in events:
    if kind == "RECEIPT":
        add_ledger(item.product_id, item.location_id, item.quantity,
                   "RECEIPT", "Receipt", doc.receipt_number, ts,
                   f"Received from {doc.supplier_name}")
    elif kind == "DELIVERY":
        add_ledger(item.product_id, item.location_id, -item.quantity,
                   "DELIVERY", "Delivery", doc.delivery_number, ts,
                   f"Despatched to {doc.customer_name}")
    elif kind == "TRANSFER":
        add_ledger(item.product_id, doc.source_location_id, -item.quantity,
                   "TRANSFER_OUT", "Transfer", doc.transfer_number, ts,
                   f"Transfer out to loc {doc.dest_location_id}")
        add_ledger(item.product_id, doc.dest_location_id, item.quantity,
                   "TRANSFER_IN", "Transfer", doc.transfer_number,
                   ts + timedelta(minutes=5),
                   f"Transfer in from loc {doc.source_location_id}")
    elif kind == "ADJUSTMENT":
        add_ledger(doc.product_id, doc.location_id, doc.diff_qty,
                   "ADJUSTMENT", "Adjustment", doc.adjustment_number,
                   doc.created_at, doc.notes or doc.reason)

print(f"   {len(ledger_rows)} ledger entries computed.")
print(f"   {len(balance)} product-location positions.")

# Step 3: Write ledger rows
print("[3/4] Writing ledger and stock_levels ...")

for row in ledger_rows:
    db.add(StockLedger(**row))

# Stock levels from computed balance (no hardcoding)
for (pid, lid), qty in balance.items():
    final_qty = max(0, qty)  # never negative
    db.add(StockLevel(
        product_id=pid,
        location_id=lid,
        quantity_on_hand=final_qty,
        reserved_quantity=0,
    ))

db.commit()

# Step 4: Verify
print("[4/4] Verifying ledger vs stock_levels ...")

all_sl = db.query(StockLevel).all()
mismatches = 0
for sl in all_sl:
    last = (
        db.query(StockLedger)
        .filter(StockLedger.product_id == sl.product_id, StockLedger.location_id == sl.location_id)
        .order_by(StockLedger.timestamp, StockLedger.id)
        .all()
    )
    if not last:
        continue
    last_bal = last[-1].balance_after
    # balance_after can go negative but stock_level is clamped to 0
    expected = max(0, last_bal)
    if expected != sl.quantity_on_hand:
        loc = db.query(Location).filter(Location.id == sl.location_id).first()
        prod = db.query(Product).filter(Product.id == sl.product_id).first()
        print(f"  MISMATCH: {prod.sku} @ {loc.code}: ledger_last_bal={last_bal}, sl={sl.quantity_on_hand}")
        mismatches += 1

if mismatches == 0:
    print("  OK - All stock_levels consistent with ledger.")
else:
    print(f"  {mismatches} mismatch(es) remain.")

# Summary
total = sum(sl.quantity_on_hand for sl in db.query(StockLevel).all())
led_ct = db.query(StockLedger).count()
sl_ct  = db.query(StockLevel).count()

print("\n=== FINAL STOCK SUMMARY ===")
for p in sorted(db.query(Product).all(), key=lambda x: x.sku):
    qty = sum(sl.quantity_on_hand for sl in db.query(StockLevel).filter(StockLevel.product_id == p.id).all())
    status = "OUT" if qty == 0 else ("LOW" if qty < p.min_stock_alert else "OK ")
    print(f"  [{status}] {p.sku} | {p.name[:38]:<38} | qty={qty:<5} | min={p.min_stock_alert}")

print(f"\n  Total stock  : {total}")
print(f"  Stock rows   : {sl_ct}")
print(f"  Ledger rows  : {led_ct}")
print(f"  Users (safe) : {db.query(__import__('app.models', fromlist=['User']).User).count()}")

db.close()
print("\n=== Done. ===")
