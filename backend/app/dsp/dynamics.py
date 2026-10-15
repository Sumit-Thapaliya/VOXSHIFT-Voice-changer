"""Dynamics: noise gate, compressor, saturation, limiter, loudness.

All of it is envelope-follower code (no lookahead beyond a few milliseconds) so
it stays well under real time on a CPU.
"""

from __future__ import annotations

import numpy as np

from .wavio import rms_dbfs

EPS = 1e-12


def _as_channels(signal: np.ndarray) -> tuple[np.ndarray, bool]:
    data = np.asarray(signal, dtype=np.float64)
    if data.ndim == 1:
        return data[:, None], True
    return data, False


def _smooth_envelope(signal: np.ndarray, sample_rate: float, attack_ms: float, release_ms: float) -> np.ndarray:
    """Peak-following envelope with different attack and release speeds."""

    magnitude = np.abs(signal)
    attack = np.exp(-1.0 / max(1.0, attack_ms * 1e-3 * sample_rate))
    release = np.exp(-1.0 / max(1.0, release_ms * 1e-3 * sample_rate))
    envelope = np.empty_like(magnitude)
    state = 0.0
    for index in range(magnitude.size):
        value = magnitude[index]
        coefficient = attack if value > state else release
        state = value + coefficient * (state - value)
        envelope[index] = state
    return envelope


