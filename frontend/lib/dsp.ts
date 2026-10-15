/**
 * VOXSHIFT local DSP engine (browser).
 *
 * This is the same voice-design pipeline as the Python engine in `backend/`,
 * implemented on Float32Array so the Studio keeps working with no server at
 * all. Pitch/formant shifting uses an FFT phase vocoder; everything else is
 * filters, dynamics and a synthesised convolution reverb.
 *
 * No machine learning, no GPU, no reference-voice cloning: a voice is
 * *designed*, not imitated.
 */

export type VoiceChain = {
  pitch: number;
  formant: number;
  body: number;
  presence: number;
  air: number;
  warmth: number;
  growl: number;
  ring: number;
  ringFreq: number;
  vibrato: number;
  vibratoRate: number;
  breath: number;
  gate: number;
  comp: number;
  deess: number;
  space: number;
  echo: number;
  echoTime: number;
  master?: {
    highpassHz?: number;
    lowpassHz?: number;
    denoise?: number;
    outputGainDb?: number;
    normalize?: boolean;
    targetLufs?: number;
    limiterCeilingDb?: number;
    trimSilence?: boolean;
    fadeMs?: number;
  };
};

export type ModuleKey = keyof Omit<VoiceChain, 'master'>;

export const NEUTRAL_CHAIN: VoiceChain = {
  pitch: 0,
  formant: 0,
  body: 0,
  presence: 0,
  air: 0,
  warmth: 0,
  growl: 0,
  ring: 0,
  ringFreq: 88,
  vibrato: 0,
  vibratoRate: 5.2,
  breath: 0,
  gate: 0,
  comp: 0,
  deess: 0,
  space: 0,
  echo: 0,
  echoTime: 190,
  master: { highpassHz: 60, lowpassHz: 0, denoise: 0, outputGainDb: 0, normalize: true, targetLufs: -16, limiterCeilingDb: -1, trimSilence: false, fadeMs: 8 },
};

export const MODULE_RANGES: Record<ModuleKey, [number, number]> = {
  pitch: [-12, 12],
  formant: [-6, 6],
  body: [0, 100],
  presence: [0, 100],
  air: [0, 100],
  warmth: [0, 100],
  growl: [0, 100],
  ring: [0, 100],
  ringFreq: [30, 400],
  vibrato: [0, 100],
  vibratoRate: [3, 9],
  breath: [0, 100],
  gate: [0, 100],
  comp: [0, 100],
  deess: [0, 100],
  space: [0, 100],
  echo: [0, 100],
  echoTime: [40, 600],
};

const EPS = 1e-9;

export function chainDefaults(): VoiceChain {
  return { ...NEUTRAL_CHAIN, master: { ...NEUTRAL_CHAIN.master } };
}

export function mergeChain(partial?: Partial<VoiceChain> | null): VoiceChain {
  const base = chainDefaults();
  if (!partial) return base;
  const merged: VoiceChain = { ...base, ...partial, master: { ...base.master, ...(partial.master || {}) } };
  for (const key of Object.keys(MODULE_RANGES) as ModuleKey[]) {
    const value = Number(merged[key]);
    const [low, high] = MODULE_RANGES[key];
    merged[key] = Number.isFinite(value) ? Math.min(high, Math.max(low, value)) : base[key];
  }
  return merged;
}

/** Scale a design away from neutral, exactly like the shared intensity control. */
export function blendIntensity(chain: VoiceChain, intensity: number, defaults: VoiceChain = chainDefaults()): VoiceChain {
  const strength = Math.min(100, Math.max(0, intensity)) / 100;
  const out = mergeChain(chain);
  for (const key of Object.keys(MODULE_RANGES) as ModuleKey[]) {
    if (key === 'ringFreq' || key === 'vibratoRate' || key === 'echoTime') continue;
    const base = defaults[key];
    out[key] = base + (Number(chain[key]) - base) * strength;
  }
  return out;
}

export function randomChain(seed = Math.random() * 100000, drama = 55): VoiceChain {
  let state = Math.floor(seed) || 1;
  const random = () => {
    state = (state * 1664525 + 1013904223) % 4294967296;
    return state / 4294967296;
  };
  const normal = (spread: number) => (random() + random() + random() - 1.5) * spread;
  const chance = (probability: number) => random() < probability;
  const strength = drama / 100;
  const amount = (probability: number, scale = 1) =>
    chance(probability) ? Math.min(100, Math.max(0, 70 * strength * scale + normal(18))) : 0;
  return mergeChain({
    pitch: Math.min(12, Math.max(-12, normal(3.4) * strength)),
    formant: Math.min(6, Math.max(-6, normal(1.5) * strength)),
    body: amount(0.6),
    presence: amount(0.5),
    air: amount(0.45),
    warmth: amount(0.45, 0.9),
    growl: amount(0.25, 0.8),
    ring: amount(0.3, 0.8),
    ringFreq: Math.min(400, Math.max(30, 95 + normal(45))),
    vibrato: amount(0.3, 0.8),
    vibratoRate: Math.min(9, Math.max(3, 5.4 + normal(1.2))),
    breath: amount(0.3, 0.8),
    gate: amount(0.4),
    comp: amount(0.6),
    deess: amount(0.4),
    space: amount(0.4, 0.9),
    echo: amount(0.3, 0.8),
    echoTime: Math.min(600, Math.max(40, 200 + normal(80))),
  });
}

export function describeChain(chain: VoiceChain): { label: string; value: number; unit: string }[] {
  const labels: [ModuleKey, string, string][] = [
    ['pitch', 'Pitch', 'st'],
    ['formant', 'Formant', 'st'],
    ['body', 'Body', '%'],
    ['presence', 'Presence', '%'],
    ['air', 'Air', '%'],
    ['warmth', 'Warmth', '%'],
    ['growl', 'Growl', '%'],
    ['ring', 'Ring', '%'],
    ['vibrato', 'Vibrato', '%'],
    ['breath', 'Breath', '%'],
    ['gate', 'Gate', '%'],
    ['comp', 'Compression', '%'],
    ['deess', 'De-esser', '%'],
    ['space', 'Space', '%'],
    ['echo', 'Echo', '%'],
  ];
  const summary = labels
    .filter(([key]) => Math.abs(Number(chain[key])) > 0.5)
    .map(([key, label, unit]) => ({ label, value: Number(chain[key]), unit }));
  const denoise = Number(chain.master?.denoise || 0);
  if (denoise > 0.5) summary.push({ label: 'Denoise', value: denoise, unit: '%' });
  return summary;
}

/* ------------------------------------------------------------------ buffers */

export type AudioData = { channels: Float32Array[]; sampleRate: number };

export function toAudioData(buffer: AudioBuffer): AudioData {
  const channels: Float32Array[] = [];
  for (let index = 0; index < buffer.numberOfChannels; index += 1) {
    channels.push(new Float32Array(buffer.getChannelData(index)));
  }
  return { channels, sampleRate: buffer.sampleRate };
}

export function duration(audio: AudioData): number {
  return audio.channels[0]?.length ? audio.channels[0].length / audio.sampleRate : 0;
}

export function peakDb(signal: Float32Array): number {
  let peak = 0;
  for (let index = 0; index < signal.length; index += 1) peak = Math.max(peak, Math.abs(signal[index]));
  return 20 * Math.log10(Math.max(peak, EPS));
}

/* ---------------------------------------------------------------------- FFT */

