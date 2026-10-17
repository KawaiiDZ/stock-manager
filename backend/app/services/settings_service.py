import json
from sqlalchemy.orm import Session
from backend.app.models.business import BusinessSettings
from backend.app.schemas.business import BusinessSettingsUpdate
from backend.app.core.errors import EntityNotFoundException, BusinessRuleException

def get_settings(db: Session) -> BusinessSettings:
    settings = db.query(BusinessSettings).filter(BusinessSettings.id == 1).first() or db.query(BusinessSettings).first()
    if not settings:
        raise EntityNotFoundException("Business Settings")
    if not settings.currency or not settings.currency.strip():
        settings.currency = "Rs."
        db.commit()
        db.refresh(settings)
    if not getattr(settings, "payment_accounts", None) or not settings.payment_accounts.strip():
        settings.payment_accounts = json.dumps(["Cash", "Bank Transfer", "Easypaisa", "Jazzcash"])
        db.commit()
        db.refresh(settings)
    setattr(settings, "has_dashboard_financials_pin", bool(getattr(settings, "dashboard_financials_pin_hash", None)))
    return settings

def update_settings(db: Session, update_data: BusinessSettingsUpdate) -> BusinessSettings:
    settings = get_settings(db)
    data = update_data.model_dump(exclude_unset=True)
    if "business_name" in data:
        if not data["business_name"] or not data["business_name"].strip():
            raise BusinessRuleException("Business name cannot be empty.")
        data["business_name"] = data["business_name"].strip()
    if "currency" in data:
        val = (data["currency"] or "").strip()
        data["currency"] = val if val else "Rs."
    if "dashboard_financials_pin" in data:
        raw_pin = (data.pop("dashboard_financials_pin") or "").strip()
        if raw_pin:
            from backend.app.core.security import hash_password
            settings.dashboard_financials_pin_hash = hash_password(raw_pin)
        else:
            settings.dashboard_financials_pin_hash = None
    if "payment_accounts" in data:
        accs = data.pop("payment_accounts")
        if isinstance(accs, list):
            cleaned = []
            for a in accs:
                s = str(a).strip()
                if s and s not in cleaned:
                    cleaned.append(s)
            if "Cash" not in cleaned:
                cleaned.insert(0, "Cash")
            settings.payment_accounts = json.dumps(cleaned)
        elif isinstance(accs, str) and accs.strip():
            settings.payment_accounts = accs.strip()
    for field, value in data.items():
        setattr(settings, field, value)
    if not settings.currency or not settings.currency.strip():
        settings.currency = "Rs."
    db.commit()
    db.refresh(settings)
    try:
        from sqlalchemy import text
        db.execute(text("PRAGMA wal_checkpoint(PASSIVE)"))
    except Exception:
        pass
    setattr(settings, "has_dashboard_financials_pin", bool(getattr(settings, "dashboard_financials_pin_hash", None)))
    return settings
