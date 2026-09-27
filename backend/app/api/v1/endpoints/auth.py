import base64
import hashlib
import secrets
from datetime import datetime, timedelta
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from app.api.deps import get_db, get_current_user, require_user
from app.core.config import settings
from app.core.security import create_access_token, get_password_hash, verify_password
from app.models.user import User
from app.models.password_reset import PasswordReset
from app.schemas.auth import (
    UserCreate, UserLogin, UserOut, Token,
    PasswordResetRequest, PasswordResetResponse,
    OTPVerifyRequest, OTPVerifyResponse,
    PasswordResetConfirm,
    ProfileUpdate, AvatarUpdate
)
from app.services.email_service import send_otp_email, SMTPConfigurationError, SMTPDeliveryError

router = APIRouter()


@router.post("/signup", response_model=Token, status_code=status.HTTP_201_CREATED)
def signup(user_in: UserCreate, db: Session = Depends(get_db)):
    existing = db.query(User).filter(User.email == user_in.email).first()
    if existing:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="A user with this email address already exists"
        )
    user = User(
        email=user_in.email,
        full_name=user_in.full_name,
        hashed_password=get_password_hash(user_in.password),
        role=user_in.role or "inventory_manager"
    )
    db.add(user)
    db.commit()
    db.refresh(user)

    token = create_access_token(subject=user.id)
    return Token(access_token=token, token_type="bearer", user=UserOut.model_validate(user))


@router.post("/login", response_model=Token)
def login(credentials: UserLogin, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.email == credentials.email).first()
    if not user or not verify_password(credentials.password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password"
        )
    if not user.is_active:
        raise HTTPException(status_code=400, detail="Inactive user account")

    token = create_access_token(subject=user.id)
    return Token(access_token=token, token_type="bearer", user=UserOut.model_validate(user))


@router.post("/logout")
def logout():
    return {"message": "Successfully logged out"}


@router.post("/forgot-password", response_model=PasswordResetResponse)
def forgot_password(req: PasswordResetRequest, db: Session = Depends(get_db)):
    """
    Initiates the OTP password-reset flow:
    - Finds registered user.
    - Enforces resend cooldown (60 seconds).
    - Generates cryptographically secure 6-digit OTP in FastAPI.
    - Stores hashed OTP, salt, attempts, and expiry in SQLAlchemy.
    - Dispatches OTP through SMTP / email service.
    - Never exposes OTP in API response.
    """
    user = db.query(User).filter(User.email == req.email).first()
    if not user:
        # Don't leak user presence to attackers
        return PasswordResetResponse(
            message="If this email is registered, a 6-digit verification code has been sent.",
            email=req.email,
            cooldown_seconds=settings.OTP_RESEND_COOLDOWN_SECONDS
        )

    # Check for recent active reset request to enforce cooldown
    latest_reset = (
        db.query(PasswordReset)
        .filter(PasswordReset.user_id == user.id, PasswordReset.is_consumed == False)
        .order_by(PasswordReset.created_at.desc())
        .first()
    )

    now = datetime.utcnow()
    if latest_reset:
        time_elapsed = (now - latest_reset.last_sent_at).total_seconds()
        if time_elapsed < settings.OTP_RESEND_COOLDOWN_SECONDS:
            remaining = int(settings.OTP_RESEND_COOLDOWN_SECONDS - time_elapsed)
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail=f"Please wait {remaining} seconds before requesting a new verification code."
            )
        # Mark previous active reset as consumed/superseded
        latest_reset.is_consumed = True
        db.add(latest_reset)

    # Generate secure 6-digit OTP
    otp = f"{secrets.randbelow(900000) + 100000:06d}"
    salt = secrets.token_hex(16)
    hashed_otp = hashlib.sha256(f"{salt}{otp}".encode("utf-8")).hexdigest()

    new_reset = PasswordReset(
        user_id=user.id,
        email=user.email,
        hashed_otp=hashed_otp,
        salt=salt,
        expires_at=now + timedelta(minutes=settings.OTP_EXPIRE_MINUTES),
        attempts=0,
        max_attempts=settings.OTP_MAX_ATTEMPTS,
        last_sent_at=now,
        is_verified=False,
        is_consumed=False
    )
    db.add(new_reset)
    db.commit()

    # Dispatch OTP via email service (raises clear error if unconfigured or delivery fails)
    try:
        send_otp_email(user.email, otp, expires_in_minutes=settings.OTP_EXPIRE_MINUTES)
    except (SMTPConfigurationError, SMTPDeliveryError, Exception) as e:
        # Delete un-sent reset entry so user is not stuck in a cooldown lock
        db.delete(new_reset)
        db.commit()
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=str(e)
        )

    return PasswordResetResponse(
        message="A 6-digit verification code has been sent to your email address.",
        email=user.email,
        cooldown_seconds=settings.OTP_RESEND_COOLDOWN_SECONDS
    )