function fftInPlace(re: Float64Array, im: Float64Array): void {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i += 1) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      [re[i], re[j]] = [re[j], re[i]];
      [im[i], im[j]] = [im[j], im[i]];
    }
  }
  for (let length = 2; length <= n; length <<= 1) {
    const angle = (-2 * Math.PI) / length;
    const wRe = Math.cos(angle);
    const wIm = Math.sin(angle);
    for (let start = 0; start < n; start += length) {
      let curRe = 1;
      let curIm = 0;
      for (let k = 0; k < length / 2; k += 1) {
        const evenRe = re[start + k];
        const evenIm = im[start + k];
        const oddRe = re[start + k + length / 2] * curRe - im[start + k + length / 2] * curIm;
        const oddIm = re[start + k + length / 2] * curIm + im[start + k + length / 2] * curRe;
        re[start + k] = evenRe + oddRe;
        im[start + k] = evenIm + oddIm;
        re[start + k + length / 2] = evenRe - oddRe;
        im[start + k + length / 2] = evenIm - oddIm;
        const nextRe = curRe * wRe - curIm * wIm;
        curIm = curRe * wIm + curIm * wRe;
        curRe = nextRe;
      }
    }
  }
}

function ifftInPlace(re: Float64Array, im: Float64Array): void {
  for (let index = 0; index < im.length; index += 1) im[index] = -im[index];
  fftInPlace(re, im);
  const scale = 1 / re.length;
  for (let index = 0; index < re.length; index += 1) {
    re[index] *= scale;
    im[index] = -im[index] * scale;
  }
}

function rfft(frame: Float64Array): { re: Float64Array; im: Float64Array } {
  const n = frame.length;
  const re = new Float64Array(n);
  const im = new Float64Array(n);
  re.set(frame);
  fftInPlace(re, im);
  const bins = n / 2 + 1;
  return { re: re.slice(0, bins), im: im.slice(0, bins) };
}

function irfft(re: Float64Array, im: Float64Array, n: number): Float64Array {
  const fullRe = new Float64Array(n);
  const fullIm = new Float64Array(n);
  const bins = re.length;
  fullRe.set(re);
  fullIm.set(im);
  for (let k = 1; k < bins - 1; k += 1) {
    fullRe[n - k] = re[k];
    fullIm[n - k] = -im[k];
  }
  ifftInPlace(fullRe, fullIm);
  return fullRe;
}

function hann(size: number): Float64Array {
  const window = new Float64Array(size);
  for (let index = 0; index < size; index += 1) window[index] = 0.5 - 0.5 * Math.cos((2 * Math.PI * index) / (size - 1));
  return window;
}

const windowCache = new Map<number, Float64Array>();
function getWindow(size: number): Float64Array {
  const cached = windowCache.get(size);
  if (cached) return cached;
  const created = hann(size);
  windowCache.set(size, created);
  return created;
}

/* --------------------------------------------------- pitch & formant shift */

function spectralEnvelope(re: Float64Array, im: Float64Array, order = 44): Float64Array {
  const bins = re.length;
  const n = (bins - 1) * 2;
  const logMagnitude = new Float64Array(bins);
  for (let index = 0; index < bins; index += 1) {
    logMagnitude[index] = Math.log(Math.hypot(re[index], im[index]) + EPS);
  }
  // Real cepstrum via a symmetric iFFT of the log spectrum.
  const fullRe = new Float64Array(n);
  const fullIm = new Float64Array(n);
  fullRe.set(logMagnitude);
  for (let k = 1; k < bins - 1; k += 1) fullRe[n - k] = logMagnitude[k];
  ifftInPlace(fullRe, fullIm);
  for (let index = order; index < n - order; index += 1) fullRe[index] = 0;
  fftInPlace(fullRe, fullIm);
  const envelope = new Float64Array(bins);
  for (let index = 0; index < bins; index += 1) envelope[index] = Math.exp(fullRe[index]);
  return envelope;
}

function warpEnvelope(
  envelope: Float64Array,
  sampleRate: number,
  factor: number,
  nFft: number,
): Float64Array {
  const bins = envelope.length;
  const logAxis = new Float64Array(bins);
  for (let index = 0; index < bins; index += 1) {
    logAxis[index] = Math.log2(Math.max((index * sampleRate) / nFft, 20));
  }
  const shift = Math.log2(factor);
  const warped = new Float64Array(bins);
  for (let index = 0; index < bins; index += 1) {
    const source = logAxis[index] - shift;
    if (source <= logAxis[0]) {
      warped[index] = envelope[0];
      continue;
    }
    if (source >= logAxis[bins - 1]) {
      warped[index] = envelope[bins - 1];
      continue;
    }
    let low = 0;
    let high = bins - 1;
    while (high - low > 1) {
      const middle = (low + high) >> 1;
      if (logAxis[middle] <= source) low = middle;
      else high = middle;
    }
    const span = logAxis[high] - logAxis[low];
    const weight = span > 0 ? (source - logAxis[low]) / span : 0;
    warped[index] = envelope[low] * (1 - weight) + envelope[high] * weight;
  }
  return warped;
}

export function pitchFormantShift(
  signal: Float32Array,
  sampleRate: number,
  semitones = 0,
  formantSemitones = 0,
  onProgress?: (value: number) => void,
): Float32Array {
  if (Math.abs(semitones) < 0.01 && Math.abs(formantSemitones) < 0.01) return signal;
  const nFft = 2048;
  if (signal.length < nFft * 2) {
    return resampleRatio(signal, Math.pow(2, semitones / 12));
  }
  const ratio = Math.pow(2, semitones / 12);
  const hop = nFft / 4;
  const synthHop = Math.max(1, Math.round(hop * ratio));
  const window = getWindow(nFft);
  const frames = 1 + Math.ceil((signal.length - nFft) / hop);
  const outLength = (frames - 1) * synthHop + nFft + 8;
  const out = new Float64Array(outLength);
  const weights = new Float64Array(outLength);
  const bins = nFft / 2 + 1;

  const expected = new Float64Array(bins);
  for (let index = 0; index < bins; index += 1) expected[index] = (2 * Math.PI * hop * index) / nFft;
  const phaseAccumulator = new Float64Array(bins);
  let previousPhase: Float64Array | null = null;
  const envelopeFactor = Math.pow(2, (formantSemitones - semitones) / 12);
  const warp = Math.abs(envelopeFactor - 1) > 0.01;

  const frame = new Float64Array(nFft);
  for (let index = 0; index < frames; index += 1) {
    const offset = index * hop;
    for (let sample = 0; sample < nFft; sample += 1) frame[sample] = (signal[offset + sample] || 0) * window[sample];
    const { re, im } = rfft(frame);
    const magnitude = new Float64Array(bins);
    const phase = new Float64Array(bins);
    for (let bin = 0; bin < bins; bin += 1) {
      magnitude[bin] = Math.hypot(re[bin], im[bin]);
      phase[bin] = Math.atan2(im[bin], re[bin]);
    }
    if (previousPhase === null) {
      for (let bin = 0; bin < bins; bin += 1) phaseAccumulator[bin] = phase[bin];
    } else {
      for (let bin = 0; bin < bins; bin += 1) {
        let delta = phase[bin] - previousPhase[bin] - expected[bin];
        delta = delta - 2 * Math.PI * Math.round(delta / (2 * Math.PI));
        phaseAccumulator[bin] += (expected[bin] + delta) * ratio;
      }
    }
    previousPhase = phase;

    if (warp) {
      const envelope = spectralEnvelope(re, im);
      const warped = warpEnvelope(envelope, sampleRate, envelopeFactor, nFft);
      for (let bin = 0; bin < bins; bin += 1) {
        magnitude[bin] *= warped[bin] / (envelope[bin] + EPS);
      }
    }

    const outRe = new Float64Array(bins);
    const outIm = new Float64Array(bins);
    for (let bin = 0; bin < bins; bin += 1) {
      outRe[bin] = magnitude[bin] * Math.cos(phaseAccumulator[bin]);
      outIm[bin] = magnitude[bin] * Math.sin(phaseAccumulator[bin]);
    }
    const rebuilt = irfft(outRe, outIm, nFft);
    const start = index * synthHop;
    for (let sample = 0; sample < nFft && start + sample < outLength; sample += 1) {
      out[start + sample] += rebuilt[sample] * window[sample];
      weights[start + sample] += window[sample] * window[sample];
    }
    if (onProgress && index % 96 === 0) onProgress(index / frames);
  }

  const stretchedLength = Math.round(signal.length * ratio);
  const stretched = new Float32Array(stretchedLength);
  for (let index = 0; index < stretchedLength; index += 1) {
    const weight = weights[index];
    stretched[index] = weight > 1e-6 ? out[index] / weight : out[index];
  }
  return resampleRatio(stretched, ratio, signal.length);
}

