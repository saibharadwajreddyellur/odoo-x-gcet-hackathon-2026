"""
StockSense — Deterministic Enterprise Data Seed Script
=======================================================
Idempotent: safe to re-run. Preserves all user/auth data.

Run from backend/ directory:
    .venv/Scripts/python.exe seed_enterprise_data.py

Strategy:
  1. Delete all non-user data (ledger → adjustments → transfer_items → transfers
     → delivery_items → deliveries → receipt_items → receipts → stock_levels
     → products → garbage categories/warehouses/locations)
  2. Upsert the 5 canonical categories
  3. Create 3 warehouses + 6 locations
  4. Create 22 products with proper SS-{CODE}-{4D} SKUs
  5. Seed historical operations: receipts, deliveries, transfers, adjustments
  6. Compute and write stock_levels + ledger from scratch
"""

import sys
import os
from datetime import datetime, timedelta

sys.path.insert(0, os.path.dirname(__file__))

from sqlalchemy import text
from app.core.database import SessionLocal, engine
from app.models import (
    Category, Warehouse, Location,
    Product, StockLevel, StockLedger,
    Receipt, ReceiptItem,
    Delivery, DeliveryItem,
    InternalTransfer, TransferItem,
    StockAdjustment,
    User,
)

db = SessionLocal()

# ---------------------------------------------------------------------------
# Helper: relative dates
# ---------------------------------------------------------------------------
NOW = datetime(2026, 9, 27, 8, 0, 0)

def dago(days: int, hour: int = 9) -> datetime:
    return NOW - timedelta(days=days, hours=0) + timedelta(hours=hour - 9)


# ---------------------------------------------------------------------------
# STEP 1 — Wipe all non-user business data (FK-safe order)
# ---------------------------------------------------------------------------
print("[1/7] Clearing existing business data ...")

db.query(StockLedger).delete()
db.query(StockAdjustment).delete()
db.query(TransferItem).delete()
db.query(InternalTransfer).delete()
db.query(DeliveryItem).delete()
db.query(Delivery).delete()
db.query(ReceiptItem).delete()
db.query(Receipt).delete()
db.query(StockLevel).delete()
db.query(Product).delete()

# Remove test/junk warehouses & locations (keep well-named ones by rebuilding all)
db.query(Location).delete()
db.query(Warehouse).delete()
db.query(Category).delete()
db.commit()

# Reset sequences so canonical entities start deterministically from ID 1
sequences_to_reset = [
    "categories_id_seq",
    "warehouses_id_seq",
    "locations_id_seq",
    "products_id_seq",
    "receipts_id_seq",
    "receipt_items_id_seq",
    "deliveries_id_seq",
    "delivery_items_id_seq",
    "internal_transfers_id_seq",
    "transfer_items_id_seq",
    "stock_adjustments_id_seq",
    "stock_ledger_id_seq",
    "stock_levels_id_seq",
]
for seq in sequences_to_reset:
    try:
        db.execute(text(f"ALTER SEQUENCE {seq} RESTART WITH 1"))
    except Exception as e:
        print(f"   Warning: could not restart {seq}: {e}")
db.commit()
print("   Done — all business tables cleared and sequences reset to 1.")


# ---------------------------------------------------------------------------
# STEP 2 — Categories (5 canonical)
# ---------------------------------------------------------------------------
print("[2/7] Creating categories ...")

CATS = [
    ("Electronics & Sensors",    "Precision IoT modules, microcontrollers, sensors and scanning equipment"),
    ("Electrical Components",     "Power supplies, relays, circuit breakers and wiring accessories"),
    ("Hardware & Tools",          "Fasteners, precision tools, hand tools and maintenance hardware"),
    ("Packaging & Storage",       "Industrial containers, label consumables, boxes and storage systems"),
    ("Industrial Equipment",      "Pneumatic, hydraulic and conveyor equipment for production lines"),
]

cat_map = {}  # name -> Category ORM object
for name, desc in CATS:
    c = Category(name=name, description=desc)
    db.add(c)
cat_objs = db.query(Category).all()  # flush after commit
db.flush()