@router.post("/resend-otp", response_model=PasswordResetResponse)
def resend_otp(req: PasswordResetRequest, db: Session = Depends(get_db)):
    """
    Alias endpoint for resending OTP adhering to the exact same cooldown and generation rules.
    """
    return forgot_password(req=req, db=db)


@router.post("/verify-otp", response_model=OTPVerifyResponse)
def verify_otp(req: OTPVerifyRequest, db: Session = Depends(get_db)):
    """
    Verifies the 6-digit OTP entirely in FastAPI:
    - Validates expiry and attempt limit.
    - Verifies constant-time hash comparison against salted hash in DB.
    - Generates a single-use verified reset_token.
    - Allows password change only after successful verification.
    """
    clean_otp = req.otp.strip()
    if not clean_otp.isdigit() or len(clean_otp) != 6:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Verification code must be exactly 6 digits."
        )

    reset_entry = (
        db.query(PasswordReset)
        .filter(PasswordReset.email == req.email, PasswordReset.is_consumed == False)
        .order_by(PasswordReset.created_at.desc())
        .first()
    )

    if not reset_entry:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No active password reset request found. Please request a new code."
        )

    now = datetime.utcnow()
    if now > reset_entry.expires_at:
        reset_entry.is_consumed = True
        db.commit()
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="The verification code has expired. Please request a new code."
        )

    if reset_entry.attempts >= reset_entry.max_attempts:
        reset_entry.is_consumed = True
        db.commit()
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Maximum verification attempts exceeded. Please request a new code."
        )

    # Constant-time salted SHA-256 verification
    expected_hash = hashlib.sha256(f"{reset_entry.salt}{clean_otp}".encode("utf-8")).hexdigest()
    if not secrets.compare_digest(reset_entry.hashed_otp, expected_hash):
        reset_entry.attempts += 1
        db.commit()
        remaining = reset_entry.max_attempts - reset_entry.attempts
        if remaining <= 0:
            reset_entry.is_consumed = True
            db.commit()
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Invalid verification code. Maximum attempts exceeded. Please request a new code."
            )
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid verification code. {remaining} attempt(s) remaining."
        )

    # Validated successfully -> issue verified reset token
    reset_token = secrets.token_urlsafe(32)
    reset_entry.is_verified = True
    reset_entry.reset_token = reset_token
    reset_entry.reset_token_expires_at = now + timedelta(minutes=15)
    db.commit()

    return OTPVerifyResponse(
        message="Verification code confirmed successfully.",
        reset_token=reset_token
    )


@router.post("/reset-password")
def reset_password(req: PasswordResetConfirm, db: Session = Depends(get_db)):
    """
    Resets the user's password:
    - Validates new password length.
    - Requires either a verified reset_token or directly valid OTP.
    - Hashes password using existing PBKDF2/SHA-256 security system.
    - Consumes the reset token to prevent reuse.
    """
    if not req.new_password or len(req.new_password) < 6:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Password must be at least 6 characters long."
        )

    now = datetime.utcnow()
    reset_entry = None

    if req.reset_token:
        reset_entry = (
            db.query(PasswordReset)
            .filter(
                PasswordReset.reset_token == req.reset_token,
                PasswordReset.email == req.email,
                PasswordReset.is_verified == True,
                PasswordReset.is_consumed == False
            )
            .first()
        )
        if not reset_entry:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Invalid or expired reset session. Please verify your OTP code again."
            )
        if reset_entry.reset_token_expires_at and now > reset_entry.reset_token_expires_at:
            reset_entry.is_consumed = True
            db.commit()
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Reset session has expired. Please request a new verification code."
            )

    elif req.otp:
        clean_otp = req.otp.strip()
        reset_entry = (
            db.query(PasswordReset)
            .filter(PasswordReset.email == req.email, PasswordReset.is_consumed == False)
            .order_by(PasswordReset.created_at.desc())
            .first()
        )
        if not reset_entry:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="No active password reset request found. Please request a new code."
            )
        if now > reset_entry.expires_at:
            reset_entry.is_consumed = True
            db.commit()
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="The verification code has expired. Please request a new code."
            )
        if reset_entry.attempts >= reset_entry.max_attempts:
            reset_entry.is_consumed = True
            db.commit()
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Maximum verification attempts exceeded. Please request a new code."
            )

        expected_hash = hashlib.sha256(f"{reset_entry.salt}{clean_otp}".encode("utf-8")).hexdigest()
        if not secrets.compare_digest(reset_entry.hashed_otp, expected_hash):
            reset_entry.attempts += 1
            db.commit()
            remaining = reset_entry.max_attempts - reset_entry.attempts
            if remaining <= 0:
                reset_entry.is_consumed = True
                db.commit()
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Invalid verification code. Maximum attempts exceeded. Please request a new code."
                )
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Invalid verification code. {remaining} attempt(s) remaining."
            )
        reset_entry.is_verified = True
    else:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Verification code or verified reset token is required."
        )

    # Ensure reset_entry is verified
    if not reset_entry.is_verified:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Verification code must be verified before changing password."
        )

    user = db.query(User).filter(User.id == reset_entry.user_id).first()
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User account not found."
        )

    # Hash using the existing PBKDF2/SHA-256 auth system
    user.hashed_password = get_password_hash(req.new_password)
    reset_entry.is_consumed = True
    db.commit()

    return {"message": "Password reset successfully. You may now log in with your new password."}


