import type { VoiceEffect } from './data';
export async function decodeAudio(url: string) {
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
export async function transformAudio(
  url: string,
  effect: VoiceEffect,
  intensity = 75,
  sampleRate = 44100,
  normalize = true,
): Promise<{ blob: Blob; duration: number }> {
  const buffer = await decodeAudio(url);
  if (buffer.duration > 180)
    throw new Error('For this browser preview, use audio shorter than 3 minutes.');
  const strength = intensity / 100;
  const rate = 1 + (effect.rate - 1) * strength;
  const context = new OfflineAudioContext(
    buffer.numberOfChannels,
    Math.ceil((buffer.duration / rate + (effect.filter === 'echo' ? 0.8 : 0)) * sampleRate),
    sampleRate,
  );
  const source = context.createBufferSource();
  source.buffer = buffer;
  source.playbackRate.value = rate;
  let node: AudioNode = source;
  if (['robot', 'metal', 'alien'].includes(effect.filter || '')) {
    const ring = context.createGain();
    ring.gain.value = 1 - strength * 0.55;
    const oscillator = context.createOscillator();
    oscillator.type = 'sine';
    oscillator.frequency.value =
      effect.filter === 'alien' ? 43 : effect.filter === 'metal' ? 67 : 88;
    const modulation = context.createGain();
    modulation.gain.value = strength * 0.55;
    oscillator.connect(modulation).connect(ring.gain);
    oscillator.start();
    node.connect(ring);
    node = ring;
  }
  if (effect.filter === 'radio') {
    const highpass = context.createBiquadFilter();
    highpass.type = 'highpass';
    highpass.frequency.value = 360 * strength;
    const lowpass = context.createBiquadFilter();
    lowpass.type = 'lowpass';
    lowpass.frequency.value = 2200 + (1 - strength) * 6000;
    node.connect(highpass).connect(lowpass);
    node = lowpass;
  }
  if (effect.filter === 'monster') {
    const distortion = context.createWaveShaper();
    const curve = new Float32Array(4096);
    for (let i = 0; i < curve.length; i++) {
      const x = (i * 2) / (curve.length - 1) - 1;
      curve[i] = Math.tanh(x * (1 + strength * 6)) * 0.72;
    }
    distortion.curve = curve;
    distortion.oversample = '2x';
    node.connect(distortion);
    node = distortion;
  }
  if (effect.filter === 'echo' || effect.filter === 'metal') {
    const delay = context.createDelay(1);
    delay.delayTime.value = effect.filter === 'echo' ? 0.19 : 0.025;
    const wet = context.createGain();
    wet.gain.value = strength * 0.35;
    const feedback = context.createGain();
    feedback.gain.value = 0.26;
    node.connect(delay).connect(wet).connect(context.destination);
    delay.connect(feedback).connect(delay);
  }
  const gain = context.createGain();
  gain.gain.value = effect.id === 'whisper' ? 0.5 : 0.88;
  node.connect(gain).connect(context.destination);
  source.start();
  const rendered = await context.startRendering();
  if (normalize) {
    let peak = 0;
    for (let c = 0; c < rendered.numberOfChannels; c++) {
      const channel = rendered.getChannelData(c);
      for (let i = 0; i < channel.length; i++) peak = Math.max(peak, Math.abs(channel[i]));
    }
    if (peak > 0) {
      const scale = 0.93 / peak;
      for (let c = 0; c < rendered.numberOfChannels; c++) {
        const channel = rendered.getChannelData(c);
        for (let i = 0; i < channel.length; i++) channel[i] *= scale;
      }
    }
  }
  return { blob: encodeWav(rendered), duration: rendered.duration };
}
export async function trimAudio(url: string, start: number, end: number) {
  const audio = await decodeAudio(url);
  const context = new OfflineAudioContext(
    audio.numberOfChannels,
    Math.ceil((end - start) * audio.sampleRate),
    audio.sampleRate,
  );
  const source = context.createBufferSource();
  source.buffer = audio;
  source.connect(context.destination);
  source.start(0, start, end - start);
  return { blob: encodeWav(await context.startRendering()), duration: end - start };
}
function encodeWav(buffer: AudioBuffer) {
  const channels = buffer.numberOfChannels,
    length = buffer.length;
  const data = new ArrayBuffer(44 + length * channels * 2);
  const view = new DataView(data);
  const text = (at: number, s: string) => {
    for (let i = 0; i < s.length; i++) view.setUint8(at + i, s.charCodeAt(i));
  };
  text(0, 'RIFF');
  view.setUint32(4, 36 + length * channels * 2, true);
  text(8, 'WAVE');
  text(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, channels, true);
  view.setUint32(24, buffer.sampleRate, true);
  view.setUint32(28, buffer.sampleRate * channels * 2, true);
  view.setUint16(32, channels * 2, true);
  view.setUint16(34, 16, true);
  text(36, 'data');
  view.setUint32(40, length * channels * 2, true);
  const channelData = Array.from({ length: channels }, (_, c) => buffer.getChannelData(c));
  let offset = 44;
  for (let i = 0; i < length; i++)
    for (let c = 0; c < channels; c++) {
      const value = Math.max(-1, Math.min(1, channelData[c][i]));
      view.setInt16(offset, value < 0 ? value * 0x8000 : value * 0x7fff, true);
      offset += 2;
    }
  return new Blob([data], { type: 'audio/wav' });
}
