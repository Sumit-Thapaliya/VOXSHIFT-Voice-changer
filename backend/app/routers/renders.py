"""Render jobs: submit a voice design, watch progress, stream the WAV."""

from __future__ import annotations

import json
from pathlib import Path

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from fastapi.responses import FileResponse

from ..config import settings
from ..deps import get_engine
from ..dsp import wavio
from ..schemas import PolishRequest, RenderRequest, VoiceChain
from ..services.engine import RenderEngine, describe_modules, modules_from_payload

router = APIRouter()


@router.post("/render", status_code=202)
async def render(
    file: UploadFile = File(...),
    preset_id: str | None = Form(default=None),
    archetype_id: str | None = Form(default=None),
    chain: str | None = Form(default=None),
    intensity: float = Form(default=75.0),
    name: str | None = Form(default=None),
    bit_depth: int = Form(default=16),
    sample_rate: int | None = Form(default=None),
    engine: RenderEngine = Depends(get_engine),
) -> dict:
    """Queue a render. Either `preset_id`/`archetype_id` or a full `chain` JSON."""

    payload = await file.read()
    chain_model = None
    if chain:
        try:
            chain_model = VoiceChain.model_validate(json.loads(chain))
        except (json.JSONDecodeError, TypeError, ValueError) as error:
            raise HTTPException(status_code=422, detail=f"Invalid chain payload: {error}") from error
    request = RenderRequest(
        preset_id=preset_id,
        archetype_id=archetype_id,
        chain=chain_model,
        intensity=intensity,
        name=name,
        bit_depth=16 if bit_depth not in (16, 24) else bit_depth,
        sample_rate=sample_rate,
    )
    queue = engine.queue_depth()
    if queue.get("queued", 0) >= settings.max_jobs_queued:
        raise HTTPException(status_code=429, detail="The render queue is full. Try again shortly.")
    source_path = engine.save_upload(file.filename or "source.wav", payload, prefix="src")
    try:
        wavio.assert_wav_container(source_path)
    except wavio.AudioDecodeError as error:
        source_path.unlink(missing_ok=True)
        raise HTTPException(status_code=415, detail=str(error)) from error
    try:
        record = engine.submit_render(request, source_path, file.filename or "source.wav")
    except ValueError as error:
        source_path.unlink(missing_ok=True)
        raise HTTPException(status_code=422, detail=str(error)) from error
    return {
        "job_id": record["id"],
        "state": record["state"],
        "status_url": f"/api/render/{record['id']}",
        "audio_url": f"/api/render/{record['id']}/audio",
        "expires_at": record["expires_at"],
        "voice_name": record["voice_name"],
    }


@router.post("/polish", status_code=202)
async def polish(
    file: UploadFile = File(...),
    options: str | None = Form(default=None),
    engine: RenderEngine = Depends(get_engine),
) -> dict:
    """Queue the clean-up pipeline (denoise, de-ess, gate, loudness, trim, fades)."""

    payload = await file.read()
    settings_model = PolishRequest()
    if options:
        try:
            settings_model = PolishRequest.model_validate(json.loads(options))
        except (json.JSONDecodeError, ValueError) as error:
            raise HTTPException(status_code=422, detail=f"Invalid polish options: {error}") from error
    queue = engine.queue_depth()
    if queue.get("queued", 0) >= settings.max_jobs_queued:
        raise HTTPException(status_code=429, detail="The render queue is full. Try again shortly.")
    source_path = engine.save_upload(file.filename or "source.wav", payload, prefix="src")
    try:
        wavio.assert_wav_container(source_path)
    except wavio.AudioDecodeError as error:
        source_path.unlink(missing_ok=True)
        raise HTTPException(status_code=415, detail=str(error)) from error
    record = engine.submit_polish(settings_model, source_path, file.filename or "source.wav")
    return {
        "job_id": record["id"],
        "state": record["state"],
        "status_url": f"/api/render/{record['id']}",
        "audio_url": f"/api/render/{record['id']}/audio",
        "expires_at": record["expires_at"],
    }


@router.get("/render/{job_id}")
def status(job_id: str, engine: RenderEngine = Depends(get_engine)) -> dict:
    record = engine.db.get_render(job_id)
    if not record:
        raise HTTPException(status_code=404, detail="Unknown job id.")
    payload = {
        "job_id": record["id"],
        "kind": record["kind"],
        "state": record["state"],
        "progress": record["progress"],
        "stage": record["stage"],
        "message": record["message"],
        "created_at": record["created_at"],
        "finished_at": record["finished_at"],
        "duration_ms": record["duration_ms"],
        "source_name": record["source_name"],
        "preset_id": record["preset_id"],
        "voice_name": record["voice_name"],
        "metrics": record["metrics"],
        "expires_at": record["expires_at"],
    }
    if record["state"] == "done" and engine.result_path(record):
        payload["audio_url"] = f"/api/render/{job_id}/audio"
    if record["spec"]:
        payload["modules"] = describe_modules(modules_from_payload(record["spec"]))
    return payload


@router.get("/render/{job_id}/audio")
def audio(job_id: str, engine: RenderEngine = Depends(get_engine)) -> FileResponse:
    record = engine.db.get_render(job_id)
    if not record:
        raise HTTPException(status_code=404, detail="Unknown job id.")
    path = engine.result_path(record)
    if record["state"] != "done" or path is None:
        raise HTTPException(status_code=409, detail=f"The job is '{record['state']}' and has no audio yet.")
    name = (record.get("voice_name") or "voxshift").replace("/", "-")[:80]
    return FileResponse(
        path,
        media_type="audio/wav",
        filename=f"{name}.wav",
        headers={"X-Voxshift-Job": job_id, "Cache-Control": "no-store"},
    )


@router.delete("/render/{job_id}")
def remove(job_id: str, engine: RenderEngine = Depends(get_engine)) -> dict:
    if not engine.db.get_render(job_id):
        raise HTTPException(status_code=404, detail="Unknown job id.")
    engine.delete(job_id)
    return {"status": "deleted", "job_id": job_id}


@router.post("/render/{job_id}/cancel")
def cancel(job_id: str, engine: RenderEngine = Depends(get_engine)) -> dict:
    record = engine.cancel(job_id)
    if not record:
        raise HTTPException(status_code=404, detail="Unknown job id.")
    return {"status": record["state"], "job_id": job_id}


@router.get("/renders")
def list_renders(limit: int = 40, engine: RenderEngine = Depends(get_engine)) -> list[dict]:
    return [
        {
            "job_id": row["id"],
            "kind": row["kind"],
            "state": row["state"],
            "source_name": row["source_name"],
            "voice_name": row["voice_name"],
            "preset_id": row["preset_id"],
            "metrics": row["metrics"],
            "created_at": row["created_at"],
            "expires_at": row["expires_at"],
            "duration_ms": row["duration_ms"],
            "audio_url": f"/api/render/{row['id']}/audio" if row["state"] == "done" else None,
        }
        for row in engine.db.list_renders(limit=limit)
    ]


@router.get("/formats")
def formats() -> dict:
    """Export options offered by the engine."""

    return {
        "exports": [
            {"id": "wav16", "label": "WAV · 16-bit PCM", "bit_depth": 16, "lossless": True},
            {"id": "wav24", "label": "WAV · 24-bit PCM", "bit_depth": 24, "lossless": True},
        ],
        "sample_rates": [22050, 32000, 44100, 48000, 96000],
        "note": "WAV only: no MP3 encoder is bundled, so nothing is ever transcoded lossily.",
    }