# Re-query to get IDs
cats = {c.name: c for c in db.query(Category).all()}
ES = cats["Electronics & Sensors"]
EC = cats["Electrical Components"]
HT = cats["Hardware & Tools"]
PS = cats["Packaging & Storage"]
IE = cats["Industrial Equipment"]
print(f"   {len(cats)} categories created.")


# ---------------------------------------------------------------------------
# STEP 3 — Warehouses & Locations
# ---------------------------------------------------------------------------
print("[3/7] Creating warehouses and locations ...")

wh1 = Warehouse(name="Central Logistics Hub",    code="WH-CENTRAL", address="100 Enterprise Way, Hub 1, Industrial Estate", is_active=True)
wh2 = Warehouse(name="North Distribution Depot", code="WH-NORTH",   address="45 Commerce Blvd, North Park", is_active=True)
wh3 = Warehouse(name="South Fulfilment Centre",  code="WH-SOUTH",   address="22 Logistics Lane, South Zone", is_active=True)
db.add_all([wh1, wh2, wh3])
db.flush()

# 2 locations per warehouse
loc = {}
locs_def = [
    # (warehouse, name, code, key)
    (wh1, "Zone A — High Velocity Rack",   "WH-C-RACK-A",  "c_a"),
    (wh1, "Receiving Dock / Staging",      "WH-C-DOCK-1",  "c_dock"),
    (wh2, "Depot Bay 01 — Bulk Storage",   "WH-N-BAY-01",  "n_bay1"),
    (wh2, "Depot Bay 02 — Overstock",      "WH-N-BAY-02",  "n_bay2"),
    (wh3, "Despatch Area — Outbound",      "WH-S-DISP-1",  "s_disp"),
    (wh3, "Cold & Sensitive Storage",      "WH-S-SENS-1",  "s_sens"),
]
for wh, name, code, key in locs_def:
    l = Location(warehouse_id=wh.id, name=name, code=code, is_active=True)
    db.add(l)
    loc[key] = l
db.flush()
print(f"   3 warehouses, {len(loc)} locations created.")


# ---------------------------------------------------------------------------
# STEP 4 — Products (22 items, SS-{CODE}-{4D} SKU)
# ---------------------------------------------------------------------------
print("[4/7] Creating products ...")

