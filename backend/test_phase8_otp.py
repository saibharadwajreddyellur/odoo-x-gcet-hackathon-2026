import hashlib
import secrets
from unittest.mock import patch, MagicMock
from datetime import datetime, timedelta
from fastapi.testclient import TestClient
from main import app, init_db
from app.core.database import SessionLocal
from app.models.user import User
from app.models.password_reset import PasswordReset
from app.core.security import verify_password, get_password_hash
from app.core.config import settings


def test_phase8_otp():
    # Ensure tables are up to date
    init_db()

    client = TestClient(app)
    db = SessionLocal()

    print("=======================================================")
    print(">>> RUNNING PHASE 8 REAL OTP PASSWORD RESET TESTS <<<")
    print("=======================================================\n")

    try:
        test_email = "admin@stocksense.io"
        user = db.query(User).filter(User.email == test_email).first()
        assert user is not None, f"User {test_email} must exist"

        # Clean up any existing password resets for clean test run
        db.query(PasswordReset).filter(PasswordReset.user_id == user.id).delete()
        db.commit()

        # -------------------------------------------------------------
        # Test 0: Missing SMTP Configuration Returns HTTP 503 With Clear Error
        # -------------------------------------------------------------
        print("Test 0: Missing SMTP Configuration Returns Clear HTTP 503")
        with patch.object(settings, "SMTP_HOST", ""), patch.object(settings, "SMTP_USER", ""):
            res0 = client.post("/api/v1/auth/forgot-password", json={"email": test_email})
            assert res0.status_code == 503, f"Expected 503, got {res0.status_code}: {res0.text}"
            detail0 = res0.json().get("detail", "")
            assert "SMTP email service is not configured" in detail0
            assert "SMTP_HOST" in detail0
            print(f"   [PASS] Clean 503 error returned on unconfigured SMTP: '{detail0}'")

            # Verify no orphan reset was left in DB
            unconfigured_entry = db.query(PasswordReset).filter(PasswordReset.user_id == user.id).first()
            assert unconfigured_entry is None, "Failed delivery must not leave pending reset entry in DB"
            print("   [PASS] Database cleaned up on SMTP configuration failure (no orphan reset record)")

        # -------------------------------------------------------------
        # Test 0b: SMTP Network / Connection Failure Returns HTTP 503
        # -------------------------------------------------------------
        print("\nTest 0b: SMTP Network / Connection Failure Returns HTTP 503")
        with patch.object(settings, "SMTP_HOST", "smtp.invalid-host-for-testing.test"), patch.object(settings, "SMTP_USER", "testuser"):
            with patch("smtplib.SMTP", side_effect=ConnectionRefusedError("Connection refused by host")):
                res0b = client.post("/api/v1/auth/forgot-password", json={"email": test_email})
                assert res0b.status_code == 503, f"Expected 503, got {res0b.status_code}: {res0b.text}"
                detail0b = res0b.json().get("detail", "")
                assert "Failed to send email via SMTP" in detail0b or "Connection refused" in detail0b
                print(f"   [PASS] Clean 503 error returned on SMTP connection error: '{detail0b}'")

        # -------------------------------------------------------------
        # Test 1: Request Password Reset OTP With Configured SMTP
        # -------------------------------------------------------------
        print("\nTest 1: Request Password Reset OTP With Configured SMTP")
        mock_smtp_server = MagicMock()
        mock_smtp_context = MagicMock()
        mock_smtp_context.__enter__.return_value = mock_smtp_server

        with patch.object(settings, "SMTP_HOST", "smtp.example.com"), \
             patch.object(settings, "SMTP_USER", "test@example.com"), \
             patch.object(settings, "SMTP_PASSWORD", "secret123"), \
             patch("smtplib.SMTP", return_value=mock_smtp_context):

            res1 = client.post("/api/v1/auth/forgot-password", json={"email": test_email})
            assert res1.status_code == 200, f"Expected 200, got {res1.status_code}: {res1.text}"
            data1 = res1.json()
            print("   Response:", data1)
            assert "demo_otp" not in data1, "Security violation: demo_otp must NEVER be returned in response"
            assert "otp" not in data1, "Security violation: plaintext otp must NEVER be returned in response"
            assert data1["email"] == test_email
            assert data1["cooldown_seconds"] == 60
            assert mock_smtp_server.send_message.called, "SMTP send_message must be called"
            print("   [PASS] OTP generated and sent through SMTP without exposing code in API response")

        # Verify Database State
        reset_entry = (
            db.query(PasswordReset)
            .filter(PasswordReset.user_id == user.id, PasswordReset.is_consumed == False)
            .order_by(PasswordReset.created_at.desc())
            .first()
        )
        assert reset_entry is not None
        assert reset_entry.hashed_otp is not None
        assert len(reset_entry.hashed_otp) == 64  # SHA-256 hex
        assert reset_entry.salt is not None
        assert reset_entry.attempts == 0
        assert reset_entry.max_attempts == 5
        assert reset_entry.is_verified is False
        assert reset_entry.is_consumed is False
        assert reset_entry.expires_at > datetime.utcnow()
        print("   [PASS] Database record created with hashed OTP, salt, expiry, and 0 initial attempts")

        # -------------------------------------------------------------
        # Test 2: Resend Cooldown Enforcement (HTTP 429)
        # -------------------------------------------------------------
        print("\nTest 2: Resend Cooldown Enforcement (HTTP 429)")
        with patch.object(settings, "SMTP_HOST", "smtp.example.com"), patch.object(settings, "SMTP_USER", "test@example.com"):
            res2 = client.post("/api/v1/auth/forgot-password", json={"email": test_email})
            assert res2.status_code == 429, f"Expected 429 Too Many Requests, got {res2.status_code}: {res2.text}"
            print(f"   [PASS] Correctly rejected duplicate request within cooldown: {res2.json()['detail']}")

        # -------------------------------------------------------------
        # Test 3: Invalid OTP attempt increment
        # -------------------------------------------------------------
        print("\nTest 3: Invalid OTP attempt increment")
        res3 = client.post("/api/v1/auth/verify-otp", json={"email": test_email, "otp": "000000"})
        assert res3.status_code == 400, f"Expected 400 Bad Request, got {res3.status_code}: {res3.text}"
        assert "4 attempt(s) remaining" in res3.json()["detail"]
        db.refresh(reset_entry)
        assert reset_entry.attempts == 1
        print(f"   [PASS] Attempt count incremented to 1; error message: {res3.json()['detail']}")

        # -------------------------------------------------------------
        # Test 4: Maximum Attempts Lockout
        # -------------------------------------------------------------
        print("\nTest 4: Maximum Attempts Lockout")
        for _ in range(3):
            client.post("/api/v1/auth/verify-otp", json={"email": test_email, "otp": "000000"})
        db.refresh(reset_entry)
        assert reset_entry.attempts == 4

        # 5th failed attempt triggers consumption/lockout
        res4 = client.post("/api/v1/auth/verify-otp", json={"email": test_email, "otp": "000000"})
        assert res4.status_code == 400
        assert "Maximum attempts exceeded" in res4.json()["detail"]
        db.refresh(reset_entry)
        assert reset_entry.is_consumed is True
        print("   [PASS] OTP invalidated after 5 failed attempts (lockout enforced)")

        # -------------------------------------------------------------
        # Test 5: Expiry Validation
        # -------------------------------------------------------------
        print("\nTest 5: Expiry Validation")
        # Clean previous records
        db.query(PasswordReset).filter(PasswordReset.user_id == user.id).delete()
        db.commit()

        # Create an expired OTP in database
        expired_salt = secrets.token_hex(16)
        expired_hash = hashlib.sha256(f"{expired_salt}123456".encode("utf-8")).hexdigest()
        expired_entry = PasswordReset(
            user_id=user.id,
            email=user.email,
            hashed_otp=expired_hash,
            salt=expired_salt,
            expires_at=datetime.utcnow() - timedelta(minutes=1),
            attempts=0,
            max_attempts=5,
            last_sent_at=datetime.utcnow() - timedelta(minutes=5),
            is_verified=False,
            is_consumed=False
        )
        db.add(expired_entry)
        db.commit()

        res5 = client.post("/api/v1/auth/verify-otp", json={"email": test_email, "otp": "123456"})
        assert res5.status_code == 400
        assert "expired" in res5.json()["detail"].lower()
        print("   [PASS] Expired OTP correctly rejected with descriptive error")

        # -------------------------------------------------------------
        # Test 6: Successful Verification & Reset Token Issuance
        # -------------------------------------------------------------
        print("\nTest 6: Successful Verification & Reset Token Issuance")
        db.query(PasswordReset).filter(PasswordReset.user_id == user.id).delete()
        db.commit()

        # Generate a fresh valid OTP directly with known code
        valid_code = "782341"
        valid_salt = secrets.token_hex(16)
        valid_hash = hashlib.sha256(f"{valid_salt}{valid_code}".encode("utf-8")).hexdigest()
        valid_entry = PasswordReset(
            user_id=user.id,
            email=user.email,
            hashed_otp=valid_hash,
            salt=valid_salt,
            expires_at=datetime.utcnow() + timedelta(minutes=10),
            attempts=0,
            max_attempts=5,
            last_sent_at=datetime.utcnow(),
            is_verified=False,
            is_consumed=False
        )
        db.add(valid_entry)
        db.commit()

        res6 = client.post("/api/v1/auth/verify-otp", json={"email": test_email, "otp": valid_code})
        assert res6.status_code == 200, f"Expected 200, got {res6.status_code}: {res6.text}"
        data6 = res6.json()
        assert "reset_token" in data6
        reset_token = data6["reset_token"]
        assert len(reset_token) > 20
        db.refresh(valid_entry)
        assert valid_entry.is_verified is True
        assert valid_entry.reset_token == reset_token
        print(f"   [PASS] Valid OTP verified in FastAPI; single-use reset_token issued: {reset_token[:10]}...")

        # -------------------------------------------------------------
        # Test 7: Reset Password With Verified Token
        # -------------------------------------------------------------
        print("\nTest 7: Reset Password With Verified Token")
        new_password = "SecureAdminPass2026!"
        res7 = client.post("/api/v1/auth/reset-password", json={
            "email": test_email,
            "reset_token": reset_token,
            "new_password": new_password
        })
        assert res7.status_code == 200, f"Expected 200, got {res7.status_code}: {res7.text}"
        print("   [PASS] Password reset endpoint completed successfully")

        # Verify password was hashed using existing auth system
        db.refresh(user)
        db.refresh(valid_entry)
        assert valid_entry.is_consumed is True
        assert verify_password(new_password, user.hashed_password) is True
        print("   [PASS] Password hashed using existing PBKDF2/SHA-256 system and updated in DB")

        # Verify token cannot be reused
        res7_reuse = client.post("/api/v1/auth/reset-password", json={
            "email": test_email,
            "reset_token": reset_token,
            "new_password": "AnotherPassword123!"
        })
        assert res7_reuse.status_code == 400
        print("   [PASS] Token reuse prevented (token was consumed)")

        # -------------------------------------------------------------
        # Test 8: Login With New Password
        # -------------------------------------------------------------
        print("\nTest 8: Login With New Password")
        login_res = client.post("/api/v1/auth/login", json={
            "email": test_email,
            "password": new_password
        })
        assert login_res.status_code == 200, f"Expected 200 login, got {login_res.status_code}: {login_res.text}"
        token_data = login_res.json()
        assert "access_token" in token_data
        print("   [PASS] Login successful with newly reset password; JWT access token received")

        # Reset password back to default 'admin123' so standard demo login remains uninterrupted
        user.hashed_password = get_password_hash("admin123")
        db.commit()
        print("   [PASS] Demo admin password cleanly restored to 'admin123'")

        print("\n=======================================================")
        print(">>> ALL PHASE 8 OTP PASSWORD RESET TESTS PASSED! <<<")
        print("=======================================================")

    finally:
        db.close()


if __name__ == "__main__":
    test_phase8_otp()
