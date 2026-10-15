"""Shared FastAPI dependencies (kept separate to avoid circular imports)."""

from __future__ import annotations

from fastapi import Header, HTTPException, Request

from .config import settings
from .services.db import Database
from .services.engine import RenderEngine


def get_engine(request: Request) -> RenderEngine:
    return request.app.state.engine


def get_database(request: Request) -> Database:
    return request.app.state.db


def get_catalog(request: Request) -> dict:
    return request.app.state.catalog


def require_api_key(x_api_key: str | None = Header(default=None, alias="X-API-Key")) -> None:
    """Optional shared-secret gate: enabled only when VOXSHIFT_API_KEY is set."""

    if settings.api_key and x_api_key != settings.api_key:
        raise HTTPException(status_code=401, detail="A valid X-API-Key header is required.")
