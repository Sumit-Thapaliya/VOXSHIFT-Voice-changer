"""SQLite persistence for custom voices, projects, renders and activity.

The engine keeps *metadata* in SQLite and *audio* on disk with a hard TTL, so a
free single-VM deployment never grows without bound.
"""

from __future__ import annotations

import json
import sqlite3
import threading
import uuid
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any

SCHEMA = """
CREATE TABLE IF NOT EXISTS voices (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT,
    color TEXT NOT NULL DEFAULT '#b597ee',
    tags TEXT NOT NULL DEFAULT '[]',
    chain TEXT NOT NULL,
    archetype_id TEXT,
    render_count INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS projects (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    source_name TEXT,
    source_seconds REAL,
    chain TEXT NOT NULL,
    intensity REAL NOT NULL DEFAULT 75,
    preset_id TEXT,
    notes TEXT,
    render_ids TEXT NOT NULL DEFAULT '[]',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS renders (
    id TEXT PRIMARY KEY,
    kind TEXT NOT NULL,
    state TEXT NOT NULL,
    source_path TEXT,
    result_path TEXT,
    source_name TEXT,
    preset_id TEXT,
    voice_name TEXT,
    spec TEXT,
    metrics TEXT,
    progress INTEGER NOT NULL DEFAULT 0,
    stage TEXT,
    message TEXT,
    duration_ms INTEGER,
    bit_depth INTEGER,
    sample_rate INTEGER,
    created_at TEXT NOT NULL,
    finished_at TEXT,
    expires_at TEXT
);
CREATE TABLE IF NOT EXISTS activity (
    id TEXT PRIMARY KEY,
    action TEXT NOT NULL,
    kind TEXT NOT NULL,
    detail TEXT,
    status TEXT,
    duration REAL,
    render_id TEXT,
    created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS renders_created ON renders (created_at DESC);
CREATE INDEX IF NOT EXISTS activity_created ON activity (created_at DESC);
"""


def utcnow() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat()


