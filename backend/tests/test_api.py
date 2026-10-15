"""End-to-end API tests against a real engine instance."""

from __future__ import annotations

import io
import json
import time
import wave
from pathlib import Path

import numpy as np
import pytest

from app.dsp import wavio


def upload_bytes(path: Path) -> tuple[str, bytes, str]:
    return (path.name, path.read_bytes(), "audio/wav")


def wait_for_job(client, job_id: str, timeout: float = 60.0) -> dict:
    deadline = time.time() + timeout
    payload = {}
    while time.time() < deadline:
        response = client.get(f"/api/render/{job_id}")
        assert response.status_code == 200, response.text
        payload = response.json()
        if payload["state"] in {"done", "failed", "cancelled"}:
            return payload
        time.sleep(0.2)
    raise AssertionError(f"Job {job_id} did not finish: {payload}")


def test_health_reports_a_cpu_engine(client) -> None:
    body = client.get("/api/health").json()
    assert body["status"] == "online"
    assert body["mode"] == "cpu-dsp"
    assert body["gpu_required"] is False
    assert body["model_free"] is True
    assert "limits" in body and "queue" in body


def test_preset_catalogue_matches_the_shared_spec(client) -> None:
    body = client.get("/api/presets").json()
    assert len(body["effects"]) == 16
    assert len(body["archetypes"]) == 8
    assert body["spec_version"] == "1.0"
    assert set(body["defaults"]) >= {"pitch", "formant", "ring", "space"}


def test_shared_preset_file_is_in_sync(client) -> None:
    from app.config import REPO_ROOT

    shared = json.loads((REPO_ROOT / "shared" / "voice-presets.json").read_text())
    bundled = json.loads((REPO_ROOT / "backend" / "app" / "data" / "voice-presets.json").read_text())
    assert shared == bundled, "Run scripts/sync_presets.py after editing shared/voice-presets.json"
    assert shared["spec_version"] == client.get("/api/presets").json()["spec_version"]


def test_module_documentation(client) -> None:
    body = client.get("/api/modules").json()
    keys = {entry["key"] for entry in body["modules"]}
    assert {"pitch", "formant", "body", "growl", "ring", "denoise"} <= keys
    assert any(entry["key"] == "targetLufs" for entry in body["master"])


def test_randomize_returns_a_valid_chain(client) -> None:
    body = client.post("/api/presets/randomize", params={"seed": 12, "drama": 70}).json()
    chain = body["chain"]
    assert -12 <= chain["pitch"] <= 12
    assert 0 <= chain["comp"] <= 100
    assert body["modules"]


def test_analyze_upload(client, voice_file: Path) -> None:
    response = client.post(
        "/api/analyze",
        files={"file": upload_bytes(voice_file)},
        data={"with_waveform": "true", "peaks": "120"},
    )
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["profile"]["summary"]
    assert 3.5 < body["duration"] < 4.5
    assert len(body["waveform"]) == 120
    assert body["pitch"]["median_hz"] > 80


def test_render_rejects_a_non_wav_before_queueing(client, voice_file: Path) -> None:
    """A wrong file must fail immediately, not turn into a mysterious failed job."""

    before = len(client.get("/api/renders?limit=100").json())
    response = client.post(
        "/api/render",
        files={"file": ("notes.txt", b"this is definitely not audio", "text/plain")},
        data={"preset_id": "deep"},
    )
    assert response.status_code == 415
    assert "Unsupported file type" in response.json()["detail"]
    assert len(client.get("/api/renders?limit=100").json()) == before, "a job was queued for a rejected file"

    polished = client.post(
        "/api/polish",
        files={"file": ("voice.wav", b"RIFFxxxxNOPE", "audio/wav")},
    )
    assert polished.status_code == 415


def test_analyze_rejects_unsupported_file(client) -> None:
    response = client.post("/api/analyze", files={"file": ("notes.txt", b"hello", "text/plain")})
    assert response.status_code == 415
    assert "Unsupported file type" in response.json()["detail"]


def test_render_preset_job_end_to_end(client, voice_file: Path) -> None:
    response = client.post(
        "/api/render",
        files={"file": upload_bytes(voice_file)},
        data={"preset_id": "deep", "intensity": "80", "name": "Test Deep"},
    )
    assert response.status_code == 202, response.text
    job_id = response.json()["job_id"]
    payload = wait_for_job(client, job_id)
    assert payload["state"] == "done", payload
    assert payload["progress"] == 100
    assert payload["metrics"]["lufs"] == pytest.approx(-16.0, abs=0.8)
    assert payload["audio_url"] == f"/api/render/{job_id}/audio"

    audio = client.get(f"/api/render/{job_id}/audio")
    assert audio.status_code == 200
    assert audio.headers["content-type"] == "audio/wav"
    decoded, rate = wavio.decode_audio(_write_tmp(audio.content))
    assert rate >= 16000
    assert decoded.shape[0] > 0
    assert 20.0 * np.log10(np.max(np.abs(decoded))) <= -0.9


