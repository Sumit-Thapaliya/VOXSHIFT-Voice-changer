/**
 * Client for the VOXSHIFT CPU engine (backend/app).
 *
 * Requests go through the Next.js `/engine` rewrite by default, which keeps the
 * browser on the same origin (no CORS and no mixed-content problems in hosted
 * previews). A custom absolute URL can be configured in Settings.
 *
 * Every call is optional: when the engine is offline the Studio falls back to
 * the local Web Audio DSP in `lib/dsp.ts`.
 */

import type { VoiceChain } from './dsp';

export type EngineState = 'checking' | 'online' | 'offline';

export type EngineHealth = {
  status: string;
  engine: string;
  version: string;
  spec_version: string;
  mode: string;
  gpu_required: boolean;
  model_free: boolean;
  uptime_seconds: number;
  cpu_count: number;
  worker_threads: number;
  formats: { native: string[]; with_ffmpeg: string[]; ffmpeg_available: boolean };
  limits: {
    max_upload_mb: number;
    max_duration_s: number;
    min_duration_s: number;
    ttl_minutes: number;
    max_jobs_queued: number;
  };
  queue: { queued: number; running: number };
  counters: Record<string, number>;
  storage: Record<string, number | string>;
  auth: { api_key_required: boolean };
};

export type EngineAnalysis = {
  duration: number;
  sample_rate: number;
  channels: number;
  peak_dbfs: number;
  rms_dbfs: number;
  lufs: number;
  dynamic_range_db: number;
  noise_floor_dbfs: number;
  clipping_ratio: number;
  pitch: { low_hz: number; median_hz: number; high_hz: number; range_semitones: number; median_note: string };
  spectrum: { centroid_hz: number; low_ratio: number; mid_ratio: number; high_ratio: number; air_ratio: number };
  voiced_ratio: number;
  profile: { register: string; tone: string; cleanliness: string; delivery: string; expression: string; summary: string };
  recommendations: { preset_id: string; label: string; intensity: number; reason: string }[];
  waveform?: number[];
};

export type RenderJob = {
  job_id: string;
  kind?: string;
  state: 'queued' | 'running' | 'done' | 'failed' | 'cancelled' | 'expired';
  progress: number;
  stage: string;
  message?: string | null;
  duration_ms?: number | null;
  voice_name?: string | null;
  preset_id?: string | null;
  metrics?: { duration?: number; peak_dbfs?: number; lufs?: number; rms_dbfs?: number; noise_floor_dbfs?: number; clipping_ratio?: number } | null;
  audio_url?: string;
  expires_at?: string | null;
  modules?: { module: string; label: string; value: number; unit: string }[];
};

export type SavedVoice = {
  id: string;
  name: string;
  description?: string | null;
  color: string;
  tags: string[];
  chain: VoiceChain;
  archetype_id?: string | null;
  render_count: number;
  created_at: string;
  updated_at: string;
};

export type SavedProject = {
  id: string;
  name: string;
  source_name?: string | null;
  source_seconds?: number | null;
  chain: VoiceChain;
  intensity: number;
  preset_id?: string | null;
  notes?: string | null;
  render_ids: string[];
  created_at: string;
  updated_at: string;
};

export type EngineOverrides = { baseUrl?: string; apiKey?: string };

const STORAGE_KEY = 'voxshift.engine';

let overrides: EngineOverrides = {};

export function loadEngineOverrides(): EngineOverrides {
  if (typeof window === 'undefined') return {};
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    overrides = raw ? (JSON.parse(raw) as EngineOverrides) : {};
  } catch {
    overrides = {};
  }
  return overrides;
}

export function saveEngineOverrides(next: EngineOverrides): void {
  overrides = next;
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    /* storage disabled: keep the in-memory value */
  }
}

/** Default `/engine` uses the Next.js rewrite, i.e. the same origin. */
export function engineBaseUrl(): string {
  const configured = overrides.baseUrl?.trim();
  if (!configured) return '/engine';
  return configured.replace(/\/$/, '');
}

