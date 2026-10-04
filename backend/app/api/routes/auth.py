from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from backend.app.core.database import get_db
from backend.app.schemas.auth import (
    LoginRequest, LoginResponse, PinVerifyRequest, PinVerifyResponse,
    ChangePasswordRequest, ChangePinRequest
)
from backend.app.services.auth_service import (
    authenticate_user, verify_settings_pin, change_user_password, change_settings_pin,
    verify_dashboard_financials_unlock
)

router = APIRouter(prefix="/auth", tags=["Auth"])

@router.post("/login", response_model=LoginResponse)
def login(data: LoginRequest, db: Session = Depends(get_db)):
    user = authenticate_user(db, data.username, data.password)
    return LoginResponse(
        success=True,
        username=user.username,
        full_name=user.full_name,
        role=getattr(user, "role", "ADMIN"),
        token=f"local-session-{user.id}"
    )

@router.post("/verify-pin", response_model=PinVerifyResponse)
def verify_pin(data: PinVerifyRequest, db: Session = Depends(get_db)):
    valid = verify_settings_pin(db, data.pin)
    return PinVerifyResponse(
        valid=valid,
        message="PIN verified" if valid else "Incorrect PIN"
    )

@router.post("/verify-dashboard-pin", response_model=PinVerifyResponse)
def verify_dashboard_pin(data: PinVerifyRequest, db: Session = Depends(get_db)):
    valid = verify_dashboard_financials_unlock(db, data.pin)
    return PinVerifyResponse(
        valid=valid,
        message="Unlocked" if valid else "Incorrect PIN or Password"
    )

@router.post("/change-password")
def change_password(data: ChangePasswordRequest, db: Session = Depends(get_db)):
    change_user_password(db, 1, data.current_password, data.new_password)
    return {"success": True, "message": "Password changed successfully"}

@router.post("/change-pin")
def change_pin(data: ChangePinRequest, db: Session = Depends(get_db)):
    change_settings_pin(db, data.current_pin, data.new_pin)
    return {"success": True, "message": "PIN changed successfully"}
