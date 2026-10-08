import os
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent


class Settings:
    APP_NAME = "VisionInspect AI"
    SECRET_KEY = os.getenv("SECRET_KEY", "change-me-in-production-please")
    ACCESS_TOKEN_MINUTES = int(os.getenv("ACCESS_TOKEN_MINUTES", "720"))
    DATA_DIR = Path(os.getenv("DATA_DIR", BASE_DIR / "data"))
    DATABASE_URL = os.getenv("DATABASE_URL", f"sqlite:///{(DATA_DIR / 'visioninspect.db').as_posix()}")
    DATASET_ROOT = Path(os.getenv("DATASET_ROOT", DATA_DIR / "datasets" / "mvtec_ad"))
    MAX_UPLOAD_MB = int(os.getenv("MAX_UPLOAD_MB", "20"))
    CORS_ORIGINS = [o.strip() for o in os.getenv("CORS_ORIGINS", "http://localhost:5173,http://localhost:3000").split(",")]
    ADMIN_EMAIL = os.getenv("ADMIN_EMAIL", "admin@visioninspect.ai")
    ADMIN_PASSWORD = os.getenv("ADMIN_PASSWORD", "Admin@123")
    INFERENCE_WORKERS = int(os.getenv("INFERENCE_WORKERS", str(min(4, os.cpu_count() or 2))))
    SEED_DEMO_USERS = os.getenv("SEED_DEMO_USERS", "true").lower() == "true"

    @property
    def upload_dir(self): return self.DATA_DIR / "inspections"
    @property
    def model_dir(self): return self.DATA_DIR / "models"


settings = Settings()
for _d in (settings.DATA_DIR, settings.upload_dir, settings.model_dir, settings.DATASET_ROOT):
    _d.mkdir(parents=True, exist_ok=True)
