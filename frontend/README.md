# VOXSHIFT Studio — frontend

The Next.js 15 application that drives VOXSHIFT: seven pages, a browser-resident DSP
engine, and an optional connection to the Python CPU engine in `../backend`.

## Run locally

```bash
npm install
npm run dev            # http://localhost:3000 (bound to 0.0.0.0 for proxied previews)
```

```bash
npm run typecheck      # tsc --noEmit
npm run build          # production build (8 routes, all static)
npm start              # serve the production build
```

The dev server reports every page as static; the only dynamic work happens in the browser
and against the engine API.

## Pages

- **Studio** (`/`, `/studio`) — 10 quick voices, animated orb, upload or record a take, real
  waveform scrubbing, trim, render, A/B against the original, WAV download. Renders through
  the engine when it is online and through the browser DSP when it is not.
- **Voice Forge** (`/voice-forge`) — the flagship page. 15 modules + 3 fine controls in five
  groups, 8 archetypes, dice roller with a drama dial, live chain summary, "Analyse my
  audio" (pitch, register, loudness, noise floor, band balance, recommendations), and saved
  voices with rename/duplicate/delete.
- **Voice Library** (`/voice-effects`) — 16 built-in voices, the 8 archetypes (*Forged*) and
  your saved voices (*Mine*), with preview, intensity and "use in studio".
- **Creations** (`/creations`) — session renders: play, download, rename, favourite, delete.
- **History** (`/history`) — session activity plus engine history, filters, CSV export.
- **Settings** (`/settings`) — loudness target, denoise/trim defaults, motion and theme,
  privacy, and the CPU engine panel (status, URL, API key, endpoint reference).
- **`/custom-voice`** — permanent redirect to `/voice-forge` (the cloning workflow was
  removed; old links still work).

## How it talks to the engine

```
browser ──/engine/*──▶ Next.js rewrite ──▶ ENGINE_URL (default http://127.0.0.1:8000)
```

* `next.config.ts` rewrites `/engine/:path*` to the engine, so the browser stays on one
  origin: no CORS, no mixed content, and hosted previews work unchanged.
* `lib/engine.ts` is the typed client. Every call is optional — `lib/dsp.ts` is a complete
  Web Audio implementation of the same voice chain, so the Studio still renders, previews
  and analyses with the engine switched off.
* Settings can override the engine URL and API key at runtime (stored in `localStorage`).

## Design system

- `app/globals.css` — the original design system (tokens, layout, components).
- `app/pages.css` — the page-level additions.
- `app/forge.css` — the Voice Forge, engine status strip, metrics and analysis modal.
- Tailwind + Radix primitives for the interactive pieces; GSAP and framer-motion for the
  orb, waveform and panel transitions (`preferences.motion` disables them).

## Tests

```bash
node tests/interaction-tests.cjs      # Playwright, needs the API + dev server running
```

The suite walks the real flows in a headless browser: quick voices, Forge sliders and
archetypes, a full render, WAV download, playback, A/B compare, saving a voice, the library
categories, settings, and the mobile layout — and fails on any uncaught page error.
Screenshots land in `tests/screenshots/`, results in `tests/test-results.json`.

## Environment

| Variable | Default | Meaning |
| --- | --- | --- |
| `ENGINE_URL` | `http://127.0.0.1:8000` | target of the `/engine/*` rewrite |
| `NEXT_BUILD_DIR` | `.next` | build output directory |
| `PORT` | `3000` | dev/production port |
