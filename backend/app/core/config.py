import os
import sys
from pathlib import Path
from pydantic_settings import BaseSettings

def get_base_dir() -> Path:
    if getattr(sys, 'frozen', False):
        return Path(sys.executable).parent
    return Path(__file__).resolve().parent.parent.parent.parent

_BASE_DIR = get_base_dir()

def get_data_dir() -> Path:
    env_dir = os.environ.get("STOCK_MANAGER_DATA_DIR")
    if env_dir:
        p = Path(env_dir)
        p.mkdir(parents=True, exist_ok=True)
        return p
    local_data = _BASE_DIR / "data"
    try:
        local_data.mkdir(parents=True, exist_ok=True)
        test_file = local_data / ".perm_check"
        test_file.touch()
        test_file.unlink()
        return local_data
    except (PermissionError, OSError):
        appdata = os.environ.get("APPDATA") or os.environ.get("LOCALAPPDATA")
        if appdata:
            user_data = Path(appdata) / "StockManager" / "data"
        else:
            user_data = Path.home() / ".stockmanager" / "data"
        user_data.mkdir(parents=True, exist_ok=True)
        return user_data

def get_backup_dir() -> Path:
    env_dir = os.environ.get("STOCK_MANAGER_BACKUP_DIR")
    if env_dir:
        p = Path(env_dir)
        p.mkdir(parents=True, exist_ok=True)
        return p
    local_backup = _BASE_DIR / "Backups"
    try:
        local_backup.mkdir(parents=True, exist_ok=True)
        test_file = local_backup / ".perm_check"
        test_file.touch()
        test_file.unlink()
        return local_backup
    except (PermissionError, OSError):
        appdata = os.environ.get("APPDATA") or os.environ.get("LOCALAPPDATA")
        if appdata:
            user_backup = Path(appdata) / "StockManager" / "Backups"
        else:
            user_backup = Path.home() / ".stockmanager" / "Backups"
        user_backup.mkdir(parents=True, exist_ok=True)
        return user_backup

class Settings(BaseSettings):
    PROJECT_NAME: str = "Offline Stock Manager"
    VERSION: str = "2.0.0"
    API_PREFIX: str = "/api"
    
    BASE_DIR: Path = _BASE_DIR
    DATA_DIR: Path = get_data_dir()
    BACKUP_DIR: Path = get_backup_dir()
    
    # Database
    SQLITE_DB_NAME: str = "business_data.db"
    
    @property
    def SQLITE_DB_PATH(self) -> Path:
        return self.DATA_DIR / self.SQLITE_DB_NAME

    @property
    def DATABASE_URL(self) -> str:
        return f"sqlite:///{self.SQLITE_DB_PATH.as_posix()}"

    SECRET_KEY: str = "offline-desktop-secret-key-change-if-needed-123456789"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60 * 24 * 30  # 30 days offline session

    # Google OAuth 2.0 Credentials (can also be configured per-installation in Settings)
    GOOGLE_CLIENT_ID: str = os.environ.get("GOOGLE_CLIENT_ID", "")
    GOOGLE_CLIENT_SECRET: str = os.environ.get("GOOGLE_CLIENT_SECRET", "")

    class Config:
        case_sensitive = True

settings = Settings()

# Ensure data and backup directories exist
os.makedirs(settings.DATA_DIR, exist_ok=True)
os.makedirs(settings.BACKUP_DIR, exist_ok=True)
