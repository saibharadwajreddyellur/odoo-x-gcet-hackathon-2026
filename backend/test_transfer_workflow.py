from fastapi.testclient import TestClient
from main import app
from app.core.database import SessionLocal
from app.models.transfer import InternalTransfer
from app.models.product import StockLevel, Product
from app.models.ledger import StockLedger

client = TestClient(app)

def test_transfer_lifecycle():
    # 1. Fetch existing transfers
    res = client.get("/api/v1/transfers")
    assert res.status_code == 200, f"Expected 200, got {res.status_code}: {res.text}"
    existing = res.json()
    print(f"Initial transfers count: {len(existing)}")

    # 2. Create a transfer as DRAFT
    payload = {
        "source_location_id": 1,
        "dest_location_id": 2,
        "status": "DRAFT",
        "notes": "Testing transfer workflow DRAFT -> SCHEDULED -> COMPLETED",
        "items": [
            {"product_id": 1, "quantity": 3}
        ]
    }
    res = client.post("/api/v1/transfers", json=payload)
    assert res.status_code == 201, f"Expected 201, got {res.status_code}: {res.text}"
    trf = res.json()
    trf_id = trf["id"]
    assert trf["status"] == "DRAFT", f"Expected DRAFT, got {trf['status']}"
    print(f"Created transfer {trf['transfer_number']} with status: {trf['status']}")

    # 3. GET /transfers/{id}
    res = client.get(f"/api/v1/transfers/{trf_id}")
    assert res.status_code == 200
    assert res.json()["status"] == "DRAFT"

    # 4. Schedule the transfer: POST /transfers/{id}/schedule
    res = client.post(f"/api/v1/transfers/{trf_id}/schedule")
    assert res.status_code == 200, f"Expected 200, got {res.status_code}: {res.text}"
    scheduled_trf = res.json()
    assert scheduled_trf["status"] == "SCHEDULED", f"Expected SCHEDULED, got {scheduled_trf['status']}"
    print(f"Scheduled transfer {trf_id}: status is now {scheduled_trf['status']}")

    # 5. Check stock before completion
    db = SessionLocal()
    try:
        src_level = db.query(StockLevel).filter(StockLevel.product_id == 1, StockLevel.location_id == 1).first()
        src_stock_before = src_level.quantity_on_hand if src_level else 0
        dest_level = db.query(StockLevel).filter(StockLevel.product_id == 1, StockLevel.location_id == 2).first()
        dest_stock_before = dest_level.quantity_on_hand if dest_level else 0
    finally:
        db.close()

    # 6. Execute & Complete the transfer: POST /transfers/{id}/complete
    res = client.post(f"/api/v1/transfers/{trf_id}/complete")
    assert res.status_code == 200, f"Expected 200, got {res.status_code}: {res.text}"
    completed_trf = res.json()
    assert completed_trf["status"] == "COMPLETED", f"Expected COMPLETED, got {completed_trf['status']}"
    assert completed_trf["completed_at"] is not None
    print(f"Completed transfer {trf_id}: status is now {completed_trf['status']}")

    # 7. Check stock after completion
    db = SessionLocal()
    try:
        src_stock_after = db.query(StockLevel).filter(StockLevel.product_id == 1, StockLevel.location_id == 1).first().quantity_on_hand
        dest_stock_after = db.query(StockLevel).filter(StockLevel.product_id == 1, StockLevel.location_id == 2).first().quantity_on_hand
        assert src_stock_after == src_stock_before - 3, f"Expected src {src_stock_before - 3}, got {src_stock_after}"
        assert dest_stock_after == dest_stock_before + 3, f"Expected dest {dest_stock_before + 3}, got {dest_stock_after}"
        print(f"Stock integrity confirmed: src {src_stock_before} -> {src_stock_after}, dest {dest_stock_before} -> {dest_stock_after}")

        # Check ledger dual audit entries
        ledger_entries = db.query(StockLedger).filter(StockLedger.reference_doc_number == trf["transfer_number"]).all()
        assert len(ledger_entries) == 2, f"Expected 2 ledger entries, got {len(ledger_entries)}"
        actions = {e.action_type for e in ledger_entries}
        assert actions == {"TRANSFER_OUT", "TRANSFER_IN"}, f"Unexpected actions: {actions}"
        print("Dual ledger entries logged: TRANSFER_OUT and TRANSFER_IN")
    finally:
        db.close()

    # 8. Immutability check: cannot schedule, complete, or cancel a COMPLETED transfer
    res_sched = client.post(f"/api/v1/transfers/{trf_id}/schedule")
    assert res_sched.status_code == 400, f"Expected 400 for scheduling completed transfer, got {res_sched.status_code}"

    res_comp = client.post(f"/api/v1/transfers/{trf_id}/complete")
    assert res_comp.status_code == 400, f"Expected 400 for completing completed transfer, got {res_comp.status_code}"

    res_cancel = client.post(f"/api/v1/transfers/{trf_id}/cancel")
    assert res_cancel.status_code == 400, f"Expected 400 for cancelling completed transfer, got {res_cancel.status_code}"
    print("Immutability confirmed: Completed transfer rejects schedule, complete, and cancel")

    # 9. Test cancellation workflow on a new DRAFT transfer
    res2 = client.post("/api/v1/transfers", json={
        "source_location_id": 1,
        "dest_location_id": 2,
        "status": "DRAFT",
        "notes": "Testing transfer cancellation",
        "items": [{"product_id": 1, "quantity": 1}]
    })
    assert res2.status_code == 201
    cancel_trf = res2.json()
    cancel_id = cancel_trf["id"]

    res_cancel2 = client.post(f"/api/v1/transfers/{cancel_id}/cancel")
    assert res_cancel2.status_code == 200
    assert res_cancel2.json()["status"] == "CANCELLED"
    print(f"Cancelled transfer {cancel_id}: status is now CANCELLED")

    # Cancelled transfer rejects schedule and complete
    res_sched2 = client.post(f"/api/v1/transfers/{cancel_id}/schedule")
    assert res_sched2.status_code == 400
    res_comp2 = client.post(f"/api/v1/transfers/{cancel_id}/complete")
    assert res_comp2.status_code == 400
    print("Cancelled transfer terminal state confirmed: rejects schedule and complete")

    print("\nALL TRANSFER WORKFLOW TESTS PASSED!")

if __name__ == "__main__":
    test_transfer_lifecycle()
