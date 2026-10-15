# VOXSHIFT

**A voice design studio that runs entirely on a CPU.**

VOXSHIFT turns a recording of your voice into a different *character* — robot, monster,
narrator, late-night DJ — using deterministic signal processing. There is no GPU, no
pretrained model, no cloud service, and no voice cloning. You design a voice by shaping
real DSP modules (pitch, formants, tone, dynamics, character, space), you hear it apply
to your own speech, and you keep the result as a WAV.

```
┌──────────────────────────┐        ┌────────────────────────────┐
│  VOXSHIFT Studio (Next)  │  /engine │  VOXSHIFT Engine (FastAPI) │
│  browser DSP fallback    │ ───────▶ │  numpy DSP, SQLite, WAV I/O│
│  design · analyse · play │ ◀─────── │  pitch · formant · polish  │
└──────────────────────────┘        └────────────────────────────┘
```

Both halves are self-contained and either half alone is useful:

* the **Studio** is fully functional on its own (Web Audio DSP in the browser),
* the **Engine** is a documented HTTP API you can drive from a script, and makes
  renders several times faster than real time on a laptop CPU.

---

## Quick start

You need **Node.js 18+**. Python 3.10+ is only needed for the engine (the faster render
path); the Studio runs without it.

### Easiest: one command

```bash
# macOS / Linux
cd voxshift
./scripts/dev.sh                 # engine :8000 + studio :3000
```

```powershell
# Windows (PowerShell, in the extracted folder)
.\scripts\dev.ps1
```

Open <http://localhost:3000>. Stop everything with Ctrl-C. The script installs the frontend
packages and the engine packages on its first run.

### Just the Studio (no Python at all)

```bash
cd voxshift/frontend
npm install
npm run dev
```

Open <http://localhost:3000>. Everything works — designing, previewing, rendering,
analysing, downloading — using the browser DSP engine. The header chip reads `BROWSER DSP`.

### Both halves, by hand (any OS)

```bash
# terminal 1 — the engine (needs Python 3.10+)
cd voxshift/backend
python3 -m pip install -r requirements.txt        # Windows: python -m pip install ...
python3 -m uvicorn app.main:app --port 8000       # Windows: python -m uvicorn ...

# terminal 2 — the Studio
cd voxshift/frontend
npm install
npm run dev
```

Both run at once; the Studio finds the engine automatically. When it is up the header chip
reads `CPU ENGINE ONLINE` and renders get noticeably faster.

### Checking it is healthy

```bash
curl http://localhost:8000/api/health      # {"status":"online","mode":"cpu-dsp",...}
```

Interactive engine docs: <http://localhost:8000/docs>.

### Poking at it without a microphone

The repo ships demo takes you can drop straight into the upload box:

```
frontend/public/audio/sample.wav       12.8 s of speech
frontend/public/audio/demo-robot.wav   demo tracks used by My Creations
frontend/public/audio/demo-deep.wav
frontend/public/audio/demo-radio.wav
```

Recording from the mic also works locally — browsers allow microphone access on
`http://localhost` without HTTPS.

### Troubleshooting

| Symptom | Fix |
| --- | --- |
| `python3: command not found` | Install Python 3.10+ (python.org). On Windows use `python` or `py` instead of `python3`. |
| Engine chip stays `OFFLINE` | The engine isn't running, or it's on another port/address. Start it, or paste its URL in *Settings → CPU engine*. |
| Port already in use | `ENGINE_PORT=8010 STUDIO_PORT=3010 ./scripts/dev.sh`, or `.\scripts\dev.ps1 -StudioPort 3010`. |
| `npm install` fails behind a proxy | Set `npm config set proxy …` / `npm config set https-proxy …` first. |
| PowerShell blocks the script | `powershell -ExecutionPolicy Bypass -File .\scripts\dev.ps1` |
| Nothing renders / silent output | Upload a WAV (16/24/32-bit PCM). The Studio also records straight from the mic. |
| Editor shows `Cannot find module '@/components/...'` | Two causes: (1) `node_modules` missing — run `npm install` inside `frontend`; (2) files left over from an older copy — extracting a zip over an existing folder never deletes files that are absent from the archive, so delete the whole folder and extract again. Then VS Code: `Ctrl+Shift+P` → *TypeScript: Restart TS Server*. |
| A file the README says does not exist, exists | Same cause: stale leftovers from extracting over an older copy. `frontend/app/custom-voice/` for example was removed on purpose (the URL redirects). Delete the folder and re-extract cleanly. |


