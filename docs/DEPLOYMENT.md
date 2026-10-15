# Deployment

VOXSHIFT is one static-ish Next.js app and one small FastAPI process. Everything below runs
on a CPU-only box; nothing needs a GPU, a paid API, or an internet connection at runtime.

## 1. Local, both halves

```bash
./scripts/dev.sh                 # engine :8000 + studio :3000
./scripts/dev.sh                 # ENGINE_PORT=8010 STUDIO_PORT=3010 ./scripts/dev.sh
```

## 2. Production on one machine

```bash
# engine
cd backend
python3 -m venv .venv && . .venv/bin/activate
pip install -r requirements.txt
VOXSHIFT_WORKERS=4 python3 -m uvicorn app.main:app --host 127.0.0.1 --port 8000

# studio
cd frontend
npm ci && npm run build
ENGINE_URL=http://127.0.0.1:8000 npm start        # :3000
```

Put nginx/Caddy in front for TLS and a hostname; the studio needs no special headers
because the browser only ever talks to the studio origin.

## 3. Docker Compose (both services)

```bash
docker compose up --build          # studio :3000, engine :8000, data in a named volume
```

* `ENGINE_URL=http://engine:8000` inside the compose network is what the studio's
  `/engine/*` rewrite targets.
* Uploads and renders live in the `engine-data` volume and are deleted when jobs expire.

To serve **both** from a single container: build the studio with a static export, copy the
result into `backend/static/`, and the engine mounts it at `/` (see `app/main.py`) while
serving `/api/*` itself. In that setup set `ENGINE_URL=""` so the studio's rewrite is not
needed — or simply point the studio at the same origin.

## 3b. Hosted: Studio on Vercel + engine on Render

Both halves are deployable to free tiers, but **not both on the same host**:

| Half | Host | Why |
| --- | --- | --- |
| Studio (Next.js) | Vercel / Netlify | static + serverless, exactly what it is built for |
| Engine (FastAPI + numpy) | Render / Railway / Fly / VPS | long-lived process with a job queue, worker threads and a SQLite file |

**No config files are required** — `render.yaml` is a convenience for Render's Blueprint
flow and there is deliberately **no `vercel.json`** (Vercel parses that filename strictly,
so a comment-only file there breaks the build). Everything below can be done by clicking
through the two dashboards.

### Studio on Vercel (works on its own, no engine)

The Studio alone is fully functional — it falls back to the browser DSP (`lib/dsp.ts`), so
you can deploy it today with zero configuration:

1. Push the repo to GitHub, then Vercel → **Add New → Project** → import it.
2. **Root Directory: `frontend`**.
3. Framework preset **Next.js** (auto-detected). Build `npm run build`. Install/Output: leave default.
4. Deploy. The status chip reads `BROWSER DSP` — accurate, not degraded.

Nothing else is needed: no env vars, no API keys, no database, no `vercel.json`.

### Engine on Render — dashboard, without the blueprint

1. Render → **New → Web Service** → connect the repo.
2. **Root Directory:** `backend`  ·  **Runtime/Language:** Python 3
3. **Build Command:** `pip install -r requirements.txt`
4. **Start Command:** `python -m uvicorn app.main:app --host 0.0.0.0 --port $PORT`
5. **Instance type:** Free. **Health Check Path:** `/api/health`
6. Environment (optional but recommended on the 512 MB free instance):
   `VOXSHIFT_WORKERS=1`, `VOXSHIFT_MAX_DURATION_S=180`, `VOXSHIFT_TTL_MINUTES=120`
7. Create. Copy the URL it gives you (`https://something.onrender.com`).

