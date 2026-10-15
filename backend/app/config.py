"""VOXSHIFT Engine — configuration.

Everything is environment driven so the same CPU engine can run from a laptop
(`uvicorn app.main:app`) or from a container without changing code.
"""

from __future__ import annotations

import os
from dataclasses import dataclass, field
from pathlib import Path

ENGINE_NAME = "VOXSHIFT Engine"
APP_NAME = "VOXSHIFT CPU Engine"
ENGINE_VERSION = "2.0.0"
SPEC_VERSION = "1.0"

PACKAGE_DIR = Path(__file__).resolve().parent
BACKEND_ROOT = PACKAGE_DIR.parent
REPO_ROOT = BACKEND_ROOT.parent

#: `/api/render/...` rows are kept this long after they finish.
JOB_RETENTION_MINUTES = 24 * 60


def _env_int(name: str, default: int) -> int:
    try:
        return int(os.environ.get(name, default))
    except (TypeError, ValueError):
        return default


def _env_float(name: str, default: float) -> float:
    try:
        return float(os.environ.get(name, default))
    except (TypeError, ValueError):
        return default


def _env_list(name: str, default: list[str]) -> list[str]:
    raw = os.environ.get(name)
    if not raw:
        return list(default)
    return [item.strip() for item in raw if item.strip()]


@dataclass(frozen=True)
class Settings:
    """Runtime settings.

    Defaults are tuned for a free CPU-only deployment: small uploads, short
    retention, one render worker per core.
    """

    app_name: str = APP_NAME
    version: str = ENGINE_VERSION
    spec_version: str = SPEC_VERSION

    data_dir: Path = field(default_factory=lambda: Path(os.environ.get("VOXSHIFT_DATA_DIR", str(BACKEND_ROOT / "data"))))
    max_upload_mb: int = field(default_factory=lambda: _env_int("VOXSHIFT_MAX_UPLOAD_MB", 40))
    max_duration_s: float = field(default_factory=lambda: _env_float("VOXSHIFT_MAX_DURATION_S", 300.0))
    min_duration_s: float = field(default_factory=lambda: _env_float("VOXSHIFT_MIN_DURATION_S", 0.5))
    ttl_minutes: int = field(default_factory=lambda: _env_int("VOXSHIFT_TTL_MINUTES", 360))
    worker_threads: int = field(default_factory=lambda: _env_int("VOXSHIFT_WORKERS", max(1, (os.cpu_count() or 2) - 1)))
    max_jobs_queued: int = field(default_factory=lambda: _env_int("VOXSHIFT_QUEUE_LIMIT", 32))
    api_key: str = field(default_factory=lambda: os.environ.get("VOXSHIFT_API_KEY", "").strip())
    cors_origins: list[str] = field(
        default_factory=lambda: _env_list(
            "VOXSHIFT_CORS_ORIGINS",
            ["http://localhost:3000", "http://127.0.0.1:3000"],
        )
    )
    #: Hosted-preview and PaaS domains are allowed by default so a split
    #: deployment (studio on Vercel/Netlify, engine on Render) works without
    #: extra configuration. Tighten this for a private deployment.
    cors_origin_regex: str = field(
        default_factory=lambda: os.environ.get(
            "VOXSHIFT_CORS_REGEX",
            r"https?://([a-z0-9-]+\.)*(localhost|e2b\.app|arena\.dev|vercel\.app|"
            r"onrender\.com|netlify\.app|railway\.app|fly\.dev|pages\.dev)(:\d+)?$",
        )
    )
    cleanup_interval_s: int = field(default_factory=lambda: _env_int("VOXSHIFT_CLEANUP_INTERVAL_S", 900))
    job_retention_minutes: int = JOB_RETENTION_MINUTES

    # ---- derived paths -------------------------------------------------
    @property
    def upload_dir(self) -> Path:
        return self.data_dir / "uploads"

    @property
    def render_dir(self) -> Path:
        return self.data_dir / "renders"

    @property
    def db_path(self) -> Path:
        return self.data_dir / "voxshift.sqlite3"

    @property
    def presets_path(self) -> Path:
        return PACKAGE_DIR / "data" / "voice-presets.json"

    @property
    def max_upload_bytes(self) -> int:
        return self.max_upload_mb * 1024 * 1024

    def ensure_dirs(self) -> None:
        for path in (self.data_dir, self.upload_dir, self.render_dir):
            path.mkdir(parents=True, exist_ok=True)


settings = Settings()

__all__ = [
    "APP_NAME",
    "BACKEND_ROOT",
    "ENGINE_NAME",
    "ENGINE_VERSION",
    "REPO_ROOT",
    "SPEC_VERSION",
    "Settings",
    "settings",
]
