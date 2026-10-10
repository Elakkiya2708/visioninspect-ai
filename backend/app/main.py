
import logging
import shutil
import zipfile
import gdown

from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
from fastapi.openapi.utils import get_openapi
from fastapi.responses import JSONResponse
from sqlalchemy import text

from .config import settings
from .database import Base, SessionLocal, engine
from .routers import analytics, auth, dataset, inspections, users
from .seed import seed_users


log = logging.getLogger("visioninspect")


def ensure_mvtec_dataset():
    expected = [
        "ceramic_tile",
        "fabric",
        "metal_plate",
        "zipper",
        "toothbrush",
        "bottle",
    ]

    if all(
        (settings.DATASET_ROOT / category).is_dir()
        for category in expected
    ):
        log.info("MVTec dataset already exists.")
        return

    zip_path = settings.DATA_DIR / "mvtec_ad.zip"
    extract_dir = settings.DATA_DIR / "mvtec_ad_extract"

    log.info("Downloading MVTec dataset from Google Drive...")

    downloaded = gdown.download(
        id="1UK7UinIOr3OK3Mx6u80EaVKt4UumPuyD",
        output=str(zip_path),
        quiet=False,
    )

    if not downloaded or not zipfile.is_zipfile(zip_path):
        raise RuntimeError(
            "Dataset download failed or downloaded file is not a valid ZIP."
        )

    extract_dir.mkdir(parents=True, exist_ok=True)

    with zipfile.ZipFile(zip_path, "r") as archive:
        archive.extractall(extract_dir)

    candidates = [extract_dir] + [
        path
        for path in extract_dir.rglob("*")
        if path.is_dir()
    ]

    source = next(
        (
            folder
            for folder in candidates
            if all(
                (folder / category).is_dir()
                for category in expected
            )
        ),
        None,
    )

    if source is None:
        raise RuntimeError(
            "Expected dataset categories were not found after extraction."
        )

    settings.DATASET_ROOT.mkdir(
        parents=True,
        exist_ok=True,
    )

    for category in expected:
        shutil.copytree(
            source / category,
            settings.DATASET_ROOT / category,
            dirs_exist_ok=True,
        )

    log.info(
        "MVTec dataset downloaded and extracted successfully."
    )


@asynccontextmanager
async def lifespan(_: FastAPI):
    try:
        ensure_mvtec_dataset()
    except Exception:
        log.exception("MVTec dataset download failed.")

    Base.metadata.create_all(engine)

    with SessionLocal() as db:
        seed_users(db)

    if settings.SECRET_KEY.startswith("change-me"):
        log.warning(
            "SECRET_KEY is the insecure default - "
            "set a long random value in production."
        )

    yield


app = FastAPI(
    title=f"{settings.APP_NAME} API",
    version="1.0.0",
    lifespan=lifespan,
    description=(
        "AI manufacturing defect detection & quality inspection platform"
    ),
)


# Fix Swagger UI file upload schema
def custom_openapi():
    if app.openapi_schema:
        return app.openapi_schema

    schema = get_openapi(
        title=app.title,
        version=app.version,
        description=app.description,
        routes=app.routes,
    )

    schema["openapi"] = "3.0.3"

    body = (
        schema.get("components", {})
        .get("schemas", {})
        .get("Body_create_inspections_api_inspections_post")
    )

    if body:
        files = body.get("properties", {}).get("files", {})

        if files.get("type") == "array":
            files["items"] = {
                "type": "string",
                "format": "binary",
            }

    app.openapi_schema = schema
    return app.openapi_schema


app.openapi = custom_openapi


app.add_middleware(
    GZipMiddleware,
    minimum_size=1024,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.middleware("http")
async def security_headers(request, call_next):
    response = await call_next(request)

    response.headers.setdefault(
        "X-Content-Type-Options",
        "nosniff",
    )
    response.headers.setdefault(
        "X-Frame-Options",
        "DENY",
    )
    response.headers.setdefault(
        "Referrer-Policy",
        "same-origin",
    )

    return response


for router in (
    auth.router,
    users.router,
    inspections.router,
    analytics.router,
    dataset.router,
):
    app.include_router(router, prefix="/api")


@app.get("/api/health", tags=["system"])
def health():
    try:
        with engine.connect() as connection:
            connection.execute(text("SELECT 1"))

    except Exception as exc:
        return JSONResponse(
            {
                "status": "degraded",
                "database": str(exc)[:120],
            },
            status_code=503,
        )

    return {
        "status": "ok",
        "service": settings.APP_NAME,
        "version": "1.0.0",
    }
