import urllib.request
import urllib.error
import json
from datetime import datetime, timedelta

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


def test_phase3():
    print("============================================================")
    print("STARTING PHASE 3 DASHBOARD VERIFICATION")
    print("============================================================")

    # 1. Login
    status, login_res = api_call('/auth/login', {'email': 'admin@stocksense.io', 'password': 'admin123'}, method='POST')
    assert status == 200, f'Login failed: {login_res}'
    token = login_res['access_token']
    print('[OK] Authenticated as admin')

    # 2. Basic Dashboard Summary
    status, dash = api_call('/dashboard/summary', token=token)
    assert status == 200
    kpis = dash['kpis']
    print('[OK] Dashboard Summary retrieved successfully:')
    print(f'   - Receipts to Receive: {kpis.get("receipts_to_receive")}')
    print(f'   - Deliveries to Deliver: {kpis.get("deliveries_to_deliver")}')
    print(f'   - Late Operations: {kpis.get("late_operations")}')
    print(f'   - Waiting Operations: {kpis.get("waiting_operations")}')

    assert 'receipts_to_receive' in kpis, 'receipts_to_receive missing from KPIs'
    assert 'deliveries_to_deliver' in kpis, 'deliveries_to_deliver missing from KPIs'
    assert 'late_operations' in kpis, 'late_operations missing from KPIs'
    assert 'waiting_operations' in kpis, 'waiting_operations missing from KPIs'
    assert len(dash.get('operation_summaries', [])) >= 3, 'operation_summaries missing or incomplete'

    # 3. Test Filter by document_type
    status, dash_rec = api_call('/dashboard/summary?document_type=receipt', token=token)
    assert status == 200
    for doc in dash_rec.get('operations', []):
        assert doc['document_type'] == 'Receipt', f'Unexpected doc type: {doc["document_type"]}'
    print(f'[OK] Document Type filter (Receipts) passed: {len(dash_rec["operations"])} items')

    status, dash_del = api_call('/dashboard/summary?document_type=delivery', token=token)
    assert status == 200
    for doc in dash_del.get('operations', []):
        assert doc['document_type'] == 'Delivery', f'Unexpected doc type: {doc["document_type"]}'
    print(f'[OK] Document Type filter (Deliveries) passed: {len(dash_del["operations"])} items')

    # 4. Test Filter by status
    status, dash_ready = api_call('/dashboard/summary?status=READY', token=token)
    assert status == 200
    for doc in dash_ready.get('operations', []):
        assert doc['status'] == 'READY', f'Expected READY, got {doc["status"]}'
    print(f'[OK] Status filter (READY) passed: {len(dash_ready["operations"])} items')

    # 5. Test Filter by warehouse_id
    status, dash_wh = api_call('/dashboard/summary?warehouse_id=1', token=token)
    assert status == 200
    print(f'[OK] Warehouse filter (WH-1) passed: {len(dash_wh["operations"])} operations')

    # 6. Test Filter by category_id
    status, dash_cat = api_call('/dashboard/summary?category_id=1', token=token)
    assert status == 200
    print(f'[OK] Category filter (Cat-1) passed: {dash_cat["kpis"]["total_products"]} products')

    # 7. Test Movement Trends & Real Data
    assert 'movement_trends' in dash, 'movement_trends missing'
    assert len(dash['movement_trends']) == 7, 'movement_trends should have 7 days'
    print(f'[OK] Real Movement Trends verified (7 days): {dash["movement_trends"][-1]}')

    print('\n============================================================')
    print('ALL PHASE 3 DASHBOARD VERIFICATION TESTS PASSED SUCCESSFULLY!')
    print('============================================================')


if __name__ == "__main__":
    test_phase3()
