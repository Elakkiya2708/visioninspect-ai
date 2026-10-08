from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from ..database import get_db
from ..deps import current_user, require_roles
from ..models import ROLES, AuditLog, User
from ..schemas import UserCreateIn, UserUpdateIn
from ..security import hash_password
from ..serializers import user_out

router = APIRouter(prefix="/users", tags=["users"])


@router.get("")
def list_users(db: Session = Depends(get_db), _: User = Depends(require_roles("admin"))):
    return [user_out(u) for u in db.query(User).order_by(User.created_at).all()]


@router.post("", status_code=201)
def create_user(body: UserCreateIn, db: Session = Depends(get_db), admin: User = Depends(require_roles("admin"))):
    if body.role not in ROLES:
        raise HTTPException(400, f"Role must be one of {ROLES}")
    email = body.email.lower().strip()
    if db.query(User).filter_by(email=email).first():
        raise HTTPException(409, "Email already registered")
    u = User(email=email, full_name=body.full_name.strip(), role=body.role, hashed_password=hash_password(body.password))
    db.add(u)
    db.add(AuditLog(user_id=admin.id, action="user.create", detail=f"{email} as {body.role}"))
    db.commit()
    return user_out(u)


@router.patch("/{user_id}")
def update_user(user_id: int, body: UserUpdateIn, db: Session = Depends(get_db), admin: User = Depends(require_roles("admin"))):
    u = db.get(User, user_id)
    if not u:
        raise HTTPException(404, "User not found")
    if u.id == admin.id and (body.is_active is False or (body.role and body.role != "admin")):
        raise HTTPException(400, "You cannot demote or deactivate your own account")
    if body.role is not None:
        if body.role not in ROLES:
            raise HTTPException(400, f"Role must be one of {ROLES}")
        u.role = body.role
    if body.is_active is not None:
        u.is_active = body.is_active
    if body.full_name:
        u.full_name = body.full_name.strip()
    db.add(AuditLog(user_id=admin.id, action="user.update", detail=f"{u.email}: {body.model_dump(exclude_none=True)}"))
    db.commit()
    return user_out(u)


@router.get("/audit")
def audit(limit: int = 50, db: Session = Depends(get_db), _: User = Depends(require_roles("admin"))):
    rows = db.query(AuditLog).order_by(AuditLog.id.desc()).limit(min(limit, 200)).all()
    return [{"id": r.id, "user_id": r.user_id, "action": r.action, "detail": r.detail,
             "created_at": r.created_at.isoformat() + "Z"} for r in rows]
