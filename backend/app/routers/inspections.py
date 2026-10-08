import random
import re
import uuid
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timedelta
from pathlib import Path
from typing import Optional

import cv2
from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, UploadFile
from fastapi.responses import FileResponse, Response
from sqlalchemy import or_
from sqlalchemy.orm import Session, selectinload

from ..config import settings
from ..database import get_db
from ..deps import current_user, require_roles
from ..models import AuditLog, Defect, Inspection, User, utcnow
from ..schemas import CameraIn, ReviewIn
from ..serializers import inspection_out
from ..services import reports, synthetic
from ..services.pipeline import inspect_image
from ..services.registry import get_active_model

router = APIRouter(prefix="/inspections", tags=["inspections"])
IMAGE_KINDS = {"original", "processed", "heatmap", "overlay"}
MAX_FILES = 50


def clean_category(c: str) -> str:
    c = re.sub(r"[^A-Za-z0-9_\-. ]", "", (c or "general")).strip()[:80]
    return c or "general"


def persist(db: Session, result: dict, user: Optional[User], filename: str, source: str, category: str,
            batch_id=None, created_at: Optional[datetime] = None, gt_label: Optional[str] = None) -> Inspection:
    ins = Inspection(
        code=f"TMP-{uuid.uuid4().hex[:12]}", user_id=user.id if user else None, filename=filename[:255], source=source,
        batch_id=batch_id, category=category, status="completed", width=result["size"]["width"], height=result["size"]["height"],
        validation=result["validation"], quality=result["quality"], features=result["features"],
        preprocessing={**result["preprocessing"], "timings": result["timings"]},
        model_name=result["model"]["name"], model_mode=result["model"]["mode"], anomaly_score=result["anomaly_score"],
        severity_score=result["severity_score"], severity_level=result["severity_level"], decision=result["decision"],
        needs_review=result["needs_review"], recommendation=result["recommendation"], root_cause=result["root_cause"],
        processing_ms=result["processing_ms"], gt_label=gt_label, created_at=created_at or utcnow(),
    )
    for d in result["defects"]:
        ins.defects.append(Defect(
            type=d["type"], category=d["category"], bbox=d["bbox"], area_ratio=d["area_ratio"], confidence=d["confidence"],
            type_confidence=d["type_confidence"], size_score=d["size_score"], location_score=d["location_score"],
            type_score=d["type_score"], confidence_score=d["confidence_score"], severity_score=d["severity_score"],
            severity_level=d["severity_level"]))
    db.add(ins)
    db.flush()
    ins.code = f"INS-{ins.id:06d}"
    folder = settings.upload_dir / ins.code
    folder.mkdir(parents=True, exist_ok=True)
    for kind, blob in result["images"].items():
        (folder / f"{kind}.jpg").write_bytes(blob)
    db.commit()
    return ins


def _apply_filters(q, search, decision, severity, category, source, date_from, date_to, needs_review):
    q = q.filter(Inspection.status == "completed")
    if search:
        like = f"%{search}%"
        q = q.filter(or_(Inspection.code.ilike(like), Inspection.filename.ilike(like), Inspection.category.ilike(like)))
    if decision:
        q = q.filter(Inspection.decision == decision.upper())
    if severity:
        q = q.filter(Inspection.severity_level == severity)
    if category:
        q = q.filter(Inspection.category == category)
    if source:
        q = q.filter(Inspection.source == source)
    if date_from:
        q = q.filter(Inspection.created_at >= date_from)
    if date_to:
        q = q.filter(Inspection.created_at < date_to + timedelta(days=1))
    if needs_review is not None:
        q = q.filter(Inspection.needs_review == needs_review, Inspection.review_status.is_(None)) if needs_review else q
    return q


@router.post("", status_code=201)
def create_inspections(files: list[UploadFile] = File(...), category: str = Form("general"),
                       db: Session = Depends(get_db), user: User = Depends(current_user)):
    if not files:
        raise HTTPException(400, "No files supplied")
    if len(files) > MAX_FILES:
        raise HTTPException(400, f"Maximum {MAX_FILES} files per batch")
    category = clean_category(category)
    model = get_active_model(db, category)
    batch_id = f"B{uuid.uuid4().hex[:8].upper()}" if len(files) > 1 else None
    source = "batch" if batch_id else "upload"
    blobs = [(f.filename or "upload", f.file.read()) for f in files]
    # CPU-bound OpenCV/NumPy work releases the GIL, so a small thread pool speeds up batches.
    workers = max(1, min(settings.INFERENCE_WORKERS, len(blobs)))
    with ThreadPoolExecutor(max_workers=workers) as pool:
        outputs = list(pool.map(lambda b: inspect_image(b[1], b[0], model, settings.MAX_UPLOAD_MB), blobs))
    results = []
    for (name, _), res in zip(blobs, outputs):
        if "error" in res:
            results.append({"filename": name, "status": "invalid", "error": res["error"], "validation": res["validation"]})
            continue
        ins = persist(db, res, user, name, source, category, batch_id)
        results.append({"status": "completed", **inspection_out(ins)})
    db.add(AuditLog(user_id=user.id, action="inspection.create", detail=f"{len(files)} file(s), category={category}, batch={batch_id}"))
    db.commit()
    return {"batch_id": batch_id, "results": results,
            "summary": {"total": len(results), "completed": sum(r["status"] == "completed" for r in results),
                        "invalid": sum(r["status"] == "invalid" for r in results)}}


