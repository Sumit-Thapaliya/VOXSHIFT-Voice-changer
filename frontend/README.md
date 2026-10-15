# VOXSHIFT — Frontend Studio

A responsive, cinematic six-page voice studio based on the supplied UI reference and logo. This deliverable implements **Phase 1: frontend**, not a deployed AI voice conversion service.

## Run locally

```bash
npm install
npm run dev
```

Open the URL printed by Next.js. The development server binds to `0.0.0.0` for proxied previews.

```bash
npm run typecheck
npm run build
npm start
```

## Included pages

- **Studio** (`/` and `/studio`): 10 quick voice presets, animated voice orb, reference upload, source recording/upload, real waveform scrubbing, trim, original/output comparison, local conversion and WAV download.
- **Voice Effects** (`/voice-effects`): 16 creative presets, search, category filtering, sorting, favorites, playable previews, selected-preset inspector, and effect intensity.
- **Custom Voice** (`/custom-voice`): reference and source recording/upload, audio validation, explicit voice permission, reference profiles, transformation configuration, and an honest unavailable state for AI inference.
- **My Creations** (`/creations`): temporary session creations, search, sorting, favorites, grid/list views, rename, playback, download, and delete.
- **History** (`/history`): temporary session activity, category/date filters, detail dialogs, playback of available results, CSV export, and clear history.
- **Settings** (`/settings`): session profile, sample rate, normalization, microphone test, themes, reduced motion, privacy, session clearing, and an optional real API preset-list reachability test.

## Frontend stack

Next.js App Router, TypeScript, Tailwind CSS, shadcn-style reusable Radix components, Framer Motion, GSAP, Lucide React, WaveSurfer.js, Web Audio API, MediaRecorder API, and Zod. Fonts and supplied logo assets are served locally; there are no required external font, icon, or image CDNs.

## What actually works

Source audio can be uploaded or recorded with microphone permission. Supported formats include WAV, MP3, M4A, WebM, OGG, AAC and FLAC where the browser decoder supports them. Files are limited to 30 MB, source clips to 3 minutes, and reference samples to 5–30 seconds (10–30 seconds recommended). These frontend checks do not replace server-side validation or an assessment of speech quality.

Traditional effects are rendered locally through `OfflineAudioContext`, with playback-rate/pitch changes, ring modulation, filters, distortion, or delay as appropriate. WAV exports are real, playable, 16-bit PCM files at the selected sample rate. Trim produces a real cropped WAV. Pitch presets are **stylized DSP effects, not realistic speaker identity conversion**. Some quick previews demonstrate pitch only; full local processing happens when Convert voice is pressed.

The original demo speech and three processed demo tracks are visibly labeled in the collections and timeline. They are demonstration assets, not user inference results.

## What is intentionally unavailable

**Custom AI voice conversion is not connected.** No FastAPI server, PyTorch model, GPU worker, pretrained weights, or AI inference service is included or running. The frontend never returns a fake successful AI conversion. Custom voice controls are configuration UI only. Saving a reference stores a temporary reference profile, not a cloned voice.

The AI connection settings can make a real request to a user-provided backend's `GET /api/voices/presets`. A successful response means only that the preset-list endpoint is reachable; it does not verify that model inference works. CORS must allow the frontend origin.

## No database or permanent user-audio storage

There is **no database**: no PostgreSQL, SQLite, MongoDB, Prisma, IndexedDB, or localStorage persistence. User audio is held as browser-session Blob/object URLs; creations, references, activity and preferences are React in-memory state. Everything resets on page refresh or when the tab is closed. Download audio before leaving the session. Built-in sample files are static demonstration assets, not stored user recordings.

Microphone recording needs a secure browser context and permission. Embedded preview environments may disallow microphone access; the upload workflow still works. Browser codec support can vary, particularly for M4A and FLAC.

## Next phases (not implemented)

1. Separate FastAPI API with validated uploads, unique temporary IDs, in-memory jobs and configurable file cleanup.
2. Evaluate the official pretrained Seed-VC implementation, license, GPU requirements, languages and actual inference quality before deployment.
3. Load verified model weights once per inference worker, then run genuine source/reference conversions on an appropriate GPU.
4. Connect upload, reference, conversion, job-status, result and deletion endpoints. Never treat temporary in-memory job state as durable storage.
5. Implement automatic server file expiry, error handling, security and deployment configuration.

The UI follows the intended endpoint contract, but no API routes are mocked as successful inference jobs.

## Assets

- `public/logo.png` and `public/favicon.png`: cropped from the user-supplied `logo.jpg`; original included as `public/logo-original.jpg`.
- Locally served Inter and Space Grotesk fonts, under their SIL Open Font License.
- Demo speech: a 12.8-second excerpt of the Open Speech Repository's American English Harvard sentence recording, originally at https://www.voiptroubleshooter.com/open_speech/american/OSR_us_000_0010_8k.wav . Demonstration use only; review source terms for redistribution in a deployed product.
- Demo Robot, Deep and Radio WAVs are local DSP transformations of that excerpt.

## Accessibility

Keyboard-operable controls, Radix focus-managed dialogs and tooltips, meaningful labels, focus states, and reduced-motion handling. The Studio switches to a compact layout on shorter desktop screens, using its built-in transport controls instead of the extra bottom player. `Space` toggles audio playback when focus is outside form controls; `Cmd/Ctrl + K` opens workspace search.

## Verification

The optimized production build and TypeScript checks pass. An automated Playwright suite covers 27 functional and responsive checks, including a genuine WAV export, MediaRecorder capture, permission-gated reference profiles, honest AI-unavailable behavior, navigation, theme changes, and session reset on refresh. The suite is in `tests/interaction-tests.cjs`. With a local server running, install the Playwright Chromium browser and run it with `node tests/interaction-tests.cjs`.
