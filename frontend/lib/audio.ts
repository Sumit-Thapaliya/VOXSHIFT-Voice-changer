import {
  analyseAudio,
  decodeToAudioData,
  encodeWav,
  renderChain,
  type AudioData,
  type LocalAnalysis,
  type VoiceChain,
} from './dsp';

/** Decode a URL to an AudioBuffer (kept for waveform and duration checks). */
export async function decodeAudio(url: string): Promise<AudioBuffer> {
  const response = await fetch(url);
  if (!response.ok) throw new Error('The audio file could not be loaded.');
  const context = new AudioContext();
  try {
    return await context.decodeAudioData(await response.arrayBuffer());
  } finally {
    await context.close();
  }
}

export async function getAudioDuration(url: string) {
  const buffer = await decodeAudio(url);
  return buffer.duration;
}

export async function loadAudioData(url: string): Promise<AudioData> {
  return decodeToAudioData(url);
}

/** Real WAV export at the selected bit depth. */
export function exportWav(audio: AudioData, bitDepth: 16 | 24 = 16): Blob {
  return encodeWav(audio, bitDepth);
}

/** Render a design locally (browser engine) and return a downloadable WAV. */
export async function renderToWav(
  url: string,
  chain: VoiceChain,
  options: { bitDepth?: 16 | 24; onProgress?: (value: number, stage: string) => void } = {},
): Promise<{ blob: Blob; duration: number }> {
  const decoded = await loadAudioData(url);
  const rendered = renderChain(decoded, chain, (progress) => options.onProgress?.(progress.value, progress.stage));
  return { blob: encodeWav(rendered, options.bitDepth ?? 16), duration: rendered.channels[0].length / rendered.sampleRate };
}

/** Trim by re-encoding the kept region as WAV. */
export async function trimAudio(
  url: string,
  start: number,
  end: number,
  bitDepth: 16 | 24 = 16,
): Promise<{ blob: Blob; duration: number }> {
  const decoded = await loadAudioData(url);
  const startSample = Math.max(0, Math.floor(start * decoded.sampleRate));
  const endSample = Math.min(decoded.channels[0].length, Math.ceil(end * decoded.sampleRate));
  const channels = decoded.channels.map((channel) => channel.slice(startSample, endSample));
  const trimmed: AudioData = { channels, sampleRate: decoded.sampleRate };
  return { blob: encodeWav(trimmed, bitDepth), duration: (endSample - startSample) / decoded.sampleRate };
}

export async function analyseLocal(url: string): Promise<LocalAnalysis> {
  return analyseAudio(await loadAudioData(url));
}
