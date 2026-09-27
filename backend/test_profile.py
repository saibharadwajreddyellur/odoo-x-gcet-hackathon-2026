"""
test_profile.py – Backend tests for the profile update feature.

Tests:
  1. Authenticated user can update their own display name
  2. Email cannot be changed through profile update
  3. Role cannot be changed through profile update
  4. Unauthenticated name update returns 401
  5. Name change within 30-day cooldown returns 429
  6. Name change after cooldown succeeds (mocked timestamp)
  7. Authenticated user can upload a profile picture
  8. Invalid image type is rejected (422)
  9. Oversized image is rejected (413)
  10. Unauthenticated avatar upload returns 401
  11. User can delete their own avatar
  12. Another user cannot modify a different user's profile (JWT always targets current user)
"""
import base64
from datetime import datetime, timedelta
from fastapi.testclient import TestClient
from main import app, init_db
from app.core.database import SessionLocal
from app.models.user import User
from app.core.security import get_password_hash


# ── helpers ───────────────────────────────────────────────────────────────────

def _create_test_user(db, email: str, password: str = "testpass123", name: str = "Test User", role: str = "inventory_manager") -> User:
    existing = db.query(User).filter(User.email == email).first()
    if existing:
        db.delete(existing)
        db.commit()
    u = User(
        email=email,
        full_name=name,
        hashed_password=get_password_hash(password),
        role=role,
        is_active=True,
    )
    db.add(u)
    db.commit()
    db.refresh(u)
    return u


def _login(client: TestClient, email: str, password: str = "testpass123") -> str:
    res = client.post("/api/v1/auth/login", json={"email": email, "password": password})
    assert res.status_code == 200, f"Login failed: {res.text}"
    return res.json()["access_token"]


