# VOXSHIFT Engine API

Base URL: `http://127.0.0.1:8000` (or whatever `/engine/*` proxies to from the Studio).
Interactive docs: `/docs` (Swagger) and `/redoc`.

Everything below is implemented and covered by `backend/tests/test_api.py`.
Authentication is off by default; set `VOXSHIFT_API_KEY` and the engine then expects an
`X-API-Key` header on every route except `/api/health`.

## Conventions

* Audio uploads are `multipart/form-data` with a `file` field. WAV (16/24/32-bit PCM) in,
  WAV out. Limits come from `/api/health`: 40 MB and 300 s by default.
* Errors are JSON: `{"detail": "..."}`.
  `400` invalid values · `404` unknown id · `409` conflict · `413` too large ·
  `415` unsupported audio (detected before a job is queued) · `422` unprocessable payload ·
  `429` queue full · `500` engine error.
* Renders are asynchronous: `POST` returns `202` with `job_id`, then poll
  `GET /api/render/{job_id}` (or stream `GET /api/render/{job_id}/audio` when it is done).
* Jobs expire after `VOXSHIFT_TTL_MINUTES` (default 6 h) and the audio file is deleted with them.

---

## Health

### `GET /api/health`

```json
{
  "status": "online",
  "engine": "VOXSHIFT Engine",
  "version": "2.0.0",
  "spec_version": "1.0",
  "mode": "cpu-dsp",
  "gpu_required": false,
  "model_free": true,
  "uptime_seconds": 128.4,
  "cpu_count": 2,
  "worker_threads": 2,
  "formats": { "native": [".wav", ".wave"], "with_ffmpeg": [], "ffmpeg_available": false },
  "limits": { "max_upload_mb": 40, "max_duration_s": 300, "min_duration_s": 0.5, "ttl_minutes": 360, "max_jobs_queued": 32 },
  "queue": { "queued": 0, "running": 0 },
  "counters": { "renders_started": 4, "renders_done": 4, "analyses": 12 },
  "storage": { "uploads_bytes": 2359296, "renders_bytes": 8123000, "data_dir": "...", "ttl_minutes": 360 },
  "auth": { "api_key_required": false }
}
```

`GET /api/stats` adds rolling counters and averages; `GET /api/formats` lists what the
engine accepts; `GET /api/jobs` lists recent jobs.

## Catalogue

| Route | Notes |
| --- | --- |
| `GET /api/presets` | `{spec_version, effects[16], archetypes[8], defaults, ranges, master_defaults}` |
| `GET /api/presets/{preset_id}` | one entry |
| `GET /api/modules` | every module with label, unit, range and default |
| `POST /api/presets/randomize?seed=42&drama=60` | deterministic random design — `{chain: {...}}` |
| `GET /api/voices/library/catalog` | the built-in voice catalogue used by the Library page |

### Two range envelopes

`ranges` in `GET /api/presets` is the **slider range** that the studio UI binds to: pitch
`-12…12` semitones, formant `-6…6`. The engine itself accepts a wider **hard envelope**
(pitch `-24…24` st, formant `-12…12` st); anything past it is **clamped, never rejected**.
So a hand-rolled request may legitimately use values the sliders do not offer:

```bash
# +18 st is applied in full; +30 st is clamped down to +24 st.
curl -X POST http://127.0.0.1:8000/api/render \
  -F file=@voice.wav \
  -F chain='{"pitch":18,"formant":0}' \
  -F intensity=100
```

Verified on a 197.3 Hz tone: 0 st → 197.31 Hz, 12 st → 394.63, 18 st → 558.05, 24 st →
789.25, 30 st → 789.25 (clamped at the ceiling). The limiter ceiling is `-1 dBFS`, so an
extreme shift can ride the limiter rather than raise the peak.

## Analysis

### `POST /api/analyze`

`multipart/form-data`: `file`, optional `sample_rate`, `with_waveform=true`, `peaks=220`.

```json
{
  "duration": 12.8, "sample_rate": 8000, "channels": 1,
  "peak_dbfs": -8.2, "rms_dbfs": -19.4, "lufs": -16.8,
  "dynamic_range_db": 41.3, "crest_factor_db": 11.2,
  "noise_floor_dbfs": -57.9, "clipping_ratio": 0.0, "dc_offset": 0.0003,
  "pitch": { "low_hz": 96.2, "median_hz": 128.8, "high_hz": 172.4, "range_semitones": 10.1, "median_note": "C3" },
  "spectrum": { "centroid_hz": 1290.4, "low_ratio": 0.31, "mid_ratio": 0.52, "high_ratio": 0.13, "air_ratio": 0.04 },
  "voiced_ratio": 0.71,
  "profile": {
    "register": "low", "tone": "warm", "cleanliness": "clean",
    "delivery": "broadcast ready", "expression": "expressive",
    "summary": "Low register (C3), warm tone, clean, broadcast ready at -16.8 LUFS."
  },
  "recommendations": [
    { "preset_id": "narrator", "label": "Narrator", "intensity": 70, "reason": "…" }
  ],
  "waveform": [0.12, 0.44, …]
}
```

