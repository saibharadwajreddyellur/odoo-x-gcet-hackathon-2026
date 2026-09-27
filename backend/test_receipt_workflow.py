import urllib.request
import urllib.error
import json
from datetime import datetime

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

def test_receipt_workflow():
    print("============================================================")
    print("TESTING INBOUND RECEIPT WORKFLOW: DRAFT -> EDIT -> RECEIVE -> DONE")
    print("============================================================")

    # 1. Login
    status, login_res = api_call('/auth/login', {'email': 'admin@stocksense.io', 'password': 'admin123'}, method='POST')
    assert status == 200, f'Login failed: {login_res}'
    token = login_res['access_token']
    print('[OK] 1. Authenticated as admin')

    # Get a product and location
    status, prods = api_call('/products', token=token)
    assert status == 200 and len(prods) > 0, "No products found"
    test_prod = prods[0]
    prod_id = test_prod['id']

    status, whs = api_call('/warehouses', token=token)
    assert status == 200 and len(whs) > 0 and len(whs[0]['locations']) > 0, "No warehouses/locations found"
    loc_id = whs[0]['locations'][0]['id']

    # Get initial stock of test_prod at loc_id
    initial_stock = 0
    for sl in test_prod.get('stock_levels', []):
        if sl['location_id'] == loc_id:
            initial_stock = sl['quantity_on_hand']
            break
    print(f'[INFO] Initial stock for product {test_prod["name"]} (ID: {prod_id}) at location {loc_id}: {initial_stock}')

    # 2. Create Receipt in DRAFT
    create_payload = {
        'supplier_name': 'Original Supplier Inc',
        'scheduled_date': datetime.utcnow().isoformat(),
        'notes': 'Original draft notes',
        'items': [
            {
                'product_id': prod_id,
                'location_id': loc_id,
                'quantity': 10,
                'unit_cost': 25.50
            }
        ]
    }
    status, rec = api_call('/receipts', data=create_payload, method='POST', token=token)
    assert status in [200, 201], f"Create receipt failed: {rec}"
    rec_id = rec['id']
    assert rec['status'] == 'DRAFT', f"Expected DRAFT status, got {rec['status']}"
    assert rec['supplier_name'] == 'Original Supplier Inc'
    print(f'[OK] 2. Created receipt #{rec["receipt_number"]} with status DRAFT')

    # 3. Edit Draft Receipt (PUT /receipts/{id})
    update_payload = {
        'supplier_name': 'Updated Premium Supplier Ltd',
        'notes': 'Updated PO notes and revised quantity to 25',
        'items': [
            {
                'product_id': prod_id,
                'location_id': loc_id,
                'quantity': 25,
                'unit_cost': 30.00
            }
        ]
    }
    status, updated_rec = api_call(f'/receipts/{rec_id}', data=update_payload, method='PUT', token=token)
    assert status == 200, f"Update receipt failed: {updated_rec}"
    assert updated_rec['status'] == 'DRAFT', f"Expected status DRAFT, got {updated_rec['status']}"
    assert updated_rec['supplier_name'] == 'Updated Premium Supplier Ltd'
    assert updated_rec['notes'] == 'Updated PO notes and revised quantity to 25'
    assert len(updated_rec['items']) == 1
    assert updated_rec['items'][0]['quantity'] == 25
    assert float(updated_rec['items'][0]['unit_cost']) == 30.00
    print('[OK] 3. Successfully edited DRAFT receipt with updated supplier, notes, and items')

    # 4. Receive/Validate Directly from DRAFT (POST /receipts/{id}/validate)
    status, validated_rec = api_call(f'/receipts/{rec_id}/validate', method='POST', token=token)
    assert status == 200, f"Validate receipt failed: {validated_rec}"
    assert validated_rec['status'] == 'DONE', f"Expected status DONE, got {validated_rec['status']}"
    print(f'[OK] 4. Validated receipt #{validated_rec["receipt_number"]} directly from DRAFT -> DONE')

    # Verify stock increased by 25
    status, updated_prod = api_call(f'/products/{prod_id}', token=token)
    assert status == 200
    new_stock = 0
    for sl in updated_prod.get('stock_levels', []):
        if sl['location_id'] == loc_id:
            new_stock = sl['quantity_on_hand']
            break
    print(f'[INFO] Updated stock at location {loc_id}: {new_stock} (Expected: {initial_stock + 25})')
    assert new_stock == initial_stock + 25, f"Stock did not increase as expected: {new_stock} vs {initial_stock + 25}"
    print('[OK] 5. Stock successfully increased by exactly +25 in inventory ledger')

    # 5. Check Immutability: Editing DONE receipt must fail
    status, err_res = api_call(f'/receipts/{rec_id}', data={'supplier_name': 'Hacker Inc'}, method='PUT', token=token)
    assert status == 400, f"Expected 400 when updating DONE receipt, got {status}: {err_res}"
    print(f'[OK] 6. Immutability confirmed: Updating DONE receipt rejected with 400: {err_res.get("detail")}')

    # 6. Check Immutability: Re-validating DONE receipt must fail
    status, err_res2 = api_call(f'/receipts/{rec_id}/validate', method='POST', token=token)
    assert status == 400, f"Expected 400 when validating already DONE receipt, got {status}: {err_res2}"
    print(f'[OK] 7. Immutability confirmed: Validating already DONE receipt rejected with 400: {err_res2.get("detail")}')

    # 7. Test DRAFT -> CANCELLED workflow
    status, rec2 = api_call('/receipts', data=create_payload, method='POST', token=token)
    assert status in [200, 201]
    rec2_id = rec2['id']
    assert rec2['status'] == 'DRAFT'
    print(f'[OK] 8. Created second receipt #{rec2["receipt_number"]} in DRAFT')

    status, cancelled_rec = api_call(f'/receipts/{rec2_id}/cancel', method='POST', token=token)
    assert status == 200
    assert cancelled_rec['status'] == 'CANCELLED'
    print(f'[OK] 9. Cancelled receipt #{cancelled_rec["receipt_number"]} successfully')

    # 8. Check Immutability: Editing CANCELLED receipt must fail
    status, err_res3 = api_call(f'/receipts/{rec2_id}', data={'supplier_name': 'Hacker Inc'}, method='PUT', token=token)
    assert status == 400, f"Expected 400 when updating CANCELLED receipt, got {status}: {err_res3}"
    print(f'[OK] 10. Immutability confirmed: Updating CANCELLED receipt rejected with 400: {err_res3.get("detail")}')

    print("\n============================================================")
    print("ALL INBOUND RECEIPT WORKFLOW TESTS PASSED PERFECTLY!")
    print("============================================================")

if __name__ == '__main__':
    test_receipt_workflow()
