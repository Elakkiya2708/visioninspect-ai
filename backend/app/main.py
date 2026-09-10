"""
VisionInspect AI — API entrypoint.

Wires together: CORS, DB table creation, and the auth, image-acquisition,
and defect-detection routers. Classification / severity-scoring /
quality-decision routers are Milestone 3 per the project plan.
"""
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.core.config import get_settings
from app.db.database import Base, engine
from app.routers import auth, images, inspection

settings = get_settings()

Base.metadata.create_all(bind=engine)

app = FastAPI(
    title=settings.app_name,
    description="Manufacturing Defect Detection & Quality Inspection System — API",
    version="0.2.0-milestone2",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router)
app.include_router(images.router)
app.include_router(inspection.router)


@app.get("/api/health", tags=["System"])
def health_check():
    return {"status": "ok", "service": settings.app_name, "milestone": "2"}