export function resampleRatio(signal: Float32Array, ratio: number, targetLength?: number): Float32Array {
  if (Math.abs(ratio - 1) < 1e-6 && (!targetLength || targetLength === signal.length)) return signal;
  const length = targetLength || Math.round(signal.length / ratio);
  if (length <= 1) return signal;
  const out = new Float32Array(length);
  const step = (signal.length - 1) / (length - 1 || 1);
  for (let index = 0; index < length; index += 1) {
    const position = index * step;
    const left = Math.floor(position);
    const right = Math.min(left + 1, signal.length - 1);
    const frac = position - left;
    out[index] = signal[left] * (1 - frac) + signal[right] * frac;
  }
  return out;
}

/* ------------------------------------------------------------------ filters */

type Biquad = { b0: number; b1: number; b2: number; a1: number; a2: number };

export function designBiquad(
  kind: 'lowpass' | 'highpass' | 'bandpass' | 'notch' | 'peaking' | 'lowshelf' | 'highshelf',
  sampleRate: number,
  frequency: number,
  q = 0.707,
  gainDb = 0,
): Biquad {
  const nyquist = sampleRate / 2;
  const f0 = Math.min(Math.max(frequency, 10), nyquist * 0.98);
  const amplitude = Math.pow(10, gainDb / 40);
  const w0 = (2 * Math.PI * f0) / sampleRate;
  const cos = Math.cos(w0);
  const sin = Math.sin(w0);
  const alpha = sin / (2 * Math.max(q, 0.02));
  let b0: number;
  let b1: number;
  let b2: number;
  let a0: number;
  let a1: number;
  let a2: number;
  switch (kind) {
    case 'lowpass':
      b0 = (1 - cos) / 2;
      b1 = 1 - cos;
      b2 = (1 - cos) / 2;
      a0 = 1 + alpha;
      a1 = -2 * cos;
      a2 = 1 - alpha;
      break;
    case 'highpass':
      b0 = (1 + cos) / 2;
      b1 = -(1 + cos);
      b2 = (1 + cos) / 2;
      a0 = 1 + alpha;
      a1 = -2 * cos;
      a2 = 1 - alpha;
      break;
    case 'bandpass':
      b0 = alpha;
      b1 = 0;
      b2 = -alpha;
      a0 = 1 + alpha;
      a1 = -2 * cos;
      a2 = 1 - alpha;
      break;
    case 'notch':
      b0 = 1;
      b1 = -2 * cos;
      b2 = 1;
      a0 = 1 + alpha;
      a1 = -2 * cos;
      a2 = 1 - alpha;
      break;
    case 'peaking':
      b0 = 1 + alpha * amplitude;
      b1 = -2 * cos;
      b2 = 1 - alpha * amplitude;
      a0 = 1 + alpha / amplitude;
      a1 = -2 * cos;
      a2 = 1 - alpha / amplitude;
      break;
    case 'lowshelf': {
      const root = 2 * Math.sqrt(amplitude) * alpha;
      b0 = amplitude * (amplitude + 1 - (amplitude - 1) * cos + root);
      b1 = 2 * amplitude * (amplitude - 1 - (amplitude + 1) * cos);
      b2 = amplitude * (amplitude + 1 - (amplitude - 1) * cos - root);
      a0 = amplitude + 1 + (amplitude - 1) * cos + root;
      a1 = -2 * (amplitude - 1 + (amplitude + 1) * cos);
      a2 = amplitude + 1 + (amplitude - 1) * cos - root;
      break;
    }
    default: {
      const root = 2 * Math.sqrt(amplitude) * alpha;
      b0 = amplitude * (amplitude + 1 + (amplitude - 1) * cos + root);
      b1 = -2 * amplitude * (amplitude - 1 + (amplitude + 1) * cos);
      b2 = amplitude * (amplitude + 1 + (amplitude - 1) * cos - root);
      a0 = amplitude + 1 - (amplitude - 1) * cos + root;
      a1 = 2 * (amplitude - 1 - (amplitude + 1) * cos);
      a2 = amplitude + 1 - (amplitude - 1) * cos - root;
    }
  }
  return { b0: b0 / a0, b1: b1 / a0, b2: b2 / a0, a1: a1 / a0, a2: a2 / a0 };
}

export function applyBiquad(signal: Float32Array, filter: Biquad): Float32Array {
  const out = new Float32Array(signal.length);
  let x1 = 0;
  let x2 = 0;
  let y1 = 0;
  let y2 = 0;
  for (let index = 0; index < signal.length; index += 1) {
    const x0 = signal[index];
    const y0 = filter.b0 * x0 + filter.b1 * x1 + filter.b2 * x2 - filter.a1 * y1 - filter.a2 * y2;
    out[index] = y0;
    x2 = x1;
    x1 = x0;
    y2 = y1;
    y1 = y0;
  }
  return out;
}

export function biquad(
  signal: Float32Array,
  sampleRate: number,
  kind: Parameters<typeof designBiquad>[0],
  frequency: number,
  q = 0.707,
  gainDb = 0,
): Float32Array {
  return applyBiquad(signal, designBiquad(kind, sampleRate, frequency, q, gainDb));
}

/* ---------------------------------------------------------------- dynamics */

function slidingMax(values: Float32Array | Float64Array, window: number): Float64Array {
  const size = values.length;
  const out = new Float64Array(size);
  window = Math.max(1, Math.floor(window));
  if (window === 1) {
    out.set(values);
    return out;
  }
  const blocks = Math.max(1, Math.ceil(size / window));
  const prefix = new Float64Array(blocks * window);
  const suffix = new Float64Array(blocks * window);
  for (let block = 0; block < blocks; block += 1) {
    const start = block * window;
    const end = Math.min(start + window, size);
    let running = -Infinity;
    for (let index = start; index < end; index += 1) {
      running = Math.max(running, values[index]);
      prefix[index] = running;
    }
    for (let index = end; index < start + window; index += 1) prefix[index] = running;
    running = -Infinity;
    for (let index = end - 1; index >= start; index -= 1) {
      running = Math.max(running, values[index]);
      suffix[index] = running;
    }
    for (let index = start + window - 1; index >= end; index -= 1) suffix[index] = running;
  }
  for (let index = 0; index < size; index += 1) {
    const tail = Math.min(index + window - 1, size - 1);
    out[index] = Math.max(suffix[index], prefix[tail]);
  }
  return out;
}