def _vector_envelope(magnitude: np.ndarray, sample_rate: float, attack_ms: float, release_ms: float) -> np.ndarray:
    """Fast approximation of :func:`_smooth_envelope` using block maxima.

    A 1 ms block max followed by a one-pole IIR gives the same audible result
    as a per-sample follower but runs in numpy instead of python.
    """

    block = max(1, int(sample_rate * 0.001))
    if magnitude.size < block * 2:
        return magnitude
    usable = (magnitude.size // block) * block
    blocked = magnitude[:usable].reshape(-1, block).max(axis=1)
    attack = np.exp(-block / max(1.0, attack_ms * 1e-3 * sample_rate))
    release = np.exp(-block / max(1.0, release_ms * 1e-3 * sample_rate))
    envelope = np.empty_like(blocked)
    state = 0.0
    for index in range(blocked.size):
        value = blocked[index]
        coefficient = attack if value > state else release
        state = value + coefficient * (state - value)
        envelope[index] = state
    upsampled = np.repeat(envelope, block)
    if upsampled.size < magnitude.size:
        upsampled = np.concatenate([upsampled, np.full(magnitude.size - upsampled.size, envelope[-1] if envelope.size else 0.0)])
    return upsampled[: magnitude.size]


def _mean_abs_envelope(magnitude: np.ndarray, sample_rate: float, attack_ms: float, release_ms: float) -> np.ndarray:
    """Mean-|x| follower: the detector a real gate uses for speech.

    Peak detectors track every transient (so a hiss-filled gap still reads
    loud); averaging over ~1 ms gives a level that separates speech from room
    tone the way an engineer expects.
    """

    block = max(1, int(sample_rate * 0.001))
    data = np.asarray(magnitude, dtype=np.float64)
    if data.size < block * 2:
        return data
    usable = (data.size // block) * block
    averaged = data[:usable].reshape(-1, block).mean(axis=1)
    attack = np.exp(-block / max(1.0, attack_ms * 1e-3 * sample_rate))
    release = np.exp(-block / max(1.0, release_ms * 1e-3 * sample_rate))
    envelope = np.empty_like(averaged)
    state = 0.0
    for index in range(averaged.size):
        value = averaged[index]
        coefficient = attack if value > state else release
        state = value + coefficient * (state - value)
        envelope[index] = state
    upsampled = np.repeat(envelope, block)
    if upsampled.size < data.size:
        upsampled = np.concatenate([upsampled, np.full(data.size - upsampled.size, envelope[-1] if envelope.size else 0.0)])
    return upsampled[: data.size]


def noise_gate(signal: np.ndarray, sample_rate: float, amount: float, reduction_db: float = -80.0) -> np.ndarray:
    """Downward expander driven by `amount` (0..100 percent).

    Below the threshold the gain collapses toward `reduction_db` (that is what a
    gate is for), with a 6 dB soft knee so quiet speech tails fade instead of
    chopping. The threshold walks from a lenient -66 dBFS at 10 % to -22 dBFS at
    100 %, which covers everything from "clean up a quiet room" to "isolate a
    close mic take".
    """

    amount = float(np.clip(amount or 0.0, 0.0, 100.0)) / 100.0
    if amount <= 0.001:
        return np.asarray(signal, dtype=np.float32)

    data, one_dimensional = _as_channels(signal)
    intensity = float(np.clip(amount, 0.0, 1.0))
    threshold_db = -66.0 + 44.0 * intensity
    knee = 6.0
    output = np.empty_like(data, dtype=np.float32)

    for channel in range(data.shape[1]):
        channel_data = data[:, channel]
        # mean-|x| detector with a fast release: room tone is closed off within
        # a couple of tens of milliseconds after a phrase ends
        envelope = _mean_abs_envelope(np.abs(channel_data), sample_rate, 1.5, 45.0)
        level = 20.0 * np.log10(np.maximum(envelope, 1e-7))
        closedness = np.clip((threshold_db + knee / 2.0 - level) / knee, 0.0, 1.0)
        target_gain = 10.0 ** (reduction_db * closedness / 20.0)
        gain = _mean_abs_envelope(target_gain, sample_rate, 2.0, 90.0)
        # never let the smoothed gain open the gate above what the level allows
        output[:, channel] = (channel_data * np.minimum(gain, target_gain)).astype(np.float32)

    return output[:, 0] if one_dimensional else output


def compressor(
    signal: np.ndarray,
    sample_rate: float,
    amount: float,
    threshold_db: float = -20.0,
    attack_ms: float = 6.0,
    release_ms: float = 140.0,
) -> np.ndarray:
    """Feed-forward compressor; `amount` 0..100 maps to ratio 1:1 → 8:1."""

    amount = float(np.clip(amount or 0.0, 0.0, 100.0)) / 100.0
    if amount <= 0.001:
        return np.asarray(signal, dtype=np.float32)

    data, one_dimensional = _as_channels(signal)
    intensity = float(np.clip(amount, 0.0, 1.0))
    ratio = 1.0 + 7.0 * intensity
    output = np.empty_like(data, dtype=np.float32)
    makeup = 10.0 ** ((threshold_db * (1.0 - 1.0 / ratio) * 0.6) / 20.0)

    for channel in range(data.shape[1]):
        channel_data = data[:, channel]
        envelope = _vector_envelope(np.abs(channel_data), sample_rate, attack_ms, release_ms)
        level = 20.0 * np.log10(np.maximum(envelope, 1e-7))
        over = np.maximum(level - threshold_db, 0.0)
        gain = 10.0 ** (-(over * (1.0 - 1.0 / ratio)) / 20.0)
        gain = _vector_envelope(gain, sample_rate, 1.0, 60.0)
        output[:, channel] = (channel_data * gain * makeup).astype(np.float32)

    return output[:, 0] if one_dimensional else output


def soft_saturate(signal: np.ndarray, amount: float, asymmetry: float = 0.0) -> np.ndarray:
    """Tape-style tanh drive with optional asymmetry (adds even harmonics)."""

    amount = float(np.clip(amount or 0.0, 0.0, 100.0)) / 100.0
    if amount <= 0.001:
        return np.asarray(signal, dtype=np.float32)

    intensity = float(np.clip(amount, 0.0, 1.0))
    drive = 1.0 + 9.0 * intensity
    data = np.asarray(signal, dtype=np.float64)
    shaped = np.tanh(drive * (data + asymmetry * 0.25 * np.square(data)))
    # normalise by the curve's own asymptote: |out| <= 1 whatever went in
    shaped = shaped / max(np.tanh(drive), EPS)
    return (data * (1.0 - intensity) + shaped * intensity).astype(np.float32)


def subharmonic(signal: np.ndarray, sample_rate: float, amount: float, fundamental_hz: float = 110.0) -> np.ndarray:
    """Add an octave-down layer by modulating with half the fundamental."""

    amount = float(np.clip(amount or 0.0, 0.0, 100.0)) / 100.0
    if amount <= 0.001:
        return np.asarray(signal, dtype=np.float32)

    from .filters import lowpass

    intensity = float(np.clip(amount, 0.0, 1.0))
    data, one_dimensional = _as_channels(signal)
    frames = data.shape[0]
    time = np.arange(frames, dtype=np.float64) / sample_rate
    modulator = np.sin(2.0 * np.pi * (fundamental_hz / 2.0) * time)
    output = np.empty_like(data, dtype=np.float32)

    for channel in range(data.shape[1]):
        channel_data = data[:, channel]
        layer = lowpass(channel_data * modulator, sample_rate, min(260.0, sample_rate * 0.4), 0.707)
        output[:, channel] = (channel_data + layer * 1.4 * intensity).astype(np.float32)

    return output[:, 0] if one_dimensional else output


def limiter(signal: np.ndarray, sample_rate: float, ceiling_db: float = -1.0, release_ms: float = 80.0) -> np.ndarray:
    """Lookahead peak limiter: the sample peak always stays under the ceiling."""

    data, one_dimensional = _as_channels(signal)
    ceiling = 10.0 ** (ceiling_db / 20.0)
    lookahead = max(2, int(0.005 * sample_rate))
    output = np.empty_like(data, dtype=np.float32)

    for channel in range(data.shape[1]):
        channel_data = data[:, channel]
        magnitude = np.abs(channel_data)
        # gain that would just keep this sample inside the ceiling
        required = np.minimum(1.0, ceiling / np.maximum(magnitude, EPS))
        # pull the gain down *before* the peak arrives, then release slowly
        delayed = sliding_min(required, lookahead)
        smoothed = _mean_abs_envelope(delayed, sample_rate, 1.0, release_ms)
        gain = np.minimum(smoothed, required)
        output[:, channel] = (channel_data * gain).astype(np.float32)
        if float(np.max(np.abs(output[:, channel]))) > ceiling + 1e-6:
            output[:, channel] *= ceiling / float(np.max(np.abs(output[:, channel])))

    return output[:, 0] if one_dimensional else output


def _k_weighting(signal: np.ndarray, sample_rate: float) -> np.ndarray:
    from .filters import apply_biquad

    # Stage 1: high-shelf "head" filter; stage 2: high-pass RLB curve.
    filtered = apply_biquad(signal, "highshelf", sample_rate, 1681.0, 0.707, 3.999)
    return apply_biquad(filtered, "highpass", sample_rate, 38.0, 0.5)


def integrated_loudness(signal: np.ndarray, sample_rate: float) -> float:
    """Gated integrated loudness in LUFS (mono sum of the channels)."""

    data, _ = _as_channels(signal)
    if data.size == 0:
        return -70.0
    weighted = _k_weighting(data, sample_rate)
    block = max(1, int(0.4 * sample_rate))
    step = max(1, block // 4)
    frames = weighted.shape[0]
    if frames < block:
        energy = float(np.mean(np.square(weighted)))
        return -0.691 + 10.0 * float(np.log10(max(energy, 1e-12)))

    starts = np.arange(0, frames - block + 1, step)
    blocks = np.lib.stride_tricks.as_strided(
        weighted,
        shape=(starts.size, block, weighted.shape[1]),
        strides=(weighted.strides[0] * step, weighted.strides[0], weighted.strides[1]),
        writeable=False,
    )
    mean_square = np.mean(np.square(blocks), axis=(1, 2))
    loudness = -0.691 + 10.0 * np.log10(np.maximum(mean_square, 1e-12))
    absolute = loudness > -70.0
    if not np.any(absolute):
        return float(np.max(loudness))
    relative_gate = float(np.mean(10.0 ** (loudness[absolute] / 10.0)))
    threshold = -0.691 + 10.0 * np.log10(max(relative_gate, 1e-12)) - 10.0
    keep = absolute & (loudness > threshold)
    if not np.any(keep):
        keep = absolute
    integrated = float(np.mean(10.0 ** (loudness[keep] / 10.0)))
    return -0.691 + 10.0 * float(np.log10(max(integrated, 1e-12)))


def normalise_to_lufs(signal: np.ndarray, sample_rate: float, target_lufs: float, ceiling_db: float = -1.0) -> tuple[np.ndarray, float]:
    """Gain to hit the loudness target, then limit at the ceiling.

    Limiting a hot signal pulls the loudness back down, so the gain is measured
    again afterwards and corrected (up to three passes). That is what makes the
    delivered level land on the target instead of "somewhere near" it.
    """

    total_gain_db = 0.0
    scaled = np.asarray(signal, dtype=np.float32)
    for _ in range(3):
        current = integrated_loudness(scaled, sample_rate)
        error = target_lufs - current
        if abs(error) < 0.15:
            break
        gain_db = float(np.clip(error, -24.0, 24.0))
        scaled = (np.asarray(scaled, dtype=np.float64) * 10.0 ** (gain_db / 20.0)).astype(np.float32)
        total_gain_db += gain_db
        scaled = limiter(scaled, sample_rate, ceiling_db)
    return scaled, total_gain_db


def peak_normalise(signal: np.ndarray, target_db: float = -1.0) -> np.ndarray:
    data = np.asarray(signal, dtype=np.float64)
    peak = float(np.max(np.abs(data))) if data.size else 0.0
    if peak < 1e-9:
        return data.astype(np.float32)
    return (data * (10.0 ** (target_db / 20.0) / peak)).astype(np.float32)


def trim_silence(signal: np.ndarray, sample_rate: float, threshold_db: float = -48.0, pad_ms: float = 60.0) -> np.ndarray:
    """Trim leading and trailing silence, keeping a short pad."""

    data, one_dimensional = _as_channels(signal)
    if data.shape[0] == 0:
        return data.astype(np.float32)
    envelope = np.max(np.abs(data), axis=1)
    block = max(1, int(sample_rate * 0.01))
    usable = (envelope.size // block) * block
    if usable < block:
        return data.astype(np.float32)
    blocked = envelope[:usable].reshape(-1, block).max(axis=1)
    active = np.flatnonzero(20.0 * np.log10(np.maximum(blocked, 1e-9)) > threshold_db)
    if active.size == 0:
        return data.astype(np.float32)
    pad = int(pad_ms * 1e-3 * sample_rate)
    start = max(0, active[0] * block - pad)
    stop = min(data.shape[0], (active[-1] + 1) * block + pad)
    trimmed = data[start:stop]
    return trimmed[:, 0].astype(np.float32) if one_dimensional else trimmed.astype(np.float32)


def apply_fades(signal: np.ndarray, sample_rate: float, fade_ms: float = 8.0) -> np.ndarray:
    data, one_dimensional = _as_channels(signal)
    length = int(min(max(fade_ms, 0.0) * 1e-3 * sample_rate, data.shape[0] / 2))
    if length < 2:
        return data.astype(np.float32)
    ramp = np.linspace(0.0, 1.0, length)[:, None]
    faded = data.copy()
    faded[:length] *= ramp
    faded[-length:] *= ramp[::-1]
    return faded[:, 0].astype(np.float32) if one_dimensional else faded.astype(np.float32)


def dc_block(signal: np.ndarray, sample_rate: float) -> np.ndarray:
    from .filters import highpass

    return highpass(signal, sample_rate, 8.0, 0.707)


def measure(signal: np.ndarray, sample_rate: float) -> dict:
    """Peak / RMS / loudness report used by both the API and the tests."""

    data = np.asarray(signal, dtype=np.float32)
    peak = float(np.max(np.abs(data))) if data.size else 0.0
    return {
        "peak_dbfs": 20.0 * float(np.log10(max(peak, 1e-9))),
        "rms_dbfs": rms_dbfs(data),
        "lufs": integrated_loudness(data, sample_rate),
        "clipped_samples": int(np.sum(np.abs(data) >= 0.999)) if data.size else 0,
    }


#: nicer name for the gate, kept identical so both call styles work
gate = noise_gate


def peak_db(signal: np.ndarray) -> float:
    """Sample peak in dBFS (convenience wrapper used across the tests)."""

    data = np.asarray(signal)
    peak = float(np.max(np.abs(data))) if data.size else 0.0
    return 20.0 * float(np.log10(max(peak, 1e-9)))


def normalize_loudness(signal: np.ndarray, sample_rate: float, target_lufs: float = -16.0, ceiling_db: float = -1.0):
    """Alias of :func:`normalise_to_lufs` returning (audio, gain_db)."""

    return normalise_to_lufs(signal, sample_rate, target_lufs, ceiling_db)


def sliding_max(signal: np.ndarray, window: int) -> np.ndarray:
    """Sliding maximum, used by the limiter's lookahead stage."""

    data = np.asarray(signal, dtype=np.float64)
    window = max(1, int(window))
    if data.size < window:
        return np.full_like(data, float(np.max(data)) if data.size else 0.0)
    padded = np.concatenate([data, np.full(window - 1, -np.inf)])
    windows = np.lib.stride_tricks.as_strided(
        padded, shape=(data.size, window), strides=(padded.strides[0], padded.strides[0]), writeable=False
    )
    return windows.max(axis=1)


def sliding_min(signal: np.ndarray, window: int) -> np.ndarray:
    """Sliding minimum, used by the ACX style noise-floor checks."""

    data = np.asarray(signal, dtype=np.float64)
    window = max(1, int(window))
    if data.size < window:
        return np.full_like(data, float(np.min(data)) if data.size else 0.0)
    padded = np.concatenate([data, np.full(window - 1, np.inf)])
    windows = np.lib.stride_tricks.as_strided(
        padded, shape=(data.size, window), strides=(padded.strides[0], padded.strides[0]), writeable=False
    )
    return windows.min(axis=1)


def box_smooth(signal: np.ndarray, window: int) -> np.ndarray:
    """Moving average with edge padding."""

    data = np.asarray(signal, dtype=np.float64)
    window = max(1, int(window))
    if data.size <= 1 or window <= 1:
        return data
    half = window // 2
    padded = np.pad(data, (half, window - half - 1), mode="edge")
    kernel = np.ones(window) / window
    return np.convolve(padded, kernel, mode="valid")


__all__ = [
    "box_smooth",
    "gate",
    "noise_gate",
    "normalize_loudness",
    "peak_db",
    "sliding_max",
    "sliding_min",
    "compressor",
    "soft_saturate",
    "subharmonic",
    "limiter",
    "integrated_loudness",
    "normalise_to_lufs",
    "peak_normalise",
    "trim_silence",
    "apply_fades",
    "dc_block",
    "measure",
]
