from datetime import datetime
from typing import Optional
from pydantic import BaseModel, EmailStr


class UserBase(BaseModel):
    email: EmailStr
    full_name: Optional[str] = None
    role: Optional[str] = "inventory_manager"


class UserCreate(UserBase):
    password: str


class UserLogin(BaseModel):
    email: EmailStr
    password: str


class UserOut(UserBase):
    id: int
    is_active: bool
    created_at: datetime
    avatar_b64: Optional[str] = None
    name_changed_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class Token(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserOut


class TokenData(BaseModel):
    user_id: Optional[str] = None


class PasswordResetRequest(BaseModel):
    email: EmailStr


class PasswordResetResponse(BaseModel):
    message: str
    email: EmailStr
    cooldown_seconds: int = 60


class OTPVerifyRequest(BaseModel):
    email: EmailStr
    otp: str


class OTPVerifyResponse(BaseModel):
    message: str
    reset_token: str


class PasswordResetConfirm(BaseModel):
    email: EmailStr
    new_password: str
    otp: Optional[str] = None
    reset_token: Optional[str] = None


# --- Profile update schemas ---

class ProfileUpdate(BaseModel):
    """Only full_name is mutable via this endpoint. email/role/is_active are read-only."""
    full_name: str


class AvatarUpdate(BaseModel):
    """base64-encoded data-URL for the profile picture (e.g. 'data:image/png;base64,...')"""
    avatar_b64: str
