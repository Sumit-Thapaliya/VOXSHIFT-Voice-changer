"""Job orchestration: uploads in, renders out, with progress and expiry."""

from __future__ import annotations

import json
import shutil
import threading
import time
import uuid
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any, Callable

import numpy as np

from ..config import settings
from ..dsp import analysis, chain as chain_module, wavio
from ..schemas import PolishRequest, RenderRequest
from .db import Database

ACTIVE_STATES = {"queued", "running"}


def _expiry() -> str:
    moment = datetime.now(timezone.utc) + timedelta(minutes=settings.ttl_minutes)
    return moment.replace(microsecond=0).isoformat()


class RenderEngine:
    """Thread pool + store for analyse / render / polish jobs."""

    def __init__(self, database: Database, catalog: dict) -> None:
        self.db = database
        self.catalog = catalog
        self.pool = ThreadPoolExecutor(max_workers=settings.worker_threads, thread_name_prefix="voxshift")
        self._lock = threading.Lock()
        self._started_at = time.time()
        self._stop = threading.Event()
        self._cleanup_thread: threading.Thread | None = None
        self.counters = {"renders_started": 0, "renders_done": 0, "renders_failed": 0, "analyses": 0}

    # ------------------------------------------------------------- lifecycle
    def start_cleanup_thread(self) -> None:
        if self._cleanup_thread and self._cleanup_thread.is_alive():
            return

        def loop() -> None:
            while not self._stop.wait(settings.cleanup_interval_s):
                try:
                    self.cleanup()
                except Exception:  # pragma: no cover - background safety net
                    continue

        self._cleanup_thread = threading.Thread(target=loop, name="voxshift-cleanup", daemon=True)
        self._cleanup_thread.start()

    def shutdown(self) -> None:
        self._stop.set()
        self.pool.shutdown(wait=False, cancel_futures=True)

    def cleanup(self) -> dict[str, int]:
        removed_files = 0
        expired = self.db.expired_renders()
        for record in expired:
            for key in ("result_path", "source_path"):
                path = record.get(key)
                if path and Path(path).exists():
                    Path(path).unlink(missing_ok=True)
                    removed_files += 1
            if record["state"] != "expired":
                self.db.update_render(record["id"], {"state": "expired", "message": "Expired after the retention window."})
        pruned = self.db.prune_renders(settings.job_retention_minutes)
        orphans = 0
        now = time.time()
        for folder in (settings.upload_dir, settings.render_dir):
            if not folder.exists():
                continue
            for path in folder.glob("*"):
                try:
                    if path.is_file() and (now - path.stat().st_mtime) > settings.ttl_minutes * 60:
                        path.unlink(missing_ok=True)
                        orphans += 1
                except OSError:
                    continue
        return {"expired_jobs": len(expired), "pruned_rows": pruned, "removed_files": removed_files + orphans}

    def queue_depth(self) -> dict[str, int]:
        rows = self.db.query("SELECT state, COUNT(*) AS total FROM renders GROUP BY state")
        counts = {row["state"]: int(row["total"]) for row in rows}
        counts.setdefault("queued", 0)
        counts.setdefault("running", 0)
        return counts

    def storage_report(self) -> dict[str, Any]:
        def folder_size(path: Path) -> int:
            if not path.exists():
                return 0
            return sum(item.stat().st_size for item in path.glob("*") if item.is_file())

        return {
            "uploads_bytes": folder_size(settings.upload_dir),
            "renders_bytes": folder_size(settings.render_dir),
            "data_dir": str(settings.data_dir),
            "ttl_minutes": settings.ttl_minutes,
        }

    def uptime_seconds(self) -> float:
        return round(time.time() - self._started_at, 1)

    # ----------------------------------------------------------------- input
    def save_upload(self, filename: str, payload: bytes, prefix: str = "src") -> Path:
        if len(payload) > settings.max_upload_mb * 1024 * 1024:
            raise ValueError(f"Files must be smaller than {settings.max_upload_mb} MB.")
        settings.ensure_dirs()
        suffix = Path(filename or "audio").suffix.lower() or ".wav"
        target = settings.upload_dir / f"{prefix}-{uuid.uuid4().hex[:12]}{suffix}"
        target.write_bytes(payload)
        return target

    # --------------------------------------------------------------- analyse
    def analyse_file(self, path: Path, target_rate: int | None = None) -> dict[str, Any]:
        audio, rate = wavio.decode_audio(path, target_rate)
        self._guard_length(audio.shape[0], rate)
        self.counters["analyses"] += 1
        return analysis.analyse(audio, rate, self.catalog)

    def _guard_length(self, samples: int, rate: int) -> None:
        seconds = samples / float(rate)
        if seconds < settings.min_duration_s:
            raise ValueError("That clip is too short to process. Use at least half a second of audio.")
        if seconds > settings.max_duration_s:
            raise ValueError(
                f"For this CPU engine, keep clips under {int(settings.max_duration_s)} seconds."
            )

    # ---------------------------------------------------------------- render
    def submit_render(self, request: RenderRequest, source_path: Path, source_name: str) -> dict[str, Any]:
        modules, label = self.resolve_modules(request)
        record = self.db.create_render(
            {
                "kind": "render",
                "state": "queued",
                "source_path": str(source_path),
                "source_name": source_name,
                "preset_id": request.preset_id,
                "voice_name": request.name or label,
                "spec": modules_to_payload(modules),
                "bit_depth": request.bit_depth,
                "sample_rate": request.sample_rate,
                "expires_at": _expiry(),
            }
        )
        self.pool.submit(self._run_render, record["id"], modules, request.bit_depth, request.sample_rate)
        return record

    def submit_polish(self, request: PolishRequest, source_path: Path, source_name: str) -> dict[str, Any]:
        modules = chain_module.ModuleSet(
            highpassHz=request.highpassHz,
            denoise=request.denoise,
            deess=request.deess,
            gate=request.gate,
            comp=request.comp,
            normalize=True,
            targetLufs=request.targetLufs,
            limiterCeilingDb=request.limiterCeilingDb,
            trimSilence=request.trimSilence,
            fadeMs=request.fadeMs,
        )
        record = self.db.create_render(
            {
                "kind": "polish",
                "state": "queued",
                "source_path": str(source_path),
                "source_name": source_name,
                "voice_name": source_name,
                "spec": modules_to_payload(modules),
                "bit_depth": request.bit_depth,
                "sample_rate": request.sample_rate,
                "expires_at": _expiry(),
            }
        )
        self.pool.submit(self._run_render, record["id"], modules, request.bit_depth, request.sample_rate)
        return record

    def resolve_modules(self, request: RenderRequest) -> tuple[chain_module.ModuleSet, str]:
        if request.chain is not None:
            values = request.chain.to_modules()
            master_values = request.chain.master.model_dump()
            modules = chain_module.modules_from_mapping(values, master_values)
            if request.intensity < 100:
                defaults = self.catalog.get("defaults", {})
                modules = chain_module.modules_from_mapping(
                    chain_module.blend_intensity(values, defaults, request.intensity), master_values
                )
            label = request.name or "Custom voice"
            return modules, label
        preset_id = request.preset_id or request.archetype_id
        if not preset_id:
            raise ValueError("Provide either preset_id or a full chain.")
        modules = chain_module.preset_modules(self.catalog, preset_id, request.intensity)
        label = preset_id.replace("-", " ").title()
        for entry in self.catalog.get("effects", []) + self.catalog.get("archetypes", []):
            if entry["id"] == preset_id:
                label = entry.get("label", label)
                break
        return modules, label

    def _run_render(self, render_id: str, modules: chain_module.ModuleSet, bit_depth: int, sample_rate: int | None) -> None:
        record = self.db.get_render(render_id)
        if not record:
            return
        started = time.time()
        self.counters["renders_started"] += 1
        self.db.update_render(render_id, {"state": "running", "stage": "Analysing input", "progress": 2})

        def progress(value: int, stage: str) -> None:
            self.db.update_render(render_id, {"progress": int(value), "stage": stage})

        try:
            source_path = Path(record["source_path"])  # type: ignore[arg-type]
            audio, rate = wavio.decode_audio(source_path, sample_rate)
            self._guard_length(audio.shape[0], rate)
            result = chain_module.render_chain(audio, rate, modules, progress)
            output_path = settings.render_dir / f"{render_id}.wav"
            wavio.write_wav(output_path, result.audio, result.sample_rate, bit_depth)
            elapsed = int((time.time() - started) * 1000)
            self.db.update_render(
                render_id,
                {
                    "state": "done",
                    "result_path": str(output_path),
                    "metrics": result.metrics,
                    "progress": 100,
                    "stage": "Finished",
                    "finished_at": datetime.now(timezone.utc).replace(microsecond=0).isoformat(),
                    "duration_ms": elapsed,
                    "sample_rate": result.sample_rate,
                },
            )
            self.db.add_activity(
                action="Polish applied" if record["kind"] == "polish" else "Voice rendered",
                kind=record["kind"],
                detail=f"{record.get('source_name') or 'audio'} · {record.get('voice_name') or 'Voice'}",
                status="Completed",
                duration=result.metrics.get("duration"),
                render_id=render_id,
            )
            if record.get("voice_name"):
                pass
            self.counters["renders_done"] += 1
        except Exception as error:  # noqa: BLE001 - surfaced to the client
            self.counters["renders_failed"] += 1
            self.db.update_render(
                render_id,
                {
                    "state": "failed",
                    "message": str(error),
                    "stage": "Failed",
                    "finished_at": datetime.now(timezone.utc).replace(microsecond=0).isoformat(),
                },
            )
            self.db.add_activity(
                action="Render failed",
                kind=record["kind"],
                detail=str(error)[:200],
                status="Failed",
                render_id=render_id,
            )

    def render_sync(
        self,
        modules: chain_module.ModuleSet,
        audio: np.ndarray,
        sample_rate: int,
        bit_depth: int = 16,
    ) -> chain_module.RenderResult:
        """Direct (non-queued) render, used by tests and the CLI."""

        return chain_module.render_chain(audio, sample_rate, modules)

    def cancel(self, render_id: str) -> dict[str, Any] | None:
        record = self.db.get_render(render_id)
        if not record:
            return None
        if record["state"] in ACTIVE_STATES:
            self.db.update_render(render_id, {"state": "cancelled", "message": "Cancelled by the client."})
            record = self.db.get_render(render_id)
        return record

    def delete(self, render_id: str) -> bool:
        record = self.db.get_render(render_id)
        if not record:
            return False
        for key in ("result_path", "source_path"):
            path = record.get(key)
            if path and Path(path).exists():
                Path(path).unlink(missing_ok=True)
        return self.db.delete_render(render_id)

    def result_path(self, record: dict[str, Any]) -> Path | None:
        path = record.get("result_path")
        if not path:
            return None
        candidate = Path(path)
        return candidate if candidate.exists() else None

    def purge_all_files(self) -> int:
        removed = 0
        for folder in (settings.upload_dir, settings.render_dir):
            if folder.exists():
                for item in folder.glob("*"):
                    if item.is_file():
                        item.unlink(missing_ok=True)
                        removed += 1
        return removed

    def disk_free_mb(self) -> float:
        try:
            usage = shutil.disk_usage(str(settings.data_dir))
            return round(usage.free / (1024 * 1024), 1)
        except OSError:
            return 0.0