function boxSmooth(values: Float32Array | Float64Array, window: number): Float64Array {
  const size = values.length;
  window = Math.max(1, Math.floor(window));
  const out = new Float64Array(size);
  if (window <= 1) {
    out.set(values);
    return out;
  }
  const cumulative = new Float64Array(size + 1);
  for (let index = 0; index < size; index += 1) cumulative[index + 1] = cumulative[index] + values[index];
  for (let index = 0; index < size; index += 1) {
    const start = Math.max(0, index - window + 1);
    out[index] = (cumulative[index + 1] - cumulative[start]) / (index - start + 1);
  }
  return out;
}

function smoothGain(gain: Float64Array, sampleRate: number, attackMs: number, releaseMs: number): Float64Array {
  const fast = boxSmooth(gain, (sampleRate * Math.max(attackMs, 0.5)) / 1000);
  const slow = boxSmooth(gain, (sampleRate * Math.max(releaseMs, attackMs)) / 1000);
  const out = new Float64Array(gain.length);
  for (let index = 0; index < gain.length; index += 1) out[index] = Math.min(fast[index], slow[index]);
  return out;
}

export function gate(signal: Float32Array, sampleRate: number, amount: number): Float32Array {
  if (amount <= 0.5) return signal;
  const window = Math.max(1, Math.floor(sampleRate * 0.02));
  const power = new Float32Array(signal.length);
  for (let index = 0; index < signal.length; index += 1) power[index] = signal[index] * signal[index];
  const envelopes = slidingMax(power, window);
  const levels = new Float64Array(signal.length);
  for (let index = 0; index < signal.length; index += 1) levels[index] = 20 * Math.log10(Math.sqrt(envelopes[index]) + EPS);
  const sorted = Float64Array.from(levels).sort();
  const noiseDb = sorted[Math.floor(sorted.length * 0.12)];
  const speechDb = sorted[Math.floor(sorted.length * 0.85)];
  const margin = 2 + (amount / 100) * 14;
  const threshold = Math.min(noiseDb + margin, speechDb - 6);
  const depth = -(6 + amount * 0.42);
  const gain = new Float64Array(signal.length);
  for (let index = 0; index < signal.length; index += 1) {
    const reduction = Math.min(1, Math.max(0, (threshold - levels[index]) / 8));
    gain[index] = Math.pow(10, (reduction * depth) / 20);
  }
  const smoothed = smoothGain(gain, sampleRate, 2, 110);
  const out = new Float32Array(signal.length);
  for (let index = 0; index < signal.length; index += 1) out[index] = signal[index] * smoothed[index];
  return out;
}

export function compressor(signal: Float32Array, sampleRate: number, amount: number): Float32Array {
  if (amount <= 0.5) return signal;
  const ratio = 1 + amount / 22;
  const threshold = -20 + (amount / 100) * 6;
  const absolute = new Float32Array(signal.length);
  for (let index = 0; index < signal.length; index += 1) absolute[index] = Math.abs(signal[index]);
  const detector = slidingMax(absolute, Math.max(1, Math.floor(sampleRate * 0.005)));
  const levels = new Float64Array(signal.length);
  for (let index = 0; index < signal.length; index += 1) levels[index] = 20 * Math.log10(detector[index] + EPS);
  let overshootTotal = 0;
  const reduction = new Float64Array(signal.length);
  for (let index = 0; index < signal.length; index += 1) {
    const overshoot = Math.max(0, levels[index] - threshold);
    overshootTotal += overshoot;
    reduction[index] = overshoot * (1 - 1 / ratio);
  }
  const makeup = Math.min(12, (overshootTotal / signal.length) * (1 - 1 / ratio) * 1.2);
  const gain = new Float64Array(signal.length);
  for (let index = 0; index < signal.length; index += 1) gain[index] = Math.pow(10, (makeup - reduction[index]) / 20);
  const smoothed = smoothGain(gain, sampleRate, 6, 140);
  const out = new Float32Array(signal.length);
  for (let index = 0; index < signal.length; index += 1) out[index] = signal[index] * smoothed[index];
  return out;
}

export function deesser(signal: Float32Array, sampleRate: number, amount: number): Float32Array {
  if (amount <= 0.5 || sampleRate < 16000) return signal;
  let high = biquad(signal, sampleRate, 'highpass', 5500, 0.707);
  high = biquad(high, sampleRate, 'lowpass', 9500, 0.707);
  const absolute = new Float32Array(high.length);
  for (let index = 0; index < high.length; index += 1) absolute[index] = Math.abs(high[index]);
  const detector = slidingMax(absolute, Math.max(1, Math.floor(sampleRate * 0.004)));
  const threshold = 0.02 + (1 - amount / 100) * 0.05;
  const reduction = new Float64Array(signal.length);
  for (let index = 0; index < signal.length; index += 1) {
    const excess = Math.min(1, Math.max(0, detector[index] / threshold - 1));
    reduction[index] = 1 - excess * (0.35 + (amount / 100) * 0.45);
  }
  const openness = smoothGain(reduction, sampleRate, 1, 90);
  const out = new Float32Array(signal.length);
  for (let index = 0; index < signal.length; index += 1) out[index] = signal[index] - high[index] * (1 - openness[index]);
  return out;
}

export function breathNoise(signal: Float32Array, sampleRate: number, amount: number): Float32Array {
  if (amount <= 0.5) return signal;
  let seed = 7;
  const noise = new Float32Array(signal.length);
  for (let index = 0; index < noise.length; index += 1) {
    seed = (seed * 1664525 + 1013904223) % 4294967296;
    noise[index] = seed / 2147483648 - 1;
  }
  let shaped = biquad(noise, sampleRate, 'highpass', 1600, 0.707);
  shaped = biquad(shaped, sampleRate, 'highshelf', 4200, 0.707, 3);
  const absolute = new Float32Array(signal.length);
  for (let index = 0; index < signal.length; index += 1) absolute[index] = Math.abs(signal[index]);
  const fast = slidingMax(absolute, Math.max(1, Math.floor(sampleRate * 0.012)));
  const slow = slidingMax(absolute, Math.max(1, Math.floor(sampleRate * 0.11)));
  let maximum = 0;
  for (let index = 0; index < signal.length; index += 1) maximum = Math.max(maximum, Math.max(fast[index], slow[index] * 0.6));
  const mix = (amount / 100) * 0.75;
  const out = new Float32Array(signal.length);
  for (let index = 0; index < signal.length; index += 1) {
    const shapedLevel = Math.max(fast[index], slow[index] * 0.6) / (maximum + EPS);
    out[index] = signal[index] * (1 - mix * 0.35) + shaped[index] * shapedLevel * mix;
  }
  return out;
}

/* ---------------------------------------------------------------- creative */

export function warmDrive(signal: Float32Array, amount: number): Float32Array {
  if (amount <= 0.5) return signal;
  const drive = 1 + (amount / 100) * 6;
  const norm = Math.tanh(drive);
  const blend = 0.35 + (amount / 100) * 0.65;
  const out = new Float32Array(signal.length);
  for (let index = 0; index < signal.length; index += 1) {
    const shaped = Math.tanh(signal[index] * drive) / norm;
    out[index] = signal[index] * (1 - blend) + shaped * blend;
  }
  return out;
}