class Database:
    """Tiny wrapper around sqlite3 with a lock and row dicts."""

    def __init__(self, path: Path) -> None:
        path.parent.mkdir(parents=True, exist_ok=True)
        self._lock = threading.RLock()
        self._connection = sqlite3.connect(str(path), check_same_thread=False)
        self._connection.row_factory = sqlite3.Row
        self._connection.execute("PRAGMA journal_mode=WAL")
        self._connection.executescript(SCHEMA)
        self._connection.commit()

    def close(self) -> None:
        with self._lock:
            self._connection.close()

    def execute(self, sql: str, params: tuple = ()) -> None:
        with self._lock:
            self._connection.execute(sql, params)
            self._connection.commit()

    def query(self, sql: str, params: tuple = ()) -> list[dict[str, Any]]:
        with self._lock:
            cursor = self._connection.execute(sql, params)
            return [dict(row) for row in cursor.fetchall()]

    def one(self, sql: str, params: tuple = ()) -> dict[str, Any] | None:
        rows = self.query(sql, params)
        return rows[0] if rows else None

    # ---------------------------------------------------------------- voices
    def list_voices(self) -> list[dict[str, Any]]:
        rows = self.query("SELECT * FROM voices ORDER BY created_at DESC")
        return [_voice_row(row) for row in rows]

    def get_voice(self, voice_id: str) -> dict[str, Any] | None:
        row = self.one("SELECT * FROM voices WHERE id = ?", (voice_id,))
        return _voice_row(row) if row else None

    def create_voice(self, data: dict[str, Any]) -> dict[str, Any]:
        voice_id = data.get("id") or str(uuid.uuid4())
        now = utcnow()
        self.execute(
            """INSERT INTO voices (id, name, description, color, tags, chain, archetype_id,
                                   render_count, created_at, updated_at)
               VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?, ?)""",
            (
                voice_id,
                data["name"],
                data.get("description"),
                data.get("color", "#b597ee"),
                json.dumps(data.get("tags", [])),
                json.dumps(data["chain"]),
                data.get("archetype_id"),
                now,
                now,
            ),
        )
        return self.get_voice(voice_id)  # type: ignore[return-value]

    def update_voice(self, voice_id: str, data: dict[str, Any]) -> dict[str, Any] | None:
        existing = self.get_voice(voice_id)
        if not existing:
            return None
        merged = {**existing, **data}
        self.execute(
            """UPDATE voices SET name = ?, description = ?, color = ?, tags = ?, chain = ?,
                                 updated_at = ? WHERE id = ?""",
            (
                merged["name"],
                merged.get("description"),
                merged.get("color", "#b597ee"),
                json.dumps(merged.get("tags", [])),
                json.dumps(merged["chain"]),
                utcnow(),
                voice_id,
            ),
        )
        return self.get_voice(voice_id)

    def delete_voice(self, voice_id: str) -> bool:
        with self._lock:
            cursor = self._connection.execute("DELETE FROM voices WHERE id = ?", (voice_id,))
            self._connection.commit()
            return cursor.rowcount > 0

    def bump_voice_use(self, voice_id: str) -> None:
        self.execute(
            "UPDATE voices SET render_count = render_count + 1, updated_at = ? WHERE id = ?",
            (utcnow(), voice_id),
        )

    # -------------------------------------------------------------- projects
    def list_projects(self) -> list[dict[str, Any]]:
        return [_project_row(row) for row in self.query("SELECT * FROM projects ORDER BY updated_at DESC")]

    def get_project(self, project_id: str) -> dict[str, Any] | None:
        row = self.one("SELECT * FROM projects WHERE id = ?", (project_id,))
        return _project_row(row) if row else None

    def create_project(self, data: dict[str, Any]) -> dict[str, Any]:
        project_id = data.get("id") or str(uuid.uuid4())
        now = utcnow()
        self.execute(
            """INSERT INTO projects (id, name, source_name, source_seconds, chain, intensity,
                                     preset_id, notes, render_ids, created_at, updated_at)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            (
                project_id,
                data["name"],
                data.get("source_name"),
                data.get("source_seconds"),
                json.dumps(data["chain"]),
                float(data.get("intensity", 75.0)),
                data.get("preset_id"),
                data.get("notes"),
                json.dumps(data.get("render_ids", [])),
                now,
                now,
            ),
        )
        return self.get_project(project_id)  # type: ignore[return-value]

    def update_project(self, project_id: str, data: dict[str, Any]) -> dict[str, Any] | None:
        existing = self.get_project(project_id)
        if not existing:
            return None
        merged = {**existing, **data}
        self.execute(
            """UPDATE projects SET name = ?, chain = ?, intensity = ?, preset_id = ?, notes = ?,
                                   render_ids = ?, updated_at = ? WHERE id = ?""",
            (
                merged["name"],
                json.dumps(merged["chain"]),
                float(merged.get("intensity", 75.0)),
                merged.get("preset_id"),
                merged.get("notes"),
                json.dumps(merged.get("render_ids", [])),
                utcnow(),
                project_id,
            ),
        )
        return self.get_project(project_id)

    def delete_project(self, project_id: str) -> bool:
        with self._lock:
            cursor = self._connection.execute("DELETE FROM projects WHERE id = ?", (project_id,))
            self._connection.commit()
            return cursor.rowcount > 0

    # --------------------------------------------------------------- renders
    def create_render(self, data: dict[str, Any]) -> dict[str, Any]:
        render_id = data.get("id") or str(uuid.uuid4())
        self.execute(
            """INSERT INTO renders (id, kind, state, source_path, result_path, source_name, preset_id,
                                   voice_name, spec, progress, stage, bit_depth, sample_rate, created_at,
                                   expires_at)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            (
                render_id,
                data["kind"],
                data.get("state", "queued"),
                data.get("source_path"),
                data.get("result_path"),
                data.get("source_name"),
                data.get("preset_id"),
                data.get("voice_name"),
                json.dumps(data.get("spec") or {}),
                int(data.get("progress", 0)),
                data.get("stage", "Queued"),
                data.get("bit_depth"),
                data.get("sample_rate"),
                utcnow(),
                data.get("expires_at"),
            ),
        )
        return self.get_render(render_id)  # type: ignore[return-value]

    def get_render(self, render_id: str) -> dict[str, Any] | None:
        row = self.one("SELECT * FROM renders WHERE id = ?", (render_id,))
        return _render_row(row) if row else None

    def update_render(self, render_id: str, data: dict[str, Any]) -> None:
        allowed = {
            "state",
            "result_path",
            "metrics",
            "progress",
            "stage",
            "message",
            "duration_ms",
            "finished_at",
            "expires_at",
            "voice_name",
            "preset_id",
        }
        fields = {key: value for key, value in data.items() if key in allowed}
        if not fields:
            return
        assignments = ", ".join(f"{key} = ?" for key in fields)
        params = [json.dumps(value) if key == "metrics" and value is not None else value for key, value in fields.items()]
        self.execute(f"UPDATE renders SET {assignments} WHERE id = ?", (*params, render_id))

    def list_renders(self, limit: int = 50, include_expired: bool = False) -> list[dict[str, Any]]:
        sql = "SELECT * FROM renders ORDER BY created_at DESC LIMIT ?"
        rows = self.query(sql, (int(limit),))
        items = [_render_row(row) for row in rows]
        if not include_expired:
            now = utcnow()
            items = [item for item in items if not item.get("expires_at") or item["expires_at"] > now or item["state"] != "expired"]
        return items

    def expired_renders(self) -> list[dict[str, Any]]:
        return [_render_row(row) for row in self.query("SELECT * FROM renders WHERE expires_at IS NOT NULL AND expires_at < ?", (utcnow(),))]

    def delete_render(self, render_id: str) -> bool:
        with self._lock:
            cursor = self._connection.execute("DELETE FROM renders WHERE id = ?", (render_id,))
            self._connection.commit()
            return cursor.rowcount > 0

    # -------------------------------------------------------------- activity
    def add_activity(
        self,
        action: str,
        kind: str,
        detail: str | None = None,
        status: str | None = None,
        duration: float | None = None,
        render_id: str | None = None,
    ) -> dict[str, Any]:
        entry_id = str(uuid.uuid4())
        self.execute(
            """INSERT INTO activity (id, action, kind, detail, status, duration, render_id, created_at)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?)""",
            (entry_id, action, kind, detail, status, duration, render_id, utcnow()),
        )
        row = self.one("SELECT * FROM activity WHERE id = ?", (entry_id,))
        return dict(row) if row else {}

    def list_activity(self, limit: int = 100) -> list[dict[str, Any]]:
        return self.query("SELECT * FROM activity ORDER BY created_at DESC LIMIT ?", (int(limit),))

    def clear_activity(self) -> int:
        with self._lock:
            cursor = self._connection.execute("DELETE FROM activity")
            self._connection.commit()
            return cursor.rowcount

    def stats(self) -> dict[str, int]:
        counts: dict[str, int] = {}
        for table in ("voices", "projects", "renders", "activity"):
            row = self.one(f"SELECT COUNT(*) AS total FROM {table}")  # noqa: S608 - fixed table names
            counts[table] = int(row["total"]) if row else 0
        return counts

    def prune_renders(self, older_than_minutes: int) -> int:
        cutoff = (datetime.now(timezone.utc) - timedelta(minutes=older_than_minutes)).replace(microsecond=0).isoformat()
        with self._lock:
            cursor = self._connection.execute(
                "DELETE FROM renders WHERE created_at < ? AND state IN ('done', 'failed', 'cancelled', 'expired')",
                (cutoff,),
            )
            self._connection.commit()
            return cursor.rowcount