PRODUCTS_DEF = [
    # (name, sku, category, uom, price, min_alert, reorder_qty, description)
    # Electronics & Sensors
    ("ESP32 Development Board",          "SS-ES-0001", ES, "Units",  18.50,  20, 50,  "Dual-core Wi-Fi/BT microcontroller for IoT prototyping"),
    ("Industrial RFID Scanner Wand",     "SS-ES-0002", ES, "Units", 185.00,  10, 20,  "Long-range wireless RFID/barcode handheld scanner"),
    ("Proximity Sensor NPN 12mm",        "SS-ES-0003", ES, "Units",  14.75,  25, 60,  "Inductive proximity sensor, NPN NO, 12mm barrel"),
    ("Industrial Temperature Sensor PT100","SS-ES-0004",ES,"Units",  38.00,  15, 30,  "PT100 RTD temperature probe, -50°C to 400°C range"),
    ("Machine Vision Camera 5MP",        "SS-ES-0005", ES, "Units", 320.00,   5, 10,  "GigE Vision 5MP monochrome industrial camera"),

    # Electrical Components
    ("24V DC Industrial Power Supply",   "SS-EC-0001", EC, "Units",  74.00,  10, 20,  "DIN-rail mount 24VDC 10A SMPS power supply"),
    ("Industrial Relay Module 10A",      "SS-EC-0002", EC, "Units",   9.20,  30, 100, "Plug-in relay module, 10A SPDT, 24VDC coil"),
    ("Circuit Breaker MCB 16A",          "SS-EC-0003", EC, "Units",   8.50,  20, 80,  "DIN-rail MCB, 16A, 1-pole, Type C curve"),
    ("Din Rail Terminal Block 4mm²",     "SS-EC-0004", EC, "Packs",   3.40,  50, 200, "Screw terminal block, 4mm², pack of 10"),
    ("Shielded Cable 4-core 1.5mm²",     "SS-EC-0005", EC, "Metres", 2.80,  100, 500, "LSZH shielded multi-core control cable"),

    # Hardware & Tools
    ("M6 Hex Bolt Set Grade 8.8",        "SS-HT-0001", HT, "Sets",   6.50,  40, 150, "M6×25mm hex bolt, washer and nut kit (50-piece)"),
    ("Digital Caliper 150mm Stainless",  "SS-HT-0002", HT, "Units",  44.00,   5, 15,  "IP54 stainless steel digital vernier caliper"),
    ("Stainless Steel Cable Ties 300mm", "SS-HT-0003", HT, "Packs",   7.80,  20, 100, "Marine-grade SS316 cable ties, pack of 50"),
    ("Torque Wrench 5–25Nm",             "SS-HT-0004", HT, "Units",  62.00,   5, 10,  "Click-type torque wrench with reversible ratchet"),
    ("Safety Industrial Gloves Cut-5",  "SS-HT-0005", HT, "Pairs",   4.10,  50, 200, "ANSI A5 cut-resistant work gloves, size L"),

    # Packaging & Storage
    ("Heavy Duty Storage Bin 60L",       "SS-PS-0001", PS, "Units",  24.00,  10, 50,  "Stackable polypropylene bin, 60L, with lid"),
    ("Thermal Label Roll 4×6 inch",      "SS-PS-0002", PS, "Rolls",  12.50,  20, 100, "Direct thermal shipping labels, 500/roll, 4×6\""),
    ("Corrugated Shipping Box 400×300×300","SS-PS-0003",PS,"Units",   1.80,  100,500, "Single-wall corrugated box, ECT-32, flat-pack"),
    ("Anti-Static Bubble Wrap 50m",      "SS-PS-0004", PS, "Rolls",  28.00,  10, 30,  "Pink anti-static 500mm×50m bubble wrap roll"),

    # Industrial Equipment
    ("Pneumatic Solenoid Valve 5/2",     "SS-IE-0001", IE, "Units",  52.00,   8, 20,  "5/2-way bistable solenoid valve, 24VDC, G1/4\""),
    ("Conveyor Belt Roller 500mm",       "SS-IE-0002", IE, "Units",  31.50,  10, 30,  "Steel idler conveyor roller, Ø50mm × 500mm"),
    ("Industrial Safety Light Curtain",  "SS-IE-0003", IE, "Units", 480.00,   3,  6,  "Type-4 SIL2 safety light curtain, 1200mm height"),
]

prod_map = {}  # sku -> Product ORM
for name, sku, cat, uom, price, min_alert, reorder, desc in PRODUCTS_DEF:
    p = Product(
        name=name, sku=sku, category_id=cat.id,
        uom=uom, unit_price=price,
        initial_stock=0,  # computed from operations
        min_stock_alert=min_alert, reorder_quantity=reorder,
        description=desc,
        created_at=dago(90),
    )
    db.add(p)
    prod_map[sku] = p

db.flush()
print(f"   {len(prod_map)} products created.")


# ---------------------------------------------------------------------------
# STEP 5 — Historical Operations
# ---------------------------------------------------------------------------
# Shortcuts for product references
es1 = prod_map["SS-ES-0001"]   # ESP32 Board
es2 = prod_map["SS-ES-0002"]   # RFID Scanner
es3 = prod_map["SS-ES-0003"]   # Proximity Sensor
es4 = prod_map["SS-ES-0004"]   # Temp Sensor
es5 = prod_map["SS-ES-0005"]   # Machine Vision Camera

ec1 = prod_map["SS-EC-0001"]   # 24V PSU
ec2 = prod_map["SS-EC-0002"]   # Relay Module
ec3 = prod_map["SS-EC-0003"]   # MCB
ec4 = prod_map["SS-EC-0004"]   # Terminal Block
ec5 = prod_map["SS-EC-0005"]   # Shielded Cable

