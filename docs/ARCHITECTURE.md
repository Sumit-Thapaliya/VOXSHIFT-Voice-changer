# Architecture

VOXSHIFT is two cooperating halves plus one shared spec file.

```
                    shared/voice-presets.json
                    (effects, archetypes, defaults, ranges)
                              │
        scripts/sync_presets.py copies it to both halves
                    ┌─────────┴─────────┐
                    ▼                   ▼
        backend/app/data/       frontend/lib/
                    │                   │
     ┌──────────────┴───┐    ┌──────────┴─────────┐
     │  VOXSHIFT Engine │    │  VOXSHIFT Studio   │
     │  FastAPI + numpy │◀───│  Next.js 15 client │
     └──────────────────┘    └────────────────────┘
              ▲                          │
              └────── lib/engine.ts ─────┘   (browser DSP fallback in lib/dsp.ts)
```

## The one design rule

**Everything must be useful with the engine switched off.**

The browser owns a complete implementation of the same voice chain (`frontend/lib/dsp.ts`).
When the engine is reachable, renders are faster and are the ones that get stored; when it
is not, the Studio still designs, previews, renders, analyses and downloads. Nothing in the
UI ever claims a result it cannot deliver: the status strip says `CPU ENGINE` or
`BROWSER DSP`, and the analysis modal reports whichever engine produced the numbers.

This is also why the reference-voice/cloning workflow was removed: it required a GPU and a
pretrained model, which violates the "runs anywhere, no downloads" rule. The Voice Forge
replaces it with a parametric design that the same DSP implements on both sides.

## Engine (backend)

```
main.py ──▶ routers ──▶ services/engine.py ──▶ dsp/chain.py ──▶ dsp/*
   │           │              │                    │
   │           │              │                    └─ wavio · filters · spectral · dynamics
   │           │              │                       effects · analysis · master
   │           │              └─ services/db.py (SQLite: renders, voices, projects, activity)
   │           └─ schemas.py (pydantic)  deps.py (DI)
   └─ config.py (every limit and path; nothing is hard-coded elsewhere)
```

* **Job model** — `POST /api/render` writes a `queued` row and submits work to a
  `ThreadPoolExecutor` sized by `VOXSHIFT_WORKERS`. Workers report progress through the same
  row, so a client can poll at any time. A background thread expires old jobs and deletes
  their files.
* **Storage** — SQLite (`data/voxshift.sqlite3`) for metadata; uploaded takes and finished
  WAVs live in `data/uploads` and `data/renders` and are deleted when the job expires.
* **DSP modules** — pure functions over `float32` arrays shaped `(frames, channels)`.
  They are deliberately stateless, so the same code paths serve a single 2 s clip and a
  5 minute take, and the tests can call them directly.
* **No optional dependencies at runtime** — `requirements.txt` is numpy + FastAPI stack.
  ffmpeg is detected (`formats.ffmpeg_available`) but never required: the engine reads and
  writes WAV itself (`dsp/wavio.py`), including 24-bit packing and linear resampling.

### The pipeline

```
dc_block → highpass → lowpass → pitch/formant → body → presence → air
        → gate → de-ess → compressor → warmth → growl → ring → vibrato → breath
        → echo → reverb → trim silence → loudness normalise + limiter → gain → fades
```

Stage names are reported live (`Shifting`, `Character`, `Mastering`, …) and the finished
job's `metrics.stages` records exactly which processors ran, so a render can be explained
after the fact.

### Pitch and formant shifting

The interesting part, and the reason no model is needed (`dsp/spectral.py`):

1. **Phase-vocoder time stretch** by `r = 2^(semitones/12)`.
   * Peaks in each frame are found and their instantaneous frequency is the
     magnitude-squared weighted mean of the ±2 neighbouring bins — that is what keeps an
     off-bin partial exactly on pitch instead of drifting a whole bin.
   * Non-peak bins keep their phase relationship to their peak (identity phase locking),
     which removes the "phasey" quality of a free-running vocoder.
2. **Envelope warp** inside the same STFT loop: the harmonic-peak envelope ("true
   envelope") is sampled one factor higher and divided out of the magnitude spectrum, so the
   formants move by `formant − semitones` semitones *relative to the pitch shift*.
3. **Resample** back by `r`, restoring the original duration and moving the pitch by `r`.

Measured accuracy: 0.01 % on off-bin test tones for every interval from −12 to +12 semitones;
formant changes leave the fundamental within 3 Hz.

### Denoise, dynamics, metering

* **Denoise** — decision-directed Wiener gain with a bias-compensated, frequency-smoothed
  noise profile; gain smoothing in time and frequency keeps the overlap-add stable
  (≈ −18 dB in the gaps, ≈ 0.6 dB of speech loss at 75 %).
* **Limiter** — a sliding-minimum lookahead pulls the gain down before a peak arrives, then
  it releases slowly; the applied gain is clamped to the instantaneous requirement, so the
  ceiling is a guarantee, not an approximation.
* **Loudness** — ITU-R BS.1770 K-weighting, 400 ms blocks with the −70 LUFS absolute gate
  and −10 LU relative gate, then up to three gain/limit passes so the delivered level is
  within 0.2 LU of the requested target (every preset measures −16.0).
* **Analysis** — autocorrelation pitch tracking with a voicing gate on 40 ms frames,
  block-RMS noise floor (quietest 10 % of 100 ms blocks), band-energy balance, crest factor,
  and a profile/summary built only from those measurements.

## Studio (frontend)

* **Routing** — seven static routes; `/custom-voice` is a permanent redirect. Nav, command
  palette, notifications and help copy all describe the current feature set.
* **State** — one React context (`components/providers.tsx`): the active chain, intensity,
  saved voices, workspace/history, preferences (persisted), render jobs, engine health and
  the global audio player. Components stay presentational.
* **Two engines, one interface** — `lib/dsp.ts` (Web Audio, offline rendering) and
  `lib/engine.ts` (HTTP client) expose the same operations: `renderVoice`, `polishAudio`,
  `previewVoice`, `analyse`. `providers.tsx` picks the engine per call and falls back
  transparently.
* **Proxy** — `next.config.ts` rewrites `/engine/:path*` to `ENGINE_URL` so the browser
  never needs CORS. Settings can override the target and API key per user.
* **Styling** — the original design system in `app/globals.css` and `app/pages.css`;
  `app/forge.css` adds only the Voice Forge, the engine strip, output metrics and the
  analysis modal. Motion respects `preferences.motion`.

## Shared spec

`shared/voice-presets.json` holds `spec_version`, `defaults`, `ranges`, `master_defaults`,
16 `effects` and 8 `archetypes`. Each preset is a flat map of module values, which both
implementations read identically, so a design forged in the browser sounds the same when the
engine renders it. `scripts/sync_presets.py --check` fails the build if the three copies
drift apart (a pytest also asserts it).
