import urllib.request
import urllib.error
import json
import time
import sys

BASE_URL = 'http://localhost:8000/api/v1'
_test_client = None

def get_test_client():
    global _test_client
    if _test_client is None:
        from fastapi.testclient import TestClient
        from main import app, init_db
        init_db()
        _test_client = TestClient(app)
    return _test_client

def api_call(path, data=None, method='GET', token=None):
    try:
        url = f'{BASE_URL}{path}'
        body = json.dumps(data).encode('utf-8') if data is not None else None
        req = urllib.request.Request(url, data=body, method=method)
        req.add_header('Content-Type', 'application/json')
        if token:
            req.add_header('Authorization', f'Bearer {token}')
        with urllib.request.urlopen(req) as resp:
            return resp.status, json.loads(resp.read().decode('utf-8'))
    except urllib.error.HTTPError as e:
        err_body = e.read().decode('utf-8')
        try:
            return e.code, json.loads(err_body)
        except Exception:
            return e.code, {'detail': err_body}
    except (urllib.error.URLError, ConnectionRefusedError):
        client = get_test_client()
        headers = {}
        if token:
            headers['Authorization'] = f'Bearer {token}'
        endpoint = f'/api/v1{path}'
        if method == 'POST':
            res = client.post(endpoint, json=data, headers=headers)
        elif method == 'PUT':
            res = client.put(endpoint, json=data, headers=headers)
        elif method == 'DELETE':
            res = client.delete(endpoint, headers=headers)
        else:
            res = client.get(endpoint, headers=headers)
        try:
            body_res = res.json()
        except Exception:
            body_res = {'detail': res.text}
        return res.status_code, body_res