ht1 = prod_map["SS-HT-0001"]   # M6 Bolt Set
ht2 = prod_map["SS-HT-0002"]   # Digital Caliper
ht3 = prod_map["SS-HT-0003"]   # Cable Ties
ht4 = prod_map["SS-HT-0004"]   # Torque Wrench
ht5 = prod_map["SS-HT-0005"]   # Safety Gloves

ps1 = prod_map["SS-PS-0001"]   # Storage Bin 60L
ps2 = prod_map["SS-PS-0002"]   # Thermal Label Roll
ps3 = prod_map["SS-PS-0003"]   # Corrugated Box
ps4 = prod_map["SS-PS-0004"]   # Anti-Static Bubble Wrap

ie1 = prod_map["SS-IE-0001"]   # Solenoid Valve
ie2 = prod_map["SS-IE-0002"]   # Conveyor Roller
ie3 = prod_map["SS-IE-0003"]   # Safety Light Curtain

# Location shortcuts
ca   = loc["c_a"]       # WH-CENTRAL Rack A (loc 1)
dock = loc["c_dock"]    # WH-CENTRAL Dock (loc 2)
nb1  = loc["n_bay1"]    # WH-NORTH Bay 1 (loc 3)
nb2  = loc["n_bay2"]    # WH-NORTH Bay 2 (loc 4)
sd   = loc["s_disp"]    # WH-SOUTH Despatch (loc 5)
ss   = loc["s_sens"]    # WH-SOUTH Sensitive (loc 6)

admin_user = db.query(User).filter(User.role == "admin").first()
staff_user = db.query(User).filter(User.role == "warehouse_staff").first()

print("[5/7] Creating historical operations ...")

# ------------------------------------------------------------------
# RECEIPTS — increases stock
# ------------------------------------------------------------------
receipts_def = [
    # (rec_number, supplier, status, date_ago, items: [(prod, loc, qty, unit_cost)])
    ("REC-2026-001", "TechSource Components Ltd",   "DONE", 85, dago(85),
     [(es1, ca, 100, 16.00), (es3, ca, 150, 12.50), (ec2, ca, 200, 8.00)]),

    ("REC-2026-002", "PowerGrid Supplies Ltd",      "DONE", 78, dago(78),
     [(ec1, dock, 40, 68.00), (ec3, dock, 120, 7.20), (ec4, nb1, 500, 2.80)]),

    ("REC-2026-003", "FastPack Industrial",         "DONE", 70, dago(70),
     [(ps1, nb1, 80, 20.00), (ps2, ca, 200, 10.00), (ps3, nb1, 500, 1.50), (ps3, nb2, 500, 1.50)]),

    ("REC-2026-004", "HandTool Depot Europe",       "DONE", 62, dago(62),
     [(ht1, ca, 100, 5.00), (ht1, nb2, 100, 5.00), (ht3, ca, 150, 6.50), (ht5, nb1, 300, 3.20)]),

    ("REC-2026-005", "PneumaTech Systems",          "DONE", 55, dago(55),
     [(ie1, nb1, 40, 44.00), (ie2, nb2, 60, 26.00)]),

    ("REC-2026-006", "TechSource Components Ltd",   "DONE", 48, dago(48),
     [(es2, ss, 30, 160.00), (es4, ca, 30, 32.00), (es4, ss, 30, 32.00), (es5, ss, 12, 280.00)]),

    ("REC-2026-007", "FastPack Industrial",         "DONE", 40, dago(40),
     [(ps4, nb1, 50, 24.00), (ps2, ca, 150, 10.00), (ps3, nb2, 500, 1.50)]),

    ("REC-2026-008", "HandTool Depot Europe",       "DONE", 32, dago(32),
     [(ht2, ss, 25, 38.00), (ht4, nb1, 20, 54.00), (ht1, ca, 100, 5.00)]),

    ("REC-2026-009", "PowerGrid Supplies Ltd",      "DONE", 24, dago(24),
     [(ec5, ca, 300, 2.40), (ec2, ca, 150, 8.00), (ec1, dock, 20, 68.00)]),

    ("REC-2026-010", "TechSource Components Ltd",   "DONE", 18, dago(18),
     [(es1, ca, 80, 17.00), (es3, nb1, 100, 12.50)]),

    ("REC-2026-011", "Industrial Parts Direct",     "DONE", 12, dago(12),
     [(ie1, nb1, 20, 44.00), (ie2, nb2, 30, 26.00), (ie3, ss, 5, 420.00)]),

    ("REC-2026-012", "FastPack Industrial",         "READY", 6, dago(6),
     [(ps1, nb1, 60, 20.00), (ps3, dock, 800, 1.50)]),

    ("REC-2026-013", "AutoSupply Global",           "DRAFT", 2, dago(2),
     [(ec3, dock, 100, 7.20), (ht5, nb1, 200, 3.20)]),
]

