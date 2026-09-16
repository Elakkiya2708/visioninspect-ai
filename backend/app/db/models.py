"""
ORM models:
  Milestone 1 — user accounts / roles + product image records.
  Milestone 2 — reference (golden-sample) images and defect predictions.
"""
import enum
import uuid
from datetime import datetime, timezone

from sqlalchemy import DateTime, Enum, Float, ForeignKey, Integer, JSON, String, Boolean
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.database import Base


def _uuid() -> str:
    return str(uuid.uuid4())


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


class UserRole(str, enum.Enum):
    QUALITY_ENGINEER = "quality_engineer"
    FACTORY_SUPERVISOR = "factory_supervisor"
    PRODUCTION_MANAGER = "production_manager"
    ADMIN = "admin"


class ImageStatus(str, enum.Enum):
    UPLOADED = "uploaded"
    VALIDATED = "validated"
    REJECTED = "rejected"
    QUEUED_FOR_INSPECTION = "queued_for_inspection"


class InspectionVerdict(str, enum.Enum):
    PASS = "pass"
    FAIL = "fail"
    INCONCLUSIVE = "inconclusive"


class User(Base):
    __tablename__ = "users"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=_uuid)
    full_name: Mapped[str] = mapped_column(String(120), nullable=False)
    email: Mapped[str] = mapped_column(String(255), unique=True, index=True, nullable=False)
    hashed_password: Mapped[str] = mapped_column(String, nullable=False)
    role: Mapped[UserRole] = mapped_column(Enum(UserRole), default=UserRole.QUALITY_ENGINEER)
    department: Mapped[str | None] = mapped_column(String(120), nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=_utcnow)

    images: Mapped[list["ProductImage"]] = relationship(back_populates="uploaded_by")


class ProductImage(Base):
    __tablename__ = "product_images"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=_uuid)
    file_name: Mapped[str] = mapped_column(String(255), nullable=False)
    stored_path: Mapped[str] = mapped_column(String(500), nullable=False)
    content_type: Mapped[str] = mapped_column(String(100), nullable=False)
    size_bytes: Mapped[int] = mapped_column(Integer, nullable=False)
    width: Mapped[int | None] = mapped_column(Integer, nullable=True)
    height: Mapped[int | None] = mapped_column(Integer, nullable=True)

    product_line: Mapped[str | None] = mapped_column(String(120), nullable=True)
    batch_code: Mapped[str | None] = mapped_column(String(120), nullable=True)
    source: Mapped[str] = mapped_column(String(50), default="manual_upload")  # manual_upload | camera_sim | dataset

    status: Mapped[ImageStatus] = mapped_column(Enum(ImageStatus), default=ImageStatus.UPLOADED)
    validation_notes: Mapped[str | None] = mapped_column(String(500), nullable=True)

    uploaded_by_id: Mapped[str] = mapped_column(ForeignKey("users.id"))
    uploaded_by: Mapped["User"] = relationship(back_populates="images")

    created_at: Mapped[datetime] = mapped_column(DateTime, default=_utcnow)


class ReferenceImage(Base):
    """
    A known-good ('golden sample') photo for a product line. Every
    inspection compares a test image against the current reference for
    that same product line. One active reference per product line —
    uploading a new one replaces the old. Product line names are matched
    case-insensitively everywhere they're looked up (see inspection.py),
    so 'Bottle' and 'bottle' are treated as the same line.
    """
    __tablename__ = "reference_images"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=_uuid)
    product_line: Mapped[str] = mapped_column(String(120), unique=True, index=True, nullable=False)
    file_name: Mapped[str] = mapped_column(String(255), nullable=False)
    stored_path: Mapped[str] = mapped_column(String(500), nullable=False)
    width: Mapped[int | None] = mapped_column(Integer, nullable=True)
    height: Mapped[int | None] = mapped_column(Integer, nullable=True)

    uploaded_by_id: Mapped[str] = mapped_column(ForeignKey("users.id"))
    created_at: Mapped[datetime] = mapped_column(DateTime, default=_utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=_utcnow, onupdate=_utcnow)


class DefectPrediction(Base):
    """
    Result of comparing a ProductImage against its product line's
    ReferenceImage — Milestone 2's 'defect predictions' deliverable.
    """
    __tablename__ = "defect_predictions"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=_uuid)
    product_image_id: Mapped[str] = mapped_column(ForeignKey("product_images.id"), index=True)
    reference_image_id: Mapped[str] = mapped_column(ForeignKey("reference_images.id"))

    similarity_score: Mapped[float] = mapped_column(Float, nullable=False)
    defect_count: Mapped[int] = mapped_column(Integer, default=0)
    total_affected_area_pct: Mapped[float] = mapped_column(Float, default=0.0)
    # Milestone 2 stored bare geometry here; Milestone 3 enriches each
    # region with its classified type, per-parameter scores and severity.
    regions: Mapped[list] = mapped_column(JSON, default=list)
    verdict: Mapped[InspectionVerdict] = mapped_column(Enum(InspectionVerdict), default=InspectionVerdict.PASS)

    # --- Milestone 3: classification, severity scoring, quality decision ---
    overall_severity: Mapped[float] = mapped_column(Float, default=0.0)
    severity_level: Mapped[str] = mapped_column(String(20), default="None")  # Critical|High|Medium|Low|None
    decision: Mapped[str] = mapped_column(String(20), default="pass")        # pass|rework|reject
    recommendation: Mapped[str | None] = mapped_column(String(500), nullable=True)
    critical_count: Mapped[int] = mapped_column(Integer, default=0)
    high_count: Mapped[int] = mapped_column(Integer, default=0)
    medium_count: Mapped[int] = mapped_column(Integer, default=0)
    low_count: Mapped[int] = mapped_column(Integer, default=0)

    quality_brightness: Mapped[float | None] = mapped_column(Float, nullable=True)
    quality_contrast: Mapped[float | None] = mapped_column(Float, nullable=True)
    quality_sharpness: Mapped[float | None] = mapped_column(Float, nullable=True)
    quality_flags: Mapped[list] = mapped_column(JSON, default=list)  # e.g. ["blurry", "underexposed"]

    analyzed_by_id: Mapped[str] = mapped_column(ForeignKey("users.id"))
    created_at: Mapped[datetime] = mapped_column(DateTime, default=_utcnow)
