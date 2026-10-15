# VOXSHIFT Engine — CPU voice DSP service

A FastAPI service that renders, analyses and masters voice audio with numpy only.
No ffmpeg, no PyTorch, no model downloads: `pip install -r requirements.txt` gives you
numpy, fastapi, uvicorn and pydantic, and that is the whole dependency list.

## Run

```bash
python3 -m pip install -r requirements.txt
python3 -m uvicorn app.main:app --host 0.0.0.0 --port 8000
```

* interactive API docs: <http://127.0.0.1:8000/docs>
* CPU story: `GET /api/health` reports `mode: "cpu-dsp"`, `gpu_required: false`,
  `model_free: true`, the core count, the queue depth and the storage figures.

## What it does

| Route | Purpose |
| --- | --- |
| `GET /api/health` | engine status, limits, queue, counters, storage |
| `GET /api/presets`, `/api/presets/{id}`, `/api/modules` | the shared preset catalogue |
| `POST /api/presets/randomize` | random voice design with a drama control |
| `POST /api/analyze` | measurements: pitch, LUFS, noise floor, band balance, profile, recommendations |
| `POST /api/waveform`, `POST /api/upload` | peak data and temporary uploads |
| `POST /api/render` | queue a render from a preset id, an archetype id or a full chain |
| `POST /api/polish` | queue the clean-up chain (denoise, de-ess, gate, comp, loudness, trim) |
| `GET /api/render/{id}` (+`/audio`, `DELETE`, `/cancel`) | job status and the finished WAV |
| `GET /api/renders`, `/api/formats` | recent jobs, supported formats |
| `GET/POST/PUT/DELETE /api/voices` | saved voice designs |
| `GET/DELETE /api/history`, `GET /api/stats` | activity log and counters |
| `POST /api/maintenance/cleanup`, `/purge` | retention housekeeping |

Full request/response documentation lives in `../docs/API.md`.

## Architecture

```
app/
├── main.py            FastAPI app, lifespan, error mapping, optional static serving
├── config.py          environment-driven settings (all limits are here)
├── schemas.py         pydantic models for every request body
├── deps.py            shared dependencies (engine, database, catalogue, API key)
├── dsp/
│   ├── wavio.py       dependency-free WAV I/O + resampling
│   ├── filters.py     biquad design, FFT convolution, shelves/peaks/tilt
│   ├── spectral.py    STFT, phase-vocoder pitch/formant shifting, Wiener denoise, de-esser
│   ├── dynamics.py    gate, compressor, saturation, subharmonic, limiter, BS.1770 loudness
│   ├── effects.py     ring modulation, vibrato, breath, echo, synthesised-IR reverb
│   ├── analysis.py    pitch tracking, spectral shape, profile and recommendations
│   ├── chain.py       VoiceChain / ModuleSet, the render pipeline, metrics
│   └── master.py      mastering helpers (limiter, LUFS, true-peak, metering)
├── routers/           health, catalog, audio, renders, voices, projects, activity
├── services/
│   ├── engine.py      thread-pool job runner, progress, retention, storage
│   └── db.py          SQLite store (renders, voices, projects, activity)
└── data/              voice-presets.json (synced from shared/)
```

The pipeline order is fixed and documented in `dsp/chain.py`:

```
dc_block → highpass → lowpass → pitch/formant → tone tilt → gate/comp/de-ess
         → character → echo → reverb → trim → loudness/limiter → gain → fades
```

## Tests

```bash
python3 -m pytest tests/ -q          # 56 tests (24 API + 32 DSP)
python3 -m pytest tests/test_dsp.py  # the DSP claims, measured
python3 ../scripts/bench.py          # timings on this machine
```

The DSP tests assert measurable outcomes — pitch accuracy to 0.01 %, formant/pitch
independence, gate behaviour, limiter ceiling, loudness target, denoiser effectiveness,
round-trip WAV accuracy — rather than just "it returned an array".

## Environment

| Variable | Default | Meaning |
| --- | --- | --- |
| `VOXSHIFT_DATA_DIR` | `backend/data` | uploads, renders, SQLite |
| `VOXSHIFT_MAX_UPLOAD_MB` | `40` | upload limit |
| `VOXSHIFT_MIN_DURATION_S` / `VOXSHIFT_MAX_DURATION_S` | `0.5` / `300` | clip length window |
| `VOXSHIFT_TTL_MINUTES` | `360` | render retention |
| `VOXSHIFT_WORKERS` | cores − 1 | render threads |
| `VOXSHIFT_QUEUE_LIMIT` | `32` | queued jobs before HTTP 429 |
| `VOXSHIFT_API_KEY` | *(empty)* | when set, requires an `X-API-Key` header |
| `VOXSHIFT_CORS_ORIGINS` / `VOXSHIFT_CORS_REGEX` | localhost + preview hosts | CORS |
| `VOXSHIFT_CLEANUP_INTERVAL_S` | `900` | background retention sweep |