for rec_num, supplier, status, days_ago, date, items in receipts_def:
    validated_at = date + timedelta(hours=3) if status == "DONE" else None
    rec = Receipt(
        receipt_number=rec_num,
        supplier_name=supplier,
        status=status,
        receipt_date=date,
        scheduled_date=date,
        responsible_user_id=admin_user.id if admin_user else None,
        notes=f"Supplier order {rec_num}. Received and inspected.",
        created_at=date - timedelta(hours=2),
        validated_at=validated_at,
    )
    db.add(rec)
    db.flush()
    for prod, loc_obj, qty, unit_cost in items:
        db.add(ReceiptItem(
            receipt_id=rec.id,
            product_id=prod.id,
            location_id=loc_obj.id,
            quantity=qty,
            unit_cost=unit_cost,
        ))

db.flush()

# ------------------------------------------------------------------
# DELIVERIES — decreases stock
# ------------------------------------------------------------------
deliveries_def = [
    # (del_number, customer, status, date, shipping_addr, items: [(prod, loc, qty)])
    ("DEL-2026-001", "Acme Manufacturing Co",   "DONE", dago(80),
     "Unit 5, Factory Road, Leeds LS1 2AB",
     [(es1, ca, 20), (ec2, ca, 50)]),

    ("DEL-2026-002", "Nexus Automation Ltd",    "DONE", dago(74),
     "Nexus Industrial Park, Sheffield S9 1TW",
     [(ec1, dock, 8), (ec3, dock, 40)]),

    ("DEL-2026-003", "PrimePack Solutions",     "DONE", dago(67),
     "Warehouse 12, Dock Lane, Bristol BS2 0QU",
     [(ps2, ca, 60), (ps3, nb2, 300)]),

    ("DEL-2026-004", "Delta Tech Systems",      "DONE", dago(46),
     "42 Innovation Drive, Cambridge CB1 1PQ",
     [(es2, ss, 5), (es4, ss, 15)]),

    ("DEL-2026-005", "Acme Manufacturing Co",   "DONE", dago(52),
     "Unit 5, Factory Road, Leeds LS1 2AB",
     [(ht1, ca, 80), (ht3, ca, 60), (ht5, nb1, 100)]),

    ("DEL-2026-006", "Southern Logistics Plc",  "DONE", dago(45),
     "Southern Hub, Southampton SO14 3PT",
     [(ps1, nb1, 20), (ie2, nb2, 15)]),

    ("DEL-2026-007", "Nexus Automation Ltd",    "DONE", dago(20),
     "Nexus Industrial Park, Sheffield S9 1TW",
     [(ec5, ca, 80), (ec2, ca, 60)]),

    ("DEL-2026-008", "GlobalFreight Partners",  "DONE", dago(10),
     "Terminal 4, Heathrow Cargo, TW6 2GW",
     [(es5, ss, 3), (ie3, ss, 1)]),

    ("DEL-2026-009", "Acme Manufacturing Co",   "DONE", dago(16),
     "Unit 5, Factory Road, Leeds LS1 2AB",
     [(es1, ca, 30), (ec2, ca, 40), (ht5, nb1, 80)]),

    ("DEL-2026-010", "Delta Tech Systems",      "DONE", dago(14),
     "42 Innovation Drive, Cambridge CB1 1PQ",
     [(ec4, nb1, 100), (es3, nb1, 40)]),

    ("DEL-2026-011", "FastBuild Contractors",   "READY", dago(8),
     "Site Office, Canary Wharf, London E14 5AB",
     [(ht2, ss, 5), (ht4, nb1, 6), (ie1, nb1, 10)]),

    ("DEL-2026-012", "PrimePack Solutions",     "WAITING", dago(5),
     "Warehouse 12, Dock Lane, Bristol BS2 0QU",
     [(ps2, ca, 30), (ps3, dock, 200)]),

    ("DEL-2026-013", "Nexus Automation Ltd",    "DRAFT", dago(2),
     "Nexus Industrial Park, Sheffield S9 1TW",
     [(es3, ca, 25), (ec3, dock, 30)]),

    ("DEL-2026-014", "EuroTech Imports",        "CANCELLED", dago(35),
     "EuroTech, Rotterdam, Netherlands",
     [(ie2, nb2, 5), (ie1, nb1, 3)]),
]