@router.post("/camera", status_code=201)
def simulate_camera(body: CameraIn, db: Session = Depends(get_db), user: User = Depends(current_user)):
    """Camera integration simulation: capture frames from the synthetic line (demo_*) or MVTec test set."""
    category = clean_category(body.category)
    model = get_active_model(db, category)
    out = []
    cat_dir = settings.DATASET_ROOT / category
    style = category.replace("demo_", "", 1) if category.startswith("demo_") else None
    if style not in synthetic.STYLES:
        style = None
    test_files = [p for p in (cat_dir / "test").rglob("*") if p.suffix.lower() in {".png", ".jpg", ".jpeg", ".bmp"}] if (cat_dir / "test").exists() else []
    for _ in range(body.count):
        seed = random.randint(0, 10_000_000)
        if style:
            img, label, kind = synthetic.random_sample(style, seed, body.defect_probability)
            ok, buf = cv2.imencode(".png", img)
            data, name, gt = buf.tobytes(), f"cam_{seed}.png", kind or "good"
        elif test_files:
            p = random.choice(test_files)
            data, name, gt = p.read_bytes(), f"cam_{p.parent.name}_{p.name}", p.parent.name
        else:
            img, label, kind = synthetic.random_sample("metal_plate", seed, body.defect_probability)
            ok, buf = cv2.imencode(".png", img)
            data, name, gt = buf.tobytes(), f"cam_{seed}.png", kind or "good"
        res = inspect_image(data, name, model, settings.MAX_UPLOAD_MB)
        out.append(inspection_out(persist(db, res, user, name, "camera", category, gt_label=gt)))
    return {"results": out}


@router.get("")
def list_inspections(page: int = Query(1, ge=1), page_size: int = Query(20, ge=1, le=100),
                     search: Optional[str] = None, decision: Optional[str] = None, severity: Optional[str] = None,
                     category: Optional[str] = None, source: Optional[str] = None, needs_review: Optional[bool] = None,
                     date_from: Optional[datetime] = None, date_to: Optional[datetime] = None,
                     db: Session = Depends(get_db), _: User = Depends(current_user)):
    q = _apply_filters(db.query(Inspection), search, decision, severity, category, source, date_from, date_to, needs_review)
    total = q.count()
    rows = (q.options(selectinload(Inspection.defects)).order_by(Inspection.created_at.desc(), Inspection.id.desc())
            .offset((page - 1) * page_size).limit(page_size).all())
    return {"items": [inspection_out(r) for r in rows], "total": total, "page": page, "page_size": page_size,
            "pages": max(1, -(-total // page_size))}


@router.get("/export.csv")
def export_csv(search: Optional[str] = None, decision: Optional[str] = None, severity: Optional[str] = None,
               category: Optional[str] = None, source: Optional[str] = None, date_from: Optional[datetime] = None,
               date_to: Optional[datetime] = None, db: Session = Depends(get_db), _: User = Depends(current_user)):
    q = _apply_filters(db.query(Inspection), search, decision, severity, category, source, date_from, date_to, None)
    rows = q.options(selectinload(Inspection.defects)).order_by(Inspection.created_at.desc()).limit(20000).all()
    return Response(reports.inspections_csv(rows), media_type="text/csv",
                    headers={"Content-Disposition": f'attachment; filename="visioninspect_inspections_{utcnow():%Y%m%d}.csv"'})


def _get(db, iid) -> Inspection:
    ins = db.get(Inspection, iid)
    if not ins:
        raise HTTPException(404, "Inspection not found")
    return ins


@router.get("/{iid:int}")
def get_inspection(iid: int, db: Session = Depends(get_db), _: User = Depends(current_user)):
    return inspection_out(_get(db, iid), detail=True)


@router.get("/{iid:int}/image/{kind}")
def get_image(iid: int, kind: str, db: Session = Depends(get_db), _: User = Depends(current_user)):
    if kind not in IMAGE_KINDS:
        raise HTTPException(404, "Unknown image kind")
    ins = _get(db, iid)
    path = settings.upload_dir / ins.code / f"{kind}.jpg"
    if not path.exists():
        raise HTTPException(404, "Image file missing")
    return FileResponse(path, media_type="image/jpeg", headers={"Cache-Control": "private, max-age=3600"})


@router.post("/{iid:int}/review")
def review(iid: int, body: ReviewIn, db: Session = Depends(get_db),
           user: User = Depends(require_roles("admin", "factory_supervisor"))):
    ins = _get(db, iid)
    ins.review_status, ins.review_note, ins.reviewed_by, ins.reviewed_at = body.action, body.note, user.id, utcnow()
    ins.needs_review = False
    db.add(AuditLog(user_id=user.id, action="inspection.review", detail=f"{ins.code} -> {body.action}"))
    db.commit()
    return inspection_out(ins, detail=True)


@router.get("/{iid:int}/report.pdf")
def report_pdf(iid: int, db: Session = Depends(get_db), _: User = Depends(current_user)):
    ins = _get(db, iid)
    try:
        pdf = reports.inspection_pdf(ins, settings.upload_dir / ins.code / "overlay.jpg")
    except ImportError:
        raise HTTPException(501, "PDF generation requires the 'reportlab' package")
    return Response(pdf, media_type="application/pdf", headers={"Content-Disposition": f'attachment; filename="{ins.code}.pdf"'})


@router.delete("/{iid:int}", status_code=204)
def delete_inspection(iid: int, db: Session = Depends(get_db), admin: User = Depends(require_roles("admin"))):
    ins = _get(db, iid)
    folder = settings.upload_dir / ins.code
    code = ins.code
    db.delete(ins)
    db.add(AuditLog(user_id=admin.id, action="inspection.delete", detail=code))
    db.commit()
    for f in folder.glob("*") if folder.exists() else []:
        f.unlink(missing_ok=True)
    if folder.exists():
        folder.rmdir()
