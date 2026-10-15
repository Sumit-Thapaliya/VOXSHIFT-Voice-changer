"""Character effects: ring modulation, vibrato, breath, echo and reverb.

These are the modules that turn "a shifted voice" into a designed character —
robot, alien, ghost, late-night radio host. Everything runs on CPU in numpy.
"""

from __future__ import annotations

import numpy as np

from .filters import bandpass, highpass, lowpass
from .wavio import rms_dbfs

EPS = 1e-12


def _as_channels(signal: np.ndarray) -> tuple[np.ndarray, bool]:
    data = np.asarray(signal, dtype=np.float64)
    if data.ndim == 1:
        return data[:, None], True
    return data, False


def ring_modulate(signal: np.ndarray, sample_rate: float, amount: float, frequency: float = 88.0) -> np.ndarray:
    """Amplitude modulation with a sine carrier — the classic robot/metallic voice. 0..100."""

    amount = float(np.clip(amount or 0.0, 0.0, 100.0)) / 100.0
    if amount <= 0.001:
        return np.asarray(signal, dtype=np.float32)

    intensity = float(np.clip(amount, 0.0, 1.0))
    data, one_dimensional = _as_channels(signal)
    time = np.arange(data.shape[0], dtype=np.float64) / sample_rate
    carrier = np.sin(2.0 * np.pi * float(np.clip(frequency, 20.0, sample_rate * 0.4)) * time)[:, None]
    mixed = data * (1.0 - intensity) + (data * carrier) * (intensity * 1.6)
    return mixed[:, 0].astype(np.float32) if one_dimensional else mixed.astype(np.float32)


def vibrato(signal: np.ndarray, sample_rate: float, depth: float, rate_hz: float = 5.2) -> np.ndarray:
    """Pitch (delay-line) vibrato. `depth` 0..100 maps to ±0.35 % delay swing."""

    depth = float(np.clip(depth or 0.0, 0.0, 100.0)) / 100.0
    if depth <= 0.001:
        return np.asarray(signal, dtype=np.float32)

    intensity = float(np.clip(depth, 0.0, 1.0))
    data, one_dimensional = _as_channels(signal)
    frames = data.shape[0]
    time = np.arange(frames, dtype=np.float64) / sample_rate
    base_delay = 4.0e-3 * intensity
    swing = 3.5e-3 * intensity
    delay = base_delay + swing * (0.5 + 0.5 * np.sin(2.0 * np.pi * float(np.clip(rate_hz, 1.0, 12.0)) * time))
    positions = np.arange(frames, dtype=np.float64) - delay * sample_rate
    positions = np.clip(positions, 0.0, frames - 1.0001)
    source = np.arange(frames, dtype=np.float64)
    output = np.empty_like(data, dtype=np.float32)
    for channel in range(data.shape[1]):
        output[:, channel] = np.interp(positions, source, data[:, channel]).astype(np.float32)
    return output[:, 0] if one_dimensional else output


def breath(signal: np.ndarray, sample_rate: float, amount: float, seed: int = 7) -> np.ndarray:
    """Airy noise layer enveloped by the voice — the whisper/ghost module. 0..100."""

    amount = float(np.clip(amount or 0.0, 0.0, 100.0)) / 100.0
    if amount <= 0.001:
        return np.asarray(signal, dtype=np.float32)

    from .dynamics import _vector_envelope

    intensity = float(np.clip(amount, 0.0, 1.0))
    data, one_dimensional = _as_channels(signal)
    frames = data.shape[0]
    rng = np.random.default_rng(seed)
    output = np.empty_like(data, dtype=np.float32)

    for channel in range(data.shape[1]):
        channel_data = data[:, channel]
        noise = rng.standard_normal(frames)
        noise = highpass(noise, sample_rate, 1800.0, 0.707)
        envelope = _vector_envelope(np.abs(channel_data), sample_rate, 8.0, 60.0)
        envelope = envelope / (float(np.percentile(envelope, 98.0)) + EPS)
        layer = noise * np.clip(envelope, 0.0, 1.5)
        # match the layer level to the voice so the mix stays predictable
        scale = (rms_dbfs(channel_data) - rms_dbfs(layer)) if np.any(layer) else 0.0
        layer *= 10.0 ** (scale / 20.0) if np.isfinite(scale) else 1.0
        output[:, channel] = (channel_data * (1.0 - intensity * 0.3) + layer * intensity * 0.75).astype(np.float32)

    return output[:, 0] if one_dimensional else output


