"""Preset catalogue: the shared voice-chain spec, served to the frontend."""

from __future__ import annotations

import numpy as np
from fastapi import APIRouter, Depends, HTTPException

from ..config import settings
from ..deps import get_catalog, get_engine
from ..dsp import chain as chain_module
from ..services.engine import RenderEngine, describe_modules

router = APIRouter()


@router.get("/presets")
def presets(catalog: dict = Depends(get_catalog)) -> dict:
    """Full catalogue: neutral spec, ranges, 16 effects and 8 forge archetypes."""

    return {
        "spec_version": catalog.get("spec_version", settings.spec_version),
        "defaults": catalog.get("defaults", {}),
        "ranges": catalog.get("ranges", {}),
        "master_defaults": catalog.get("master_defaults", {}),
        "effects": catalog.get("effects", []),
        "archetypes": catalog.get("archetypes", []),
    }


@router.get("/presets/{preset_id}")
def preset_detail(
    preset_id: str,
    intensity: float = 100.0,
    catalog: dict = Depends(get_catalog),
) -> dict:
    try:
        modules = chain_module.preset_modules(catalog, preset_id, intensity)
    except KeyError as error:
        raise HTTPException(status_code=404, detail=f"Unknown preset '{preset_id}'") from error
    payload = {key: float(getattr(modules, key)) for key in chain_module.ModuleSet.__annotations__}
    entry = next(
        (item for item in catalog.get("effects", []) + catalog.get("archetypes", []) if item["id"] == preset_id),
        {},
    )
    return {
        "id": preset_id,
        "label": entry.get("label", preset_id),
        "kind": "archetype" if entry in catalog.get("archetypes", []) else "effect",
        "intensity": intensity,
        "chain": payload,
        "modules": describe_modules(modules),
    }


@router.get("/modules")
def modules() -> dict:
    """Module documentation used by the Forge UI and by API consumers."""

    return {
        "spec_version": settings.spec_version,
        "modules": [
            {"key": "pitch", "label": "Pitch", "unit": "semitones", "range": [-12, 12], "group": "Identity",
             "description": "Moves the fundamental frequency without changing duration."},
            {"key": "formant", "label": "Formant", "unit": "semitones", "range": [-6, 6], "group": "Identity",
             "description": "Rescales the vocal-tract resonances — the actual 'size' of the voice."},
            {"key": "body", "label": "Body", "unit": "%", "range": [0, 100], "group": "Tone",
             "description": "Low shelf around 180 Hz. Weight and chest resonance."},
            {"key": "presence", "label": "Presence", "unit": "%", "range": [0, 100], "group": "Tone",
             "description": "Peak around 3.2 kHz. Intelligibility and forwardness."},
            {"key": "air", "label": "Air", "unit": "%", "range": [0, 100], "group": "Tone",
             "description": "High shelf around 8.5 kHz. Openness and sparkle."},
            {"key": "warmth", "label": "Warmth", "unit": "%", "range": [0, 100], "group": "Character",
             "description": "Soft saturation. Analogue thickness before distortion."},
            {"key": "growl", "label": "Growl", "unit": "%", "range": [0, 100], "group": "Character",
             "description": "Subharmonic generation plus asymmetric drive."},
            {"key": "ring", "label": "Ring", "unit": "%", "range": [0, 100], "group": "Character",
             "description": "Ring modulation with a sine carrier: robotic, mechanical, alien."},
            {"key": "vibrato", "label": "Vibrato", "unit": "%", "range": [0, 100], "group": "Character",
             "description": "Modulated delay-based pitch wobble."},
            {"key": "breath", "label": "Breath", "unit": "%", "range": [0, 100], "group": "Character",
             "description": "Airflow noise shaped by the voice envelope."},
            {"key": "gate", "label": "Gate", "unit": "%", "range": [0, 100], "group": "Dynamics",
             "description": "Downward expansion of room noise between words."},
            {"key": "comp", "label": "Compression", "unit": "%", "range": [0, 100], "group": "Dynamics",
             "description": "Even, broadcast-like level control with make-up gain."},
            {"key": "deess", "label": "De-esser", "unit": "%", "range": [0, 100], "group": "Dynamics",
             "description": "Dynamic sibilance control in the 5.5–9.5 kHz band."},
            {"key": "space", "label": "Space", "unit": "%", "range": [0, 100], "group": "Space",
             "description": "Convolution reverb with a synthesised room impulse."},
            {"key": "echo", "label": "Echo", "unit": "%", "range": [0, 100], "group": "Space",
             "description": "Damped feedback delay for depth and drama."},
            {"key": "denoise", "label": "Denoise", "unit": "%", "range": [0, 100], "group": "Master",
             "description": "Spectral noise reduction using the quietest part of the clip."},
        ],
        "master": [
            {"key": "highpassHz", "label": "High-pass", "range": [0, 500]},
            {"key": "lowpassHz", "label": "Low-pass", "range": [0, 20000], "note": "0 disables"},
            {"key": "normalize", "label": "Loudness normalise", "range": [0, 1]},
            {"key": "targetLufs", "label": "Target loudness", "range": [-30, -6]},
            {"key": "limiterCeilingDb", "label": "Limiter ceiling", "range": [-6, 0]},
            {"key": "trimSilence", "label": "Trim silence", "range": [0, 1]},
            {"key": "fadeMs", "label": "Fades", "range": [0, 200]},
            {"key": "outputGainDb", "label": "Output gain", "range": [-24, 24]},
        ],
    }


