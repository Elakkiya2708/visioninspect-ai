"""
Authentication & user-management endpoints (Milestone 1 — User Management Module).
"""
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.core.security import create_access_token, hash_password, verify_password
from app.db.database import get_db
from app.db.models import DefectPrediction, ImageStatus, InspectionVerdict, ProductImage, User, UserRole
from app.dependencies import get_current_user, require_role
from app.schemas import LoginRequest, Token, UserCreate, UserOut, UserRoleUpdate, UserStatsOut

router = APIRouter(prefix="/api/auth", tags=["Authentication"])


@router.post("/register", response_model=UserOut, status_code=status.HTTP_201_CREATED)
def register(payload: UserCreate, db: Session = Depends(get_db)):
    existing = db.query(User).filter(User.email == payload.email).first()
    if existing:
        raise HTTPException(status_code=400, detail="An account with this email already exists.")

    user = User(
        full_name=payload.full_name,
        email=payload.email,
        hashed_password=hash_password(payload.password),
        role=payload.role,
        department=payload.department,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


@router.post("/login", response_model=Token)
def login(payload: LoginRequest, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.email == payload.email).first()
    if not user or not verify_password(payload.password, user.hashed_password):
        raise HTTPException(status_code=401, detail="Incorrect email or password.")
    if not user.is_active:
        raise HTTPException(status_code=403, detail="This account has been deactivated.")

    token = create_access_token(data={"sub": user.id, "role": user.role.value})
    return Token(access_token=token, user=user)


@router.get("/me", response_model=UserOut)
def read_current_user(current_user: User = Depends(get_current_user)):
    return current_user


@router.get("/me/stats", response_model=UserStatsOut)
def my_stats(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    """
    Activity scoped to the logged-in account only — this is what makes
    each user's Profile page show genuinely different numbers instead of
    the shared, system-wide Dashboard totals.
    """
    total_images = (
        db.query(func.count(ProductImage.id))
        .filter(ProductImage.uploaded_by_id == current_user.id)
        .scalar()
        or 0
    )
    validated_images = (
        db.query(func.count(ProductImage.id))
        .filter(ProductImage.uploaded_by_id == current_user.id, ProductImage.status == ImageStatus.VALIDATED)
        .scalar()
        or 0
    )
    rejected_images = (
        db.query(func.count(ProductImage.id))
        .filter(ProductImage.uploaded_by_id == current_user.id, ProductImage.status == ImageStatus.REJECTED)
        .scalar()
        or 0
    )

    total_inspections = (
        db.query(func.count(DefectPrediction.id))
        .filter(DefectPrediction.analyzed_by_id == current_user.id)
        .scalar()
        or 0
    )
    passed_inspections = (
        db.query(func.count(DefectPrediction.id))
        .filter(
            DefectPrediction.analyzed_by_id == current_user.id,
            DefectPrediction.verdict == InspectionVerdict.PASS,
        )
        .scalar()
        or 0
    )
    failed_inspections = (
        db.query(func.count(DefectPrediction.id))
        .filter(
            DefectPrediction.analyzed_by_id == current_user.id,
            DefectPrediction.verdict == InspectionVerdict.FAIL,
        )
        .scalar()
        or 0
    )

    pass_rate = round((passed_inspections / total_inspections) * 100, 2) if total_inspections > 0 else None

    return UserStatsOut(
        total_images=total_images,
        validated_images=validated_images,
        rejected_images=rejected_images,
        total_inspections=total_inspections,
        passed_inspections=passed_inspections,
        failed_inspections=failed_inspections,
        pass_rate_pct=pass_rate,
    )


@router.get("/users", response_model=list[UserOut])
def list_users(
    db: Session = Depends(get_db),
    _: User = Depends(require_role(UserRole.FACTORY_SUPERVISOR, UserRole.PRODUCTION_MANAGER)),
):
    """Role management view — supervisors/managers can see all accounts."""
    return db.query(User).order_by(User.created_at.desc()).all()


@router.patch("/users/{user_id}/role", response_model=UserOut)
def update_user_role(
    user_id: str,
    payload: UserRoleUpdate,
    db: Session = Depends(get_db),
    _: User = Depends(require_role(UserRole.PRODUCTION_MANAGER)),
):
    """Role management — only production managers / admins may reassign roles."""
    user = db.get(User, user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found.")
    user.role = payload.role
    db.commit()
    db.refresh(user)
    return user