for del_num, customer, status, date, addr, items in deliveries_def:
    validated_at = date + timedelta(hours=4) if status == "DONE" else None
    d = Delivery(
        delivery_number=del_num,
        customer_name=customer,
        status=status,
        delivery_date=date,
        scheduled_date=date + timedelta(days=1),
        responsible_user_id=staff_user.id if staff_user else admin_user.id,
        shipping_address=addr,
        notes=f"Delivery order {del_num} to {customer}.",
        created_at=date - timedelta(hours=3),
        validated_at=validated_at,
    )
    db.add(d)
    db.flush()
    for prod, loc_obj, qty in items:
        db.add(DeliveryItem(
            delivery_id=d.id,
            product_id=prod.id,
            location_id=loc_obj.id,
            quantity=qty,
        ))

db.flush()

# ------------------------------------------------------------------
# INTERNAL TRANSFERS — moves stock between locations
# ------------------------------------------------------------------
transfers_def = [
    # (trf_number, from_loc, to_loc, status, date, items: [(prod, qty)])
    ("TRF-2026-001", ca, nb1, "COMPLETED", dago(65),
     [(es1, 30), (ec2, 80)]),

    ("TRF-2026-002", nb1, sd, "COMPLETED", dago(50),
     [(ps1, 25), (ps3, 200)]),

    ("TRF-2026-003", nb2, ca, "COMPLETED", dago(42),
     [(ie2, 20), (ht1, 50)]),

    ("TRF-2026-004", dock, nb1, "COMPLETED", dago(28),
     [(ec1, 10), (ec3, 40)]),

    ("TRF-2026-005", ca, ss, "COMPLETED", dago(15),
     [(es4, 20), (ec5, 50)]),

    ("TRF-2026-006", nb1, sd, "SCHEDULED", dago(4),
     [(ht5, 50), (ps2, 40)]),

    ("TRF-2026-007", ca, nb2, "DRAFT", dago(1),
     [(ec4, 100), (ht3, 30)]),
]

for trf_num, src, dst, status, date, items in transfers_def:
    completed_at = date + timedelta(hours=2) if status == "COMPLETED" else None
    t = InternalTransfer(
        transfer_number=trf_num,
        source_location_id=src.id,
        dest_location_id=dst.id,
        status=status,
        scheduled_date=date,
        notes=f"Internal transfer {trf_num}: {src.code} -> {dst.code}",
        created_at=date - timedelta(hours=1),
        completed_at=completed_at,
    )
    db.add(t)
    db.flush()
    for prod, qty in items:
        db.add(TransferItem(transfer_id=t.id, product_id=prod.id, quantity=qty))

db.flush()