export function growl(signal: Float32Array, sampleRate: number, amount: number, fundamental = 110): Float32Array {
  if (amount <= 0.5) return signal;
  const depth = amount / 100;
  const sub = new Float32Array(signal.length);
  const grit = new Float32Array(signal.length);
  for (let index = 0; index < signal.length; index += 1) {
    const time = index / sampleRate;
    sub[index] = signal[index] * Math.sin(2 * Math.PI * (fundamental / 2) * time);
    grit[index] = Math.tanh(signal[index] * 2.5) - Math.tanh(signal[index] * 1.2) * 0.5;
  }
  const filteredSub = biquad(sub, sampleRate, 'lowpass', 220, 0.707);
  const filteredGrit = biquad(grit, sampleRate, 'bandpass', 260, 0.9);
  const out = new Float32Array(signal.length);
  for (let index = 0; index < signal.length; index += 1) {
    out[index] = signal[index] * (1 - depth * 0.25) + filteredSub[index] * depth * 1.5 + filteredGrit[index] * depth * 0.35;
  }
  return out;
}

export function ringModulate(signal: Float32Array, sampleRate: number, amount: number, frequency: number): Float32Array {
  if (amount <= 0.5) return signal;
  const mix = (amount / 100) * 0.95;
  const carrier = Math.min(400, Math.max(20, frequency));
  const out = new Float32Array(signal.length);
  for (let index = 0; index < signal.length; index += 1) {
    const modulation = Math.sin((2 * Math.PI * carrier * index) / sampleRate);
    out[index] = signal[index] * (1 - mix) + signal[index] * modulation * mix;
  }
  return out;
}

export function vibrato(signal: Float32Array, sampleRate: number, amount: number, rate = 5.2): Float32Array {
  if (amount <= 0.5) return signal;
  const maxDelay = 0.0035 * (amount / 100) * sampleRate;
  const out = new Float32Array(signal.length);
  const bound = Math.min(10, Math.max(2, rate));
  for (let index = 0; index < signal.length; index += 1) {
    const delay = (maxDelay / 2) * (1 - Math.cos((2 * Math.PI * bound * index) / sampleRate));
    const read = Math.max(index - delay, 0);
    const left = Math.floor(read);
    const right = Math.min(left + 1, signal.length - 1);
    const frac = read - left;
    out[index] = signal[left] * (1 - frac) + signal[right] * frac;
  }
  return out;
}

export function echo(signal: Float32Array, sampleRate: number, amount: number, delayMs: number, feedback = 0.3): Float32Array {
  if (amount <= 0.5) return signal;
  const delay = Math.max(1, Math.floor((sampleRate * Math.min(900, Math.max(20, delayMs))) / 1000));
  const gain = Math.min(0.62, 0.15 + (amount / 100) * 0.45);
  const wet = new Float32Array(signal.length + delay * 6);
  wet.set(signal);
  let amplitude = 1;
  for (let tap = 1; tap <= 5; tap += 1) {
    amplitude *= gain;
    if (amplitude < 0.02) break;
    const offset = delay * tap;
    if (offset >= wet.length) break;
    for (let index = offset; index < wet.length; index += 1) wet[index] += signal[index - offset] * amplitude;
  }
  const damped = biquad(wet, sampleRate, 'lowpass', 4200, 0.707);
  const mix = 0.25 + (amount / 100) * 0.45;
  const out = new Float32Array(signal.length);
  for (let index = 0; index < signal.length; index += 1) out[index] = signal[index] + (damped[index] || 0) * mix;
  return out;
}

function fftConvolve(signal: Float32Array, kernel: Float32Array): Float32Array {
  const nFft = 1 << Math.ceil(Math.log2(Math.max(2048, signal.length + kernel.length - 1)));
  const blockSize = 1 << 14;
  const spectrumSize = nFft / 2 + 1;
  const kernelRe = new Float64Array(nFft);
  kernelRe.set(kernel);
  const kernelSpec = rfft(kernelRe);
  const out = new Float32Array(signal.length + kernel.length - 1);
  for (let start = 0; start < signal.length; start += blockSize) {
    const length = Math.min(blockSize, signal.length - start);
    const frame = new Float64Array(nFft);
    for (let index = 0; index < length; index += 1) frame[index] = signal[start + index];
    const spec = rfft(frame);
    const re = new Float64Array(spectrumSize);
    const im = new Float64Array(spectrumSize);
    for (let bin = 0; bin < spectrumSize; bin += 1) {
      re[bin] = spec.re[bin] * kernelSpec.re[bin] - spec.im[bin] * kernelSpec.im[bin];
      im[bin] = spec.re[bin] * kernelSpec.im[bin] + spec.im[bin] * kernelSpec.re[bin];
    }
    const block = irfft(re, im, nFft);
    for (let index = 0; index < nFft && start + index < out.length; index += 1) out[start + index] += block[index];
  }
  return out;
}

export function reverb(signal: Float32Array, sampleRate: number, amount: number): Float32Array {
  if (amount <= 0.5) return signal;
  const rt60 = 0.6 + (amount / 100) * 1.6;
  const length = Math.floor(sampleRate * rt60);
  const impulse = new Float32Array(length);
  let seed = 11;
  for (let index = 0; index < length; index += 1) {
    seed = (seed * 1664525 + 1013904223) % 4294967296;
    const noise = seed / 2147483648 - 1;
    impulse[index] = noise * Math.exp((-6.9078 * index) / length);
  }
  let shaped = biquad(impulse, sampleRate, 'highpass', 180, 0.707);
  shaped = biquad(shaped, sampleRate, 'lowpass', 5200, 0.707);
  for (const [tapMs, gain] of [
    [11, 0.5],
    [19, 0.38],
    [29, 0.3],
    [41, 0.22],
  ]) {
    const index = Math.floor((sampleRate * tapMs) / 1000);
    if (index < shaped.length) shaped[index] += gain;
  }
  let maximum = 0;
  for (let index = 0; index < shaped.length; index += 1) maximum = Math.max(maximum, Math.abs(shaped[index]));
  for (let index = 0; index < shaped.length; index += 1) shaped[index] /= maximum || 1;
  const wet = fftConvolve(signal, shaped);
  let wetMax = 0;
  for (let index = 0; index < signal.length; index += 1) wetMax = Math.max(wetMax, Math.abs(wet[index]));
  const mix = (amount / 100) * 0.55;
  const out = new Float32Array(signal.length);
  for (let index = 0; index < signal.length; index += 1) {
    out[index] = signal[index] * (1 - mix * 0.35) + ((wet[index] / (wetMax || 1)) as number) * mix;
  }
  return out;
}

/* ------------------------------------------------------------------- master */

export function kWeight(signal: Float32Array, sampleRate: number): Float32Array {
  let out = biquad(signal, sampleRate, 'highshelf', 1681, 0.707, 4);
  out = biquad(out, sampleRate, 'highpass', 38, 0.5);
  return out;
}

