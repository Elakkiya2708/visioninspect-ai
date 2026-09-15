"""
Pydantic request/response schemas — the API's public contract.
"""
from datetime import datetime

from pydantic import BaseModel, EmailStr, Field

from app.db.models import ImageStatus, InspectionVerdict, UserRole


# ---------- Auth / Users ----------

class UserCreate(BaseModel):
    full_name: str = Field(min_length=2, max_length=120)
    email: EmailStr
    password: str = Field(min_length=8, max_length=128)
    role: UserRole = UserRole.QUALITY_ENGINEER
    department: str | None = None


class UserOut(BaseModel):
    id: str
    full_name: str
    email: EmailStr
    role: UserRole
    department: str | None
    is_active: bool
    created_at: datetime

    class Config:
        from_attributes = True


class UserRoleUpdate(BaseModel):
    role: UserRole


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class Token(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserOut


# ---------- Images ----------

class ProductImageOut(BaseModel):
    id: str
    file_name: str
    content_type: str
    size_bytes: int
    width: int | None
    height: int | None
    product_line: str | None
    batch_code: str | None
    source: str
    status: ImageStatus
    validation_notes: str | None
    uploaded_by_id: str
    created_at: datetime

    class Config:
        from_attributes = True


class UserStatsOut(BaseModel):
    """Per-account activity — scoped to what THIS user uploaded/inspected,
    not the whole system. Powers the personalized Profile page."""
    total_images: int
    validated_images: int
    rejected_images: int
    total_inspections: int
    passed_inspections: int
    failed_inspections: int
    pass_rate_pct: float | None


class ImageStatsOut(BaseModel):
    total_images: int
    uploaded: int
    validated: int
    rejected: int
    queued_for_inspection: int
    total_storage_mb: float


# ---------- Milestone 2: Defect Detection ----------

class ReferenceImageOut(BaseModel):
    id: str
    product_line: str
    file_name: str
    width: int | None
    height: int | None
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class DefectRegionOut(BaseModel):
    x: int
    y: int
    width: int
    height: int
    area_ratio: float


class QualityReportOut(BaseModel):
    brightness: float
    contrast: float
    sharpness: float
    is_blurry: bool
    is_underexposed: bool
    is_overexposed: bool


class InspectionStatsOut(BaseModel):
    """System-wide (not per-user) inspection health — powers the
    Factory Supervisor / Production Manager dashboards."""
    total_inspections: int
    passed: int
    failed: int
    inconclusive: int
    pass_rate_pct: float | None
    avg_similarity_pct: float | None


class DefectPredictionOut(BaseModel):
    id: str
    product_image_id: str
    reference_image_id: str
    similarity_score: float
    defect_count: int
    total_affected_area_pct: float
    regions: list[DefectRegionOut]
    verdict: InspectionVerdict
    quality: QualityReportOut | None
    quality_flags: list[str]
    created_at: datetime

    class Config:
        from_attributes = True