@router.get("/me", response_model=UserOut)
def read_current_user(user: User = Depends(get_current_user)):
    if not user:
        raise HTTPException(status_code=401, detail="Authentication required")
    return user


# ── Profile: display name update (30-day rate limit) ──────────────────────────

NAME_CHANGE_COOLDOWN_DAYS = 30


@router.patch("/me", response_model=UserOut)
def update_profile(
    body: ProfileUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_user),
):
    """
    Update the authenticated user's display name.
    Rate-limited: maximum one name change every 30 days.
    Email, role, is_active are immutable through this endpoint.
    """
    name = body.full_name.strip()
    if not name:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Display name cannot be empty."
        )
    if len(name) > 100:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Display name must be 100 characters or fewer."
        )

    now = datetime.utcnow()
    if current_user.name_changed_at is not None:
        elapsed = (now - current_user.name_changed_at).total_seconds()
        cooldown_seconds = NAME_CHANGE_COOLDOWN_DAYS * 86400
        if elapsed < cooldown_seconds:
            remaining_seconds = int(cooldown_seconds - elapsed)
            remaining_days = (remaining_seconds + 86399) // 86400  # ceil
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail=(
                    f"You can change your name again in {remaining_days} "
                    f"day{'s' if remaining_days != 1 else ''}. "
                    f"(Cooldown: {NAME_CHANGE_COOLDOWN_DAYS} days between name changes.)"
                )
            )

    current_user.full_name = name
    current_user.name_changed_at = now
    db.add(current_user)
    db.commit()
    db.refresh(current_user)
    return current_user


# ── Profile: avatar upload ─────────────────────────────────────────────────────

# Allowed MIME prefixes for the data-URL
_ALLOWED_AVATAR_PREFIXES = (
    "data:image/png;base64,",
    "data:image/jpeg;base64,",
    "data:image/jpg;base64,",
    "data:image/webp;base64,",
    "data:image/gif;base64,",
)
_MAX_AVATAR_BYTES = 200 * 1024  # 200 KB decoded


@router.post("/me/avatar", response_model=UserOut)
def update_avatar(
    body: AvatarUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_user),
):
    """
    Upload / replace the authenticated user's profile picture.
    Accepts a base64-encoded data-URL string.
    Validates MIME type and enforces a 200 KB decoded size limit.
    """
    data_url = body.avatar_b64.strip()

    # Validate prefix (type)
    matched_prefix = None
    for prefix in _ALLOWED_AVATAR_PREFIXES:
        if data_url.startswith(prefix):
            matched_prefix = prefix
            break

    if matched_prefix is None:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Avatar must be a valid PNG, JPEG, WEBP, or GIF image encoded as a base64 data-URL."
        )

    raw_b64 = data_url[len(matched_prefix):]
    try:
        decoded = base64.b64decode(raw_b64, validate=True)
    except Exception:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Invalid base64 encoding in avatar data."
        )

    if len(decoded) > _MAX_AVATAR_BYTES:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail=f"Avatar image must be smaller than 200 KB. Received {len(decoded) // 1024} KB."
        )

    current_user.avatar_b64 = data_url
    db.add(current_user)
    db.commit()
    db.refresh(current_user)
    return current_user


@router.delete("/me/avatar", response_model=UserOut)
def delete_avatar(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_user),
):
    """Remove the authenticated user's profile picture (revert to initial avatar)."""
    current_user.avatar_b64 = None
    db.add(current_user)
    db.commit()
    db.refresh(current_user)
    return current_user
