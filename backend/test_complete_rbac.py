import time
from fastapi.testclient import TestClient
from main import app, init_db
from app.core.database import SessionLocal
from app.models import Product, Warehouse, Location, Category, StockAdjustment, StockLedger, Receipt, Delivery, InternalTransfer

def test_complete_rbac():
    init_db()
    client = TestClient(app)

    # Log in as Manager (admin@stocksense.io)
    res_mgr = client.post("/api/v1/auth/login", json={"email": "admin@stocksense.io", "password": "admin123"})
    assert res_mgr.status_code == 200, f"Manager login failed: {res_mgr.text}"
    mgr_token = res_mgr.json()["access_token"]
    mgr_headers = {"Authorization": f"Bearer {mgr_token}"}
    assert res_mgr.json()["user"]["role"] in ["inventory_manager", "admin"]

    # Log in as Warehouse Staff (staff@stocksense.io)
    res_staff = client.post("/api/v1/auth/login", json={"email": "staff@stocksense.io", "password": "staff123"})
    assert res_staff.status_code == 200, f"Staff login failed: {res_staff.text}"
    staff_token = res_staff.json()["access_token"]
    staff_headers = {"Authorization": f"Bearer {staff_token}"}
    assert res_staff.json()["user"]["role"] == "warehouse_staff"

    # 1. UNAUTHENTICATED CHECKS (401)
    res = client.post("/api/v1/products", json={"name": "Anon Product", "sku": "ANON-01"})
    assert res.status_code == 401

    # 2. CATALOG & WAREHOUSE MUTATIONS: BLOCKED FOR STAFF (403), ALLOWED FOR MANAGER
    # Product Create
    res = client.post("/api/v1/products", json={
        "name": "Staff Attempt Product", "sku": "STAFF-PROD-99", "uom": "Units", "unit_price": 50.0
    }, headers=staff_headers)
    assert res.status_code == 403

    # Product Update
    res = client.put("/api/v1/products/1", json={"name": "Staff Changed Name"}, headers=staff_headers)
    assert res.status_code == 403

    # Product Delete
    res = client.delete("/api/v1/products/1", headers=staff_headers)
    assert res.status_code == 403

    # Category Create
    res = client.post("/api/v1/products/categories", json={"name": "Staff Cat"}, headers=staff_headers)
    assert res.status_code == 403

    # Warehouse Create
    res = client.post("/api/v1/warehouses", json={"name": "Staff WH", "code": "SWH"}, headers=staff_headers)
    assert res.status_code == 403

    # Location Create
    res = client.post("/api/v1/warehouses/locations", json={"warehouse_id": 1, "name": "Staff Loc", "code": "SLOC"}, headers=staff_headers)
    assert res.status_code == 403

    # 3. INBOUND RECEIPTS:
    # 3.1 Staff cannot create receipt (403)
    res = client.post("/api/v1/receipts", json={
        "supplier_name": "Staff Supplier",
        "items": [{"product_id": 1, "location_id": 1, "quantity": 10, "unit_cost": "15.00"}]
    }, headers=staff_headers)
    assert res.status_code == 403

    # 3.2 Manager CAN create receipt (201)
    res_rcpt = client.post("/api/v1/receipts", json={
        "supplier_name": "Manager Supplier",
        "items": [{"product_id": 1, "location_id": 1, "quantity": 5, "unit_cost": "20.00"}]
    }, headers=mgr_headers)
    assert res_rcpt.status_code == 201, f"Failed: {res_rcpt.text}"
    rcpt_id = res_rcpt.json()["id"]

    # 3.3 Staff cannot update receipt (403)
    res = client.put(f"/api/v1/receipts/{rcpt_id}", json={
        "supplier_name": "Staff Modified Supplier"
    }, headers=staff_headers)
    assert res.status_code == 403

    # 3.4 Manager CAN update draft receipt (200)
    res = client.put(f"/api/v1/receipts/{rcpt_id}", json={
        "supplier_name": "Manager Updated Supplier",
        "notes": "Updated by manager"
    }, headers=mgr_headers)
    assert res.status_code == 200
    assert res.json()["supplier_name"] == "Manager Updated Supplier"

    # 3.5 Staff CAN view receipts (200)
    res = client.get("/api/v1/receipts", headers=staff_headers)
    assert res.status_code == 200

    # 3.6 Staff cannot cancel receipt (403)
    res = client.post(f"/api/v1/receipts/{rcpt_id}/cancel", headers=staff_headers)
    assert res.status_code == 403

    # 3.7 Staff CAN receive/validate draft receipt (200)
    res = client.post(f"/api/v1/receipts/{rcpt_id}/validate", headers=staff_headers)
    assert res.status_code == 200
    assert res.json()["status"].upper() == "DONE"

    # 3.8 Manager CAN cancel a draft receipt
    res_rcpt2 = client.post("/api/v1/receipts", json={
        "supplier_name": "To Cancel Supplier",
        "items": [{"product_id": 1, "location_id": 1, "quantity": 2, "unit_cost": "20.00"}]
    }, headers=mgr_headers)
    assert res_rcpt2.status_code == 201
    rcpt2_id = res_rcpt2.json()["id"]

    res_cancel = client.post(f"/api/v1/receipts/{rcpt2_id}/cancel", headers=mgr_headers)
    assert res_cancel.status_code == 200
    assert res_cancel.json()["status"].upper() == "CANCELLED"

    # 4. OUTBOUND DELIVERIES:
    # 4.1 Staff cannot create delivery (403)
    res = client.post("/api/v1/deliveries", json={
        "customer_name": "Staff Customer",
        "items": [{"product_id": 1, "location_id": 1, "quantity": 1}]
    }, headers=staff_headers)
    assert res.status_code == 403

    # 4.2 Manager CAN create delivery (201)
    res_del = client.post("/api/v1/deliveries", json={
        "customer_name": "Manager Customer",
        "items": [{"product_id": 1, "location_id": 1, "quantity": 1}]
    }, headers=mgr_headers)
    assert res_del.status_code == 201, f"Failed: {res_del.text}"
    del_id = res_del.json()["id"]

    # 4.3 Staff CAN view deliveries (200)
    res = client.get("/api/v1/deliveries", headers=staff_headers)
    assert res.status_code == 200

    # 4.4 Staff cannot cancel delivery (403)
    res = client.post(f"/api/v1/deliveries/{del_id}/cancel", headers=staff_headers)
    assert res.status_code == 403

    # 4.5 Staff CAN check & advance delivery to waiting/ready (200)
    res = client.post(f"/api/v1/deliveries/{del_id}/check_availability", headers=staff_headers)
    assert res.status_code == 200

    # 4.6 Manager CAN cancel a delivery (200)
    res_del2 = client.post("/api/v1/deliveries", json={
        "customer_name": "Customer To Cancel",
        "items": [{"product_id": 1, "location_id": 1, "quantity": 1}]
    }, headers=mgr_headers)
    assert res_del2.status_code == 201
    del2_id = res_del2.json()["id"]

    res_cancel_del = client.post(f"/api/v1/deliveries/{del2_id}/cancel", headers=mgr_headers)
    assert res_cancel_del.status_code == 200
    assert res_cancel_del.json()["status"].upper() == "CANCELLED"

    # 5. INTERNAL TRANSFERS:
    # 5.1 Staff CAN create transfer (201)
    res_tr = client.post("/api/v1/transfers", json={
        "source_location_id": 1,
        "dest_location_id": 2,
        "notes": "Staff moving stock",
        "items": [{"product_id": 1, "quantity": 1}]
    }, headers=staff_headers)
    assert res_tr.status_code == 201, f"Failed: {res_tr.text}"
    tr_id = res_tr.json()["id"]

    # 5.2 Staff cannot cancel transfer (403)
    res = client.post(f"/api/v1/transfers/{tr_id}/cancel", headers=staff_headers)
    assert res.status_code == 403

    # 5.3 Staff CAN complete transfer (200)
    res = client.post(f"/api/v1/transfers/{tr_id}/complete", headers=staff_headers)
    assert res.status_code == 200
    assert res.json()["status"].upper() == "COMPLETED"

    # 5.4 Manager CAN cancel a draft transfer (200)
    res_tr2 = client.post("/api/v1/transfers", json={
        "source_location_id": 1,
        "dest_location_id": 2,
        "notes": "Transfer to cancel",
        "items": [{"product_id": 1, "quantity": 1}]
    }, headers=mgr_headers)
    assert res_tr2.status_code == 201
    tr2_id = res_tr2.json()["id"]

    res_cancel_tr = client.post(f"/api/v1/transfers/{tr2_id}/cancel", headers=mgr_headers)
    assert res_cancel_tr.status_code == 200
    assert res_cancel_tr.json()["status"].upper() == "CANCELLED"

    # 6. STOCK ADJUSTMENTS:
    # 6.1 Staff CAN submit physical count / stock adjustment (201)
    res_adj = client.post("/api/v1/adjustments", json={
        "product_id": 1,
        "location_id": 1,
        "counted_qty": 45,
        "reason": "Staff physical cycle count",
        "notes": "Floor count verified"
    }, headers=staff_headers)
    assert res_adj.status_code == 201

    # 6.2 Manager CAN submit stock adjustment (201)
    res_adj_mgr = client.post("/api/v1/adjustments", json={
        "product_id": 1,
        "location_id": 1,
        "counted_qty": 45,
        "reason": "Manager cycle count verification",
        "notes": "Manager verification"
    }, headers=mgr_headers)
    assert res_adj_mgr.status_code == 201

    # 7. DASHBOARD & LEDGER:
    # Both roles can view
    res = client.get("/api/v1/dashboard/summary", headers=staff_headers)
    assert res.status_code == 200
    res = client.get("/api/v1/dashboard/summary", headers=mgr_headers)
    assert res.status_code == 200

    res = client.get("/api/v1/ledger", headers=staff_headers)
    assert res.status_code == 200
    res = client.get("/api/v1/ledger", headers=mgr_headers)
    assert res.status_code == 200

    print("ALL COMPLETE RBAC ASSERTIONS PASSED!")