def test_render_with_full_chain_and_24_bit(client, voice_file: Path) -> None:
    chain = {
        "pitch": -3,
        "formant": -1,
        "body": 40,
        "comp": 30,
        "space": 20,
        "master": {"targetLufs": -18, "trimSilence": False, "lowpassHz": 12000},
    }
    response = client.post(
        "/api/render",
        files={"file": upload_bytes(voice_file)},
        data={"chain": json.dumps(chain), "bit_depth": "24", "intensity": "100"},
    )
    assert response.status_code == 202, response.text
    payload = wait_for_job(client, response.json()["job_id"])
    assert payload["state"] == "done"
    assert payload["metrics"]["lufs"] == pytest.approx(-18.0, abs=0.9)
    audio = client.get(f"/api/render/{payload['job_id']}/audio")
    with wave.open(io.BytesIO(audio.content), "rb") as handle:
        assert handle.getsampwidth() == 3


def test_render_rejects_invalid_chain(client, voice_file: Path) -> None:
    response = client.post(
        "/api/render",
        files={"file": upload_bytes(voice_file)},
        data={"chain": "{\"pitch\": }"},
    )
    assert response.status_code == 422


def test_render_requires_a_preset_or_chain(client, voice_file: Path) -> None:
    response = client.post("/api/render", files={"file": upload_bytes(voice_file)}, data={})
    assert response.status_code in (400, 422)


def test_polish_job_cleans_up_a_noisy_clip(client, sample_rate: int, tmp_path: Path) -> None:
    rng = np.random.default_rng(2)
    time = np.arange(int(sample_rate * 3)) / sample_rate
    speech = 0.3 * np.sin(2 * np.pi * 180 * time) * (0.5 + 0.5 * np.sin(2 * np.pi * 2 * time))
    noisy = (speech + rng.normal(0, 0.04, time.size)).astype(np.float32)[:, None]
    path = tmp_path / "noisy.wav"
    wavio.write_wav(path, noisy, sample_rate)
    before = client.post("/api/analyze", files={"file": upload_bytes(path)}).json()

    response = client.post(
        "/api/polish",
        files={"file": upload_bytes(path)},
        data={"options": json.dumps({"denoise": 80, "deess": 0, "gate": 40, "comp": 30})},
    )
    assert response.status_code == 202, response.text
    payload = wait_for_job(client, response.json()["job_id"])
    assert payload["state"] == "done"
    assert payload["kind"] == "polish"
    assert payload["metrics"]["lufs"] == pytest.approx(-16.0, abs=0.8)

    audio = client.get(f"/api/render/{payload['job_id']}/audio").content
    rendered, _ = wavio.decode_audio(_write_tmp(audio))
    after = client.post(
        "/api/analyze",
        files={"file": ("polished.wav", audio, "audio/wav")},
    ).json()
    assert after["noise_floor_dbfs"] < before["noise_floor_dbfs"] + 1
    assert rendered.shape[0] > 0


def test_voice_library_crud(client) -> None:
    payload = {
        "name": "Test Baritone",
        "description": "Saved from the Forge test suite",
        "color": "#7b96f4",
        "tags": ["test"],
        "chain": {"pitch": -4, "formant": -1.5, "body": 35, "comp": 30},
    }
    created = client.post("/api/voices", json=payload)
    assert created.status_code == 201, created.text
    voice = created.json()
    assert voice["id"] and voice["created_at"]
    assert voice["chain"]["pitch"] == -4

    listed = client.get("/api/voices").json()
    assert any(item["id"] == voice["id"] for item in listed)

    modules = client.get(f"/api/voices/{voice['id']}/modules").json()
    assert any(entry["module"] == "pitch" for entry in modules["modules"])

    updated = client.put(
        f"/api/voices/{voice['id']}",
        json={**payload, "name": "Renamed Baritone", "chain": {"pitch": -5}},
    ).json()
    assert updated["name"] == "Renamed Baritone"
    assert updated["chain"]["pitch"] == -5

    assert client.post(f"/api/voices/{voice['id']}/use").json()["status"] == "ok"
    assert client.delete(f"/api/voices/{voice['id']}").json()["status"] == "deleted"
    assert client.get(f"/api/voices/{voice['id']}").status_code == 404


