from .config import settings
from .models import User
from .security import hash_password


def seed_users(db):
    users = [(settings.ADMIN_EMAIL, "Platform Admin", "admin", settings.ADMIN_PASSWORD)]
    if settings.SEED_DEMO_USERS:
        users += [("engineer@visioninspect.ai", "Priya Nair (Quality Engineer)", "quality_engineer", "Engineer@123"),
                  ("supervisor@visioninspect.ai", "Arjun Rao (Factory Supervisor)", "factory_supervisor", "Supervisor@123")]
    for email, name, role, pw in users:
        if not db.query(User).filter_by(email=email).first():
            db.add(User(email=email, full_name=name, role=role, hashed_password=hash_password(pw)))
    db.commit()