def _voice_row(row: dict[str, Any]) -> dict[str, Any]:
    return {
        "id": row["id"],
        "name": row["name"],
        "description": row.get("description"),
        "color": row.get("color") or "#b597ee",
        "tags": json.loads(row.get("tags") or "[]"),
        "chain": json.loads(row["chain"]),
        "archetype_id": row.get("archetype_id"),
        "render_count": int(row.get("render_count") or 0),
        "created_at": row["created_at"],
        "updated_at": row["updated_at"],
    }


def _project_row(row: dict[str, Any]) -> dict[str, Any]:
    return {
        "id": row["id"],
        "name": row["name"],
        "source_name": row.get("source_name"),
        "source_seconds": row.get("source_seconds"),
        "chain": json.loads(row["chain"]),
        "intensity": float(row.get("intensity") or 75.0),
        "preset_id": row.get("preset_id"),
        "notes": row.get("notes"),
        "render_ids": json.loads(row.get("render_ids") or "[]"),
        "created_at": row["created_at"],
        "updated_at": row["updated_at"],
    }


def _render_row(row: dict[str, Any]) -> dict[str, Any]:
    metrics = row.get("metrics")
    spec = row.get("spec")
    return {
        "id": row["id"],
        "kind": row["kind"],
        "state": row["state"],
        "source_name": row.get("source_name"),
        "preset_id": row.get("preset_id"),
        "voice_name": row.get("voice_name"),
        "spec": json.loads(spec) if spec else None,
        "metrics": json.loads(metrics) if metrics else None,
        "progress": int(row.get("progress") or 0),
        "stage": row.get("stage"),
        "message": row.get("message"),
        "duration_ms": row.get("duration_ms"),
        "bit_depth": row.get("bit_depth"),
        "sample_rate": row.get("sample_rate"),
        "created_at": row["created_at"],
        "finished_at": row.get("finished_at"),
        "expires_at": row.get("expires_at"),
        "result_path": row.get("result_path"),
        "source_path": row.get("source_path"),
    }
