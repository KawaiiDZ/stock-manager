from typing import Optional
from datetime import datetime
from pydantic import BaseModel, Field

class LoginRequest(BaseModel):
    username: str
    password: str

class LoginResponse(BaseModel):
    success: bool
    username: str
    full_name: str
    role: str = "ADMIN"
    token: str
    message: str = "Login successful"

class PinVerifyRequest(BaseModel):
    pin: str

class PinVerifyResponse(BaseModel):
    valid: bool
    message: str

class ChangePasswordRequest(BaseModel):
    current_password: str
    new_password: str

class ChangePinRequest(BaseModel):
    current_pin: str
    new_pin: str

class UserResponse(BaseModel):
    id: int
    username: str
    full_name: str
    role: str
    is_active: bool
    created_at: Optional[datetime] = None

    class Config:
        from_attributes = True

class UserCreate(BaseModel):
    username: str
    password: str
    full_name: str
    role: str = "RESTOCKER"

class UserUpdate(BaseModel):
    full_name: Optional[str] = None
    role: Optional[str] = None
    is_active: Optional[bool] = None
    password: Optional[str] = None