Every number is measured from the file. `recommendations` may contain `preset_id: null`,
which means "run Audio Polish first" rather than a preset.

`POST /api/waveform` returns just `{peaks, duration, sample_rate, channels}`;
`POST /api/upload` stores a take and returns `{upload_id, seconds, sample_rate, channels, bytes}`.

## Rendering

### `POST /api/render` → `202`

`multipart/form-data`:

| Field | Meaning |
| --- | --- |
| `file` | the source take (required) |
| `preset_id` *or* `archetype_id` *or* `chain` | what to render; `chain` is a JSON object of module values plus an optional `master` block |
| `intensity` | 0–100, blends every module toward neutral (used with `preset_id`) |
| `name` | label stored with the job |
| `bit_depth` | `16` or `24` |
| `sample_rate` | optional resample target (8000–96000) |

```json
{ "job_id": "9f3…", "state": "queued", "status_url": "/api/render/9f3…", "audio_url": "/api/render/9f3…/audio", "expires_at": "2026-10-15T12:00:00+00:00", "voice_name": "Deep" }
```

Chain example:

```bash
curl -X POST http://127.0.0.1:8000/api/render \
  -F file=@take.wav \
  -F chain='{"modules":{"pitch":-4,"formant":-1.5,"body":45,"warmth":30,"space":20},"master":{"targetLufs":-16,"denoise":25}}' \
  -F bit_depth=24
```

### `POST /api/polish` → `202`

`multipart/form-data`: `file` plus optional `options` JSON
(`denoise`, `deess`, `gate`, `comp`, `highpassHz`, `targetLufs`, `limiterCeilingDb`,
`trimSilence`, `fadeMs`, `bit_depth`, `sample_rate`).

### Job lifecycle

```
POST /api/render ──▶ queued ──▶ running ──▶ done │ failed │ cancelled │ expired
                                    │        └──▶ GET /api/render/{id}/audio (streams the WAV)
                                    └──▶ POST /api/render/{id}/cancel
```

`GET /api/render/{job_id}`:

```json
{
  "job_id": "9f3…", "kind": "render", "state": "done", "progress": 100, "stage": "Finished",
  "duration_ms": 2310, "source_name": "take.wav", "preset_id": null, "voice_name": "Deep",
  "audio_url": "/api/render/9f3…/audio",
  "metrics": { "duration": 30.0, "peak_dbfs": -1.0, "true_peak_dbfs": -0.7, "rms_dbfs": -17.4,
               "lufs": -16.0, "dynamic_range_db": 38.2, "crest_factor_db": 16.4,
               "noise_floor_dbfs": -55.1, "clipping_ratio": 0.0, "stages": ["highpass", "pitch/formant", "…"] },
  "modules": [ { "module": "pitch", "label": "Pitch", "value": -4.0, "unit": "st" } ]
}
```

Progress stages: `Analysing` → `Cleaning` → `Shifting` → `Shaping tone` → `Dynamics` →
`Character` → `Space and time` → `Mastering` → `Finished`.

Other routes: `GET /api/renders?limit=40`, `DELETE /api/render/{job_id}`.

## Saved voices & projects

```
GET    /api/voices                 POST   /api/voices           {name, description, color, tags[], chain, archetype_id}
GET    /api/voices/{id}            PUT    /api/voices/{id}
DELETE /api/voices/{id}            POST   /api/voices/{id}/use
GET    /api/voices/{id}/modules    → the human-readable module list for that voice

GET    /api/projects               POST   /api/projects         {name, source_name, source_seconds, chain, intensity, preset_id, notes, render_ids[]}
GET    /api/projects/{id}          PUT    /api/projects/{id}    DELETE /api/projects/{id}
```

## Activity & maintenance

| Route | Notes |
| --- | --- |
| `GET /api/history?limit=60` | `[{id, action, kind, detail, status, duration, created_at}]` |
| `DELETE /api/history` | clears the activity log |
| `GET /api/stats` | render/analysis counters, averages, storage, queue |
| `POST /api/maintenance/cleanup` | expire jobs, prune rows, delete orphan files |
| `POST /api/maintenance/purge` | delete every upload and render file |

## Scripting example

```python
import requests, time

with open("take.wav", "rb") as handle:
    job = requests.post(
        "http://127.0.0.1:8000/api/render",
        files={"file": ("take.wav", handle, "audio/wav")},
        data={"preset_id": "narrator", "intensity": "70", "bit_depth": "24"},
    ).json()

while True:
    status = requests.get(f"http://127.0.0.1:8000/api/render/{job['job_id']}").json()
    if status["state"] in {"done", "failed", "cancelled", "expired"}:
        break
    time.sleep(0.3)

audio = requests.get(f"http://127.0.0.1:8000/api/render/{job['job_id']}/audio").content
open("narrator.wav", "wb").write(audio)
print(status["metrics"])
```