---

## What you can do with it

| Page | What it does |
| --- | --- |
| **Studio** (`/`) | Pick one of 10 quick voices, drop in a WAV or record a take, render it, A/B against the original, download it. Falls back to the browser DSP when the engine is offline. |
| **Voice Forge** (`/voice-forge`) | The replacement for reference-voice cloning. 15 modules + 3 fine controls across 5 groups, 8 archetypes, a randomiser with a drama dial, live chain summary, "Analyse my audio", and named voices you can keep. |
| **Voice Library** (`/voice-effects`) | 16 built-in voices, the 8 forged archetypes and your own saved voices in one place, with preview and intensity. |
| **Creations** (`/creations`) | Everything you have rendered this session: play, download, rename, favourite, delete. |
| **History** (`/history`) | Activity log with filters and CSV export, plus the engine's own render history when it is connected. |
| **Settings** (`/settings`) | Loudness target, denoise/trim defaults, motion and theme, privacy, and the CPU engine panel (status, URL, API key, endpoint list). |

### The Voice Forge, honestly

Cloning a specific person's voice needs a trained model and a GPU. The Forge does the
opposite: it *re-shapes the voice you already have*.

| Module group | What is really happening |
| --- | --- |
| Identity | Phase-vocoder pitch shifting with independent formant control (`pitch/formant → phase-vocoder stretch → resample`) |
| Tone | Low shelf, 3.2 kHz presence, high shelf — the same shapes a mastering EQ uses |
| Character | Ring modulation, vibrato, breath noise, subharmonic layering, asymmetric saturation |
| Dynamics | Noise gate (downward expander), compressor, de-esser |
| Space | Synthesised-impulse reverb and damped feedback delay |
| Master | Denoise, HP/LP, BS.1770 loudness normalisation to your target, lookahead limiter, fades |

The separate **Audio Polish** pass is a decision-directed Wiener denoiser followed by
de-essing, gating, compression, silence trim and loudness normalisation.

Measured on a 30 s stereo take (2 vCPU), and asserted by the test suite:

| Claim | Measured |
| --- | --- |
| Pitch accuracy | within 0.01 % of the requested interval (off-bin tones included) |
| Formant control | monotone and independent of pitch (fundamental stays within 3 Hz) |
| Loudness target | every one of the 24 presets lands at −16.0 ± 0.2 LUFS |
| Denoise | ≈ −18 dB of room tone removed for ≈ 0.6 dB of speech loss |
| Render speed | 2.8×–18.6× real time for 30 s stereo @ 44.1 kHz |

Run `python3 scripts/bench.py` for the table on your own machine.

---

## Layout

```
voxshift/
├── backend/            FastAPI + numpy CPU engine
│   ├── app/dsp/        the DSP: wavio, filters, spectral, dynamics, effects, analysis, chain
│   ├── app/routers/    health, catalog, audio, renders, voices, projects, activity
│   ├── app/services/   engine (jobs) and db (SQLite)
│   └── tests/          56 pytest tests (24 API + 32 DSP)
├── frontend/           Next.js 15 studio (React 19, Tailwind, Radix)
│   ├── app/            the seven pages
│   ├── components/     app shell, players, visuals, upload zone, voice glyphs
│   ├── lib/            dsp.ts (browser engine), engine.ts (API client), data.ts, audio.ts
│   └── tests/          Playwright end-to-end suite
├── shared/             voice-presets.json — the single source of truth for every preset
├── scripts/            dev.sh (macOS/Linux) · dev.ps1 (Windows) · sync_presets.py · bench.py
└── docs/               API.md · ARCHITECTURE.md · DEPLOYMENT.md
```

