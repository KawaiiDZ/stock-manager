from sqlalchemy.orm import Session
from backend.app.models.business import BusinessSettings
from backend.app.schemas.business import BusinessSettingsUpdate
from backend.app.core.errors import EntityNotFoundException, BusinessRuleException

def get_settings(db: Session) -> BusinessSettings:
    settings = db.query(BusinessSettings).filter(BusinessSettings.id == 1).first()
    if not settings:
        raise EntityNotFoundException("Business Settings")
    return settings

def update_settings(db: Session, update_data: BusinessSettingsUpdate) -> BusinessSettings:
    settings = get_settings(db)
    data = update_data.model_dump(exclude_unset=True)
    if "business_name" in data:
        if not data["business_name"] or not data["business_name"].strip():
            raise BusinessRuleException("Business name cannot be empty.")
        data["business_name"] = data["business_name"].strip()
    for field, value in data.items():
        setattr(settings, field, value)
    db.commit()
    db.refresh(settings)
    return settings
