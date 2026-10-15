"""FastAPI application: routes, CORS, lifespan and error handling."""

from __future__ import annotations

import json
import logging
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import Depends, FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles

from .config import BACKEND_ROOT, REPO_ROOT, settings
from .deps import get_catalog, get_database, get_engine, require_api_key
from .services.db import Database
from .services.engine import RenderEngine
from .dsp.wavio import AudioDecodeError, FFMPEG

logger = logging.getLogger("voxshift")


def load_catalog() -> dict:
    candidates = [
        settings.presets_path,
        BACKEND_ROOT / "app" / "data" / "voice-presets.json",
        REPO_ROOT / "shared" / "voice-presets.json",
    ]
    for candidate in candidates:
        if Path(candidate).exists():
            return json.loads(Path(candidate).read_text())
    raise RuntimeError(
        "voice-presets.json was not found. Copy shared/voice-presets.json into backend/app/data/."
    )


@asynccontextmanager
async def lifespan(app: FastAPI):
    settings.ensure_dirs()
    catalog = load_catalog()
    database = Database(settings.db_path)
    engine = RenderEngine(database, catalog)
    engine.start_cleanup_thread()
    app.state.catalog = catalog
    app.state.db = database
    app.state.engine = engine
    logger.info(
        "VOXSHIFT engine %s ready · data=%s · ffmpeg=%s · workers=%s",
        settings.version,
        settings.data_dir,
        "yes" if FFMPEG else "no",
        settings.worker_threads,
    )
    try:
        yield
    finally:
        engine.shutdown()
        database.close()


app = FastAPI(
    title=settings.app_name,
    version=settings.version,
    description=(
        "CPU-only voice design engine for VOXSHIFT Studio. Deterministic DSP, no GPU, "
        "no reference-voice cloning, no fake AI results."
    ),
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_origin_regex=settings.cors_origin_regex,
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["X-Voxshift-Job", "X-Voxshift-Bytes", "Content-Disposition"],
)


@app.exception_handler(AudioDecodeError)
async def audio_error_handler(_: Request, exc: AudioDecodeError) -> JSONResponse:
    return JSONResponse(status_code=415, content={"detail": str(exc)})


@app.exception_handler(ValueError)
async def value_error_handler(_: Request, exc: ValueError) -> JSONResponse:
    return JSONResponse(status_code=400, content={"detail": str(exc)})


from .routers import activity, audio, catalog as catalog_router, health, projects, renders, voices  # noqa: E402

app.include_router(health.router, prefix="/api", tags=["health"])
app.include_router(catalog_router.router, prefix="/api", tags=["catalog"], dependencies=[Depends(require_api_key)])
app.include_router(audio.router, prefix="/api", tags=["audio"], dependencies=[Depends(require_api_key)])
app.include_router(renders.router, prefix="/api", tags=["renders"], dependencies=[Depends(require_api_key)])
app.include_router(voices.router, prefix="/api", tags=["voices"], dependencies=[Depends(require_api_key)])
app.include_router(projects.router, prefix="/api", tags=["projects"], dependencies=[Depends(require_api_key)])
app.include_router(activity.router, prefix="/api", tags=["activity"], dependencies=[Depends(require_api_key)])

# Optional: serve a pre-built frontend export (single-container deployment).
static_dir = BACKEND_ROOT / "static"
if static_dir.exists():
    app.mount("/", StaticFiles(directory=str(static_dir), html=True), name="static")
