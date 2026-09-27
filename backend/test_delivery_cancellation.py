import sys
from fastapi.testclient import TestClient
from main import app, init_db
from app.core.database import SessionLocal
from app.models import Delivery, DeliveryItem, StockAdjustment, StockLedger, StockLevel


def test_delivery_cancellation():
    init_db()
    client = TestClient(app)
    db = SessionLocal()

    print("=" * 60)
    print("DELIVERY CANCELLATION & WORKFLOW VERIFICATION")
    print("=" * 60)

    created_delivery_ids = []
    created_adj_ids = []
    orig_stock = None
    prod_id = None
    loc_id = None

    try:
        # 1. Login
        res = client.post("/api/v1/auth/login", json={"email": "admin@stocksense.io", "password": "admin123"})
        assert res.status_code == 200, f"Login failed: {res.text}"
        token = res.json()["access_token"]
        headers = {"Authorization": f"Bearer {token}"}
        print("[PASS] Admin logged in successfully")

        # Get product and location
        prods_res = client.get("/api/v1/products", headers=headers)
        assert prods_res.status_code == 200
        products = prods_res.json()
        assert len(products) > 0
        prod_id = products[0]["id"]

        wh_res = client.get("/api/v1/warehouses", headers=headers)
        assert wh_res.status_code == 200
        warehouses = wh_res.json()
        assert len(warehouses) > 0 and len(warehouses[0]["locations"]) > 0
        loc_id = warehouses[0]["locations"][0]["id"]

        sl_rec = db.query(StockLevel).filter(StockLevel.product_id == prod_id, StockLevel.location_id == loc_id).first()
        orig_stock = sl_rec.quantity_on_hand if sl_rec else 0

        # TEST 1: Cancel DRAFT delivery
        del_draft_res = client.post("/api/v1/deliveries", json={
            "customer_name": "Acme Corp Draft",
            "shipping_address": "123 Test St",
            "items": [{"product_id": prod_id, "location_id": loc_id, "quantity": 2}]
        }, headers=headers)
        assert del_draft_res.status_code == 201
        del_draft = del_draft_res.json()
        created_delivery_ids.append(del_draft["id"])
        assert del_draft["status"] == "DRAFT"
        print(f"[PASS] Created DRAFT delivery #{del_draft['delivery_number']} (id: {del_draft['id']})")

        cancel_draft_res = client.post(f"/api/v1/deliveries/{del_draft['id']}/cancel", headers=headers)
        assert cancel_draft_res.status_code == 200
        assert cancel_draft_res.json()["status"] == "CANCELLED"
        print(f"[PASS] Successfully cancelled DRAFT delivery #{del_draft['delivery_number']}")

        # TEST 2: Double cancel must fail (HTTP 400)
        double_cancel_res = client.post(f"/api/v1/deliveries/{del_draft['id']}/cancel", headers=headers)
        assert double_cancel_res.status_code == 400
        assert "already cancelled" in double_cancel_res.json()["detail"].lower()
        print("[PASS] Double cancellation correctly rejected with HTTP 400")

        # TEST 3: Validation of CANCELLED delivery must fail (HTTP 400)
        val_cancelled_res = client.post(f"/api/v1/deliveries/{del_draft['id']}/validate", headers=headers)
        assert val_cancelled_res.status_code == 400
        print("[PASS] Validation of CANCELLED delivery correctly rejected with HTTP 400")

        # TEST 4: Cancel WAITING delivery
        # Create delivery with very large quantity to force WAITING status
        del_waiting_res = client.post("/api/v1/deliveries", json={
            "customer_name": "Big Buyer Shortage",
            "shipping_address": "999 Deficit Way",
            "items": [{"product_id": prod_id, "location_id": loc_id, "quantity": 999999}]
        }, headers=headers)
        assert del_waiting_res.status_code == 201
        del_waiting = del_waiting_res.json()
        created_delivery_ids.append(del_waiting["id"])

        # Check availability -> transitions to WAITING
        check_res = client.post(f"/api/v1/deliveries/{del_waiting['id']}/check_availability", headers=headers)
        assert check_res.status_code == 200
        assert check_res.json()["status"] == "WAITING"
        print(f"[PASS] Delivery #{del_waiting['delivery_number']} transitioned to WAITING")

        cancel_waiting_res = client.post(f"/api/v1/deliveries/{del_waiting['id']}/cancel", headers=headers)
        assert cancel_waiting_res.status_code == 200
        assert cancel_waiting_res.json()["status"] == "CANCELLED"
        print(f"[PASS] Successfully cancelled WAITING delivery #{del_waiting['delivery_number']}")

        # TEST 5: Cancel READY delivery
        # First ensure stock exists
        adj_res = client.post("/api/v1/adjustments", json={
            "product_id": prod_id,
            "location_id": loc_id,
            "counted_qty": 50,
            "reason": "Stock for ready test"
        }, headers=headers)
        assert adj_res.status_code == 201, f"Adjustment failed: {adj_res.text}"
        adj_data = adj_res.json()
        created_adj_ids.append(adj_data["id"])

        del_ready_res = client.post("/api/v1/deliveries", json={
            "customer_name": "Ready Buyer",
            "shipping_address": "456 Ready St",
            "items": [{"product_id": prod_id, "location_id": loc_id, "quantity": 5}]
        }, headers=headers)
        assert del_ready_res.status_code == 201
        del_ready = del_ready_res.json()
        created_delivery_ids.append(del_ready["id"])

        check_ready_res = client.post(f"/api/v1/deliveries/{del_ready['id']}/check_availability", headers=headers)
        assert check_ready_res.status_code == 200
        assert check_ready_res.json()["status"] == "READY"
        print(f"[PASS] Delivery #{del_ready['delivery_number']} transitioned to READY")

        cancel_ready_res = client.post(f"/api/v1/deliveries/{del_ready['id']}/cancel", headers=headers)
        assert cancel_ready_res.status_code == 200
        assert cancel_ready_res.json()["status"] == "CANCELLED"
        print(f"[PASS] Successfully cancelled READY delivery #{del_ready['delivery_number']}")

        # TEST 6: CANCEL on COMPLETED (DONE) delivery MUST FAIL (HTTP 400)
        del_done_res = client.post("/api/v1/deliveries", json={
            "customer_name": "Completed Buyer",
            "shipping_address": "789 Done Blvd",
            "items": [{"product_id": prod_id, "location_id": loc_id, "quantity": 2}]
        }, headers=headers)
        assert del_done_res.status_code == 201
        del_done = del_done_res.json()
        created_delivery_ids.append(del_done["id"])

        client.post(f"/api/v1/deliveries/{del_done['id']}/check_availability", headers=headers)
        val_done_res = client.post(f"/api/v1/deliveries/{del_done['id']}/validate", headers=headers)
        assert val_done_res.status_code == 200
        assert val_done_res.json()["status"] == "DONE"
        print(f"[PASS] Delivery #{del_done['delivery_number']} completed (status: DONE)")

        cancel_done_res = client.post(f"/api/v1/deliveries/{del_done['id']}/cancel", headers=headers)
        assert cancel_done_res.status_code == 400
        assert "cannot cancel a completed delivery" in cancel_done_res.json()["detail"].lower()
        print("[PASS] Cancelling a completed (DONE) delivery was correctly rejected with HTTP 400")

        # TEST 7: Delivery list reflects CANCELLED status
        list_res = client.get("/api/v1/deliveries", headers=headers)
        assert list_res.status_code == 200
        all_delivs = list_res.json()
        cancelled_ids = {d["id"] for d in all_delivs if d["status"] == "CANCELLED"}
        assert del_draft["id"] in cancelled_ids
        assert del_waiting["id"] in cancelled_ids
        assert del_ready["id"] in cancelled_ids
        print("[PASS] GET /api/v1/deliveries correctly reflects all CANCELLED orders")

        print("\n" + "=" * 60)
        print(">>> ALL DELIVERY CANCELLATION TESTS PASSED! <<<")
        print("=" * 60)

    finally:
        try:
            for did in created_delivery_ids:
                del_obj = db.query(Delivery).filter(Delivery.id == did).first()
                if del_obj:
                    del_num = del_obj.delivery_number
                    db.query(DeliveryItem).filter(DeliveryItem.delivery_id == did).delete()
                    db.delete(del_obj)
                    db.query(StockLedger).filter(StockLedger.reference_doc_number == del_num).delete()
            for aid in created_adj_ids:
                adj_obj = db.query(StockAdjustment).filter(StockAdjustment.id == aid).first()
                if adj_obj:
                    adj_num = adj_obj.adjustment_number
                    db.delete(adj_obj)
                    db.query(StockLedger).filter(StockLedger.reference_doc_number == adj_num).delete()
            if prod_id and loc_id and orig_stock is not None:
                sl_fix = db.query(StockLevel).filter(StockLevel.product_id == prod_id, StockLevel.location_id == loc_id).first()
                if sl_fix:
                    sl_fix.quantity_on_hand = orig_stock
            db.commit()
        except Exception as e:
            print(f"Warning during delivery cancellation test cleanup: {e}")
        finally:
            db.close()


if __name__ == "__main__":
    test_delivery_cancellation()
