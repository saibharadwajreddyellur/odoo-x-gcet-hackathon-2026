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