# ------------------------------------------------------------------
# STOCK ADJUSTMENTS — reconcile physical vs system
# ------------------------------------------------------------------
adjustments_def = [
    # (adj_num, prod, loc, recorded, counted, reason, notes, date)
    ("ADJ-2026-001", es1, ca,  130, 128, "Cycle Count",
     "Barcode misread during count; 2 units unaccounted", dago(72)),

    ("ADJ-2026-002", ps2, ca,  280, 275, "Damage",
     "5 label rolls damaged by forklift impact", dago(58)),

    ("ADJ-2026-003", ht5, nb1, 300, 295, "Cycle Count",
     "Minor discrepancy found in quarterly count", dago(45)),

    ("ADJ-2026-004", ec4, nb1, 500, 510, "Found Stock",
     "10 additional terminal blocks found behind racking", dago(33)),

    ("ADJ-2026-005", ps3, nb2, 400, 392, "Expiry",
     "8 damaged boxes removed after moisture exposure", dago(28)),

    ("ADJ-2026-006", es3, ca,  150, 148, "Cycle Count",
     "2 units recorded as tested/destroyed in QC", dago(20)),

    ("ADJ-2026-007", ie2, nb2,  50,  47, "Damage",
     "3 rollers bent during unloading — written off", dago(14)),

    ("ADJ-2026-008", ht1, ca,   90,  95, "Found Stock",
     "5 extra bolt sets found in unlabelled bin", dago(8)),

    ("ADJ-2026-009", ps4, nb1,  50,  49, "Cycle Count",
     "1 roll missing seal; quarantined and written off", dago(3)),
]

for adj_num, prod, loc_obj, recorded, counted, reason, notes_txt, date in adjustments_def:
    diff = counted - recorded
    db.add(StockAdjustment(
        adjustment_number=adj_num,
        product_id=prod.id,
        location_id=loc_obj.id,
        recorded_qty=recorded,
        counted_qty=counted,
        diff_qty=diff,
        reason=reason,
        notes=notes_txt,
        adjusted_by="Admin — Warehouse Count",
        created_at=date,
    ))

db.flush()
print("   Receipts, deliveries, transfers and adjustments created.")


# ------------------------------------------------------------------
# STEP 6 — Chronological Replay for Ledger & StockLevel consistency
# ------------------------------------------------------------------
print("[6/7] Replaying operations in chronological order for ledger and stock_levels ...")

events = []

# Receipts DONE
for rec in db.query(Receipt).filter(Receipt.status == "DONE").all():
    ts = rec.validated_at or rec.receipt_date
    for ri in db.query(ReceiptItem).filter(ReceiptItem.receipt_id == rec.id).all():
        events.append(dict(
            timestamp=ts,
            product_id=ri.product_id,
            location_id=ri.location_id,
            change_qty=ri.quantity,
            action_type="RECEIPT",
            reference_doc_type="Receipt",
            reference_doc_number=rec.receipt_number,
            notes=f"Stock received from {rec.supplier_name}",
        ))

# Deliveries DONE
for d in db.query(Delivery).filter(Delivery.status == "DONE").all():
    ts = d.validated_at or d.delivery_date
    for di in db.query(DeliveryItem).filter(DeliveryItem.delivery_id == d.id).all():
        events.append(dict(
            timestamp=ts,
            product_id=di.product_id,
            location_id=di.location_id,
            change_qty=-di.quantity,
            action_type="DELIVERY",
            reference_doc_type="Delivery",
            reference_doc_number=d.delivery_number,
            notes=f"Stock despatched to {d.customer_name}",
        ))

# InternalTransfers COMPLETED
for t in db.query(InternalTransfer).filter(InternalTransfer.status == "COMPLETED").all():
    ts = t.completed_at or t.scheduled_date
    src_loc = db.query(Location).filter(Location.id == t.source_location_id).first()
    dst_loc = db.query(Location).filter(Location.id == t.dest_location_id).first()
    src_code = src_loc.code if src_loc else f"loc {t.source_location_id}"
    dst_code = dst_loc.code if dst_loc else f"loc {t.dest_location_id}"
    for ti in db.query(TransferItem).filter(TransferItem.transfer_id == t.id).all():
        events.append(dict(
            timestamp=ts,
            product_id=ti.product_id,
            location_id=t.source_location_id,
            change_qty=-ti.quantity,
            action_type="TRANSFER_OUT",
            reference_doc_type="Transfer",
            reference_doc_number=t.transfer_number,
            notes=f"Transfer out to {dst_code}",
        ))
        events.append(dict(
            timestamp=ts + timedelta(minutes=5),
            product_id=ti.product_id,
            location_id=t.dest_location_id,
            change_qty=ti.quantity,
            action_type="TRANSFER_IN",
            reference_doc_type="Transfer",
            reference_doc_number=t.transfer_number,
            notes=f"Transfer in from {src_code}",
        ))