function headers(extra?: Record<string, string>): Record<string, string> {
  return { ...(overrides.apiKey ? { 'X-API-Key': overrides.apiKey } : {}), ...(extra || {}) };
}

async function request<T>(path: string, init?: RequestInit & { timeoutMs?: number }): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), init?.timeoutMs ?? 20000);
  try {
    const response = await fetch(`${engineBaseUrl()}${path}`, {
      ...init,
      headers: headers(init?.headers as Record<string, string> | undefined),
      signal: controller.signal,
    });
    if (!response.ok) {
      let detail = `The engine returned ${response.status}.`;
      try {
        const payload = await response.json();
        if (payload?.detail) detail = typeof payload.detail === 'string' ? payload.detail : JSON.stringify(payload.detail);
      } catch {
        /* keep the default message */
      }
      throw new Error(detail);
    }
    const type = response.headers.get('content-type') || '';
    if (type.includes('application/json')) return (await response.json()) as T;
    return (await response.blob()) as unknown as T;
  } finally {
    clearTimeout(timeout);
  }
}

export async function getHealth(): Promise<EngineHealth> {
  return request<EngineHealth>('/api/health', { timeoutMs: 4000 });
}

export async function getPresets(): Promise<{
  spec_version: string;
  effects: { id: string; label: string; chain: Record<string, unknown> }[];
  archetypes: { id: string; label: string; chain: Record<string, unknown> }[];
}> {
  return request('/api/presets');
}

export async function analyzeFile(file: File | Blob, name = 'audio.wav'): Promise<EngineAnalysis> {
  const form = new FormData();
  form.append('file', file, name);
  form.append('sample_rate', '');
  form.append('with_waveform', 'true');
  form.append('peaks', '220');
  return request<EngineAnalysis>('/api/analyze', { method: 'POST', body: form, timeoutMs: 120000 });
}

export type RenderOptions = {
  chain?: VoiceChain;
  presetId?: string;
  archetypeId?: string;
  intensity?: number;
  name?: string;
  bitDepth?: 16 | 24;
  sampleRate?: number;
  kind?: 'render' | 'polish';
  polish?: Record<string, unknown>;
  onProgress?: (job: RenderJob) => void;
};

export async function startJob(file: File | Blob, name: string, options: RenderOptions): Promise<RenderJob> {
  const form = new FormData();
  form.append('file', file, name);
  const path = options.kind === 'polish' ? '/api/polish' : '/api/render';
  if (options.kind === 'polish') {
    form.append('options', JSON.stringify(options.polish || {}));
  } else {
    if (options.presetId) form.append('preset_id', options.presetId);
    if (options.archetypeId) form.append('archetype_id', options.archetypeId);
    if (options.chain) {
      const { master, ...modules } = options.chain;
      form.append('chain', JSON.stringify({ ...modules, master: master || {} }));
    }
    form.append('intensity', String(options.intensity ?? 75));
    if (options.name) form.append('name', options.name);
    form.append('bit_depth', String(options.bitDepth ?? 16));
    if (options.sampleRate) form.append('sample_rate', String(options.sampleRate));
  }
  return request<RenderJob>(path, { method: 'POST', body: form, timeoutMs: 180000 });
}

export async function getJob(jobId: string): Promise<RenderJob> {
  return request<RenderJob>(`/api/render/${jobId}`);
}

export async function waitForJob(jobId: string, onProgress?: (job: RenderJob) => void, timeoutMs = 300000): Promise<RenderJob> {
  const deadline = Date.now() + timeoutMs;
  let job = await getJob(jobId);
  onProgress?.(job);
  while (!['done', 'failed', 'cancelled', 'expired'].includes(job.state)) {
    if (Date.now() > deadline) throw new Error('The engine took too long to finish this job.');
    await new Promise((resolve) => setTimeout(resolve, 350));
    job = await getJob(jobId);
    onProgress?.(job);
  }
  if (job.state !== 'done') throw new Error(job.message || `The job ended as '${job.state}'.`);
  return job;
}

export async function fetchJobAudio(jobId: string): Promise<Blob> {
  return request<Blob>(`/api/render/${jobId}/audio`, { timeoutMs: 120000 });
}

