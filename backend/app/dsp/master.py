"""Mastering helpers: limiter, loudness normalisation and metering.

Thin, well-named wrappers around :mod:`app.dsp.dynamics` so the render chain and
the tests read like a mastering console instead of a bag of functions.
"""

from __future__ import annotations

import numpy as np

from .dynamics import (
    apply_fades,
    box_smooth,
    dc_block,
    integrated_loudness,
    limiter,
    measure,
    normalise_to_lufs,
    normalize_loudness,
    peak_db,
    peak_normalise,
    sliding_max,
    sliding_min,
    trim_silence,
)


def lufs(signal: np.ndarray, sample_rate: float) -> float:
    """Integrated loudness in LUFS."""

    return integrated_loudness(signal, sample_rate)


def true_peak_db(signal: np.ndarray, oversample: int = 4) -> float:
    """Inter-sample peak estimate by zero-stuffed oversampling."""

    data = np.asarray(signal, dtype=np.float64)
    if data.ndim == 2:
        data = data.max(axis=1)
    if data.size == 0:
        return -120.0
    if data.size > 2_000_000:  # keep the estimate cheap on very long takes
        step = data.size // 2_000_000 + 1
        data = data[::step]
    holder = np.zeros(data.size * oversample)
    holder[::oversample] = data
    # a short windowed-sinc interpolation is enough to catch 0.3–0.5 dB peaks
    half = 8 * oversample
    taps = np.sinc(np.arange(-half, half + 1) / oversample) * np.hamming(2 * half + 1)
    taps /= taps.sum()
    smoothed = np.convolve(holder, taps, mode="same")
    return peak_db(smoothed)


def apply_output_gain(signal: np.ndarray, gain_db: float) -> np.ndarray:
    if abs(gain_db) < 0.01:
        return np.asarray(signal, dtype=np.float32)
    return (np.asarray(signal, dtype=np.float64) * 10.0 ** (gain_db / 20.0)).astype(np.float32)


__all__ = [
    "apply_fades",
    "apply_output_gain",
    "box_smooth",
    "dc_block",
    "integrated_loudness",
    "limiter",
    "lufs",
    "measure",
    "normalise_to_lufs",
    "normalize_loudness",
    "peak_db",
    "peak_normalise",
    "sliding_max",
    "sliding_min",
    "trim_silence",
    "true_peak_db",
]
