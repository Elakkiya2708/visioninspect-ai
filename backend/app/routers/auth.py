from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.orm import Session

from ..database import get_db
from ..deps import current_user
from ..models import AuditLog, User, utcnow
from ..schemas import LoginIn, RegisterIn
from ..security import create_token, hash_password, verify_password
from ..serializers import user_out
from ..services.ratelimit import login_limiter

router = APIRouter(prefix="/auth", tags=["auth"])
SELF_SERVICE_ROLES = {"quality_engineer", "factory_supervisor"}


@router.post("/register", status_code=201)
def register(body: RegisterIn, db: Session = Depends(get_db)):
    if body.role not in SELF_SERVICE_ROLES:
        raise HTTPException(400, "Role must be quality_engineer or factory_supervisor")
    email = body.email.lower().strip()
    if db.query(User).filter_by(email=email).first():
        raise HTTPException(409, "An account with this email already exists")
    user = User(email=email, full_name=body.full_name.strip(), role=body.role, hashed_password=hash_password(body.password))
    db.add(user)
    db.add(AuditLog(action="register", detail=email))
    db.commit()
    return {"access_token": create_token(user.id, user.role), "token_type": "bearer", "user": user_out(user)}


@router.post("/login")
def login(body: LoginIn, request: Request, db: Session = Depends(get_db)):
    key = f"{request.client.host if request.client else 'unknown'}:{body.email.lower().strip()}"
    wait = login_limiter.retry_after(key)
    if wait:
        raise HTTPException(429, f"Too many failed attempts. Try again in {wait // 60 + 1} minute(s).")
    user = db.query(User).filter_by(email=body.email.lower().strip()).first()
    if not user or not verify_password(body.password, user.hashed_password):
        login_limiter.fail(key)
        raise HTTPException(401, "Incorrect email or password")
    login_limiter.reset(key)
    if not user.is_active:
        raise HTTPException(403, "This account has been deactivated")
    user.last_login = utcnow()
    db.add(AuditLog(user_id=user.id, action="login"))
    db.commit()
    return {"access_token": create_token(user.id, user.role), "token_type": "bearer", "user": user_out(user)}


@router.get("/me")
def me(user: User = Depends(current_user)):
    return user_out(user)
