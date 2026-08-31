import os
from pathlib import Path
from pydantic_settings import BaseSettings

class Settings(BaseSettings):
    PROJECT_NAME: str = "Offline Stock Manager"
    VERSION: str = "1.0.0"
    API_PREFIX: str = "/api"
    
    # Base directory is workspace root
    BASE_DIR: Path = Path(__file__).resolve().parent.parent.parent.parent
    DATA_DIR: Path = BASE_DIR / "data"
    BACKUP_DIR: Path = BASE_DIR / "Backups"
    
    # Database
    SQLITE_DB_NAME: str = "business_data.db"
    
    @property
    def SQLITE_DB_PATH(self) -> Path:
        return self.DATA_DIR / self.SQLITE_DB_NAME

    @property
    def DATABASE_URL(self) -> str:
        return f"sqlite:///{self.SQLITE_DB_PATH}"

    SECRET_KEY: str = "offline-desktop-secret-key-change-if-needed-123456789"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60 * 24 * 30  # 30 days offline session

    class Config:
        case_sensitive = True

settings = Settings()

# Ensure data and backup directories exist
os.makedirs(settings.DATA_DIR, exist_ok=True)
os.makedirs(settings.BACKUP_DIR, exist_ok=True)