def test_phase7():
    print("============================================================")
    print("STARTING PHASE 7 WAREHOUSE & LOCATION VERIFICATION")
    print("============================================================")

    wh_id = None
    loc_id = None

    try:
        # 1. Login Manager & Staff
        status, mgr = api_call('/auth/login', {'email': 'admin@stocksense.io', 'password': 'admin123'}, method='POST')
        assert status == 200, f"Manager login failed: {mgr}"
        mgr_token = mgr['access_token']
        print(f"[OK] Inventory Manager Authenticated (Role: {mgr['user']['role']})")

        status, staff = api_call('/auth/login', {'email': 'staff@stocksense.io', 'password': 'staff123'}, method='POST')
        assert status == 200, f"Staff login failed: {staff}"
        staff_token = staff['access_token']
        print(f"[OK] Warehouse Staff Authenticated (Role: {staff['user']['role']})")

        # 2. Staff View
        status, whs = api_call('/warehouses', token=staff_token)
        assert status == 200, f"Staff GET /warehouses failed: {whs}"
        print(f"[OK] Staff can view warehouses: {len(whs)} found")

        status, locs = api_call('/warehouses/locations', token=staff_token)
        assert status == 200, f"Staff GET /warehouses/locations failed: {locs}"
        print(f"[OK] Staff can view locations: {len(locs)} found")

        # 3. Staff Forbidden Actions (Must return 403)
        print("\nTesting Staff RBAC restrictions (Must return 403)...")
        status, res = api_call('/warehouses', {'name': 'Staff WH', 'code': 'STAFF-WH-99'}, method='POST', token=staff_token)
        assert status == 403, f"Expected 403 for staff POST /warehouses, got {status}: {res}"
        print("[OK] Staff POST /warehouses returns 403 Forbidden")

        status, res = api_call('/warehouses/1', {'name': 'Staff Rename WH'}, method='PUT', token=staff_token)
        assert status == 403, f"Expected 403 for staff PUT /warehouses/1, got {status}: {res}"
        print("[OK] Staff PUT /warehouses/1 returns 403 Forbidden")

        status, res = api_call('/warehouses/locations', {'warehouse_id': 1, 'name': 'Staff Loc', 'code': 'STAFF-L-99'}, method='POST', token=staff_token)
        assert status == 403, f"Expected 403 for staff POST /warehouses/locations, got {status}: {res}"
        print("[OK] Staff POST /warehouses/locations returns 403 Forbidden")

        status, res = api_call('/warehouses/locations/1', {'name': 'Staff Rename Loc'}, method='PUT', token=staff_token)
        assert status == 403, f"Expected 403 for staff PUT /warehouses/locations/1, got {status}: {res}"
        print("[OK] Staff PUT /warehouses/locations/1 returns 403 Forbidden")

        # 4. Inventory Manager Create & Update Warehouse
        print("\nTesting Inventory Manager Warehouse Create & Update...")
        ts = int(time.time())
        new_wh_code = f"WH-P7-{ts % 10000}"
        new_wh_payload = {
            "name": f"Phase 7 Logistics Center {ts % 1000}",
            "code": new_wh_code,
            "address": "456 Automation Pkwy, Sector 7"
        }
        status, created_wh = api_call('/warehouses', new_wh_payload, method='POST', token=mgr_token)
        assert status == 201, f"Manager create warehouse failed: {created_wh}"
        wh_id = created_wh['id']
        assert created_wh['code'] == new_wh_code
        assert created_wh['address'] == new_wh_payload['address']
        print(f"[OK] Manager created warehouse ID {wh_id}: {created_wh['name']} ({created_wh['code']})")

        # Update Warehouse
        updated_wh_payload = {
            "name": f"Phase 7 Global Hub {ts % 1000}",
            "address": "789 Enterprise Way, Tech District"
        }
        status, updated_wh = api_call(f'/warehouses/{wh_id}', updated_wh_payload, method='PUT', token=mgr_token)
        assert status == 200, f"Manager update warehouse failed: {updated_wh}"
        assert updated_wh['name'] == updated_wh_payload['name']
        assert updated_wh['address'] == updated_wh_payload['address']
        assert updated_wh['code'] == new_wh_code
        print(f"[OK] Manager updated warehouse ID {wh_id}: {updated_wh['name']} ({updated_wh['address']})")

        # 5. Inventory Manager Create & Update Location
        print("\nTesting Inventory Manager Location Create & Update...")
        new_loc_code = f"LOC-P7-{ts % 10000}"
        new_loc_payload = {
            "warehouse_id": wh_id,
            "name": "Staging Bay Alpha",
            "code": new_loc_code
        }
        status, created_loc = api_call('/warehouses/locations', new_loc_payload, method='POST', token=mgr_token)
        assert status == 201, f"Manager create location failed: {created_loc}"
        loc_id = created_loc['id']
        assert created_loc['warehouse_id'] == wh_id
        assert created_loc['code'] == new_loc_code
        print(f"[OK] Manager created location ID {loc_id}: {created_loc['name']} in WH {wh_id}")

        # Update Location
        updated_loc_payload = {
            "name": "High-Density Rack A-01",
            "code": f"HDR-{ts % 10000}"
        }
        status, updated_loc = api_call(f'/warehouses/locations/{loc_id}', updated_loc_payload, method='PUT', token=mgr_token)
        assert status == 200, f"Manager update location failed: {updated_loc}"
        assert updated_loc['name'] == updated_loc_payload['name']
        assert updated_loc['code'] == updated_loc_payload['code']
        print(f"[OK] Manager updated location ID {loc_id}: {updated_loc['name']} ({updated_loc['code']})")

        # 6. Verify Location belongs to Warehouse when querying warehouses
        status, all_whs = api_call('/warehouses', token=mgr_token)
        matching_wh = next((w for w in all_whs if w['id'] == wh_id), None)
        assert matching_wh is not None, f"Created warehouse {wh_id} not in /warehouses list"
        matching_loc = next((l for l in matching_wh.get('locations', []) if l['id'] == loc_id), None)
        assert matching_loc is not None, f"Location {loc_id} not in warehouse {wh_id} locations list"
        assert matching_loc['name'] == updated_loc_payload['name']
        print(f"[OK] Verified location {loc_id} appears in warehouse {wh_id} locations hierarchy")

        print("\n============================================================")
        print("PHASE 7 BACKEND RBAC & CRUD VERIFICATION PASSED!")
        print("============================================================")

    finally:
        try:
            from app.core.database import SessionLocal
            from app.models import Warehouse, Location
            cleanup_db = SessionLocal()
            if loc_id:
                for l in cleanup_db.query(Location).filter(Location.id == loc_id).all():
                    cleanup_db.delete(l)
                cleanup_db.commit()
            if wh_id:
                for l in cleanup_db.query(Location).filter(Location.warehouse_id == wh_id).all():
                    cleanup_db.delete(l)
                cleanup_db.commit()
                for w in cleanup_db.query(Warehouse).filter(Warehouse.id == wh_id).all():
                    cleanup_db.delete(w)
                cleanup_db.commit()
            cleanup_db.close()
        except Exception as cleanup_err:
            print(f"Warning during test_phase7 cleanup: {cleanup_err}")


if __name__ == "__main__":
    test_phase7()
