"""
Milestone 2 — Defect Detection Module.

Endpoints for managing per-product-line reference ("golden sample")
images and running defect analysis against them. See
app/vision/defect_detector.py for the actual computer-vision pipeline.

Product line names are matched case-insensitively and trimmed of
whitespace everywhere a reference is looked up, so "Bottle", "bottle",
and " bottle " are all treated as the same line.
"""
import uuid
from datetime import datetime, timedelta, timezone
from pathlib import Path

import cv2

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile, status
from fastapi.responses import FileResponse
from PIL import Image as PILImage, UnidentifiedImageError
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.security import decode_access_token
from app.db.database import get_db
from app.db.models import DefectPrediction, InspectionVerdict, ProductImage, ReferenceImage, User
from app.dependencies import get_current_user
from app.schemas import (
    AnalyticsOverviewOut,
    DailyActivityOut,
    DefectPredictionOut,
    DefectRegionOut,
    DefectTrendPointOut,
    DefectTypeCountOut,
    InspectionStatsOut,
    ProductLineQualityOut,
    QualityReportOut,
    ReferenceImageOut,
    SeverityDistributionOut,
)
from app.vision.classifier import DEFECT_TYPES, classify_and_score
from app.vision.defect_detector import detect_defects
from app.vision.preprocessing import analyze_quality, preprocess, read_image
from app.vision.quality_control import decide

router = APIRouter(prefix="/api/inspection", tags=["Defect Detection"])
settings = get_settings()

REFERENCE_DIR = Path(settings.upload_dir).parent / "references"
REFERENCE_DIR.mkdir(parents=True, exist_ok=True)


def _find_reference(db: Session, product_line: str) -> ReferenceImage | None:
    """Case-insensitive, whitespace-trimmed lookup — see module docstring."""
    normalized = product_line.strip().lower()
    return (
        db.query(ReferenceImage)
        .filter(func.lower(ReferenceImage.product_line) == normalized)
        .first()
    )