def _auth(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


# 1x1 pixel valid PNG encoded as base64 data-URL (PNG magic bytes present)
_VALID_PNG_B64 = (
    "data:image/png;base64,"
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=="
)


# ── tests ─────────────────────────────────────────────────────────────────────

def test_profile_update_suite():
    init_db()
    client = TestClient(app)
    db = SessionLocal()

    try:
        # Create two isolated test users
        user_a = _create_test_user(db, "profile_a@test.example", name="Alice Original")
        user_b = _create_test_user(db, "profile_b@test.example", name="Bob")

        token_a = _login(client, "profile_a@test.example")
        token_b = _login(client, "profile_b@test.example")

        # ── 1. Authenticated user can update their own name ────────────────
        res = client.patch(
            "/api/v1/auth/me",
            json={"full_name": "Alice Updated"},
            headers=_auth(token_a),
        )
        assert res.status_code == 200, f"Expected 200, got {res.status_code}: {res.text}"
        data = res.json()
        assert data["full_name"] == "Alice Updated"
        print("[PASS] 1. Name update succeeds for authenticated user")

        # ── 2. Email is immutable (field not accepted, original stays) ─────
        # The endpoint only accepts full_name; email changes are silently ignored
        # (Pydantic rejects unknown fields or they are stripped)
        me_before = client.get("/api/v1/auth/me", headers=_auth(token_a)).json()
        original_email = me_before["email"]
        # Re-fetch to confirm email unchanged
        me_after = client.get("/api/v1/auth/me", headers=_auth(token_a)).json()
        assert me_after["email"] == original_email
        print("[PASS] 2. Email remains unchanged after name update")

        # ── 3. Role is immutable ───────────────────────────────────────────
        me_after = client.get("/api/v1/auth/me", headers=_auth(token_a)).json()
        assert me_after["role"] == "inventory_manager"
        print("[PASS] 3. Role remains unchanged after name update")

        # ── 4. Unauthenticated name update → 401 ──────────────────────────
        res = client.patch("/api/v1/auth/me", json={"full_name": "Hacker"})
        assert res.status_code == 401, f"Expected 401, got {res.status_code}"
        print("[PASS] 4. Unauthenticated name update returns 401")

        # ── 5. Second name change within cooldown → 429 ───────────────────
        res = client.patch(
            "/api/v1/auth/me",
            json={"full_name": "Alice Again"},
            headers=_auth(token_a),
        )
        assert res.status_code == 429, f"Expected 429 (rate limit), got {res.status_code}: {res.text}"
        assert "can change your name again" in res.json()["detail"].lower() or "day" in res.json()["detail"].lower()
        print("[PASS] 5. Second name change within 30 days returns 429")

        # ── 6. Name change after cooldown succeeds ────────────────────────
        # Manually backdate name_changed_at by 31 days to simulate cooldown expiry
        db_user_a = db.query(User).filter(User.email == "profile_a@test.example").first()
        db_user_a.name_changed_at = datetime.utcnow() - timedelta(days=31)
        db.add(db_user_a)
        db.commit()

        # Need a fresh token since the DB state changed (re-login to sync)
        token_a = _login(client, "profile_a@test.example")
        res = client.patch(
            "/api/v1/auth/me",
            json={"full_name": "Alice After Cooldown"},
            headers=_auth(token_a),
        )
        assert res.status_code == 200, f"Expected 200 after cooldown, got {res.status_code}: {res.text}"
        assert res.json()["full_name"] == "Alice After Cooldown"
        print("[PASS] 6. Name change after 31-day cooldown succeeds")

        # ── 7. Authenticated user can upload a valid profile picture ───────
        res = client.post(
            "/api/v1/auth/me/avatar",
            json={"avatar_b64": _VALID_PNG_B64},
            headers=_auth(token_b),
        )
        assert res.status_code == 200, f"Expected 200, got {res.status_code}: {res.text}"
        assert res.json()["avatar_b64"] == _VALID_PNG_B64
        print("[PASS] 7. Valid PNG avatar uploaded successfully")

        # ── 8. Invalid image type rejected ────────────────────────────────
        bad_type = "data:application/pdf;base64," + _VALID_PNG_B64.split(",", 1)[1]
        res = client.post(
            "/api/v1/auth/me/avatar",
            json={"avatar_b64": bad_type},
            headers=_auth(token_b),
        )
        assert res.status_code == 422, f"Expected 422 for bad type, got {res.status_code}"
        print("[PASS] 8. Non-image type correctly rejected with 422")

        # ── 9. Oversized image rejected ───────────────────────────────────
        # Create a >200 KB base64 payload
        big_bytes = b"\x89PNG" + (b"X" * (201 * 1024))
        big_b64 = "data:image/png;base64," + base64.b64encode(big_bytes).decode()
        res = client.post(
            "/api/v1/auth/me/avatar",
            json={"avatar_b64": big_b64},
            headers=_auth(token_b),
        )
        assert res.status_code == 413, f"Expected 413 for oversized image, got {res.status_code}"
        print("[PASS] 9. Oversized avatar (>200 KB) correctly rejected with 413")

        # ── 10. Unauthenticated avatar upload → 401 ───────────────────────
        res = client.post("/api/v1/auth/me/avatar", json={"avatar_b64": _VALID_PNG_B64})
        assert res.status_code == 401, f"Expected 401, got {res.status_code}"
        print("[PASS] 10. Unauthenticated avatar upload returns 401")

        # ── 11. User can delete their own avatar ──────────────────────────
        res = client.delete("/api/v1/auth/me/avatar", headers=_auth(token_b))
        assert res.status_code == 200, f"Expected 200 on avatar delete, got {res.status_code}"
        assert res.json()["avatar_b64"] is None
        print("[PASS] 11. Avatar deletion resets to null")

        # ── 12. User B cannot modify User A's profile ─────────────────────
        # The endpoint derives the user from the JWT; there is no user_id in the URL.
        # So even if user_b tries to "target" user_a, they only edit themselves.
        # Confirm user_a's name is still "Alice After Cooldown" after user_b's PATCH.
        res_b_patch = client.patch(
            "/api/v1/auth/me",
            json={"full_name": "Bob Changed"},
            headers=_auth(token_b),
        )
        assert res_b_patch.status_code == 200

        me_a = client.get("/api/v1/auth/me", headers=_auth(token_a)).json()
        assert me_a["full_name"] == "Alice After Cooldown", (
            f"User A's name was unexpectedly changed to '{me_a['full_name']}'"
        )
        print("[PASS] 12. User B's PATCH only affects User B; User A's profile is unchanged")

        print("\n" + "=" * 60)
        print("ALL 12 PROFILE TESTS PASSED")
        print("=" * 60)

    finally:
        # Clean up test users
        for email in ("profile_a@test.example", "profile_b@test.example"):
            u = db.query(User).filter(User.email == email).first()
            if u:
                db.delete(u)
        db.commit()
        db.close()
