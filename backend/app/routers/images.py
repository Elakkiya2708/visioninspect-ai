"""
Image Acquisition Module (Milestone 1):
  product image upload, batch image processing, image validation,
  and a "camera integration simulation" endpoint that mimics a
  factory-floor camera pushing a captured frame into the pipeline.
"""
import os
import uuid
from pathlib import Path

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile, status
from fastapi.responses import FileResponse
from PIL import Image, UnidentifiedImageError
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.security import decode_access_token
from app.db.database import get_db
from app.db.models import ImageStatus, ProductImage, User
from app.dependencies import get_current_user
from app.schemas import ImageStatsOut, ProductImageOut

router = APIRouter(prefix="/api/images", tags=["Image Acquisition"])
settings = get_settings()

UPLOAD_DIR = Path(settings.upload_dir)
UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
MAX_BYTES = settings.max_image_size_mb * 1024 * 1024


def _validate_and_store(file: UploadFile, contents: bytes):
    """Runs Image Validation checks and persists the file to disk.
    Returns (stored_path, width, height, rejection_reason)."""
    if file.content_type not in settings.allowed_image_types_list:
        return None, None, None, f"Unsupported file type: {file.content_type}"

    if len(contents) > MAX_BYTES:
        return None, None, None, f"File exceeds {settings.max_image_size_mb}MB limit"

    try:
        from io import BytesIO
        img = Image.open(BytesIO(contents))
        img.verify()
        img = Image.open(BytesIO(contents))  # re-open after verify() invalidates the handle
        width, height = img.size
    except UnidentifiedImageError:
        return None, None, None, "File is not a valid, readable image"

    ext = Path(file.filename).suffix or ".bin"
    stored_name = f"{uuid.uuid4().hex}{ext}"
    stored_path = UPLOAD_DIR / stored_name
    with open(stored_path, "wb") as f:
        f.write(contents)

    return stored_path, width, height, None


def _persist_record(
    db: Session,
    file: UploadFile,
    contents: bytes,
    uploaded_by: User,
    product_line: str | None,
    batch_code: str | None,
    source: str,
) -> ProductImage:
    stored_path, width, height, rejection_reason = _validate_and_store(file, contents)

    record = ProductImage(
        file_name=file.filename,
        stored_path=str(stored_path) if stored_path else "",
        content_type=file.content_type or "application/octet-stream",
        size_bytes=len(contents),
        width=width,
        height=height,
        product_line=product_line.strip() if product_line else None,
        batch_code=batch_code.strip() if batch_code else None,
        source=source,
        status=ImageStatus.REJECTED if rejection_reason else ImageStatus.VALIDATED,
        validation_notes=rejection_reason,
    )
    record.uploaded_by = uploaded_by
    db.add(record)
    db.commit()
    db.refresh(record)
    return record


@router.post("/upload", response_model=ProductImageOut, status_code=status.HTTP_201_CREATED)
async def upload_image(
    file: UploadFile = File(...),
    product_line: str | None = Form(None),
    batch_code: str | None = Form(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Single product image upload with validation."""
    contents = await file.read()
    return _persist_record(db, file, contents, current_user, product_line, batch_code, "manual_upload")


@router.post("/upload-batch", response_model=list[ProductImageOut], status_code=status.HTTP_201_CREATED)
async def upload_batch(
    files: list[UploadFile] = File(...),
    product_line: str | None = Form(None),
    batch_code: str | None = Form(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Batch image processing — accepts multiple files from one production run."""
    if len(files) > 50:
        raise HTTPException(status_code=400, detail="Batch limited to 50 images per request.")

    results = []
    for file in files:
        contents = await file.read()
        record = _persist_record(db, file, contents, current_user, product_line, batch_code, "manual_upload")
        results.append(record)
    return results


@router.post("/camera-simulate", response_model=ProductImageOut, status_code=status.HTTP_201_CREATED)
async def simulate_camera_capture(
    file: UploadFile = File(...),
    product_line: str | None = Form(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Camera integration simulation: represents a frame pushed by a
    factory-floor vision camera rather than a manual operator upload.
    """
    contents = await file.read()
    return _persist_record(db, file, contents, current_user, product_line, None, "camera_sim")


@router.get("", response_model=list[ProductImageOut])
def list_images(
    status_filter: ImageStatus | None = None,
    limit: int = 50,
    offset: int = 0,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    query = db.query(ProductImage)
    if status_filter:
        query = query.filter(ProductImage.status == status_filter)
    return (
        query.order_by(ProductImage.created_at.desc())
        .offset(offset)
        .limit(min(limit, 200))
        .all()
    )


@router.get("/stats", response_model=ImageStatsOut)
def image_stats(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    rows = db.query(ProductImage.status, func.count(ProductImage.id)).group_by(ProductImage.status).all()
    counts = {status_val.value: count for status_val, count in rows}
    total_bytes = db.query(func.coalesce(func.sum(ProductImage.size_bytes), 0)).scalar()

    return ImageStatsOut(
        total_images=sum(counts.values()),
        uploaded=counts.get(ImageStatus.UPLOADED.value, 0),
        validated=counts.get(ImageStatus.VALIDATED.value, 0),
        rejected=counts.get(ImageStatus.REJECTED.value, 0),
        queued_for_inspection=counts.get(ImageStatus.QUEUED_FOR_INSPECTION.value, 0),
        total_storage_mb=round((total_bytes or 0) / (1024 * 1024), 2),
    )


@router.get("/{image_id}/file")
def get_image_file(image_id: str, token: str, db: Session = Depends(get_db)):
    """
    Serves the raw image bytes so the dashboard can render real thumbnails.
    Browsers can't attach an Authorization header to an <img> tag, so the
    access token is passed as a query parameter here instead and verified
    manually (same JWT, just a different transport for this one endpoint).
    """
    payload = decode_access_token(token)
    if not payload:
        raise HTTPException(status_code=401, detail="Invalid or expired token.")
    requesting_user = db.get(User, payload.get("sub"))
    if not requesting_user or not requesting_user.is_active:
        raise HTTPException(status_code=401, detail="Invalid or expired token.")

    record = db.get(ProductImage, image_id)
    if not record or not record.stored_path or not os.path.exists(record.stored_path):
        raise HTTPException(status_code=404, detail="Image file not found.")

    return FileResponse(record.stored_path, media_type=record.content_type)


@router.delete("/{image_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_image(
    image_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    record = db.get(ProductImage, image_id)
    if not record:
        raise HTTPException(status_code=404, detail="Image not found.")
    if record.stored_path and os.path.exists(record.stored_path):
        os.remove(record.stored_path)
    db.delete(record)
    db.commit()