export async function cancelJob(jobId: string): Promise<void> {
  await request(`/api/render/${jobId}/cancel`, { method: 'POST' });
}

export async function deleteJob(jobId: string): Promise<void> {
  await request(`/api/render/${jobId}`, { method: 'DELETE' });
}

export async function listRenders(limit = 40): Promise<RenderJob[]> {
  const rows = await request<
    {
      job_id: string;
      kind: string;
      state: RenderJob['state'];
      source_name?: string;
      voice_name?: string;
      preset_id?: string;
      metrics?: RenderJob['metrics'];
      created_at: string;
      expires_at?: string;
      duration_ms?: number;
      audio_url?: string | null;
    }[]
  >(`/api/renders?limit=${limit}`);
  return rows.map((row) => ({
    job_id: row.job_id,
    kind: row.kind,
    state: row.state,
    progress: row.state === 'done' ? 100 : 0,
    stage: row.state,
    voice_name: row.voice_name,
    preset_id: row.preset_id,
    metrics: row.metrics,
    audio_url: row.audio_url || undefined,
    duration_ms: row.duration_ms,
    expires_at: row.expires_at,
  }));
}

export async function listVoices(): Promise<SavedVoice[]> {
  return request<SavedVoice[]>('/api/voices');
}

export async function saveVoice(payload: {
  name: string;
  description?: string;
  color: string;
  tags: string[];
  chain: VoiceChain;
  archetypeId?: string;
}): Promise<SavedVoice> {
  return request<SavedVoice>('/api/voices', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: payload.name,
      description: payload.description,
      color: payload.color,
      tags: payload.tags,
      chain: payload.chain,
      archetype_id: payload.archetypeId ?? null,
    }),
  });
}

export async function updateVoice(
  voiceId: string,
  payload: { name: string; description?: string; color: string; tags: string[]; chain: VoiceChain },
): Promise<SavedVoice> {
  return request<SavedVoice>(`/api/voices/${voiceId}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
}

export async function deleteVoice(voiceId: string): Promise<void> {
  await request(`/api/voices/${voiceId}`, { method: 'DELETE' });
}

export async function saveProject(payload: {
  name: string;
  sourceName?: string;
  sourceSeconds?: number;
  chain: VoiceChain;
  intensity: number;
  presetId?: string;
  notes?: string;
  renderIds?: string[];
}): Promise<SavedProject> {
  return request<SavedProject>('/api/projects', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: payload.name,
      source_name: payload.sourceName,
      source_seconds: payload.sourceSeconds,
      chain: payload.chain,
      intensity: payload.intensity,
      preset_id: payload.presetId,
      notes: payload.notes,
      render_ids: payload.renderIds || [],
    }),
  });
}

export async function listProjects(): Promise<SavedProject[]> {
  return request<SavedProject[]>('/api/projects');
}

export async function deleteProject(projectId: string): Promise<void> {
  await request(`/api/projects/${projectId}`, { method: 'DELETE' });
}

export async function getStats(): Promise<{
  records: Record<string, number>;
  counters: Record<string, number>;
  renders: { total: number; done: number; failed: number; average_render_ms: number; total_audio_seconds: number };
  storage: Record<string, number | string>;
  queue: Record<string, number>;
}> {
  return request('/api/stats');
}

export async function getEngineHistory(limit = 60): Promise<
  { id: string; action: string; kind: string; detail?: string; status?: string; duration?: number; created_at: string }[]
> {
  return request(`/api/history?limit=${limit}`);
}

export async function runCleanup(): Promise<Record<string, number>> {
  return request('/api/maintenance/cleanup', { method: 'POST' });
}

export async function randomizeOnEngine(seed: number, drama: number): Promise<{ chain: VoiceChain }> {
  return request(`/api/presets/randomize?seed=${seed}&drama=${drama}`, { method: 'POST' });
}

export function blobName(base: string, extension = 'wav'): string {
  const clean = base.replace(/[^a-z0-9-_ .]/gi, '').trim() || 'voxshift';
  return `${clean}.${extension}`;
}
