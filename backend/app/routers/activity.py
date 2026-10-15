"""Engine-side activity log and aggregate stats."""

from __future__ import annotations

from fastapi import APIRouter, Depends

from ..deps import get_database, get_engine
from ..services.db import Database
from ..services.engine import RenderEngine

router = APIRouter()


@router.get("/history")
def history(limit: int = 100, database: Database = Depends(get_database)) -> list[dict]:
    return database.list_activity(limit=limit)


@router.delete("/history")
def clear_history(database: Database = Depends(get_database)) -> dict:
    return {"status": "cleared", "removed": database.clear_activity()}


@router.get("/stats")
def stats(engine: RenderEngine = Depends(get_engine), database: Database = Depends(get_database)) -> dict:
    renders = database.list_renders(limit=200, include_expired=True)
    done = [row for row in renders if row["state"] == "done"]
    total_seconds = sum((row["metrics"] or {}).get("duration", 0.0) for row in done)
    average_ms = (
        round(sum(row["duration_ms"] or 0 for row in done) / len(done)) if done else 0
    )
    return {
        "records": database.stats(),
        "counters": engine.counters,
        "renders": {
            "total": len(renders),
            "done": len(done),
            "failed": len([row for row in renders if row["state"] == "failed"]),
            "average_render_ms": average_ms,
            "total_audio_seconds": round(total_seconds, 2),
        },
        "storage": engine.storage_report(),
        "queue": engine.queue_depth(),
    }