export function integratedLoudness(signal: Float32Array, sampleRate: number): number {
  if (!signal.length) return -70;
  const weighted = kWeight(signal, sampleRate);
  const block = Math.max(1, Math.floor(sampleRate * 0.4));
  const step = Math.max(1, Math.floor(sampleRate * 0.1));
  if (weighted.length < block) {
    let sum = 0;
    for (let index = 0; index < weighted.length; index += 1) sum += weighted[index] * weighted[index];
    const meanSquare = sum / weighted.length;
    return meanSquare > 0 ? -0.691 + 10 * Math.log10(meanSquare) : -70;
  }
  const powers: number[] = [];
  for (let start = 0; start + block <= weighted.length; start += step) {
    let sum = 0;
    for (let index = 0; index < block; index += 1) {
      const value = weighted[start + index];
      sum += value * value;
    }
    powers.push(sum / block);
  }
  const loudness = powers.map((power) => -0.691 + 10 * Math.log10(Math.max(power, EPS)));
  const aboveAbsolute = powers.filter((_, index) => loudness[index] > -70);
  if (!aboveAbsolute.length) return -70;
  const relativeMean = aboveAbsolute.reduce((total, value) => total + value, 0) / aboveAbsolute.length;
  const relativeThreshold = -0.691 + 10 * Math.log10(Math.max(relativeMean, EPS)) - 10;
  const gated = powers.filter((power, index) => loudness[index] > relativeThreshold && loudness[index] > -70);
  const use = gated.length ? gated : aboveAbsolute;
  const mean = use.reduce((total, value) => total + value, 0) / use.length;
  return -0.691 + 10 * Math.log10(Math.max(mean, EPS));
}

export function limiter(signal: Float32Array, sampleRate: number, ceilingDb = -1): Float32Array {
  const ceiling = Math.pow(10, ceilingDb / 20);
  const look = Math.max(1, Math.floor(sampleRate * 0.003));
  const absolute = new Float32Array(signal.length);
  for (let index = 0; index < signal.length; index += 1) absolute[index] = Math.abs(signal[index]);
  const envelope = slidingMax(absolute, look);
  const target = new Float64Array(signal.length);
  for (let index = 0; index < signal.length; index += 1) target[index] = Math.min(1, ceiling / Math.max(envelope[index], EPS));
  const smoothed = boxSmooth(target, Math.floor((sampleRate * 3) / 1000));
  const forward = slidingMax(smoothed, look + 2);
  const out = new Float32Array(signal.length);
  for (let index = 0; index < signal.length; index += 1) out[index] = signal[index] * forward[index];
  let maximum = 0;
  for (let index = 0; index < out.length; index += 1) maximum = Math.max(maximum, Math.abs(out[index]));
  const scale = maximum > ceiling ? ceiling / maximum : 1;
  if (scale < 1) for (let index = 0; index < out.length; index += 1) out[index] *= scale;
  return out;
}

export function trimSilence(signal: Float32Array, sampleRate: number, thresholdDb = -45): Float32Array {
  const threshold = Math.pow(10, thresholdDb / 20);
  const absolute = new Float32Array(signal.length);
  for (let index = 0; index < signal.length; index += 1) absolute[index] = Math.abs(signal[index]);
  const envelope = slidingMax(absolute, Math.max(1, Math.floor(sampleRate * 0.02)));
  let first = -1;
  let last = -1;
  for (let index = 0; index < envelope.length; index += 1) {
    if (envelope[index] > threshold) {
      if (first < 0) first = index;
      last = index;
    }
  }
  if (first < 0 || last - first < sampleRate * 0.18) return signal;
  const padding = Math.floor(sampleRate * 0.03);
  const start = Math.max(0, first - padding);
  const end = Math.min(signal.length, last + padding);
  return signal.slice(start, end);
}

export function applyFades(signal: Float32Array, sampleRate: number, fadeMs: number): Float32Array {
  if (fadeMs <= 0) return signal;
  const length = Math.min(Math.floor((sampleRate * fadeMs) / 1000), Math.floor(signal.length / 2));
  if (length <= 1) return signal;
  const out = signal.slice();
  for (let index = 0; index < length; index += 1) {
    const ramp = index / (length - 1);
    out[index] *= ramp;
    out[out.length - 1 - index] *= ramp;
  }
  return out;
}

export function denoise(signal: Float32Array, sampleRate: number, amount: number): Float32Array {
  if (amount <= 0.5 || signal.length < 4096) return signal;
  const nFft = 2048;
  const hop = 512;
  const window = getWindow(nFft);
  const frames = 1 + Math.floor((signal.length - nFft) / hop);
  if (frames < 8) return signal;
  const bins = nFft / 2 + 1;
  const magnitudes: Float64Array[] = [];
  const phases: Float64Array[] = [];
  const frame = new Float64Array(nFft);
  for (let index = 0; index < frames; index += 1) {
    const offset = index * hop;
    for (let sample = 0; sample < nFft; sample += 1) frame[sample] = (signal[offset + sample] || 0) * window[sample];
    const { re, im } = rfft(frame);
    const magnitude = new Float64Array(bins);
    const phase = new Float64Array(bins);
    for (let bin = 0; bin < bins; bin += 1) {
      magnitude[bin] = Math.hypot(re[bin], im[bin]);
      phase[bin] = Math.atan2(im[bin], re[bin]);
    }
    magnitudes.push(magnitude);
    phases.push(phase);
  }
  const noise = new Float64Array(bins);
  const column = new Float64Array(frames);
  for (let bin = 0; bin < bins; bin += 1) {
    for (let index = 0; index < frames; index += 1) column[index] = magnitudes[index][bin];
    const sorted = Float64Array.from(column).sort();
    noise[bin] = Math.max(sorted[Math.floor(frames * 0.2)], 1e-6);
  }
  const overSubtraction = 0.8 + (amount / 100) * 2.2;
  const floor = Math.pow(10, (-24 + (amount / 100) * 8) / 20);
  const out = new Float32Array(signal.length + nFft);
  const weights = new Float64Array(out.length);
  for (let index = 0; index < frames; index += 1) {
    const re = new Float64Array(bins);
    const im = new Float64Array(bins);
    for (let bin = 0; bin < bins; bin += 1) {
      const magnitude = magnitudes[index][bin];
      const cleaned = Math.max(magnitude - overSubtraction * noise[bin], floor * magnitude);
      const gain = Math.max(cleaned / Math.max(magnitude, EPS), Math.pow(10, -18 / 20));
      re[bin] = magnitude * gain * Math.cos(phases[index][bin]);
      im[bin] = magnitude * gain * Math.sin(phases[index][bin]);
    }
    const rebuilt = irfft(re, im, nFft);
    const start = index * hop;
    for (let sample = 0; sample < nFft && start + sample < out.length; sample += 1) {
      out[start + sample] += rebuilt[sample] * window[sample];
      weights[start + sample] += window[sample] * window[sample];
    }
  }
  const result = new Float32Array(signal.length);
  for (let index = 0; index < result.length; index += 1) {
    result[index] = weights[index] > 1e-6 ? out[index] / weights[index] : signal[index];
  }
  return result;
}

/* -------------------------------------------------------------- the chain */

export type RenderProgress = { value: number; stage: string };

