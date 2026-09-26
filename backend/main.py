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

    # Seed initial test data if database is empty
    db = SessionLocal()
    try:
        if db.query(User).count() == 0:
            logger.info("Seeding initial administrator and sample inventory data...")
            # Demo User
            demo_user = User(
                email="admin@stocksense.io",
                full_name="Alex Morgan",
                hashed_password=get_password_hash("admin123"),
                role="admin"
            )
            db.add(demo_user)

            # Warehouses & Locations
            wh_main = Warehouse(name="Central Logistics Hub", code="WH-CENTRAL", address="100 Enterprise Way, Hub 1")
            wh_north = Warehouse(name="North Distribution Depot", code="WH-NORTH", address="45 Commerce Blvd")
            db.add_all([wh_main, wh_north])
            db.flush()

            loc_1 = Location(warehouse_id=wh_main.id, name="Rack A - High Velocity", code="WH-C-RACK-A")
            loc_2 = Location(warehouse_id=wh_main.id, name="Receiving Dock Staging", code="WH-C-DOCK-1")
            loc_3 = Location(warehouse_id=wh_north.id, name="Depot Bay 01", code="WH-N-BAY-01")
            db.add_all([loc_1, loc_2, loc_3])
            db.flush()

            # Categories
            cat_elec = Category(name="Electronics & Sensors", description="Precision IoT and microcontroller boards")
            cat_pack = Category(name="Packaging & Storage", description="Industrial containers and boxes")
            cat_tools = Category(name="Hardware & Tools", description="Assembly and maintenance tools")
            db.add_all([cat_elec, cat_pack, cat_tools])
            db.flush()

            # Products
            p1 = Product(
                name="Smart RFID Scanner Wand",
                sku="SS-WAND-001",
                category_id=cat_elec.id,
                uom="Units",
                unit_price=185.00,
                initial_stock=45,
                min_stock_alert=15,
                reorder_quantity=30,
                description="Long-range wireless barcode and RFID inventory scanner"
            )
            p2 = Product(
                name="Thermal Label Roll (4x6)",
                sku="SS-LBL-4X6",
                category_id=cat_pack.id,
                uom="Rolls",
                unit_price=12.50,
                initial_stock=8,
                min_stock_alert=20,  # LOW STOCK trigger
                reorder_quantity=100,
                description="Direct thermal shipping label rolls (500 labels/roll)"
            )
            p3 = Product(
                name="Heavy Duty Storage Bin (60L)",
                sku="SS-BIN-60L",
                category_id=cat_pack.id,
                uom="Units",
                unit_price=24.00,
                initial_stock=0,  # OUT OF STOCK trigger
                min_stock_alert=10,
                reorder_quantity=50,
                description="Stackable impact-resistant polypropylene container"
            )
            p4 = Product(
                name="Precision Caliper Digital 150mm",
                sku="SS-CALIPER-150",
                category_id=cat_tools.id,
                uom="Units",
                unit_price=45.00,
                initial_stock=32,
                min_stock_alert=5,
                reorder_quantity=20,
                description="Stainless steel digital caliper with LCD screen"
            )
            db.add_all([p1, p2, p3, p4])
            db.flush()

            # Initial stock levels
            sl1 = StockLevel(product_id=p1.id, location_id=loc_1.id, quantity_on_hand=45)
            sl2 = StockLevel(product_id=p2.id, location_id=loc_1.id, quantity_on_hand=8)
            sl3 = StockLevel(product_id=p3.id, location_id=loc_2.id, quantity_on_hand=0)
            sl4 = StockLevel(product_id=p4.id, location_id=loc_3.id, quantity_on_hand=32)
            db.add_all([sl1, sl2, sl3, sl4])
            db.flush()

            # Initial Ledger Records
            for p, sl in [(p1, sl1), (p2, sl2), (p4, sl4)]:
                if sl.quantity_on_hand > 0:
                    db.add(StockLedger(
                        product_id=p.id,
                        location_id=sl.location_id,
                        change_qty=sl.quantity_on_hand,
                        balance_after=sl.quantity_on_hand,
                        action_type="INITIAL",
                        reference_doc_type="SystemInit",
                        reference_doc_number=p.sku,
                        notes="Initial system seed inventory"
                    ))

            db.commit()
            logger.info("Database initialized and sample data seeded successfully.")

        # Ensure demo Warehouse Staff account exists for RBAC
        staff_user = db.query(User).filter(User.email == "staff@stocksense.io").first()
        if not staff_user:
            staff_user = User(
                email="staff@stocksense.io",
                full_name="Sam Taylor",
                hashed_password=get_password_hash("staff123"),
                role="warehouse_staff",
                is_active=True
            )
            db.add(staff_user)
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
