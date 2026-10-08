import random
import re
import threading
from concurrent.futures import ThreadPoolExecutor
from datetime import timedelta
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from ..config import settings
from ..database import SessionLocal, get_db
from ..deps import current_user, require_roles
from ..models import AuditLog, ModelVersion, User, utcnow
from ..schemas import SampleInspectIn, TrainIn
from ..serializers import model_out
from ..services import registry, synthetic, trainer
from ..services.pipeline import inspect_image
from .inspections import persist

router = APIRouter(prefix="/dataset", tags=["dataset & models"])
NAME_RE = re.compile(r"^[A-Za-z0-9_\-]+$")
staff = require_roles("admin", "quality_engineer")


def _category_dir(name: str) -> Path:
    if not NAME_RE.match(name):
        raise HTTPException(400, "Invalid category name")
    d = settings.DATASET_ROOT / name
    if not (d / "train" / "good").exists():
        raise HTTPException(404, f"Category '{name}' not found under the dataset root")
    return d


def _spawn(jid, fn):
    def run():
        try:
            fn()
        except Exception as e:  # noqa: BLE001
            registry.update_job(jid, status="failed", error=str(e), message="Failed")
    threading.Thread(target=run, daemon=True).start()


@router.get("/status")
def status(db: Session = Depends(get_db), _: User = Depends(current_user)):
    cats = trainer.scan_categories(settings.DATASET_ROOT)
    active = {m.category: m for m in db.query(ModelVersion).filter_by(active=True).all()}
    for c in cats:
        m = active.get(c["name"])
        c["active_model"] = model_out(m) if m else None
    return {"root": str(settings.DATASET_ROOT), "categories": cats,
            "hint": "Extract MVTec AD categories (bottle, carpet, ...) into the dataset root, or generate the demo dataset."}


@router.post("/generate-demo", status_code=202)
def generate_demo(user: User = Depends(staff)):
    jid = registry.new_job("dataset", "Generate demo dataset")

    def work():
        synthetic.generate_dataset(settings.DATASET_ROOT, progress=lambda p: registry.update_job(jid, p, "Rendering synthetic parts"))
        registry.update_job(jid, 1.0, "Done", status="completed", result={"categories": [f"demo_{s}" for s in synthetic.STYLES]})
    _spawn(jid, work)
    return {"job_id": jid}


@router.post("/train", status_code=202)
def train(body: TrainIn, user: User = Depends(staff)):
    cat_dir = _category_dir(body.category)
    jid = registry.new_job("train", f"Train {body.category}")
    uid = user.id

    def work():
        db = SessionLocal()
        try:
            version = registry.next_version(db, body.category)
            path = registry.model_path(body.category, version)
            model, metrics = trainer.train_category(
                body.category, settings.DATASET_ROOT, path, version, body.max_train_images, body.clusters,
                progress=lambda p, m: registry.update_job(jid, p, m))
            mv = ModelVersion(category=body.category, name=model.name, version=version, path=str(path), metrics=metrics, trained_by=uid)
            db.add(mv)
            db.add(AuditLog(user_id=uid, action="model.train", detail=f"{model.name} auroc={metrics.get('auroc')}"))
            db.commit()
            registry.activate(db, mv)
            registry.update_job(jid, 1.0, "Model trained and activated", status="completed", result=model_out(mv))
        finally:
            db.close()
    _spawn(jid, work)
    return {"job_id": jid}


@router.get("/jobs")
def jobs(_: User = Depends(current_user)):
    return list(registry.JOBS.values())[-15:][::-1]


@router.get("/jobs/{jid}")
def job(jid: str, _: User = Depends(current_user)):
    j = registry.JOBS.get(jid)
    if not j:
        raise HTTPException(404, "Job not found")
    return j


@router.get("/models")
def models(category: str | None = None, db: Session = Depends(get_db), _: User = Depends(current_user)):
    q = db.query(ModelVersion)
    if category:
        q = q.filter_by(category=category)
    return [model_out(m) for m in q.order_by(ModelVersion.created_at.desc()).all()]


@router.post("/models/{mid}/activate")
def activate_model(mid: int, db: Session = Depends(get_db), user: User = Depends(staff)):
    mv = db.get(ModelVersion, mid)
    if not mv:
        raise HTTPException(404, "Model not found")
    registry.activate(db, mv)
    db.add(AuditLog(user_id=user.id, action="model.activate", detail=mv.name))
    db.commit()
    return model_out(mv)


@router.post("/inspect-samples", status_code=202)
def inspect_samples(body: SampleInspectIn, user: User = Depends(staff)):
    """Run the pipeline on random MVTec-style test images. `spread_days` back-dates them to
    simulate production history so trend dashboards have data to show."""
    cat_dir = _category_dir(body.category)
    files = [(p, p.parent.name) for p in (cat_dir / "test").rglob("*") if p.suffix.lower() in {".png", ".jpg", ".jpeg", ".bmp"}]
    if not files:
        raise HTTPException(400, "This category has no test images")
    jid = registry.new_job("samples", f"Inspect {body.count} samples from {body.category}")
    uid = user.id

    def work():
        db = SessionLocal()
        try:
            u = db.get(User, uid)
            model = registry.get_active_model(db, body.category)
            good = [x for x in files if x[1] == "good"]
            bad = [x for x in files if x[1] != "good"]

            def pick():
                if body.defect_ratio is None or not good or not bad:
                    return random.choice(files)
                return random.choice(bad if random.random() < body.defect_ratio else good)

            picks = [pick() for _ in range(body.count)]
            batch = f"D{random.randint(0, 16**6):06X}"
            run = lambda item: inspect_image(item[0].read_bytes(), item[0].name, model, settings.MAX_UPLOAD_MB)  # noqa: E731
            done = 0
            with ThreadPoolExecutor(max_workers=max(1, settings.INFERENCE_WORKERS)) as pool:
                for start in range(0, len(picks), 8):
                    chunk = picks[start:start + 8]
                    for (p, label), res in zip(chunk, pool.map(run, chunk)):
                        when = utcnow() - timedelta(days=random.random() * body.spread_days) if body.spread_days else None
                        persist(db, res, u, p.name, "dataset", body.category, batch, when, gt_label=label)
                        done += 1
                        registry.update_job(jid, done / len(picks), f"Inspected {done}/{len(picks)}")
            registry.update_job(jid, 1.0, "Done", status="completed", result={"inspected": len(picks), "mode": "trained" if model else "baseline"})
        finally:
            db.close()
    _spawn(jid, work)
    return {"job_id": jid}