# StockAdjustments
for adj in db.query(StockAdjustment).all():
    if adj.diff_qty != 0:
        events.append(dict(
            timestamp=adj.created_at,
            product_id=adj.product_id,
            location_id=adj.location_id,
            change_qty=adj.diff_qty,
            action_type="ADJUSTMENT",
            reference_doc_type="Adjustment",
            reference_doc_number=adj.adjustment_number,
            notes=adj.notes or adj.reason or "Stock Adjustment",
        ))

# Sort all events chronologically
events.sort(key=lambda x: x["timestamp"])

stock_balance = {}
for ev in events:
    key = (ev["product_id"], ev["location_id"])
    stock_balance[key] = stock_balance.get(key, 0) + ev["change_qty"]
    db.add(StockLedger(
        timestamp=ev["timestamp"],
        product_id=ev["product_id"],
        location_id=ev["location_id"],
        change_qty=ev["change_qty"],
        balance_after=stock_balance[key],
        action_type=ev["action_type"],
        reference_doc_type=ev["reference_doc_type"],
        reference_doc_number=ev["reference_doc_number"],
        notes=ev["notes"],
    ))

# Write stock_levels from computed balances
for (product_id, location_id), qty in stock_balance.items():
    if qty > 0:
        db.add(StockLevel(
            product_id=product_id,
            location_id=location_id,
            quantity_on_hand=qty,
            reserved_quantity=0,
        ))

db.commit()
print(f"   {len(stock_balance)} stock_level records written, {len(events)} ledger entries written.")


# ------------------------------------------------------------------
# STEP 7 — Verification summary
# ------------------------------------------------------------------
print("[7/7] Verification ...")

from app.models import Category, Product, StockLevel, Receipt, Delivery, InternalTransfer, StockAdjustment, StockLedger

cat_count   = db.query(Category).count()
prod_count  = db.query(Product).count()
sl_count    = db.query(StockLevel).count()
rec_count   = db.query(Receipt).count()
del_count   = db.query(Delivery).count()
trf_count   = db.query(InternalTransfer).count()
adj_count   = db.query(StockAdjustment).count()
led_count   = db.query(StockLedger).count()

total_stock = sum(s.quantity_on_hand for s in db.query(StockLevel).all())
low_stock   = db.query(Product).join(StockLevel).filter(
    StockLevel.quantity_on_hand < Product.min_stock_alert,
    StockLevel.quantity_on_hand > 0
).count()
out_stock   = db.query(Product).outerjoin(StockLevel).filter(
    (StockLevel.id == None) | (StockLevel.quantity_on_hand == 0)
).count()

print(f"""
   +-----------------------------------------+
   |         SEED VERIFICATION SUMMARY       |
   +-----------------------------------------+
   |  Categories         : {cat_count:<5}               |
   |  Products           : {prod_count:<5}               |
   |  Stock Level Rows   : {sl_count:<5}               |
   |  Total Stock on Hand: {total_stock:<5}               |
   |  Low-stock Products : {low_stock:<5}               |
   |  Out-of-stock Prods : {out_stock:<5}               |
   +-----------------------------------------+
   |  Receipts           : {rec_count:<5}               |
   |  Deliveries         : {del_count:<5}               |
   |  Internal Transfers : {trf_count:<5}               |
   |  Stock Adjustments  : {adj_count:<5}               |
   |  Ledger Entries     : {led_count:<5}               |
   +-----------------------------------------+
""")

# Check for negative stock
neg = [(k, v) for k, v in stock_balance.items() if v < 0]
if neg:
    print(f"   WARNING: {len(neg)} negative stock balances detected! Check operations.")
else:
    print("   OK: No negative stock balances.")

# Users preserved
user_count = db.query(User).count()
print(f"   OK: {user_count} users preserved (not modified).")

db.close()
print("\n=== Seed complete. ===")

