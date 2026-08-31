from typing import List
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from backend.app.core.database import get_db
from backend.app.schemas.business import (
    BusinessSettingsResponse, BusinessSettingsUpdate,
    PresetTemplateResponse, ApplyPresetRequest,
    ResetDataRequest, ResetDataResponse
)
from backend.app.services.settings_service import get_settings, update_settings
from backend.app.services.presets_service import get_available_presets, apply_preset
from backend.app.services.reset_service import reset_database_data

router = APIRouter(prefix="/settings", tags=["Settings"])

@router.get("", response_model=BusinessSettingsResponse)
def read_settings(db: Session = Depends(get_db)):
    return get_settings(db)

@router.put("", response_model=BusinessSettingsResponse)
def save_settings(data: BusinessSettingsUpdate, db: Session = Depends(get_db)):
    return update_settings(db, data)

@router.get("/presets", response_model=List[PresetTemplateResponse])
def get_presets_list():
    return get_available_presets()

@router.post("/apply-preset", response_model=BusinessSettingsResponse)
def apply_business_preset(data: ApplyPresetRequest, db: Session = Depends(get_db)):
    return apply_preset(db, data)

@router.post("/reset-data", response_model=ResetDataResponse)
def reset_system_data(data: ResetDataRequest, db: Session = Depends(get_db)):
    return reset_database_data(db, confirm_pin=data.confirm_pin, wipe_mode=data.wipe_mode or "inventory_only")
