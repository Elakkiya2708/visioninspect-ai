"""Model registry (versioning + active model cache) and background job tracking."""
import threading
import uuid
from pathlib import Path

from sqlalchemy.orm import Session

from ..config import settings
from ..models import ModelVersion
from .anomaly import AnomalyModel

_cache: dict[str, AnomalyModel] = {}
_lock = threading.Lock()
JOBS: dict[str, dict] = {}


def get_active_model(db: Session, category: str):
    """Return the active trained model for a category or None (-> baseline detector)."""
    mv = db.query(ModelVersion).filter_by(category=category, active=True).first()
    if not mv or not Path(mv.path).exists():
        return None
    with _lock:
        if mv.path not in _cache:
            _cache[mv.path] = AnomalyModel.load(Path(mv.path))
        return _cache[mv.path]


def next_version(db: Session, category: str) -> int:
    last = db.query(ModelVersion).filter_by(category=category).order_by(ModelVersion.version.desc()).first()
    return (last.version + 1) if last else 1


def model_path(category: str, version: int) -> Path:
    return settings.model_dir / category / f"v{version}.npz"


def activate(db: Session, mv: ModelVersion):
    db.query(ModelVersion).filter_by(category=mv.category, active=True).update({"active": False})
    mv.active = True
    db.commit()


def new_job(kind: str, label: str) -> str:
    jid = uuid.uuid4().hex[:10]
    JOBS[jid] = {"id": jid, "kind": kind, "label": label, "status": "running", "progress": 0.0,
                 "message": "Starting", "result": None, "error": None}
    return jid


def update_job(jid, progress=None, message=None, **kw):
    j = JOBS.get(jid)
    if j:
        if progress is not None:
            j["progress"] = round(float(progress), 3)
        if message:
            j["message"] = message
        j.update(kw)
