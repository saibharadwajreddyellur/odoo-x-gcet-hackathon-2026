import sys
import time
from fastapi.testclient import TestClient
from main import app, init_db
from app.core.database import SessionLocal
from app.models import Category, StockAdjustment, StockLedger, StockLevel


def test_phase6_rbac_direct():
    # Initialize database schema
    init_db()

    client = TestClient(app)
    db = SessionLocal()

    print("============================================================")
    print("STARTING DIRECT FASTAPI RBAC PERMISSION VERIFICATION")
    print("============================================================\n")

    orig_stock = None
    sl = db.query(StockLevel).filter(StockLevel.product_id == 1, StockLevel.location_id == 1).first()
    if sl:
        orig_stock = sl.quantity_on_hand

    created_cat_name = None
    created_adj_id = None
    created_adj_num = None

    try:
        # 1. Authenticate as Inventory Manager (admin@stocksense.io)
        res_mgr = client.post("/api/v1/auth/login", json={"email": "admin@stocksense.io", "password": "admin123"})
        assert res_mgr.status_code == 200, f"Manager login failed: {res_mgr.text}"
        mgr_token = res_mgr.json()["access_token"]
        mgr_headers = {"Authorization": f"Bearer {mgr_token}"}
        print("[PASS] Inventory Manager logged in successfully")

        # 2. Authenticate as Warehouse Staff (staff@stocksense.io)
        res_staff = client.post("/api/v1/auth/login", json={"email": "staff@stocksense.io", "password": "staff123"})
        assert res_staff.status_code == 200, f"Staff login failed: {res_staff.text}"
        staff_data = res_staff.json()
        staff_token = staff_data["access_token"]
        staff_headers = {"Authorization": f"Bearer {staff_token}"}
        assert staff_data["user"]["role"] == "warehouse_staff"
        print("[PASS] Warehouse Staff logged in successfully with role 'warehouse_staff'\n")

        # -------------------------------------------------------------
        # TEST 1: Restricted Management Endpoints Return 403 For Staff
        # -------------------------------------------------------------
        print("Test 1: Verifying Staff Forbidden Access (HTTP 403) on Catalog & Warehouse Administration...")

        # 1.1 POST /products (Product creation)
        res = client.post("/api/v1/products", json={
            "name": "Staff Rogue Item",
            "sku": "STAFF-FORBIDDEN-01",
            "uom": "Units",
            "unit_price": 10.0,
            "initial_stock": 0,
            "min_stock_alert": 5,
            "reorder_quantity": 10
        }, headers=staff_headers)
        assert res.status_code == 403, f"Expected 403, got {res.status_code}: {res.text}"
        print("   [PASS] POST /api/v1/products blocked for Warehouse Staff (403 Forbidden)")

        # 1.2 PUT /products/{id} (Product update)
        res = client.put("/api/v1/products/1", json={"name": "Hacked Name"}, headers=staff_headers)
        assert res.status_code == 403, f"Expected 403, got {res.status_code}: {res.text}"
        print("   [PASS] PUT /api/v1/products/1 blocked for Warehouse Staff (403 Forbidden)")

        # 1.3 DELETE /products/{id} (Product delete)
        res = client.delete("/api/v1/products/1", headers=staff_headers)
        assert res.status_code == 403, f"Expected 403, got {res.status_code}: {res.text}"
        print("   [PASS] DELETE /api/v1/products/1 blocked for Warehouse Staff (403 Forbidden)")

        # 1.4 POST /products/categories (Category creation)
        res = client.post("/api/v1/products/categories", json={"name": "Rogue Category"}, headers=staff_headers)
        assert res.status_code == 403, f"Expected 403, got {res.status_code}: {res.text}"
        print("   [PASS] POST /api/v1/products/categories blocked for Warehouse Staff (403 Forbidden)")

        # 1.5 POST /warehouses (Warehouse creation)
        res = client.post("/api/v1/warehouses", json={
            "name": "Rogue WH",
            "code": "RWH-01",
            "address": "123 Somewhere"
        }, headers=staff_headers)
        assert res.status_code == 403, f"Expected 403, got {res.status_code}: {res.text}"
        print("   [PASS] POST /api/v1/warehouses blocked for Warehouse Staff (403 Forbidden)")

        # 1.6 PUT /warehouses/{id} (Warehouse update)
        res = client.put("/api/v1/warehouses/1", json={"name": "Modified WH"}, headers=staff_headers)
        assert res.status_code == 403, f"Expected 403, got {res.status_code}: {res.text}"
        print("   [PASS] PUT /api/v1/warehouses/1 blocked for Warehouse Staff (403 Forbidden)")

        # 1.7 DELETE /warehouses/{id} (Warehouse delete)
        res = client.delete("/api/v1/warehouses/1", headers=staff_headers)
        assert res.status_code == 403, f"Expected 403, got {res.status_code}: {res.text}"
        print("   [PASS] DELETE /api/v1/warehouses/1 blocked for Warehouse Staff (403 Forbidden)")

        # 1.8 POST /warehouses/locations (Location creation)
        res = client.post("/api/v1/warehouses/locations", json={
            "warehouse_id": 1,
            "name": "Rogue Bin",
            "code": "RBIN-01"
        }, headers=staff_headers)
        assert res.status_code == 403, f"Expected 403, got {res.status_code}: {res.text}"
        print("   [PASS] POST /api/v1/warehouses/locations blocked for Warehouse Staff (403 Forbidden)")

        # 1.9 PUT /warehouses/locations/{id} (Location update)
        res = client.put("/api/v1/warehouses/locations/1", json={"name": "Modified Bin"}, headers=staff_headers)
        assert res.status_code == 403, f"Expected 403, got {res.status_code}: {res.text}"
        print("   [PASS] PUT /api/v1/warehouses/locations/1 blocked for Warehouse Staff (403 Forbidden)")

        # 1.10 DELETE /warehouses/locations/{id} (Location delete)
        res = client.delete("/api/v1/warehouses/locations/1", headers=staff_headers)
        assert res.status_code == 403, f"Expected 403, got {res.status_code}: {res.text}"
        print("   [PASS] DELETE /api/v1/warehouses/locations/1 blocked for Warehouse Staff (403 Forbidden)\n")

        # -------------------------------------------------------------
        # TEST 2: Operational Endpoints Allowed For Staff (200 / 201)
        # -------------------------------------------------------------
        print("Test 2: Verifying Staff Allowed Operations (Transfers, Counting, Read Topology)...")

        # 2.1 Staff can view operational Dashboard metrics
        res = client.get("/api/v1/dashboard/summary", headers=staff_headers)
        assert res.status_code == 200, f"Dashboard failed: {res.text}"
        print("   [PASS] GET /api/v1/dashboard/summary allowed for Warehouse Staff (200 OK)")

        # 2.2 Staff can view Stock / Inventory
        res = client.get("/api/v1/products", headers=staff_headers)
        assert res.status_code == 200, f"Stock view failed: {res.text}"
        print(f"   [PASS] GET /api/v1/products allowed for Warehouse Staff (200 OK, count: {len(res.json())})")

        # 2.3 Staff can view warehouse topology (needed for moving stock)
        res = client.get("/api/v1/warehouses", headers=staff_headers)
        assert res.status_code == 200, f"Warehouses view failed: {res.text}"
        print("   [PASS] GET /api/v1/warehouses read-only allowed for Warehouse Staff (200 OK)")

        # 2.4 Staff can perform physical stock counting / adjustment
        res = client.post("/api/v1/adjustments", json={
            "product_id": 1,
            "location_id": 1,
            "counted_qty": 50,
            "reason": "Routine Physical Count",
            "notes": "Verified by floor staff"
        }, headers=staff_headers)
        assert res.status_code == 201, f"Adjustment failed: {res.text}"
        adj_data = res.json()
        created_adj_id = adj_data["id"]
        created_adj_num = adj_data["adjustment_number"]
        print("   [PASS] POST /api/v1/adjustments allowed for Warehouse Staff (201 Created)")

        # 2.5 Staff can view immutable movement ledger
        res = client.get("/api/v1/ledger?limit=5", headers=staff_headers)
        assert res.status_code == 200, f"Ledger failed: {res.text}"
        print(f"   [PASS] GET /api/v1/ledger allowed for Warehouse Staff (200 OK, count: {len(res.json())})")

        # -------------------------------------------------------------
        # TEST 3: Manager Has Full Access To All Actions
        # -------------------------------------------------------------
        print("\nTest 3: Verifying Inventory Manager Has Full Access...")
        uniq = int(time.time())
        created_cat_name = f"Manager Cat {uniq}"
        res = client.post("/api/v1/products/categories", json={"name": created_cat_name, "description": "Admin created"}, headers=mgr_headers)
        assert res.status_code == 201, f"Manager category creation failed: {res.text}"
        print("   [PASS] POST /api/v1/products/categories allowed for Inventory Manager (201 Created)")

        print("\n============================================================")
        print(">>> ALL DIRECT FASTAPI RBAC TESTS PASSED SUCCESSFULLY! <<<")
        print("============================================================")

    finally:
        try:
            cleanup_db = SessionLocal()
            for c in cleanup_db.query(Category).filter(Category.name.like("Manager Cat%")).all():
                cleanup_db.delete(c)
            if created_adj_num:
                cleanup_db.query(StockAdjustment).filter(StockAdjustment.adjustment_number == created_adj_num).delete()
                cleanup_db.query(StockLedger).filter(StockLedger.reference_doc_number == created_adj_num).delete()
            if orig_stock is not None:
                sl_restore = cleanup_db.query(StockLevel).filter(StockLevel.product_id == 1, StockLevel.location_id == 1).first()
                if sl_restore:
                    sl_restore.quantity_on_hand = orig_stock
            cleanup_db.commit()
            cleanup_db.close()
        except Exception as e:
            print(f"Warning during test_phase6_rbac_direct cleanup: {e}")
        finally:
            db.close()


if __name__ == "__main__":
    test_phase6_rbac_direct()
