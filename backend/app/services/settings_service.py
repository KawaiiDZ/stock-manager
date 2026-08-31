from sqlalchemy.orm import Session
from backend.app.models.business import BusinessSettings
from backend.app.schemas.business import BusinessSettingsUpdate
from backend.app.core.errors import EntityNotFoundException

def get_settings(db: Session) -> BusinessSettings:
    settings = db.query(BusinessSettings).filter(BusinessSettings.id == 1).first()
    if not settings:
        raise EntityNotFoundException("Business Settings")
    return settings

def update_settings(db: Session, update_data: BusinessSettingsUpdate) -> BusinessSettings:
    settings = get_settings(db)
    for field, value in update_data.model_dump(exclude_unset=True).items():
        setattr(settings, field, value)
    db.commit()
    db.refresh(settings)
    return settings
