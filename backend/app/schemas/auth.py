from pydantic import BaseModel

class LoginRequest(BaseModel):
    username: str
    password: str

class LoginResponse(BaseModel):
    success: bool
    username: str
    full_name: str
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