def echo(signal: np.ndarray, sample_rate: float, amount: float, delay_ms: float = 190.0, feedback: float = 0.32) -> np.ndarray:
    """Simple damped delay line; ping-pong style stereo offset when stereo. 0..100."""

    amount = float(np.clip(amount or 0.0, 0.0, 100.0)) / 100.0
    if amount <= 0.001:
        return np.asarray(signal, dtype=np.float32)

    intensity = float(np.clip(amount, 0.0, 1.0))
    data, one_dimensional = _as_channels(signal)
    delay_samples = int(np.clip(delay_ms, 20.0, 900.0) * 1e-3 * sample_rate)
    if delay_samples < 2:
        return np.asarray(signal, dtype=np.float32)

    frames, channels = data.shape
    total = frames + delay_samples * 6
    buffer = np.zeros((total, channels), dtype=np.float64)
    buffer[:frames] = data
    taps = 10
    for tap in range(1, taps + 1):
        offset = delay_samples * tap
        if offset >= total:
            break
        gain = feedback ** (tap - 1)
        source = data[: max(0, frames - offset)]
        if source.size == 0:
            break
        if channels > 1:
            source = np.roll(source, 1, axis=1)  # offset the channels for width
        buffer[offset : offset + source.shape[0]] += source * gain * 0.6
    wet = lowpass(buffer, sample_rate, 6500.0, 0.707)
    dry = np.zeros_like(wet)
    dry[:frames] = data
    mixed = dry + wet * intensity
    return mixed[:frames, 0].astype(np.float32) if one_dimensional else mixed[:frames].astype(np.float32)


def reverb(
    signal: np.ndarray,
    sample_rate: float,
    amount: float,
    decay_s: float = 1.5,
    pre_delay_ms: float = 18.0,
    seed: int = 11,
) -> np.ndarray:
    """Convolution reverb built from a synthesised impulse response.

    No sample libraries and no downloads: the IR is generated on the fly from
    exponentially decaying noise plus a handful of early reflections.
    """

    if amount <= 0.001:
        return np.asarray(signal, dtype=np.float32)

    from .filters import fft_convolve

    amount = float(np.clip(amount or 0.0, 0.0, 100.0)) / 100.0
    intensity = float(np.clip(amount, 0.0, 1.0))
    data, one_dimensional = _as_channels(signal)
    length = max(64, int(np.clip(decay_s, 0.2, 4.0) * sample_rate))
    rng = np.random.default_rng(seed)
    time = np.arange(length, dtype=np.float64) / sample_rate
    envelope = np.exp(-3.2 * time / max(decay_s, 0.1))
    impulse = rng.standard_normal(length) * envelope
    impulse = lowpass(impulse, sample_rate, min(8000.0, sample_rate * 0.45), 0.707)
    impulse = highpass(impulse, sample_rate, 120.0, 0.707)
    for tap_ms, tap_gain in ((11.0, 0.5), (23.0, 0.36), (38.0, 0.24), (57.0, 0.16)):
        index = int(tap_ms * 1e-3 * sample_rate)
        if index < length:
            impulse[index] += tap_gain
    impulse /= max(float(np.max(np.abs(impulse))), EPS)

    pre_delay = max(0, int(pre_delay_ms * 1e-3 * sample_rate))
    wet = np.zeros_like(data, dtype=np.float64)
    for channel in range(data.shape[1]):
        delayed = np.concatenate([np.zeros(pre_delay), data[:, channel]])
        wet[:, channel] = fft_convolve(delayed[: data.shape[0]], impulse)
    wet = highpass(wet, sample_rate, 150.0, 0.707)
    mixed = data * (1.0 - intensity * 0.25) + wet * intensity
    return mixed[:, 0].astype(np.float32) if one_dimensional else mixed.astype(np.float32)


def tilt_filter(signal: np.ndarray, sample_rate: float, brightness_db: float) -> np.ndarray:
    """Thin wrapper kept for readability of the render chain."""

    from .filters import tilt

    return tilt(signal, sample_rate, brightness_db)


def warm_drive(signal: np.ndarray, amount: float) -> np.ndarray:
    """Saturation with the voice's even harmonics — the warmth module."""

    from .dynamics import soft_saturate

    return soft_saturate(signal, amount, asymmetry=0.35)


def dc_block(signal: np.ndarray, sample_rate: float) -> np.ndarray:
    """Remove DC offset (kept here so `effects.dc_block` keeps working)."""

    from .dynamics import dc_block as _dc_block

    return _dc_block(signal, sample_rate)


__all__ = ["ring_modulate", "vibrato", "breath", "echo", "reverb", "tilt_filter", "warm_drive", "dc_block"]
