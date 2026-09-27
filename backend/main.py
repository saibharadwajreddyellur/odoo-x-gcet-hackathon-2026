import logging
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.core.config import settings
from app.core.database import engine, Base, SessionLocal
from app.api.v1.router import api_router
from app.models import (
    User, Category, Warehouse, Location, Product, StockLevel, StockLedger, PasswordReset
)
from app.core.security import get_password_hash

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("stocksense")


def init_db():
    logger.info("Initializing database tables...")
    Base.metadata.create_all(bind=engine)

    # Lightweight migration helper for newly added columns if table already existed
    with engine.begin() as conn:
        for tbl in ["receipts", "deliveries"]:
            try:
                conn.exec_driver_sql(f"ALTER TABLE {tbl} ADD COLUMN scheduled_date TIMESTAMP")
            except Exception:
                pass
            try:
                conn.exec_driver_sql(f"ALTER TABLE {tbl} ADD COLUMN responsible_user_id INTEGER")
            except Exception:
                pass

    # Seed canonical enterprise data only on a completely fresh database (no users yet)
    db = SessionLocal()
    try:
        if db.query(User).count() == 0:
            logger.info("Seeding initial administrator and canonical enterprise inventory...")
            from datetime import timedelta

            # --- Admin user ---
            admin = User(email="admin@stocksense.io", full_name="Alex Morgan",
                         hashed_password=get_password_hash("admin123"), role="admin")
            db.add(admin)
            db.flush()

            # --- Warehouses & Locations ---
            wh1 = Warehouse(name="Central Logistics Hub",    code="WH-CENTRAL", address="100 Enterprise Way, Hub 1, Industrial Estate")
            wh2 = Warehouse(name="North Distribution Depot", code="WH-NORTH",   address="45 Commerce Blvd, North Park")
            wh3 = Warehouse(name="South Fulfilment Centre",  code="WH-SOUTH",   address="22 Logistics Lane, South Zone")
            db.add_all([wh1, wh2, wh3])
            db.flush()
            loca = Location(warehouse_id=wh1.id, name="Zone A - High Velocity Rack", code="WH-C-RACK-A")
            locb = Location(warehouse_id=wh1.id, name="Receiving Dock / Staging",    code="WH-C-DOCK-1")
            locc = Location(warehouse_id=wh2.id, name="Depot Bay 01 - Bulk Storage", code="WH-N-BAY-01")
            locd = Location(warehouse_id=wh2.id, name="Depot Bay 02 - Overstock",   code="WH-N-BAY-02")
            loce = Location(warehouse_id=wh3.id, name="Despatch Area - Outbound",    code="WH-S-DISP-1")
            locf = Location(warehouse_id=wh3.id, name="Cold and Sensitive Storage",  code="WH-S-SENS-1")
            db.add_all([loca, locb, locc, locd, loce, locf])
            db.flush()

            # --- 5 Canonical Categories ---
            cat_es = Category(name="Electronics & Sensors",   description="Precision IoT modules, microcontrollers, sensors and scanning equipment")
            cat_ec = Category(name="Electrical Components",   description="Power supplies, relays, circuit breakers and wiring accessories")
            cat_ht = Category(name="Hardware & Tools",        description="Fasteners, precision tools, hand tools and maintenance hardware")
            cat_ps = Category(name="Packaging & Storage",     description="Industrial containers, label consumables, boxes and storage systems")
            cat_ie = Category(name="Industrial Equipment",    description="Pneumatic, hydraulic and conveyor equipment for production lines")
            db.add_all([cat_es, cat_ec, cat_ht, cat_ps, cat_ie])
            db.flush()

            # --- 22 Canonical Products (SS-{CODE}-{4D} SKU) ---
            prods = [
                Product(name="ESP32 Development Board",          sku="SS-ES-0001", category_id=cat_es.id, uom="Units",  unit_price=18.50,  min_stock_alert=20, reorder_quantity=50,  description="Dual-core Wi-Fi/BT microcontroller for IoT prototyping"),
                Product(name="Industrial RFID Scanner Wand",     sku="SS-ES-0002", category_id=cat_es.id, uom="Units",  unit_price=185.00, min_stock_alert=10, reorder_quantity=20,  description="Long-range wireless RFID/barcode handheld scanner"),
                Product(name="Proximity Sensor NPN 12mm",        sku="SS-ES-0003", category_id=cat_es.id, uom="Units",  unit_price=14.75,  min_stock_alert=25, reorder_quantity=60,  description="Inductive proximity sensor, NPN NO, 12mm barrel"),
                Product(name="Industrial Temperature Sensor PT100", sku="SS-ES-0004", category_id=cat_es.id, uom="Units", unit_price=38.00, min_stock_alert=15, reorder_quantity=30, description="PT100 RTD temperature probe -50 to 400 deg C"),
                Product(name="Machine Vision Camera 5MP",        sku="SS-ES-0005", category_id=cat_es.id, uom="Units",  unit_price=320.00, min_stock_alert=5,  reorder_quantity=10,  description="GigE Vision 5MP monochrome industrial camera"),
                Product(name="24V DC Industrial Power Supply",   sku="SS-EC-0001", category_id=cat_ec.id, uom="Units",  unit_price=74.00,  min_stock_alert=10, reorder_quantity=20,  description="DIN-rail mount 24VDC 10A SMPS power supply"),
                Product(name="Industrial Relay Module 10A",      sku="SS-EC-0002", category_id=cat_ec.id, uom="Units",  unit_price=9.20,   min_stock_alert=30, reorder_quantity=100, description="Plug-in relay module, 10A SPDT, 24VDC coil"),
                Product(name="Circuit Breaker MCB 16A",          sku="SS-EC-0003", category_id=cat_ec.id, uom="Units",  unit_price=8.50,   min_stock_alert=20, reorder_quantity=80,  description="DIN-rail MCB, 16A, 1-pole, Type C curve"),
                Product(name="DIN Rail Terminal Block 4mm2",     sku="SS-EC-0004", category_id=cat_ec.id, uom="Packs",  unit_price=3.40,   min_stock_alert=50, reorder_quantity=200, description="Screw terminal block, 4mm2, pack of 10"),
                Product(name="Shielded Cable 4-core 1.5mm2",    sku="SS-EC-0005", category_id=cat_ec.id, uom="Metres", unit_price=2.80,   min_stock_alert=100,reorder_quantity=500, description="LSZH shielded multi-core control cable"),
                Product(name="M6 Hex Bolt Set Grade 8.8",        sku="SS-HT-0001", category_id=cat_ht.id, uom="Sets",   unit_price=6.50,   min_stock_alert=40, reorder_quantity=150, description="M6x25mm hex bolt, washer and nut kit (50-piece)"),
                Product(name="Digital Caliper 150mm Stainless",  sku="SS-HT-0002", category_id=cat_ht.id, uom="Units",  unit_price=44.00,  min_stock_alert=5,  reorder_quantity=15,  description="IP54 stainless steel digital vernier caliper"),
                Product(name="Stainless Steel Cable Ties 300mm", sku="SS-HT-0003", category_id=cat_ht.id, uom="Packs",  unit_price=7.80,   min_stock_alert=20, reorder_quantity=100, description="Marine-grade SS316 cable ties, pack of 50"),
                Product(name="Torque Wrench 5 to 25Nm",          sku="SS-HT-0004", category_id=cat_ht.id, uom="Units",  unit_price=62.00,  min_stock_alert=5,  reorder_quantity=10,  description="Click-type torque wrench with reversible ratchet"),
                Product(name="Safety Industrial Gloves Cut-5",   sku="SS-HT-0005", category_id=cat_ht.id, uom="Pairs",  unit_price=4.10,   min_stock_alert=50, reorder_quantity=200, description="ANSI A5 cut-resistant work gloves, size L"),
                Product(name="Heavy Duty Storage Bin 60L",       sku="SS-PS-0001", category_id=cat_ps.id, uom="Units",  unit_price=24.00,  min_stock_alert=10, reorder_quantity=50,  description="Stackable polypropylene bin, 60L, with lid"),
                Product(name="Thermal Label Roll 4x6 inch",      sku="SS-PS-0002", category_id=cat_ps.id, uom="Rolls",  unit_price=12.50,  min_stock_alert=20, reorder_quantity=100, description="Direct thermal shipping labels, 500/roll, 4x6 inch"),
                Product(name="Corrugated Shipping Box 400x300",  sku="SS-PS-0003", category_id=cat_ps.id, uom="Units",  unit_price=1.80,   min_stock_alert=100,reorder_quantity=500, description="Single-wall corrugated box, ECT-32, flat-pack"),
                Product(name="Anti-Static Bubble Wrap 50m",      sku="SS-PS-0004", category_id=cat_ps.id, uom="Rolls",  unit_price=28.00,  min_stock_alert=10, reorder_quantity=30,  description="Pink anti-static 500mm x 50m bubble wrap roll"),
                Product(name="Pneumatic Solenoid Valve 5/2",     sku="SS-IE-0001", category_id=cat_ie.id, uom="Units",  unit_price=52.00,  min_stock_alert=8,  reorder_quantity=20,  description="5/2-way bistable solenoid valve, 24VDC, G1/4"),
                Product(name="Conveyor Belt Roller 500mm",        sku="SS-IE-0002", category_id=cat_ie.id, uom="Units",  unit_price=31.50,  min_stock_alert=10, reorder_quantity=30,  description="Steel idler conveyor roller, 50mm x 500mm"),
                Product(name="Industrial Safety Light Curtain",   sku="SS-IE-0003", category_id=cat_ie.id, uom="Units",  unit_price=480.00, min_stock_alert=3,  reorder_quantity=6,   description="Type-4 SIL2 safety light curtain, 1200mm height"),
            ]
            db.add_all(prods)
            db.flush()

            # Seed representative opening stock levels + ledger
            pm = {p.sku: p for p in prods}
            seed_stock = [
                ("SS-ES-0001", loca, 100), ("SS-ES-0002", locf, 30),
                ("SS-ES-0003", loca, 150), ("SS-ES-0004", locf, 60),
                ("SS-ES-0005", locf, 12),  ("SS-EC-0001", locb, 40),
                ("SS-EC-0002", loca, 200), ("SS-EC-0003", locb, 120),
                ("SS-EC-0004", locc, 500), ("SS-EC-0005", loca, 300),
                ("SS-HT-0001", loca, 200), ("SS-HT-0002", locf, 25),
                ("SS-HT-0003", loca, 150), ("SS-HT-0004", locc, 20),
                ("SS-HT-0005", locc, 300), ("SS-PS-0001", locc, 80),
                ("SS-PS-0002", loca, 200), ("SS-PS-0003", locd, 1000),
                ("SS-PS-0004", locc, 50),  ("SS-IE-0001", locc, 40),
                ("SS-IE-0002", locd, 60),  ("SS-IE-0003", locf, 5),
            ]
            for sku, loc_obj, qty in seed_stock:
                p = pm[sku]
                sl = StockLevel(product_id=p.id, location_id=loc_obj.id, quantity_on_hand=qty)
                db.add(sl)
                if qty > 0:
                    db.add(StockLedger(
                        product_id=p.id, location_id=loc_obj.id,
                        change_qty=qty, balance_after=qty,
                        action_type="INITIAL", reference_doc_type="SystemInit",
                        reference_doc_number=p.sku, notes="Opening stock — enterprise seed",
                    ))

            db.commit()
            logger.info("Canonical enterprise data seeded successfully.")

        # Ensure Warehouse Staff account exists
        staff_user = db.query(User).filter(User.email == "staff@stocksense.io").first()
        if not staff_user:
            db.add(User(email="staff@stocksense.io", full_name="Sam Taylor",
                        hashed_password=get_password_hash("staff123"),
                        role="warehouse_staff", is_active=True))
            db.commit()
            logger.info("Warehouse staff account 'staff@stocksense.io' ensured.")
    except Exception as e:
        logger.error(f"Error seeding database: {e}")
        db.rollback()
    finally:
        db.close()



@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    yield


app = FastAPI(
    title=settings.PROJECT_NAME,
    version="1.0.0",
    description="Enterprise Inventory Management System API with Real-time Stock Ledger and Supabase PostgreSQL integration.",
    lifespan=lifespan
)

# CORS Middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Hackathon-friendly: allows frontend access from local dev server
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Mount API Router
app.include_router(api_router, prefix=settings.API_V1_STR)


@app.get("/")
def root():
    return {
        "system": settings.PROJECT_NAME,
        "status": "online",
        "docs": "/docs",
        "api_v1": settings.API_V1_STR
    }


@app.get("/health")
def health():
    return {"status": "healthy"}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