@router.post("/presets/randomize")
def randomize(
    seed: int | None = None,
    drama: float = 55.0,
    catalog: dict = Depends(get_catalog),
    engine: RenderEngine = Depends(get_engine),
) -> dict:
    """Generate a coherent random voice design (used by the Forge shuffle)."""

    rng = np.random.default_rng(seed)
    drama = float(np.clip(drama, 0.0, 100.0)) / 100.0

    def amount(scale: float = 1.0) -> float:
        return float(np.clip(rng.normal(70.0, 25.0) * drama * scale, 0.0, 100.0))

    chain = {
        "pitch": float(np.clip(rng.normal(0.0, 3.2) * drama, -12, 12)),
        "formant": float(np.clip(rng.normal(0.0, 1.4) * drama, -6, 6)),
        "body": amount(0.6) if rng.random() < 0.6 else 0.0,
        "presence": amount(0.5) if rng.random() < 0.5 else 0.0,
        "air": amount(0.5) if rng.random() < 0.45 else 0.0,
        "warmth": amount(0.6) if rng.random() < 0.45 else 0.0,
        "growl": amount(0.6) if rng.random() < 0.25 else 0.0,
        "ring": amount(0.5) if rng.random() < 0.3 else 0.0,
        "ringFreq": float(np.clip(rng.normal(95.0, 45.0), 30, 400)),
        "vibrato": amount(0.5) if rng.random() < 0.3 else 0.0,
        "vibratoRate": float(np.clip(rng.normal(5.4, 1.2), 3, 9)),
        "breath": amount(0.5) if rng.random() < 0.3 else 0.0,
        "gate": amount(0.4) if rng.random() < 0.4 else 0.0,
        "comp": amount(0.6) if rng.random() < 0.6 else 0.0,
        "deess": amount(0.4) if rng.random() < 0.4 else 0.0,
        "space": amount(0.5) if rng.random() < 0.4 else 0.0,
        "echo": amount(0.5) if rng.random() < 0.3 else 0.0,
        "echoTime": float(np.clip(rng.normal(200.0, 80.0), 40, 600)),
    }
    modules = chain_module.modules_from_mapping(chain, catalog.get("master_defaults", {}))
    return {
        "seed": seed,
        "chart": chain,
        "chain": {key: float(getattr(modules, key)) for key in chain_module.ModuleSet.__annotations__},
        "modules": describe_modules(modules),
    }
