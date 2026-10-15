"""Audio intake: analysis, waveform peaks and temporary uploads."""

from __future__ import annotations

import math
from pathlib import Path

import numpy as np
from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, UploadFile

from ..config import settings
from ..deps import get_catalog, get_engine
from ..dsp import analysis as analysis_module
from ..dsp import wavio
from ..services.engine import RenderEngine

router = APIRouter()


@router.post("/analyze")
async def analyze(
    file: UploadFile = File(...),
    sample_rate: int | None = Form(default=None),
    with_waveform: bool = Form(default=False),
    peaks: int = Form(default=600),
    engine: RenderEngine = Depends(get_engine),
    catalog: dict = Depends(get_catalog),
) -> dict:
    """Measure a clip: pitch, loudness, noise floor, spectrum and recommendations."""

    payload = await file.read()
    path = engine.save_upload(file.filename or "upload.wav", payload, prefix="analyze")
    try:
        audio, rate = wavio.decode_audio(path, sample_rate)
        engine._guard_length(audio.shape[0], rate)  # noqa: SLF001 - shared limit check
        report = analysis_module.analyse(audio, rate, catalog)
        if with_waveform:
            report["waveform"] = waveform_peaks(audio[:, 0], int(np.clip(peaks, 40, 4000)))
        return report
    finally:
        path.unlink(missing_ok=True)


@router.post("/waveform")
async def waveform(
    file: UploadFile = File(...),
    peaks: int = Form(default=800),
) -> dict:
    """Downsampled min/max peaks for drawing a waveform without the whole file."""

    payload = await file.read()
    if len(payload) > settings.max_upload_mb * 1024 * 1024:
        raise HTTPException(status_code=413, detail="File too large.")
    from tempfile import NamedTemporaryFile

    suffix = Path(file.filename or "audio.wav").suffix or ".wav"
    with NamedTemporaryFile(suffix=suffix, delete=False) as handle:
        handle.write(payload)
        temporary = Path(handle.name)
    try:
        audio, rate = wavio.decode_audio(temporary)
        return {
            "peaks": waveform_peaks(audio[:, 0], int(np.clip(peaks, 40, 4000))),
            "duration": round(audio.shape[0] / float(rate), 3),
            "sample_rate": rate,
            "channels": int(audio.shape[1]),
        }
    finally:
        temporary.unlink(missing_ok=True)


@router.post("/upload")
async def upload(
    file: UploadFile = File(...),
    engine: RenderEngine = Depends(get_engine),
) -> dict:
    """Store a temporary source file and return a handle for later renders."""

    payload = await file.read()
    path = engine.save_upload(file.filename or "upload.wav", payload, prefix="src")
    audio, rate = wavio.decode_audio(path)
    engine._guard_length(audio.shape[0], rate)  # noqa: SLF001
    return {
        "upload_id": path.stem,
        "filename": file.filename,
        "seconds": round(audio.shape[0] / float(rate), 3),
        "sample_rate": rate,
        "channels": int(audio.shape[1]),
        "bytes": len(payload),
        "expires_in_minutes": settings.ttl_minutes,
    }


@router.post("/polish/preview")
async def polish_preview(
    file: UploadFile = File(...),
    denoise: float = Form(default=60),
    deess: float = Form(default=35),
    engine: RenderEngine = Depends(get_engine),
) -> dict:
    """Quick synchronous clean-up preview used by the Studio 'Polish' panel."""

    payload = await file.read()
    path = engine.save_upload(file.filename or "upload.wav", payload, prefix="preview")
    try:
        audio, rate = wavio.decode_audio(path)
        engine._guard_length(audio.shape[0], rate)  # noqa: SLF001
        from ..dsp import chain as chain_module

        modules = chain_module.ModuleSet(denoise=denoise, deess=deess, comp=25, gate=20, trimSilence=True)
        result = chain_module.render_chain(audio, rate, modules)
        before = analysis_module.analyse(audio, rate)
        after = analysis_module.analyse(result.audio, rate)
        return {
            "before": {
                "lufs": before["lufs"],
                "noise_floor_dbfs": before["noise_floor_dbfs"],
                "peak_dbfs": before["peak_dbfs"],
            },
            "after": {
                "lufs": after["lufs"],
                "noise_floor_dbfs": after["noise_floor_dbfs"],
                "peak_dbfs": after["peak_dbfs"],
            },
            "used_ffmpeg": False,
        }
    finally:
        path.unlink(missing_ok=True)


def waveform_peaks(signal: np.ndarray, count: int) -> list[float]:
    """Bucket the signal into `count` peak values (absolute max per bucket)."""

    if signal.size == 0:
        return []
    count = max(1, int(count))
    if signal.size <= count:
        return [round(float(abs(value)), 4) for value in signal]
    bucket = int(math.ceil(signal.size / count))
    padded = np.pad(signal, (0, bucket * count - signal.size), constant_values=0.0)
    shaped = np.abs(padded).reshape(count, bucket)
    return [round(float(value), 4) for value in shaped.max(axis=1)]
