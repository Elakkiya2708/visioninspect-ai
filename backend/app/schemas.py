from typing import Optional

from pydantic import BaseModel, Field

EMAIL_RE = r"^[^@\s]+@[^@\s]+\.[^@\s]+$"


class RegisterIn(BaseModel):
    email: str = Field(pattern=EMAIL_RE, max_length=255)
    full_name: str = Field(min_length=2, max_length=120)
    password: str = Field(min_length=8, max_length=128)
    role: str = "quality_engineer"


class LoginIn(BaseModel):
    email: str
    password: str


class UserCreateIn(RegisterIn):
    pass


class UserUpdateIn(BaseModel):
    role: Optional[str] = None
    is_active: Optional[bool] = None
    full_name: Optional[str] = None


class ReviewIn(BaseModel):
    action: str = Field(pattern="^(approved|rejected|rework)$")
    note: Optional[str] = Field(default=None, max_length=1000)


class CameraIn(BaseModel):
    category: str
    count: int = Field(default=1, ge=1, le=10)
    defect_probability: float = Field(default=0.35, ge=0, le=1)


class TrainIn(BaseModel):
    category: str
    clusters: int = Field(default=4, ge=1, le=8)
    max_train_images: int = Field(default=200, ge=10, le=1000)


class SampleInspectIn(BaseModel):
    category: str
    count: int = Field(default=30, ge=1, le=200)
    spread_days: int = Field(default=14, ge=0, le=90)
    defect_ratio: Optional[float] = Field(default=None, ge=0, le=1)
