import urllib.request
import json
import sys
import time

BASE_URL = 'http://localhost:8000/api/v1'

def api_call(path, data=None, method='GET', token=None):
    url = f'{BASE_URL}{path}'
    body = json.dumps(data).encode('utf-8') if data is not None else None
    req = urllib.request.Request(url, data=body, method=method)
    req.add_header('Content-Type', 'application/json')
    if token:
        req.add_header('Authorization', f'Bearer {token}')
    try:
        with urllib.request.urlopen(req) as resp:
            return resp.status, json.loads(resp.read().decode('utf-8'))
    except urllib.error.HTTPError as e:
        err_body = e.read().decode('utf-8')
        try:
            return e.code, json.loads(err_body)
        except Exception:
            return e.code, {'detail': err_body}


def test_phase6_rbac():
    try:
        print("============================================================")
        print("STARTING PHASE 6 RBAC VERIFICATION")
        print("============================================================")

        # 1. Authenticate as Inventory Manager (admin@stocksense.io)
        status, manager_res = api_call('/auth/login', {'email': 'admin@stocksense.io', 'password': 'admin123'}, method='POST')
        assert status == 200, f"Manager login failed: {manager_res}"
        manager_token = manager_res['access_token']
        manager_user = manager_res['user']
        print(f"[OK] Inventory Manager Authenticated: {manager_user['email']} (Role: {manager_user['role']})")

        # 2. Authenticate as Warehouse Staff (staff@stocksense.io)
        status, staff_res = api_call('/auth/login', {'email': 'staff@stocksense.io', 'password': 'staff123'}, method='POST')
        assert status == 200, f"Staff login failed: {staff_res}"
        staff_token = staff_res['access_token']
        staff_user = staff_res['user']
        assert staff_user['role'] == 'warehouse_staff', f"Expected role warehouse_staff, got {staff_user['role']}"
        print(f"[OK] Warehouse Staff Authenticated: {staff_user['email']} (Role: {staff_user['role']})")

        # ============================================================
        # [TEST 1] VERIFY RESTRICTED ACTIONS ARE FORBIDDEN (403) FOR WAREHOUSE STAFF
        # ============================================================
        print("\n[TEST 1] Testing Forbidden Management Actions for Warehouse Staff...")

        # 1.1 Staff attempts to create a product SKU in catalog
        forbidden_prod_payload = {
            "name": "Unauthorized Staff SKU",
            "sku": "STAFF-PROD-001",
            "uom": "Units",
            "unit_price": 50.0,
            "initial_stock": 0,
            "min_stock_alert": 5,
            "reorder_quantity": 10
        }
        status, res = api_call('/products', forbidden_prod_payload, method='POST', token=staff_token)
        assert status == 403, f"Expected HTTP 403 Forbidden for staff creating product, got {status}: {res}"
        print("  [OK] POST /products blocked for Warehouse Staff (HTTP 403 Forbidden)")

        # 1.2 Staff attempts to update product SKU
        status, res = api_call('/products/1', {"name": "Staff Renamed Product"}, method='PUT', token=staff_token)
        assert status == 403, f"Expected HTTP 403 Forbidden for staff updating product, got {status}: {res}"
        print("  [OK] PUT /products/1 blocked for Warehouse Staff (HTTP 403 Forbidden)")

        # 1.3 Staff attempts to create a category
        forbidden_cat_payload = {
            "name": "Staff Created Category",
            "description": "Unauthorized"
        }
        status, res = api_call('/products/categories', forbidden_cat_payload, method='POST', token=staff_token)
        assert status == 403, f"Expected HTTP 403 Forbidden for staff creating category, got {status}: {res}"
        print("  [OK] POST /products/categories blocked for Warehouse Staff (HTTP 403 Forbidden)")

        # 1.4 Staff attempts to create a warehouse facility
        forbidden_wh_payload = {
            "name": "Staff Rogue Warehouse",
            "code": "WH-ROGUE-01",
            "address": "999 Unauthorized Way"
        }
        status, res = api_call('/warehouses', forbidden_wh_payload, method='POST', token=staff_token)
        assert status == 403, f"Expected HTTP 403 Forbidden for staff creating warehouse, got {status}: {res}"
        print("  [OK] POST /warehouses blocked for Warehouse Staff (HTTP 403 Forbidden)")

        # 1.5 Staff attempts to create a storage location
        forbidden_loc_payload = {
            "warehouse_id": 1,
            "name": "Staff Rogue Bin",
            "code": "BIN-ROGUE-01"
        }
        status, res = api_call('/warehouses/locations', forbidden_loc_payload, method='POST', token=staff_token)
        assert status == 403, f"Expected HTTP 403 Forbidden for staff creating location, got {status}: {res}"
        print("  [OK] POST /warehouses/locations blocked for Warehouse Staff (HTTP 403 Forbidden)")

        # ============================================================
        # [TEST 2] VERIFY OPERATIONAL ACTIONS ARE ALLOWED (200/201) FOR WAREHOUSE STAFF
        # ============================================================
        print("\n[TEST 2] Testing Allowed Operational Actions for Warehouse Staff...")

        # 2.1 Staff can view operational Dashboard KPIs
        status, dash_res = api_call('/dashboard/summary', token=staff_token)
        assert status == 200, f"Staff failed to read dashboard: {dash_res}"
        print("  [OK] GET /dashboard/summary allowed for Warehouse Staff (HTTP 200)")

        # 2.2 Staff can view products catalog (read-only)
        status, prod_res = api_call('/products', token=staff_token)
        assert status == 200, f"Staff failed to read products: {prod_res}"
        print(f"  [OK] GET /products allowed for Warehouse Staff (HTTP 200, {len(prod_res)} SKUs)")

        # 2.3 Staff can view warehouses and locations topology (read-only for operational routing)
        status, wh_res = api_call('/warehouses', token=staff_token)
        assert status == 200, f"Staff failed to read warehouses: {wh_res}"
        print(f"  [OK] GET /warehouses allowed for Warehouse Staff (HTTP 200, {len(wh_res)} facilities)")

        # 2.4 Staff can perform operational cycle count adjustment
        adj_payload = {
            "product_id": 1,
            "location_id": 1,
            "counted_qty": 180,
            "reason": "Staff Routine Shelf Audit",
            "notes": "Verified by warehouse staff"
        }
        status, adj_res = api_call('/adjustments', adj_payload, method='POST', token=staff_token)
        assert status == 201, f"Staff failed to log adjustment: {adj_res}"
        print(f"  [OK] POST /adjustments allowed for Warehouse Staff (HTTP 201, {adj_res['adjustment_number']})")

        # 2.5 Staff can view immutable movement ledger
        status, ledger_res = api_call('/ledger?limit=5', token=staff_token)
        assert status == 200, f"Staff failed to read ledger: {ledger_res}"
        print(f"  [OK] GET /ledger allowed for Warehouse Staff (HTTP 200, {len(ledger_res)} entries)")

        # ============================================================
        # [TEST 3] VERIFY INVENTORY MANAGER HAS FULL ACCESS TO ALL ACTIONS
        # ============================================================
        print("\n[TEST 3] Testing Full Access for Inventory Manager...")

        # 3.1 Manager creates a product SKU in catalog
        unique_sku = f"MGR-SKU-{int(time.time())}"
        mgr_prod_payload = {
            "name": "Manager Managed Item",
            "sku": unique_sku,
            "uom": "Units",
            "unit_price": 75.0,
            "initial_stock": 0,
            "min_stock_alert": 5,
            "reorder_quantity": 15
        }
        status, mgr_prod_res = api_call('/products', mgr_prod_payload, method='POST', token=manager_token)
        assert status == 201, f"Manager failed to create product: {mgr_prod_res}"
        mgr_prod_id = mgr_prod_res['id']
        print(f"  [OK] POST /products allowed for Inventory Manager (HTTP 201, ID: {mgr_prod_id}, SKU: {unique_sku})")

        # 3.2 Manager updates the product SKU
        status, mgr_update_res = api_call(f'/products/{mgr_prod_id}', {"unit_price": 82.50}, method='PUT', token=manager_token)
        assert status == 200, f"Manager failed to update product: {mgr_update_res}"
        assert float(mgr_update_res['unit_price']) == 82.50, f"Expected 82.50, got {mgr_update_res['unit_price']}"
        print(f"  [OK] PUT /products/{mgr_prod_id} allowed for Inventory Manager (HTTP 200, Price: $82.50)")

        # 3.3 Manager creates category
        unique_cat = f"Cat {int(time.time())}"
        status, mgr_cat_res = api_call('/products/categories', {"name": unique_cat, "description": "Admin created"}, method='POST', token=manager_token)
        assert status == 201, f"Manager failed to create category: {mgr_cat_res}"
        print(f"  [OK] POST /products/categories allowed for Inventory Manager (HTTP 201, {unique_cat})")

        # 3.4 Manager creates location
        unique_loc = f"LOC-{int(time.time()) % 10000}"
        status, mgr_loc_res = api_call('/warehouses/locations', {"warehouse_id": 1, "name": f"Aisle {unique_loc}", "code": unique_loc}, method='POST', token=manager_token)
        assert status == 201, f"Manager failed to create location: {mgr_loc_res}"
        print(f"  [OK] POST /warehouses/locations allowed for Inventory Manager (HTTP 201, {unique_loc})")

        print("\n============================================================")
        print("ALL PHASE 6 RBAC VERIFICATION TESTS PASSED SUCCESSFULLY!")
        print("============================================================")

    finally:
        # Clean up test entities so database remains in pristine enterprise state
        try:
            from app.core.database import SessionLocal
            from app.models import Product, Category, Location, StockAdjustment, StockLedger, StockLevel
            cleanup_db = SessionLocal()
            if 'mgr_prod_id' in locals():
                cleanup_db.query(Product).filter(Product.id == mgr_prod_id).delete()
            if 'unique_cat' in locals():
                cleanup_db.query(Category).filter(Category.name == unique_cat).delete()
            cleanup_db.query(Category).filter(Category.name.like("Cat %")).delete()
            if 'unique_loc' in locals():
                cleanup_db.query(Location).filter(Location.code == unique_loc).delete()
            if 'adj_res' in locals() and adj_res.get('id'):
                adj_id = adj_res['id']
                adj_num = adj_res.get('adjustment_number')
                cleanup_db.query(StockAdjustment).filter(StockAdjustment.id == adj_id).delete()
                cleanup_db.query(StockLedger).filter(StockLedger.reference_doc_number == adj_num).delete()
                # Restore stock level from previous ledger balance
                prev_entry = cleanup_db.query(StockLedger).filter(
                    StockLedger.product_id == 1,
                    StockLedger.location_id == 1
                ).order_by(StockLedger.timestamp.desc(), StockLedger.id.desc()).first()
                if prev_entry:
                    sl1 = cleanup_db.query(StockLevel).filter(StockLevel.product_id == 1, StockLevel.location_id == 1).first()
                    if sl1:
                        sl1.quantity_on_hand = prev_entry.balance_after
            cleanup_db.commit()
            cleanup_db.close()
        except Exception as cleanup_err:
            print(f"Warning during test_phase6 cleanup: {cleanup_err}")


if __name__ == "__main__":
    test_phase6_rbac()