@router.post("/reference", response_model=ReferenceImageOut, status_code=status.HTTP_201_CREATED)
async def upload_reference_image(
    product_line: str = Form(...),
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Sets (or replaces) the known-good sample image for a product line.
    Every future inspection on this product line is compared against
    whichever reference image is current.
    """
    product_line = product_line.strip()
    if not product_line:
        raise HTTPException(status_code=400, detail="Product line name cannot be empty.")

    contents = await file.read()
    if file.content_type not in settings.allowed_image_types_list:
        raise HTTPException(status_code=400, detail=f"Unsupported file type: {file.content_type}")
    if len(contents) > settings.max_image_size_mb * 1024 * 1024:
        raise HTTPException(status_code=400, detail=f"File exceeds {settings.max_image_size_mb}MB limit")

    try:
        from io import BytesIO
        img = PILImage.open(BytesIO(contents))
        img.verify()
        img = PILImage.open(BytesIO(contents))
        width, height = img.size
    except UnidentifiedImageError:
        raise HTTPException(status_code=400, detail="File is not a valid, readable image")

    ext = Path(file.filename).suffix or ".jpg"
    stored_path = REFERENCE_DIR / f"{uuid.uuid4().hex}{ext}"
    with open(stored_path, "wb") as f:
        f.write(contents)

    existing = _find_reference(db, product_line)
    if existing:
        old_path = Path(existing.stored_path)
        if old_path.exists():
            old_path.unlink(missing_ok=True)
        existing.file_name = file.filename
        existing.stored_path = str(stored_path)
        existing.width = width
        existing.height = height
        db.commit()
        db.refresh(existing)
        return existing

    record = ReferenceImage(
        product_line=product_line,
        file_name=file.filename,
        stored_path=str(stored_path),
        width=width,
        height=height,
        uploaded_by_id=current_user.id,
    )
    db.add(record)
    db.commit()
    db.refresh(record)
    return record


@router.get("/reference", response_model=list[ReferenceImageOut])
def list_reference_images(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    return db.query(ReferenceImage).order_by(ReferenceImage.product_line).all()


@router.get("/reference/{reference_id}/file")
def get_reference_file(reference_id: str, token: str, db: Session = Depends(get_db)):
    payload = decode_access_token(token)
    if not payload:
        raise HTTPException(status_code=401, detail="Invalid or expired token.")
    user = db.get(User, payload.get("sub"))
    if not user or not user.is_active:
        raise HTTPException(status_code=401, detail="Invalid or expired token.")

    record = db.get(ReferenceImage, reference_id)
    if not record or not Path(record.stored_path).exists():
        raise HTTPException(status_code=404, detail="Reference image not found.")
    return FileResponse(record.stored_path, media_type="image/jpeg")


def _to_prediction_out(pred: DefectPrediction) -> DefectPredictionOut:
    quality = None
    if pred.quality_brightness is not None:
        quality = QualityReportOut(
            brightness=pred.quality_brightness,
            contrast=pred.quality_contrast or 0.0,
            sharpness=pred.quality_sharpness or 0.0,
            is_blurry="blurry" in (pred.quality_flags or []),
            is_underexposed="underexposed" in (pred.quality_flags or []),
            is_overexposed="overexposed" in (pred.quality_flags or []),
        )
    return DefectPredictionOut(
        id=pred.id,
        product_image_id=pred.product_image_id,
        reference_image_id=pred.reference_image_id,
        similarity_score=pred.similarity_score,
        defect_count=pred.defect_count,
        total_affected_area_pct=pred.total_affected_area_pct,
        regions=[DefectRegionOut(**r) for r in (pred.regions or [])],
        verdict=pred.verdict,
        overall_severity=pred.overall_severity or 0.0,
        severity_level=pred.severity_level or "None",
        decision=pred.decision or "pass",
        recommendation=pred.recommendation,
        critical_count=pred.critical_count or 0,
        high_count=pred.high_count or 0,
        medium_count=pred.medium_count or 0,
        low_count=pred.low_count or 0,
        quality=quality,
        quality_flags=pred.quality_flags or [],
        created_at=pred.created_at,
    )


@router.post("/analyze/{image_id}", response_model=DefectPredictionOut, status_code=status.HTTP_201_CREATED)
def analyze_image(
    image_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Runs the defect-detection pipeline on an already-uploaded product
    image, comparing it against its product line's reference image.
    """
    product_image = db.get(ProductImage, image_id)
    if not product_image:
        raise HTTPException(status_code=404, detail="Product image not found.")
    if not product_image.stored_path or not Path(product_image.stored_path).exists():
        raise HTTPException(status_code=400, detail="Image file is not available (it may have been rejected at upload).")

    if not product_image.product_line or not product_image.product_line.strip():
        raise HTTPException(
            status_code=400,
            detail="This image has no product line assigned, so there's no reference image to compare it against. "
            "Re-upload it from Image Acquisition with the 'Product line' field filled in.",
        )

    reference = _find_reference(db, product_image.product_line)
    if not reference:
        raise HTTPException(
            status_code=404,
            detail=f"No reference (golden-sample) image set for product line '{product_image.product_line}' yet. "
            "Add one in step 1 above, using the exact same product line name.",
        )

    try:
        reference_np = read_image(reference.stored_path)
        test_np = read_image(product_image.stored_path)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    quality = analyze_quality(test_np)
    result = detect_defects(reference_np, test_np)

    # --- Milestone 3: classify each region, score its severity, and
    # derive a single auditable quality decision for the product. ---
    ref_prepped = preprocess(reference_np)
    test_prepped = preprocess(test_np)
    test_aligned = cv2.resize(
        test_prepped,
        (ref_prepped.shape[1], ref_prepped.shape[0]),
        interpolation=cv2.INTER_AREA,
    )
    ref_gray = cv2.cvtColor(ref_prepped, cv2.COLOR_BGR2GRAY)
    test_gray = cv2.cvtColor(test_aligned, cv2.COLOR_BGR2GRAY)

    classified = classify_and_score(ref_gray, test_gray, result.regions)
    quality_decision = decide(classified)

    flags = []
    if quality.is_blurry:
        flags.append("blurry")
    if quality.is_underexposed:
        flags.append("underexposed")
    if quality.is_overexposed:
        flags.append("overexposed")

    record = DefectPrediction(
        product_image_id=product_image.id,
        reference_image_id=reference.id,
        similarity_score=result.similarity_score,
        defect_count=result.defect_count,
        total_affected_area_pct=result.total_affected_area_pct,
        regions=[d.to_dict() for d in classified],
        verdict=InspectionVerdict(result.verdict),
        overall_severity=quality_decision.overall_severity,
        severity_level=quality_decision.severity_level,
        decision=quality_decision.decision,
        recommendation=quality_decision.recommendation,
        critical_count=quality_decision.critical_count,
        high_count=quality_decision.high_count,
        medium_count=quality_decision.medium_count,
        low_count=quality_decision.low_count,
        quality_brightness=quality.brightness,
        quality_contrast=quality.contrast,
        quality_sharpness=quality.sharpness,
        quality_flags=flags,
        analyzed_by_id=current_user.id,
    )
    db.add(record)
    db.commit()
    db.refresh(record)

    return _to_prediction_out(record)


@router.get("/stats", response_model=InspectionStatsOut)
def inspection_stats(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    """
    System-wide inspection health (every account's predictions, not just
    the caller's) — the Supervisor/Manager dashboards use this; the
    Quality Engineer dashboard uses the per-account /api/auth/me/stats
    instead, so the three roles genuinely see different numbers.
    """
    rows = db.query(DefectPrediction.verdict, DefectPrediction.similarity_score).all()

    total = len(rows)
    passed = sum(1 for v, _ in rows if v == InspectionVerdict.PASS)
    failed = sum(1 for v, _ in rows if v == InspectionVerdict.FAIL)
    inconclusive = sum(1 for v, _ in rows if v == InspectionVerdict.INCONCLUSIVE)

    decided = passed + failed
    pass_rate = round((passed / decided) * 100, 2) if decided > 0 else None
    avg_similarity = round((sum(s for _, s in rows) / total) * 100, 2) if total > 0 else None

    return InspectionStatsOut(
        total_inspections=total,
        passed=passed,
        failed=failed,
        inconclusive=inconclusive,
        pass_rate_pct=pass_rate,
        avg_similarity_pct=avg_similarity,
    )


@router.get("/activity", response_model=list[DailyActivityOut])
def inspection_activity(
    days: int = 14,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Daily inspection counts (system-wide) for the last N days — powers
    the activity chart on the Supervisor/Manager dashboards. Computed in
    Python over the raw rows rather than a DB-specific date-grouping
    query, so it works identically on SQLite and Postgres.
    """
    days = max(1, min(days, 90))
    rows = db.query(DefectPrediction.created_at, DefectPrediction.verdict).all()

    now = datetime.now(timezone.utc)
    start_date = (now - timedelta(days=days - 1)).date()

    daily: dict[str, dict[str, int]] = {
        (start_date + timedelta(days=i)).isoformat(): {"total": 0, "passed": 0, "failed": 0}
        for i in range(days)
    }

    for created_at, verdict in rows:
        ts = created_at if created_at.tzinfo else created_at.replace(tzinfo=timezone.utc)
        day_key = ts.date().isoformat()
        if day_key in daily:
            daily[day_key]["total"] += 1
            if verdict == InspectionVerdict.PASS:
                daily[day_key]["passed"] += 1
            elif verdict == InspectionVerdict.FAIL:
                daily[day_key]["failed"] += 1

    return [
        DailyActivityOut(date=d, total=v["total"], passed=v["passed"], failed=v["failed"])
        for d, v in sorted(daily.items())
    ]


@router.get("/analytics", response_model=AnalyticsOverviewOut)
def analytics_overview(
    days: int = 14,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Milestone 3 — Manufacturing Analytics Dashboard.

    Defect trend analysis, defect-type distribution, severity mix, and a
    per-product-line quality report. Aggregated in Python over the raw
    prediction rows rather than with DB-specific SQL, so it behaves
    identically on SQLite and PostgreSQL.
    """
    days = max(1, min(days, 90))

    rows = (
        db.query(DefectPrediction, ProductImage.product_line)
        .join(ProductImage, DefectPrediction.product_image_id == ProductImage.id)
        .all()
    )

    total_inspections = len(rows)
    total_defects = sum(p.defect_count or 0 for p, _ in rows)
    severities = [p.overall_severity or 0.0 for p, _ in rows]
    avg_severity = round(sum(severities) / len(severities), 2) if severities else 0.0

    rejected = sum(1 for p, _ in rows if (p.decision or "pass") == "reject")
    reject_rate = round((rejected / total_inspections) * 100, 2) if total_inspections else None

    # Severity mix across every individual defect, not per product.
    sev = {"critical": 0, "high": 0, "medium": 0, "low": 0}
    type_counts: dict[str, list[float]] = {}
    for p, _ in rows:
        sev["critical"] += p.critical_count or 0
        sev["high"] += p.high_count or 0
        sev["medium"] += p.medium_count or 0
        sev["low"] += p.low_count or 0
        for region in p.regions or []:
            key = region.get("defect_type")
            if key:
                type_counts.setdefault(key, []).append(float(region.get("severity_score") or 0.0))

    defect_types = sorted(
        (
            DefectTypeCountOut(
                defect_type=key,
                label=DEFECT_TYPES.get(key, {}).get("label", key.replace("_", " ").title()),
                count=len(scores),
                avg_severity=round(sum(scores) / len(scores), 2) if scores else 0.0,
            )
            for key, scores in type_counts.items()
        ),
        key=lambda t: -t.count,
    )

    # Per-product-line quality report.
    lines: dict[str, dict] = {}
    for p, product_line in rows:
        key = (product_line or "Unassigned").strip() or "Unassigned"
        bucket = lines.setdefault(
            key, {"inspections": 0, "passed": 0, "rework": 0, "rejected": 0, "severities": []}
        )
        bucket["inspections"] += 1
        decision = p.decision or "pass"
        if decision == "reject":
            bucket["rejected"] += 1
        elif decision == "rework":
            bucket["rework"] += 1
        else:
            bucket["passed"] += 1
        bucket["severities"].append(p.overall_severity or 0.0)

    by_product_line = sorted(
        (
            ProductLineQualityOut(
                product_line=name,
                inspections=b["inspections"],
                passed=b["passed"],
                rework=b["rework"],
                rejected=b["rejected"],
                pass_rate_pct=round((b["passed"] / b["inspections"]) * 100, 2) if b["inspections"] else None,
                avg_severity=round(sum(b["severities"]) / len(b["severities"]), 2) if b["severities"] else 0.0,
            )
            for name, b in lines.items()
        ),
        key=lambda x: -x.inspections,
    )

    # Daily defect trend.
    now = datetime.now(timezone.utc)
    start_date = (now - timedelta(days=days - 1)).date()
    trend_map: dict[str, dict] = {
        (start_date + timedelta(days=i)).isoformat(): {"inspections": 0, "defects": 0, "severities": []}
        for i in range(days)
    }
    for p, _ in rows:
        ts = p.created_at if p.created_at.tzinfo else p.created_at.replace(tzinfo=timezone.utc)
        key = ts.date().isoformat()
        if key in trend_map:
            trend_map[key]["inspections"] += 1
            trend_map[key]["defects"] += p.defect_count or 0
            trend_map[key]["severities"].append(p.overall_severity or 0.0)

    trend = [
        DefectTrendPointOut(
            date=d,
            inspections=v["inspections"],
            defects=v["defects"],
            avg_severity=round(sum(v["severities"]) / len(v["severities"]), 2) if v["severities"] else 0.0,
        )
        for d, v in sorted(trend_map.items())
    ]

    return AnalyticsOverviewOut(
        total_inspections=total_inspections,
        total_defects=total_defects,
        avg_severity=avg_severity,
        reject_rate_pct=reject_rate,
        severity_distribution=SeverityDistributionOut(**sev),
        defect_types=defect_types,
        by_product_line=by_product_line,
        trend=trend,
    )


@router.get("/predictions", response_model=list[DefectPredictionOut])
def list_predictions(
    limit: int = 50,
    offset: int = 0,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    rows = (
        db.query(DefectPrediction)
        .order_by(DefectPrediction.created_at.desc())
        .offset(offset)
        .limit(min(limit, 200))
        .all()
    )
    return [_to_prediction_out(r) for r in rows]


@router.get("/predictions/{prediction_id}", response_model=DefectPredictionOut)
def get_prediction(prediction_id: str, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    record = db.get(DefectPrediction, prediction_id)
    if not record:
        raise HTTPException(status_code=404, detail="Prediction not found.")
    return _to_prediction_out(record)