Alternatively use **New → Blueprint** and Render reads the included `render.yaml`, which
sets all of the above for you (it validates against Render's official schema; delete the
file if you'd rather not have it in the repo — manual deploys are unaffected either way).

### Point the Studio at the engine

In the deployed Studio open *Settings → CPU engine*, paste the Render URL into **Engine
URL**, and press **Save & test** — the chip turns `CPU ENGINE ONLINE`. That setting is
stored per browser. To do it for everyone, add `ENGINE_URL=https://…onrender.com` in
Vercel → Settings → Environment Variables and redeploy: `/engine/*` is then proxied
server-side (no CORS involved), and the engine's own docs appear at
`https://your-studio.vercel.app/engine/docs`.

Notes:

* The engine's CORS defaults already allow `*.vercel.app`, `*.onrender.com`,
  `*.netlify.app`, `*.railway.app`, `*.fly.dev`, `*.pages.dev` and localhost, so a split
  deployment works out of the box. Tighten `VOXSHIFT_CORS_ORIGINS` for a private setup.
* Render's free instance sleeps after 15 minutes idle; the first request afterwards takes
  ~30 s to wake. Until it answers, the Studio quietly uses the browser DSP.
* Nothing in the engine needs a paid service, a database add-on or object storage: uploads,
  renders and the SQLite file live on its own disk and are deleted when jobs expire.
* Saved voices also live in the Studio's `localStorage`, so an ephemeral engine disk loses
  nothing you cannot re-create.

### What cannot be hosted on Vercel

The *engine* must not go to Vercel: serverless functions are short-lived with an ephemeral
filesystem, so there is no long-lived job queue, no persistent worker threads, no SQLite
file, and `pip install numpy` would run on every cold start. Vercel is the right home for the
Studio; the engine wants a container or web service (Render, Railway, Fly, a $5 VPS, or the
machine you are sitting at).

## 4. Any cheap VPS / Raspberry Pi

The engine's footprint is numpy. On a 2-core box the presets render at 2.8×–18.6× real time
(30 s stereo @ 44.1 kHz), so a small instance comfortably handles single-user work.
Useful knobs:

| Knob | Effect |
| --- | --- |
| `VOXSHIFT_WORKERS=1` | one render at a time, lowest memory |
| `VOXSHIFT_MAX_DURATION_S=120` | cap long jobs |
| `VOXSHIFT_TTL_MINUTES=60` | free disk sooner |
| `VOXSHIFT_QUEUE_LIMIT=4` | shed load with HTTP 429 instead of queueing forever |

Reverse-proxy tip: allow `300 s` read timeouts for `POST /api/render` on very long clips,
and cap request bodies at the same size as `VOXSHIFT_MAX_UPLOAD_MB`.

## 5. Hardening checklist

* [ ] Set `VOXSHIFT_API_KEY` and put it in the studio's Settings → CPU engine panel
      (it is sent as `X-API-Key`, and `/api/health` stays public for monitoring).
* [ ] Restrict `VOXSHIFT_CORS_ORIGINS` to your studio's origin if you expose the engine
      directly; behind the studio proxy you can leave it empty.
* [ ] Run the engine as an unprivileged user (the Dockerfile already does).
* [ ] Schedule `POST /api/maintenance/cleanup` (or rely on the built-in sweep, every 15 min).
* [ ] Back up nothing: the engine stores only temporary uploads, renders and your saved
      voice definitions. Export `data/voxshift.sqlite3` if you want to keep the voices.

## 6. Verifying a deployment

```bash
curl -s "$STUDIO/engine/api/health" | python3 -m json.tool | head -20   # proxied engine
curl -s -X POST "$STUDIO/engine/api/render" -F file=@take.wav \
     -F preset_id=deep -F intensity=70                                  # -> 202 + job_id
cd frontend && node tests/interaction-tests.cjs                         # full browser pass
```

The end-to-end suite is engine-aware: with the engine down it exercises the browser DSP
fallback and still expects every flow to complete.

## 7. Removing things again

If you ever need to strip the engine out of a deployment entirely, delete `backend/`, drop
the `rewrites()` block from `frontend/next.config.ts`, and set `preferServer` off in
Settings. The studio keeps working: `lib/dsp.ts` is the whole voice chain in the browser.