`shared/voice-presets.json` is copied to `backend/app/data/` and `frontend/lib/` by
`scripts/sync_presets.py` (a test fails if the three copies drift apart).

Scripts:

| Script | What it does |
| --- | --- |
| `scripts/dev.sh` / `dev.ps1` | start engine + studio together (auto-installs on first run) |
| `scripts/sync_presets.py` | `--check` verifies the three preset copies, no args copies them, `--report` summarises |
| `scripts/bench.py` | render every preset over a synthetic take and print CPU timings |

---

## Tests

```bash
cd backend && python3 -m pytest tests/ -q            # 56 tests, ~8 s
cd frontend && ./node_modules/.bin/tsc --noEmit      # type check
cd frontend && npm run build                         # production build
cd frontend && node tests/interaction-tests.cjs      # end-to-end (needs both servers)
```

The engine tests do not just check that functions run: they measure that the pitch really
moved, that the formants moved *without* the pitch moving, that the gate closes, that the
limiter never exceeds its ceiling, that loudness hits the target, that the denoiser lifts
the gaps, and that every preset renders finite audio within the length limit.

---

## Deployment

See `docs/DEPLOYMENT.md`. Two containers do the job:

```bash
docker compose up --build       # studio on :3000, engine on :8000
```

The Studio proxies `/engine/*` to the engine, so the browser only ever talks to one origin
— which is also why previews and single-container deployments work without CORS.

**Hosted, free tier:** the Studio deploys to Vercel as-is and runs entirely on the browser
DSP (no engine required, no config files needed). For engine-backed renders, deploy the
engine to Render — either by clicking through the dashboard or by using the optional
`render.yaml` blueprint — then paste its URL into *Settings → CPU engine* in the deployed
Studio. Step-by-step for both, including what Vercel cannot host: `docs/DEPLOYMENT.md`.

---

## Configuration

| Where | Variable | Default | Meaning |
| --- | --- | --- | --- |
| Engine | `VOXSHIFT_DATA_DIR` | `backend/data` | uploads, renders, SQLite file |
| Engine | `VOXSHIFT_MAX_UPLOAD_MB` | `40` | upload limit |
| Engine | `VOXSHIFT_MAX_DURATION_S` | `300` | longest clip per job |
| Engine | `VOXSHIFT_TTL_MINUTES` | `360` | how long renders are kept |
| Engine | `VOXSHIFT_WORKERS` | cores − 1 | render threads |
| Engine | `VOXSHIFT_API_KEY` | *(empty)* | when set, `X-API-Key` is required |
| Engine | `VOXSHIFT_QUEUE_LIMIT` | `32` | queued jobs before 429 |
| Studio | `ENGINE_URL` | `http://127.0.0.1:8000` | what `/engine/*` rewrites to |

The Studio's Settings page can point the browser at a different engine (absolute URL +
optional API key) without rebuilding anything.

---

## Notes

* **Audio formats**: WAV (16/24/32-bit PCM) in and out, 22.05–96 kHz. No ffmpeg needed.
* **Privacy**: uploads are written to the engine's data directory, processed locally, and
  deleted when the job expires. Nothing leaves your machine; no analytics, no accounts.
* **Accents**: the engine never guesses. Analysis reports measurements (Hz, LUFS, dBFS,
  ratios) and the UI speaks in those terms.
* Removed on purpose: the reference-voice / voice-cloning workflow, any GPU or pretrained
  model dependency, and the `/custom-voice` page (the URL still redirects to `/voice-forge`
  so old links keep working).
