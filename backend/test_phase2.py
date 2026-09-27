"""
Phase 2 Verification Script:
1. Test Receipt: Draft -> Ready -> Done, +stock once.
2. Test Delivery: Waiting/Ready -> Done, -stock once.
3. Test Cancel: no stock change.
4. Verify ledger entries for all operations.
"""
import sys
from fastapi import HTTPException
from app.core.database import SessionLocal
from app.models.product import Product, StockLevel
from app.models.warehouse import Warehouse, Location
from app.models.receipt import Receipt, ReceiptItem
from app.models.delivery import Delivery, DeliveryItem
from app.models.ledger import StockLedger
from app.schemas.movement import (
    ReceiptCreate,
    ReceiptItemCreate,
    DeliveryCreate,
    DeliveryItemCreate,
)
from app.api.v1.endpoints.receipts import (
    create_receipt,
    mark_receipt_ready,
    validate_receipt_endpoint,
    cancel_receipt,
)
from app.api.v1.endpoints.deliveries import (
    create_delivery,
    check_and_advance_to_waiting_or_ready,
    mark_delivery_ready,
    validate_delivery_endpoint,
    cancel_delivery,
)
from app.services.inventory_engine import get_or_create_stock_level


def test_phase2():
    db = SessionLocal()

    def get_stock(prod_id: int, loc_id: int) -> int:
        lvl = db.query(StockLevel).filter(
            StockLevel.product_id == prod_id,
            StockLevel.location_id == loc_id
        ).first()
        return lvl.quantity_on_hand if lvl else 0

    def get_ledger_count(prod_id: int, loc_id: int) -> int:
        return db.query(StockLedger).filter(
            StockLedger.product_id == prod_id,
            StockLedger.location_id == loc_id
        ).count()

    created_receipt_ids = []
    created_delivery_ids = []
    prod_id = None
    loc_id = None
    initial_stock = 0

    try:
        print("=" * 60)
        print("STARTING PHASE 2 VERIFICATION")
        print("=" * 60)

        # Setup isolated test entities
        prod = db.query(Product).first()
        loc = db.query(Location).first()
        assert prod is not None, "Product must exist in DB"
        assert loc is not None, "Location must exist in DB"
        prod_id = prod.id
        loc_id = loc.id

        initial_stock = get_stock(prod_id, loc_id)
        initial_ledger_count = get_ledger_count(prod_id, loc_id)
        print(f"Base state: Product {prod_id} at Location {loc_id}, Stock = {initial_stock}, Ledger Entries = {initial_ledger_count}")

        # =========================================================================
        # TEST 1: Receipt Workflow (Draft -> Ready -> Done, +stock once)
        # =========================================================================
        print("\n[TEST 1] Testing Receipt: Draft -> Ready -> Done (+stock once)")
        
        # 1.1 Create receipt -> status must be DRAFT, stock unchanged
        r_in = ReceiptCreate(
            supplier_name="Phase2 Supplier",
            items=[ReceiptItemCreate(product_id=prod_id, location_id=loc_id, quantity=25, unit_cost=50.0)]
        )
        rec = create_receipt(receipt_in=r_in, db=db, user=None)
        created_receipt_ids.append(rec.id)
        assert rec.status == "DRAFT", f"Expected DRAFT, got {rec.status}"
        assert get_stock(prod_id, loc_id) == initial_stock, "Stock changed prematurely on DRAFT creation!"
        assert get_ledger_count(prod_id, loc_id) == initial_ledger_count, "Ledger created prematurely on DRAFT creation!"
        print(f"  [OK] Receipt created in DRAFT ({rec.receipt_number}), stock unchanged ({initial_stock})")

        # 1.2 Try validating directly from DRAFT -> MUST FAIL
        try:
            validate_receipt_endpoint(receipt_id=rec.id, db=db, user=None)
            assert False, "Validation from DRAFT should have been blocked!"
        except HTTPException as e:
            assert e.status_code == 400, f"Expected 400, got {e.status_code}"
            print("  [OK] Validation from DRAFT correctly blocked (HTTP 400)")

        # 1.3 Mark Ready -> status must be READY, stock unchanged
        rec_ready = mark_receipt_ready(receipt_id=rec.id, db=db, user=None)
        assert rec_ready.status == "READY", f"Expected READY, got {rec_ready.status}"
        assert get_stock(prod_id, loc_id) == initial_stock, "Stock changed on Mark Ready!"
        assert get_ledger_count(prod_id, loc_id) == initial_ledger_count, "Ledger created on Mark Ready!"
        print(f"  [OK] Receipt marked READY, stock still unchanged ({initial_stock})")

        # 1.4 Validate -> status must be DONE, stock +25, 1 new ledger entry
        rec_done = validate_receipt_endpoint(receipt_id=rec.id, db=db, user=None)
        assert rec_done.status == "DONE", f"Expected DONE, got {rec_done.status}"
        stock_after_rec = get_stock(prod_id, loc_id)
        assert stock_after_rec == initial_stock + 25, f"Expected stock {initial_stock + 25}, got {stock_after_rec}"
        assert get_ledger_count(prod_id, loc_id) == initial_ledger_count + 1, "Ledger entry count did not increase by 1"

        # Verify ledger entry content
        latest_ledger = db.query(StockLedger).filter(
            StockLedger.product_id == prod_id,
            StockLedger.location_id == loc_id
        ).order_by(StockLedger.id.desc()).first()
        assert latest_ledger.action_type == "RECEIPT"
        assert latest_ledger.change_qty == 25
        assert latest_ledger.balance_after == initial_stock + 25
        assert latest_ledger.reference_doc_number == rec.receipt_number
        print(f"  [OK] Receipt validated -> DONE. Stock: {stock_after_rec} (+25). Ledger verified.")

        # 1.5 Try validating again -> MUST FAIL (no double validation)
        try:
            validate_receipt_endpoint(receipt_id=rec.id, db=db, user=None)
            assert False, "Double validation should have been blocked!"
        except HTTPException as e:
            assert e.status_code == 400
            print("  [OK] Second validation blocked (HTTP 400)")

        # Ensure stock did not change on blocked attempt
        assert get_stock(prod_id, loc_id) == stock_after_rec, "Stock corrupted after blocked validation!"

        # =========================================================================
        # TEST 2: Delivery Workflow (Waiting/Ready -> Done, -stock once)
        # =========================================================================
        print("\n[TEST 2] Testing Delivery: Waiting/Ready -> Done (-stock once)")

        # 2.1 Test WAITING flow when insufficient stock requested
        excess_qty = stock_after_rec + 999
        d_short = DeliveryCreate(
            customer_name="Shortage Customer",
            shipping_address="Shortage Way",
            items=[DeliveryItemCreate(product_id=prod_id, location_id=loc_id, quantity=excess_qty)]
        )
        del_short = create_delivery(delivery_in=d_short, db=db, user=None)
        created_delivery_ids.append(del_short.id)
        assert del_short.status == "DRAFT"
        
        # Check availability -> should advance to WAITING
        del_short_avail = check_and_advance_to_waiting_or_ready(delivery_id=del_short.id, db=db, user=None)
        assert del_short_avail.status == "WAITING", f"Expected WAITING, got {del_short_avail.status}"
        assert get_stock(prod_id, loc_id) == stock_after_rec, "Stock changed during availability check!"
        print(f"  [OK] Delivery with insufficient stock correctly transitioned to WAITING ({del_short.delivery_number})")

        # Try mark_ready while still short -> MUST FAIL
        try:
            mark_delivery_ready(delivery_id=del_short.id, db=db, user=None)
            assert False, "mark_ready should fail when stock is insufficient!"
        except HTTPException as e:
            assert e.status_code == 400
            print("  [OK] mark_ready correctly rejected due to insufficient stock")

        # 2.2 Test normal Delivery flow (DRAFT -> READY -> DONE) with available stock
        del_qty = 10
        d_in = DeliveryCreate(
            customer_name="Ready Customer",
            shipping_address="123 Delivery Road",
            items=[DeliveryItemCreate(product_id=prod_id, location_id=loc_id, quantity=del_qty)]
        )
        deliv = create_delivery(delivery_in=d_in, db=db, user=None)
        created_delivery_ids.append(deliv.id)
        assert deliv.status == "DRAFT"
        assert get_stock(prod_id, loc_id) == stock_after_rec

        # Check availability -> should transition to READY (since stock_after_rec >= 10)
        del_ready = check_and_advance_to_waiting_or_ready(delivery_id=deliv.id, db=db, user=None)
        assert del_ready.status == "READY", f"Expected READY, got {del_ready.status}"
        assert get_stock(prod_id, loc_id) == stock_after_rec, "Stock changed on advance to READY!"
        print(f"  [OK] Delivery with sufficient stock transitioned to READY ({deliv.delivery_number})")

        # Try validating delivery before READY check: already tested status check, but verify READY allows validate
        ledger_count_before_del = get_ledger_count(prod_id, loc_id)
        del_done = validate_delivery_endpoint(delivery_id=deliv.id, db=db, user=None)
        assert del_done.status == "DONE", f"Expected DONE, got {del_done.status}"
        stock_after_del = get_stock(prod_id, loc_id)
        assert stock_after_del == stock_after_rec - del_qty, f"Expected {stock_after_rec - del_qty}, got {stock_after_del}"
        assert get_ledger_count(prod_id, loc_id) == ledger_count_before_del + 1, "Ledger entry count did not increase by 1"

        # Verify ledger entry for delivery
        latest_ledger_del = db.query(StockLedger).filter(
            StockLedger.product_id == prod_id,
            StockLedger.location_id == loc_id
        ).order_by(StockLedger.id.desc()).first()
        assert latest_ledger_del.action_type == "DELIVERY"
        assert latest_ledger_del.change_qty == -del_qty
        assert latest_ledger_del.balance_after == stock_after_del
        assert latest_ledger_del.reference_doc_number == deliv.delivery_number
        print(f"  [OK] Delivery validated -> DONE. Stock: {stock_after_del} (-{del_qty}). Ledger verified.")

        # 2.3 Try validating again -> MUST FAIL
        try:
            validate_delivery_endpoint(delivery_id=deliv.id, db=db, user=None)
            assert False, "Double delivery validation should have been blocked!"
        except HTTPException as e:
            assert e.status_code == 400
            print("  [OK] Second delivery validation blocked (HTTP 400)")

        assert get_stock(prod_id, loc_id) == stock_after_del, "Stock corrupted after blocked delivery validate!"

        # =========================================================================
        # TEST 3: Cancel Workflows & No Stock Changes
        # =========================================================================
        print("\n[TEST 3] Testing Cancel Workflows (no stock change)")

        # 3.1 Cancel Receipt from DRAFT
        r_cancel_draft = create_receipt(receipt_in=r_in, db=db, user=None)
        created_receipt_ids.append(r_cancel_draft.id)
        stock_before_c1 = get_stock(prod_id, loc_id)
        r_c1 = cancel_receipt(receipt_id=r_cancel_draft.id, db=db, user=None)
        assert r_c1.status == "CANCELLED"
        assert get_stock(prod_id, loc_id) == stock_before_c1, "Stock changed when cancelling DRAFT receipt!"
        print("  [OK] Receipt cancelled from DRAFT -> stock unchanged")

        # 3.2 Cancel Receipt from READY
        r_cancel_ready = create_receipt(receipt_in=r_in, db=db, user=None)
        created_receipt_ids.append(r_cancel_ready.id)
        mark_receipt_ready(receipt_id=r_cancel_ready.id, db=db, user=None)
        stock_before_c2 = get_stock(prod_id, loc_id)
        r_c2 = cancel_receipt(receipt_id=r_cancel_ready.id, db=db, user=None)
        assert r_c2.status == "CANCELLED"
        assert get_stock(prod_id, loc_id) == stock_before_c2, "Stock changed when cancelling READY receipt!"
        print("  [OK] Receipt cancelled from READY -> stock unchanged")

        # 3.3 Cancel Receipt from DONE -> MUST FAIL
        try:
            cancel_receipt(receipt_id=rec.id, db=db, user=None)
            assert False, "Cancelling a DONE receipt should have failed!"
        except HTTPException as e:
            assert e.status_code == 400
            print("  [OK] Cancel on DONE receipt correctly rejected (HTTP 400)")

        # 3.4 Cancel Delivery from DRAFT
        d_cancel_draft = create_delivery(delivery_in=d_in, db=db, user=None)
        created_delivery_ids.append(d_cancel_draft.id)
        stock_before_cd1 = get_stock(prod_id, loc_id)
        d_cd1 = cancel_delivery(delivery_id=d_cancel_draft.id, db=db, user=None)
        assert d_cd1.status == "CANCELLED"
        assert get_stock(prod_id, loc_id) == stock_before_cd1, "Stock changed when cancelling DRAFT delivery!"
        print("  [OK] Delivery cancelled from DRAFT -> stock unchanged")

        # 3.5 Cancel Delivery from WAITING
        stock_before_cd2 = get_stock(prod_id, loc_id)
        d_cd2 = cancel_delivery(delivery_id=del_short.id, db=db, user=None)
        assert d_cd2.status == "CANCELLED"
        assert get_stock(prod_id, loc_id) == stock_before_cd2, "Stock changed when cancelling WAITING delivery!"
        print("  [OK] Delivery cancelled from WAITING -> stock unchanged")

        # 3.6 Cancel Delivery from READY
        d_cancel_ready = create_delivery(delivery_in=d_in, db=db, user=None)
        created_delivery_ids.append(d_cancel_ready.id)
        check_and_advance_to_waiting_or_ready(delivery_id=d_cancel_ready.id, db=db, user=None)
        stock_before_cd3 = get_stock(prod_id, loc_id)
        d_cd3 = cancel_delivery(delivery_id=d_cancel_ready.id, db=db, user=None)
        assert d_cd3.status == "CANCELLED"
        assert get_stock(prod_id, loc_id) == stock_before_cd3, "Stock changed when cancelling READY delivery!"
        print("  [OK] Delivery cancelled from READY -> stock unchanged")

        # 3.7 Cancel Delivery from DONE -> MUST FAIL
        try:
            cancel_delivery(delivery_id=deliv.id, db=db, user=None)
            assert False, "Cancelling a DONE delivery should have failed!"
        except HTTPException as e:
            assert e.status_code == 400
            print("  [OK] Cancel on DONE delivery correctly rejected (HTTP 400)")

        print("\n" + "=" * 60)
        print("ALL PHASE 2 VERIFICATION CHECKS PASSED SUCCESSFULLY!")
        print("=" * 60)

    finally:
        try:
            for rid in created_receipt_ids:
                robj = db.query(Receipt).filter(Receipt.id == rid).first()
                if robj:
                    rnum = robj.receipt_number
                    db.query(ReceiptItem).filter(ReceiptItem.receipt_id == rid).delete()
                    db.delete(robj)
                    db.query(StockLedger).filter(StockLedger.reference_doc_number == rnum).delete()
            for did in created_delivery_ids:
                dobj = db.query(Delivery).filter(Delivery.id == did).first()
                if dobj:
                    dnum = dobj.delivery_number
                    db.query(DeliveryItem).filter(DeliveryItem.delivery_id == did).delete()
                    db.delete(dobj)
                    db.query(StockLedger).filter(StockLedger.reference_doc_number == dnum).delete()
            if prod_id and loc_id:
                sl = db.query(StockLevel).filter(StockLevel.product_id == prod_id, StockLevel.location_id == loc_id).first()
                if sl:
                    sl.quantity_on_hand = initial_stock
            db.commit()
        except Exception as cleanup_err:
            print(f"Warning during test_phase2 cleanup: {cleanup_err}")
        finally:
            db.close()


if __name__ == "__main__":
    test_phase2()