export function renderChain(
  audio: AudioData,
  chain: VoiceChain,
  onProgress?: (progress: RenderProgress) => void,
): AudioData {
  const design = mergeChain(chain);
  const master = design.master || {};
  const sampleRate = audio.sampleRate;
  const report = (value: number, stage: string) => onProgress?.({ value, stage });

  report(6, 'Preparing audio');
  let channels = audio.channels.map((channel) => {
    let out = channel;
    if (Number(master.denoise) > 0.5) out = denoise(out, sampleRate, Number(master.denoise));
    out = biquad(out, sampleRate, 'highpass', 24, 0.707);
    if (Number(master.highpassHz) > 0) out = biquad(out, sampleRate, 'highpass', Number(master.highpassHz), 0.707);
    if (Number(master.lowpassHz) > 0 && Number(master.lowpassHz) < sampleRate / 2) {
      out = biquad(out, sampleRate, 'lowpass', Math.min(Number(master.lowpassHz), sampleRate * 0.45), 0.707);
    }
    return out;
  });

  if (Math.abs(design.pitch) > 0.01 || Math.abs(design.formant) > 0.01) {
    report(18, 'Shifting pitch and formants');
    channels = channels.map((channel, index) =>
      pitchFormantShift(channel, sampleRate, design.pitch, design.formant, (value) =>
        report(18 + Math.round((value * 18) / Math.max(1, channels.length)) + index * 8, 'Shifting pitch and formants'),
      ),
    );
  }

  report(48, 'Shaping tone');
  channels = channels.map((channel) => {
    let out = channel;
    if (design.body > 0.5) out = biquad(out, sampleRate, 'lowshelf', 180, 0.707, (design.body / 100) * 7);
    if (design.presence > 0.5) out = biquad(out, sampleRate, 'peaking', 3200, 0.9, (design.presence / 100) * 7);
    if (design.air > 0.5) out = biquad(out, sampleRate, 'highshelf', 8500, 0.707, (design.air / 100) * 7.5);
    return out;
  });

  report(58, 'Dynamics and clarity');
  channels = channels.map((channel) => {
    let out = channel;
    if (design.gate > 0.5) out = gate(out, sampleRate, design.gate);
    if (design.comp > 0.5) out = compressor(out, sampleRate, design.comp);
    if (design.deess > 0.5) out = deesser(out, sampleRate, design.deess);
    return out;
  });

  report(70, 'Character modules');
  const characterStage = (channel: Float32Array) => {
    let out = channel;
    if (design.warmth > 0.5) out = warmDrive(out, design.warmth);
    if (design.growl > 0.5) out = growl(out, sampleRate, design.growl);
    if (design.ring > 0.5) out = ringModulate(out, sampleRate, design.ring, design.ringFreq);
    if (design.vibrato > 0.5) out = vibrato(out, sampleRate, design.vibrato, design.vibratoRate);
    if (design.breath > 0.5) out = breathNoise(out, sampleRate, design.breath);
    return out;
  };
  channels = channels.map(characterStage);

  if (design.echo > 0.5 || design.space > 0.5) {
    report(80, 'Space and time');
    channels = channels.map((channel) => {
      let out = channel;
      if (design.echo > 0.5) out = echo(out, sampleRate, design.echo, design.echoTime);
      if (design.space > 0.5) out = reverb(out, sampleRate, design.space);
      return out;
    });
  }

  report(88, 'Mastering');
  if (master.trimSilence) channels = channels.map((channel) => trimSilence(channel, sampleRate));
  const length = Math.min(...channels.map((channel) => channel.length));
  channels = channels.map((channel) => channel.slice(0, length));

  if (master.normalize !== false) {
    const mono = new Float32Array(length);
    for (let index = 0; index < length; index += 1) {
      let sum = 0;
      for (const channel of channels) sum += channel[index];
      mono[index] = sum / channels.length;
    }
    const measured = integratedLoudness(mono, sampleRate);
    const gainDb = Math.min(24, Math.max(-24, Number(master.targetLufs ?? -16) - measured));
    const gain = Math.pow(10, gainDb / 20);
    channels = channels.map((channel) => {
      const scaled = new Float32Array(channel.length);
      for (let index = 0; index < channel.length; index += 1) scaled[index] = channel[index] * gain;
      return limiter(scaled, sampleRate, Number(master.limiterCeilingDb ?? -1));
    });
  } else {
    channels = channels.map((channel) => limiter(channel, sampleRate, Number(master.limiterCeilingDb ?? -1)));
  }

  if (Math.abs(Number(master.outputGainDb) || 0) > 0.01) {
    const gain = Math.pow(10, Number(master.outputGainDb) / 20);
    channels = channels.map((channel) => {
      const scaled = new Float32Array(channel.length);
      for (let index = 0; index < channel.length; index += 1) scaled[index] = channel[index] * gain;
      return limiter(scaled, sampleRate, Number(master.limiterCeilingDb ?? -1));
    });
  }

  channels = channels.map((channel) => applyFades(channel, sampleRate, Number(master.fadeMs ?? 8)));
  report(100, 'Finished');
  return { channels, sampleRate };
}

/* ------------------------------------------------------------------- output */

export function encodeWav(audio: AudioData, bitDepth: 16 | 24 = 16): Blob {
  const { channels, sampleRate } = audio;
  const channelCount = channels.length;
  const frames = channels[0].length;
  const bytesPerSample = bitDepth === 24 ? 3 : 2;
  const buffer = new ArrayBuffer(44 + frames * channelCount * bytesPerSample);
  const view = new DataView(buffer);
  const text = (offset: number, value: string) => {
    for (let index = 0; index < value.length; index += 1) view.setUint8(offset + index, value.charCodeAt(index));
  };
  text(0, 'RIFF');
  view.setUint32(4, 36 + frames * channelCount * bytesPerSample, true);
  text(8, 'WAVE');
  text(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, channelCount, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * channelCount * bytesPerSample, true);
  view.setUint16(32, channelCount * bytesPerSample, true);
  view.setUint16(34, bitDepth, true);
  text(36, 'data');
  view.setUint32(40, frames * channelCount * bytesPerSample, true);
  let offset = 44;
  for (let frame = 0; frame < frames; frame += 1) {
    for (let channel = 0; channel < channelCount; channel += 1) {
      const value = Math.max(-1, Math.min(1, channels[channel][frame] || 0));
      if (bitDepth === 24) {
        const integer = Math.round(value * ((1 << 23) - 1));
        view.setUint8(offset, integer & 0xff);
        view.setUint8(offset + 1, (integer >> 8) & 0xff);
        view.setUint8(offset + 2, (integer >> 16) & 0xff);
        offset += 3;
      } else {
        view.setInt16(offset, value < 0 ? value * 0x8000 : value * 0x7fff, true);
        offset += 2;
      }
    }
  }
  return new Blob([buffer], { type: 'audio/wav' });
}

/* --------------------------------------------------------------- analysis */

export type LocalAnalysis = {
  duration: number;
  sampleRate: number;
  channels: number;
  peakDbfs: number;
  rmsDbfs: number;
  lufs: number;
  dynamicRangeDb: number;
  noiseFloorDbfs: number;
  clippingRatio: number;
  pitch: { lowHz: number; medianHz: number; highHz: number; rangeSemitones: number; medianNote: string };
  spectrum: { centroidHz: number; lowRatio: number; midRatio: number; highRatio: number; airRatio: number };
  voicedRatio: number;
  profile: { register: string; tone: string; cleanliness: string; delivery: string; expression: string; summary: string };
  engine: 'browser';
};

const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

function noteName(frequency: number): string {
  if (frequency <= 0) return '—';
  const midi = Math.round(69 + 12 * Math.log2(frequency / 440));
  return `${NOTE_NAMES[((midi % 12) + 12) % 12]}${Math.floor(midi / 12) - 1}`;
}

