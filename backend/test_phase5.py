import urllib.request
import urllib.error
import json
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


def test_phase5():
    print("============================================================")
    print("STARTING PHASE 5 STOCK VIEW & ADJUSTMENT VERIFICATION")
    print("============================================================")

    created_adj_nums = []
    product_id = None
    location_id = None
    initial_on_hand = None

    try:
        # 1. Authenticate
        status, login_res = api_call('/auth/login', {'email': 'admin@stocksense.io', 'password': 'admin123'}, method='POST')
        assert status == 200, f"Login failed: {login_res}"
        token = login_res['access_token']
        print("[OK] Authenticated as admin user")

        # 2. Fetch all products and inspect stock levels
        status, products = api_call('/products', token=token)
        assert status == 200, f"Failed to get products: {products}"
        assert len(products) > 0, "No products found in database"
        print(f"[OK] Retrieved {len(products)} products from catalog")

        # Find a product with an existing stock level
        target_prod = None
        target_level = None
        for p in products:
            if p.get('stock_levels') and len(p['stock_levels']) > 0:
                target_prod = p
                target_level = p['stock_levels'][0]
                break

        assert target_prod is not None, "Could not find a product with an active stock level"
        assert target_level is not None, "Target level is missing"

        product_id = target_prod['id']
        location_id = target_level['location_id']
        initial_on_hand = target_level['quantity_on_hand']
        reserved_qty = target_level.get('reserved_quantity', 0)
        initial_free_to_use = initial_on_hand - reserved_qty
        unit_cost = target_prod.get('unit_price', 0)

        print(f"[OK] Target Product Selected:")
        print(f"   - Name: {target_prod['name']}")
        print(f"   - SKU: {target_prod['sku']}")
        print(f"   - Category: {target_prod.get('category_name')}")
        print(f"   - Unit Price / Cost: ${unit_cost}")
        print(f"   - Location ID: {location_id} ({target_level.get('location_name')})")
        print(f"   - Initial On Hand: {initial_on_hand}")
        print(f"   - Initial Free to Use: {initial_free_to_use} (Reserved: {reserved_qty})")

        # 3. Test Upward Stock Adjustment (+20 units)
        new_count_up = initial_on_hand + 20
        adj_payload_up = {
            "product_id": product_id,
            "location_id": location_id,
            "counted_qty": new_count_up,
            "reason": "Phase 5 Stock Count Reconciliation (Surplus Audit)",
            "notes": "Verified by automated test suite"
        }

        status, adj_up_res = api_call('/adjustments', adj_payload_up, method='POST', token=token)
        assert status == 201, f"Adjustment failed with status {status}: {adj_up_res}"
        adj_num_up = adj_up_res['adjustment_number']
        created_adj_nums.append(adj_num_up)
        assert adj_up_res['recorded_qty'] == initial_on_hand, f"Expected recorded_qty {initial_on_hand}, got {adj_up_res['recorded_qty']}"
        assert adj_up_res['counted_qty'] == new_count_up, f"Expected counted_qty {new_count_up}, got {adj_up_res['counted_qty']}"
        assert adj_up_res['diff_qty'] == 20, f"Expected diff_qty 20, got {adj_up_res['diff_qty']}"
        print(f"[OK] Upward Adjustment created successfully ({adj_num_up}):")
        print(f"   - Recorded: {initial_on_hand} -> Counted: {new_count_up} (Diff: +20)")

        # Verify product stock level updated in DB
        status, updated_products = api_call('/products', token=token)
        updated_prod = next(p for p in updated_products if p['id'] == product_id)
        updated_level = next(sl for sl in updated_prod['stock_levels'] if sl['location_id'] == location_id)
        assert updated_level['quantity_on_hand'] == new_count_up, f"Expected on hand {new_count_up}, got {updated_level['quantity_on_hand']}"
        updated_free_to_use = updated_level['quantity_on_hand'] - updated_level.get('reserved_quantity', 0)
        assert updated_free_to_use == new_count_up - reserved_qty, f"Free to use calculation mismatch: {updated_free_to_use}"
        print(f"[OK] Product stock level verified updated in database: On Hand={updated_level['quantity_on_hand']}, Free To Use={updated_free_to_use}")

        # Verify Stock Ledger entry logged for upward adjustment
        status, ledger_entries = api_call(f'/ledger?product_id={product_id}&location_id={location_id}&limit=10', token=token)
        assert status == 200, f"Failed to get ledger: {ledger_entries}"
        latest_ledger = ledger_entries[0]
        assert latest_ledger['action_type'] == 'ADJUSTMENT', f"Expected action_type ADJUSTMENT, got {latest_ledger['action_type']}"
        assert latest_ledger['change_qty'] == 20, f"Expected change_qty 20, got {latest_ledger['change_qty']}"
        assert latest_ledger['balance_after'] == new_count_up, f"Expected balance_after {new_count_up}, got {latest_ledger['balance_after']}"
        assert latest_ledger['reference_doc_number'] == adj_num_up, f"Expected reference {adj_num_up}, got {latest_ledger['reference_doc_number']}"
        print(f"[OK] Immutable Stock Ledger record verified:")
        print(f"   - Action: {latest_ledger['action_type']}")
        print(f"   - Change: +{latest_ledger['change_qty']}")
        print(f"   - Balance After: {latest_ledger['balance_after']}")
        print(f"   - Doc Reference: {latest_ledger['reference_doc_number']}")

        # 4. Test Downward Stock Adjustment (-8 units, e.g. Damaged Goods)
        new_count_down = new_count_up - 8
        adj_payload_down = {
            "product_id": product_id,
            "location_id": location_id,
            "counted_qty": new_count_down,
            "reason": "Damaged Goods Discrepancy",
            "notes": "8 units damaged during shelf audit"
        }

        status, adj_down_res = api_call('/adjustments', adj_payload_down, method='POST', token=token)
        assert status == 201, f"Downward adjustment failed: {adj_down_res}"
        adj_num_down = adj_down_res['adjustment_number']
        created_adj_nums.append(adj_num_down)
        assert adj_down_res['diff_qty'] == -8, f"Expected diff_qty -8, got {adj_down_res['diff_qty']}"
        assert adj_down_res['counted_qty'] == new_count_down, f"Expected counted_qty {new_count_down}"
        print(f"[OK] Downward Adjustment created successfully ({adj_num_down}):")
        print(f"   - Recorded: {new_count_up} -> Counted: {new_count_down} (Diff: -8)")

        # Verify ledger entry for downward adjustment
        status, ledger_entries = api_call(f'/ledger?product_id={product_id}&location_id={location_id}&limit=5', token=token)
        latest_down_ledger = ledger_entries[0]
        assert latest_down_ledger['action_type'] == 'ADJUSTMENT'
        assert latest_down_ledger['change_qty'] == -8
        assert latest_down_ledger['balance_after'] == new_count_down
        assert latest_down_ledger['reference_doc_number'] == adj_num_down
        print(f"[OK] Downward adjustment verified in Stock Ledger (Change: -8, Balance After: {new_count_down})")

        # 5. Restore stock to initial count for test idempotency
        restore_payload = {
            "product_id": product_id,
            "location_id": location_id,
            "counted_qty": initial_on_hand,
            "reason": "Test Suite Clean-up Restoration",
            "notes": "Restored baseline test quantity"
        }
        status, restore_res = api_call('/adjustments', restore_payload, method='POST', token=token)
        assert status == 201
        if status == 201 and 'adjustment_number' in restore_res:
            created_adj_nums.append(restore_res['adjustment_number'])
        print(f"[OK] Baseline stock restored to initial count ({initial_on_hand}) via ledger-backed adjustment")

        print("============================================================")
        print("ALL PHASE 5 STOCK VIEW & ADJUSTMENT CHECKS PASSED!")
        print("============================================================")

    finally:
        try:
            from app.core.database import SessionLocal
            from app.models import StockAdjustment, StockLedger, StockLevel
            cleanup_db = SessionLocal()
            for anum in created_adj_nums:
                cleanup_db.query(StockAdjustment).filter(StockAdjustment.adjustment_number == anum).delete()
                cleanup_db.query(StockLedger).filter(StockLedger.reference_doc_number == anum).delete()
            if product_id and location_id and initial_on_hand is not None:
                sl = cleanup_db.query(StockLevel).filter(StockLevel.product_id == product_id, StockLevel.location_id == location_id).first()
                if sl:
                    sl.quantity_on_hand = initial_on_hand
            cleanup_db.commit()
            cleanup_db.close()
        except Exception as cleanup_err:
            print(f"Warning during test_phase5 cleanup: {cleanup_err}")


if __name__ == "__main__":
    test_phase5()
