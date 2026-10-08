import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
from fastapi.responses import JSONResponse
from sqlalchemy import text

from .config import settings
from .database import Base, SessionLocal, engine
from .routers import analytics, auth, dataset, inspections, users
from .seed import seed_users

log = logging.getLogger("visioninspect")


@asynccontextmanager
async def lifespan(_: FastAPI):
    Base.metadata.create_all(engine)
    with SessionLocal() as db:
        seed_users(db)
    if settings.SECRET_KEY.startswith("change-me"):
        log.warning("SECRET_KEY is the insecure default - set a long random value in production.")
    yield


app = FastAPI(title=f"{settings.APP_NAME} API", version="1.0.0", lifespan=lifespan,
              description="AI manufacturing defect detection & quality inspection platform")
app.add_middleware(GZipMiddleware, minimum_size=1024)
app.add_middleware(CORSMiddleware, allow_origins=settings.CORS_ORIGINS, allow_credentials=True,
                   allow_methods=["*"], allow_headers=["*"])


@app.middleware("http")
async def security_headers(request, call_next):
    response = await call_next(request)
    response.headers.setdefault("X-Content-Type-Options", "nosniff")
    response.headers.setdefault("X-Frame-Options", "DENY")
    response.headers.setdefault("Referrer-Policy", "same-origin")
    return response


for r in (auth.router, users.router, inspections.router, analytics.router, dataset.router):
    app.include_router(r, prefix="/api")


@app.get("/api/health", tags=["system"])
def health():
    try:
        with engine.connect() as c:
            c.execute(text("SELECT 1"))
    except Exception as e:  # noqa: BLE001
        return JSONResponse({"status": "degraded", "database": str(e)[:120]}, status_code=503)
    return {"status": "ok", "service": settings.APP_NAME, "version": "1.0.0"}