export function analyseAudio(audio: AudioData): LocalAnalysis {
  const sampleRate = audio.sampleRate;
  const frames = audio.channels[0].length;
  const mono = new Float32Array(frames);
  for (const channel of audio.channels) {
    for (let index = 0; index < frames; index += 1) mono[index] += channel[index] / audio.channels.length;
  }
  const duration = frames / sampleRate;
  let peak = 0;
  let sumSquares = 0;
  let clipped = 0;
  for (let index = 0; index < frames; index += 1) {
    const value = Math.abs(mono[index]);
    peak = Math.max(peak, value);
    sumSquares += mono[index] * mono[index];
    if (value >= 0.999) clipped += 1;
  }

  // Frame levels for the noise floor and dynamic range.
  const window = Math.max(64, Math.floor(sampleRate * 0.03));
  const levels: number[] = [];
  for (let start = 0; start + window <= frames; start += Math.floor(window / 2)) {
    let sum = 0;
    for (let index = 0; index < window; index += 1) sum += mono[start + index] * mono[start + index];
    levels.push(10 * Math.log10(sum / window + EPS));
  }
  levels.sort((a, b) => a - b);
  const pick = (ratio: number) => levels[Math.min(levels.length - 1, Math.max(0, Math.floor(levels.length * ratio)))] ?? -70;
  const noiseFloor = pick(0.12);
  const speechLevel = pick(0.85);

  // Pitch track (autocorrelation, 40 ms frames, 20 ms hop).
  const frameSize = Math.floor(sampleRate * 0.04);
  const hop = Math.floor(sampleRate * 0.02);
  const minimumLag = Math.floor(sampleRate / 420);
  const maximumLag = Math.floor(sampleRate / 60);
  const pitches: number[] = [];
  for (let start = 0; start + frameSize <= frames; start += hop) {
    let energy = 0;
    for (let index = 0; index < frameSize; index += 1) energy += mono[start + index] * mono[start + index];
    if (energy / frameSize < 1e-5) continue;
    let mean = 0;
    for (let index = 0; index < frameSize; index += 1) mean += mono[start + index];
    mean /= frameSize;
    let best = 0;
    let bestValue = 0;
    let zero = 0;
    for (let index = 0; index < frameSize; index += 1) {
      const value = mono[start + index] - mean;
      zero += value * value;
    }
    if (zero <= 0) continue;
    for (let lag = minimumLag; lag <= maximumLag && lag < frameSize; lag += 1) {
      let sum = 0;
      for (let index = 0; index < frameSize - lag; index += 1) {
        sum += (mono[start + index] - mean) * (mono[start + index + lag] - mean);
      }
      const normalized = sum / zero;
      if (normalized > bestValue) {
        bestValue = normalized;
        best = lag;
      }
    }
    if (best && bestValue > 0.32) pitches.push(sampleRate / best);
  }
  pitches.sort((a, b) => a - b);
  const pitchPick = (ratio: number) => (pitches.length ? pitches[Math.floor(pitches.length * ratio)] : 0);
  const pitchLow = pitchPick(0.1);
  const pitchMedian = pitchPick(0.5);
  const pitchHigh = pitchPick(0.9);
  const rangeSemitones = pitchLow > 0 && pitchHigh > 0 ? 12 * Math.log2(pitchHigh / pitchLow) : 0;

  // Spectral balance from one averaged FFT of the middle of the clip.
  const nFft = 2048;
  const spectrum = new Float64Array(nFft / 2 + 1);
  let analysed = 0;
  for (let start = 0; start + nFft <= frames; start += nFft * 2) {
    const frame = new Float64Array(nFft);
    for (let index = 0; index < nFft; index += 1) frame[index] = mono[start + index];
    const { re, im } = rfft(frame);
    for (let bin = 0; bin < spectrum.length; bin += 1) spectrum[bin] += Math.hypot(re[bin], im[bin]);
    analysed += 1;
  }
  if (analysed) for (let bin = 0; bin < spectrum.length; bin += 1) spectrum[bin] /= analysed;
  let total = 0;
  let centroid = 0;
  const band = { low: 0, mid: 0, high: 0, air: 0 };
  for (let bin = 0; bin < spectrum.length; bin += 1) {
    const frequency = (bin * sampleRate) / nFft;
    total += spectrum[bin];
    centroid += spectrum[bin] * frequency;
    if (frequency < 250) band.low += spectrum[bin];
    else if (frequency < 2500) band.mid += spectrum[bin];
    else if (frequency < 8000) band.high += spectrum[bin];
    else band.air += spectrum[bin];
  }
  total = total || 1;

  const register =
    !pitchMedian ? 'Unpitched' : pitchMedian < 95 ? 'Very low' : pitchMedian < 130 ? 'Low' : pitchMedian < 175 ? 'Mid' : pitchMedian < 230 ? 'High' : 'Very high';
  const centroidHz = centroid / total;
  const tone =
    centroidHz < 1200 ? 'Dark and weighty' : centroidHz < 1900 ? 'Warm and balanced' : centroidHz < 2600 ? 'Bright and forward' : 'Thin and sibilant';
  const cleanliness = noiseFloor < -55 ? 'Very clean' : noiseFloor < -46 ? 'Usable' : noiseFloor < -38 ? 'Noisy' : 'Heavily noisy';
  const voicedRatio = pitches.length / Math.max(1, Math.floor(duration / 0.02));
  const delivery = voicedRatio > 0.5 ? 'Continuous speech' : voicedRatio > 0.25 ? 'Conversational' : 'Sparse or musical';
  const expression = rangeSemitones < 2.5 ? 'Monotone' : rangeSemitones < 6 ? 'Natural' : 'Highly expressive';

  return {
    duration,
    sampleRate,
    channels: audio.channels.length,
    peakDbfs: 20 * Math.log10(Math.max(peak, EPS)),
    rmsDbfs: 20 * Math.log10(Math.sqrt(sumSquares / Math.max(1, frames)) + EPS),
    lufs: integratedLoudness(mono, sampleRate),
    dynamicRangeDb: speechLevel - noiseFloor,
    noiseFloorDbfs: noiseFloor,
    clippingRatio: clipped / Math.max(1, frames),
    pitch: { lowHz: pitchLow, medianHz: pitchMedian, highHz: pitchHigh, rangeSemitones, medianNote: noteName(pitchMedian) },
    spectrum: {
      centroidHz,
      lowRatio: band.low / total,
      midRatio: band.mid / total,
      highRatio: band.high / total,
      airRatio: band.air / total,
    },
    voicedRatio,
    profile: {
      register,
      tone,
      cleanliness,
      delivery,
      expression,
      summary: `${register} register, ${tone.toLowerCase()} tone, ${expression.toLowerCase()} delivery, ${cleanliness.toLowerCase()} recording.`,
    },
    engine: 'browser',
  };
}

/** Convert a mono/stereo File or BlobURL into AudioData for local processing. */
export async function decodeToAudioData(url: string): Promise<AudioData> {
  const response = await fetch(url);
  if (!response.ok) throw new Error('The audio file could not be loaded.');
  const context = new AudioContext();
  try {
    const buffer = await context.decodeAudioData(await response.arrayBuffer());
    return toAudioData(buffer);
  } finally {
    await context.close();
  }
}

/** Capped, averaged waveform peaks for lightweight canvas-free drawing. */
export function waveformPeaks(channel: Float32Array, count = 400): number[] {
  const bucket = Math.max(1, Math.ceil(channel.length / count));
  const peaks: number[] = [];
  for (let start = 0; start < channel.length; start += bucket) {
    let peak = 0;
    for (let index = start; index < Math.min(start + bucket, channel.length); index += 1) {
      peak = Math.max(peak, Math.abs(channel[index]));
    }
    peaks.push(Number(peak.toFixed(4)));
  }
  return peaks;
}
