import sys
from fastapi.testclient import TestClient
from main import app, init_db

# Initialize database schema
init_db()

client = TestClient(app)

print("============================================================")
print("STARTING DIRECT FASTAPI RBAC PERMISSION VERIFICATION")
print("============================================================\n")

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
print("   [PASS] POST /api/v1/adjustments allowed for Warehouse Staff (201 Created)")

# 2.5 Staff can view immutable movement ledger
res = client.get("/api/v1/ledger?limit=5", headers=staff_headers)
assert res.status_code == 200, f"Ledger failed: {res.text}"
print(f"   [PASS] GET /api/v1/ledger allowed for Warehouse Staff (200 OK, count: {len(res.json())})")

# -------------------------------------------------------------
# TEST 3: Manager Has Full Access To All Actions
# -------------------------------------------------------------
print("\nTest 3: Verifying Inventory Manager Has Full Access...")
import time
uniq = int(time.time())
res = client.post("/api/v1/products/categories", json={"name": f"Manager Cat {uniq}", "description": "Admin created"}, headers=mgr_headers)
assert res.status_code == 201, f"Manager category creation failed: {res.text}"
print("   [PASS] POST /api/v1/products/categories allowed for Inventory Manager (201 Created)")

print("\n============================================================")
print(">>> ALL DIRECT FASTAPI RBAC TESTS PASSED SUCCESSFULLY! <<<")
print("============================================================")