def test_voice_library_catalog_includes_saved_voices(client) -> None:
    created = client.post(
        "/api/voices",
        json={"name": "Catalog Voice", "chain": {"pitch": -2}, "color": "#8bde9c"},
    ).json()
    body = client.get("/api/voices/library/catalog").json()
    assert len(body["effects"]) == 16
    assert any(item["id"] == created["id"] for item in body["saved"])
    client.delete(f"/api/voices/{created['id']}")


def test_voice_payload_validation(client) -> None:
    assert client.post("/api/voices", json={"name": "", "chain": {}}).status_code == 422
    assert client.post(
        "/api/voices", json={"name": "Bad colour", "chain": {}, "color": "purple"}
    ).status_code == 422


def test_projects_crud(client) -> None:
    payload = {
        "name": "Podcast intro",
        "source_name": "intro.wav",
        "source_seconds": 12.5,
        "chain": {"pitch": -2, "body": 30},
        "intensity": 65,
        "notes": "Keep it warm",
    }
    created = client.post("/api/projects", json=payload)
    assert created.status_code == 201, created.text
    project = created.json()
    listed = client.get("/api/projects").json()
    assert any(item["id"] == project["id"] for item in listed)
    updated = client.put(
        f"/api/projects/{project['id']}", json={**payload, "name": "Podcast intro v2"}
    ).json()
    assert updated["name"] == "Podcast intro v2"
    assert client.delete(f"/api/projects/{project['id']}").json()["status"] == "deleted"
    assert client.get(f"/api/projects/{project['id']}").status_code == 404


def test_activity_and_stats(client, voice_file: Path) -> None:
    client.post(
        "/api/render",
        files={"file": upload_bytes(voice_file)},
        data={"preset_id": "narrator", "intensity": "70"},
    )
    history = client.get("/api/history").json()
    assert isinstance(history, list)
    stats = client.get("/api/stats").json()
    assert stats["renders"]["total"] >= 1
    assert stats["counters"]["renders_started"] >= 1
    assert client.delete("/api/history").json()["status"] == "cleared"


def test_job_listing_and_delete(client, voice_file: Path) -> None:
    response = client.post(
        "/api/render",
        files={"file": upload_bytes(voice_file)},
        data={"preset_id": "robot"},
    )
    job_id = response.json()["job_id"]
    wait_for_job(client, job_id)
    jobs = client.get("/api/jobs", params={"limit": 5}).json()
    assert any(job["id"] == job_id for job in jobs)
    renders = client.get("/api/renders").json()
    assert any(item["job_id"] == job_id for item in renders)
    assert client.delete(f"/api/render/{job_id}").json()["status"] == "deleted"
    assert client.get(f"/api/render/{job_id}").status_code == 404


def test_missing_job_returns_404(client) -> None:
    assert client.get("/api/render/does-not-exist").status_code == 404
    assert client.delete("/api/render/does-not-exist").status_code == 404


def test_audio_before_completion_is_conflict(client, voice_file: Path) -> None:
    response = client.post(
        "/api/render", files={"file": upload_bytes(voice_file)}, data={"preset_id": "helium"}
    )
    job_id = response.json()["job_id"]
    status = client.get(f"/api/render/{job_id}").json()
    if status["state"] != "done":
        assert client.get(f"/api/render/{job_id}/audio").status_code == 409


def test_too_short_clip_is_rejected(client, sample_rate: int, tmp_path: Path) -> None:
    short = (0.2 * np.sin(2 * np.pi * 200 * np.arange(int(sample_rate * 0.1)) / sample_rate)).astype(np.float32)[:, None]
    path = tmp_path / "short.wav"
    wavio.write_wav(path, short, sample_rate)
    response = client.post("/api/analyze", files={"file": upload_bytes(path)})
    assert response.status_code == 400


def test_maintenance_cleanup_and_purge(client) -> None:
    cleanup = client.post("/api/maintenance/cleanup").json()
    assert cleanup["status"] == "ok"
    purge = client.post("/api/maintenance/purge").json()
    assert purge["removed_files"] >= 0


def test_waveform_endpoint(client, voice_file: Path) -> None:
    response = client.post(
        "/api/waveform", files={"file": upload_bytes(voice_file)}, data={"peaks": "64"}
    )
    assert response.status_code == 200
    assert len(response.json()["peaks"]) == 64


def _write_tmp(payload: bytes):
    import tempfile

    handle = tempfile.NamedTemporaryFile(suffix=".wav", delete=False)
    handle.write(payload)
    handle.close()
    return Path(handle.name)