def modules_to_payload(modules: chain_module.ModuleSet) -> dict[str, Any]:
    return {key: getattr(modules, key) for key in chain_module.ModuleSet.__annotations__}


def modules_from_payload(payload: dict[str, Any]) -> chain_module.ModuleSet:
    return chain_module.ModuleSet(**{key: value for key, value in payload.items() if key in chain_module.ModuleSet.__annotations__})


def describe_modules(modules: chain_module.ModuleSet) -> list[dict[str, Any]]:
    """Human-readable summary of the non-neutral modules in a design."""

    labels = {
        "pitch": ("Pitch", "st"),
        "formant": ("Formant", "st"),
        "body": ("Body", "%"),
        "presence": ("Presence", "%"),
        "air": ("Air", "%"),
        "warmth": ("Warmth", "%"),
        "growl": ("Growl", "%"),
        "ring": ("Ring modulation", "%"),
        "vibrato": ("Vibrato", "%"),
        "breath": ("Breath", "%"),
        "gate": ("Noise gate", "%"),
        "comp": ("Compression", "%"),
        "deess": ("De-esser", "%"),
        "space": ("Space", "%"),
        "echo": ("Echo", "%"),
        "denoise": ("Denoise", "%"),
    }
    summary: list[dict[str, Any]] = []
    for key, (label, unit) in labels.items():
        value = float(getattr(modules, key, 0.0))
        if abs(value) > 0.5:
            summary.append({"module": key, "label": label, "value": round(value, 2), "unit": unit})
    return summary


def catalog_json(catalog: dict) -> str:
    return json.dumps(catalog, indent=2)
