"""Custom voices (saved Forge designs) and quick server-side previews."""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException

from ..deps import get_catalog, get_database, get_engine
from ..schemas import VoiceProfile, VoiceProfileIn
from ..services.db import Database
from ..services.engine import RenderEngine, describe_modules
from ..dsp import chain as chain_module

router = APIRouter()


@router.get("/voices", response_model=list[VoiceProfile])
def list_voices(database: Database = Depends(get_database)) -> list[dict]:
    return database.list_voices()


@router.post("/voices", response_model=VoiceProfile, status_code=201)
def create_voice(payload: VoiceProfileIn, database: Database = Depends(get_database)) -> dict:
    if len(database.list_voices()) >= 200:
        raise HTTPException(status_code=409, detail="Voice library limit reached (200). Delete one first.")
    return database.create_voice(
        {
            "name": payload.name,
            "description": payload.description,
            "color": payload.color,
            "tags": payload.tags,
            "chain": payload.chain.model_dump(),
            "archetype_id": payload.archetype_id,
        }
    )


@router.get("/voices/{voice_id}", response_model=VoiceProfile)
def get_voice(voice_id: str, database: Database = Depends(get_database)) -> dict:
    voice = database.get_voice(voice_id)
    if not voice:
        raise HTTPException(status_code=404, detail="Unknown voice id.")
    return voice


@router.put("/voices/{voice_id}", response_model=VoiceProfile)
def update_voice(voice_id: str, payload: VoiceProfileIn, database: Database = Depends(get_database)) -> dict:
    updated = database.update_voice(
        voice_id,
        {
            "name": payload.name,
            "description": payload.description,
            "color": payload.color,
            "tags": payload.tags,
            "chain": payload.chain.model_dump(),
        },
    )
    if not updated:
        raise HTTPException(status_code=404, detail="Unknown voice id.")
    return updated


@router.delete("/voices/{voice_id}")
def delete_voice(voice_id: str, database: Database = Depends(get_database)) -> dict:
    if not database.delete_voice(voice_id):
        raise HTTPException(status_code=404, detail="Unknown voice id.")
    return {"status": "deleted", "voice_id": voice_id}


@router.get("/voices/{voice_id}/modules")
def voice_modules(voice_id: str, database: Database = Depends(get_database)) -> dict:
    voice = database.get_voice(voice_id)
    if not voice:
        raise HTTPException(status_code=404, detail="Unknown voice id.")
    modules = chain_module.modules_from_mapping(
        {key: value for key, value in voice["chain"].items() if key != "master"},
        voice["chain"].get("master"),
    )
    return {"voice_id": voice_id, "name": voice["name"], "modules": describe_modules(modules)}


@router.post("/voices/{voice_id}/use")
def mark_used(voice_id: str, database: Database = Depends(get_database)) -> dict:
    if not database.get_voice(voice_id):
        raise HTTPException(status_code=404, detail="Unknown voice id.")
    database.bump_voice_use(voice_id)
    return {"status": "ok", "voice_id": voice_id}


@router.get("/voices/library/catalog")
def voice_catalog(catalog: dict = Depends(get_catalog), engine: RenderEngine = Depends(get_engine)) -> dict:
    """Every voice the Studio can use: built-in effects plus the Forge archetypes."""

    return {
        "effects": catalog.get("effects", []),
        "archetypes": catalog.get("archetypes", []),
        "saved": engine.db.list_voices(),
    }
