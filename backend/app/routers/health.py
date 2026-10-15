"""Health, capabilities and maintenance endpoints."""

from __future__ import annotations

import os
import platform

from fastapi import APIRouter, Depends

from ..config import settings
from ..dsp.wavio import FFMPEG, COMPRESSED_EXT, SUPPORTED_WAV_EXT
from ..schemas import JobStatus
from ..services.engine import RenderEngine
from ..services.db import Database
from ..deps import get_database, get_engine

router = APIRouter()


@router.get("/health")
def health(engine: RenderEngine = Depends(get_engine), database: Database = Depends(get_database)) -> dict:
    queue = engine.queue_depth()
    return {
        "status": "online",
        "engine": settings.app_name,
        "version": settings.version,
        "spec_version": settings.spec_version,
        "mode": "cpu-dsp",
        "gpu_required": False,
        "model_free": True,
        "uptime_seconds": engine.uptime_seconds(),
        "python": platform.python_version(),
        "cpu_count": os.cpu_count(),
        "worker_threads": settings.worker_threads,
        "formats": {
            "native": sorted(SUPPORTED_WAV_EXT),
            "with_ffmpeg": sorted(COMPRESSED_EXT) if FFMPEG else [],
            "ffmpeg_available": bool(FFMPEG),
        },
        "limits": {
            "max_upload_mb": settings.max_upload_mb,
            "max_duration_s": settings.max_duration_s,
            "min_duration_s": settings.min_duration_s,
            "ttl_minutes": settings.ttl_minutes,
            "max_jobs_queued": settings.max_jobs_queued,
        },
        "queue": {"queued": queue.get("queued", 0), "running": queue.get("running", 0)},
        "counters": engine.counters,
        "storage": {**engine.storage_report(), "disk_free_mb": engine.disk_free_mb(), "records": database.stats()},
        "auth": {"api_key_required": bool(settings.api_key)},
    }


@router.post("/maintenance/cleanup")
def cleanup(engine: RenderEngine = Depends(get_engine)) -> dict:
    return {"status": "ok", **engine.cleanup()}


@router.post("/maintenance/purge", dependencies=[])
def purge(engine: RenderEngine = Depends(get_engine)) -> dict:
    """Delete every temporary upload and render file right now."""

    removed = engine.purge_all_files()
    return {"status": "ok", "removed_files": removed}


@router.get("/jobs", response_model=list[JobStatus])
def list_jobs(limit: int = 25, engine: RenderEngine = Depends(get_engine)) -> list[dict]:
    rows = engine.db.list_renders(limit=limit, include_expired=True)
    return [
        {
            "id": row["id"],
            "kind": row["kind"],
            "state": row["state"],
            "progress": row["progress"],
            "stage": row["stage"] or "",
            "message": row["message"],
            "created_at": row["created_at"],
            "started_at": row["created_at"],
            "finished_at": row["finished_at"],
            "duration_ms": row["duration_ms"],
            "source_name": row["source_name"],
            "preset_id": row["preset_id"],
            "voice_name": row["voice_name"],
            "result": {"metrics": row["metrics"], "expires_at": row["expires_at"]},
        }
        for row in rows
    ]
