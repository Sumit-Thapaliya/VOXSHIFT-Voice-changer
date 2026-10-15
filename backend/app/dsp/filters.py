"""Biquad filter design + fast IIR filtering through impulse responses.

Pure numpy has no recursive filter, so instead of a per-sample Python loop we
build the filter's impulse response (a few thousand taps is enough for any
stable biquad) and run it through an overlap-add FFT convolution. On a CPU this
is an order of magnitude faster than trying to recurse in Python and it matches
the analytic response to well under a decibel.
"""

from __future__ import annotations

import numpy as np

EPS = 1e-12


def biquad_coeffs(kind: str, sample_rate: float, frequency: float, q: float = 0.707, gain_db: float = 0.0):
    """RBJ audio-EQ-cookbook coefficients. Returns (b, a) with a[0] normalised."""

    nyquist = sample_rate / 2.0
    frequency = float(np.clip(frequency, 10.0, nyquist * 0.98))
    q = float(max(q, 0.05))
    w0 = 2.0 * np.pi * frequency / sample_rate
    cos_w0 = float(np.cos(w0))
    sin_w0 = float(np.sin(w0))
    alpha = sin_w0 / (2.0 * q)
    amplitude = 10.0 ** (gain_db / 40.0)

    if kind == "lowpass":
        b = [(1 - cos_w0) / 2, 1 - cos_w0, (1 - cos_w0) / 2]
        a = [1 + alpha, -2 * cos_w0, 1 - alpha]
    elif kind == "highpass":
        b = [(1 + cos_w0) / 2, -(1 + cos_w0), (1 + cos_w0) / 2]
        a = [1 + alpha, -2 * cos_w0, 1 - alpha]
    elif kind == "bandpass":
        b = [alpha, 0.0, -alpha]
        a = [1 + alpha, -2 * cos_w0, 1 - alpha]
    elif kind == "notch":
        b = [1.0, -2 * cos_w0, 1.0]
        a = [1 + alpha, -2 * cos_w0, 1 - alpha]
    elif kind == "peaking":
        b = [1 + alpha * amplitude, -2 * cos_w0, 1 - alpha * amplitude]
        a = [1 + alpha / amplitude, -2 * cos_w0, 1 - alpha / amplitude]
    elif kind == "lowshelf":
        sqrt_a = float(np.sqrt(amplitude))
        b = [
            amplitude * ((amplitude + 1) - (amplitude - 1) * cos_w0 + 2 * sqrt_a * alpha),
            2 * amplitude * ((amplitude - 1) - (amplitude + 1) * cos_w0),
            amplitude * ((amplitude + 1) - (amplitude - 1) * cos_w0 - 2 * sqrt_a * alpha),
        ]
        a = [
            (amplitude + 1) + (amplitude - 1) * cos_w0 + 2 * sqrt_a * alpha,
            -2 * ((amplitude - 1) + (amplitude + 1) * cos_w0),
            (amplitude + 1) + (amplitude - 1) * cos_w0 - 2 * sqrt_a * alpha,
        ]
    elif kind == "highshelf":
        sqrt_a = float(np.sqrt(amplitude))
        b = [
            amplitude * ((amplitude + 1) + (amplitude - 1) * cos_w0 + 2 * sqrt_a * alpha),
            -2 * amplitude * ((amplitude - 1) + (amplitude + 1) * cos_w0),
            amplitude * ((amplitude + 1) + (amplitude - 1) * cos_w0 - 2 * sqrt_a * alpha),
        ]
        a = [
            (amplitude + 1) - (amplitude - 1) * cos_w0 + 2 * sqrt_a * alpha,
            2 * ((amplitude - 1) - (amplitude + 1) * cos_w0),
            (amplitude + 1) - (amplitude - 1) * cos_w0 - 2 * sqrt_a * alpha,
        ]
    else:  # pragma: no cover - defensive
        raise ValueError(f"unknown filter kind: {kind}")

    a0 = a[0] if abs(a[0]) > EPS else EPS
    return np.array(b, dtype=np.float64) / a0, np.array(a, dtype=np.float64) / a0


def impulse_response(b: np.ndarray, a: np.ndarray, length: int = 4096) -> np.ndarray:
    """Impulse response of a stable biquad, computed with a small python loop."""

    length = int(max(64, length))
    x = np.zeros(length, dtype=np.float64)
    x[0] = 1.0
    y = np.zeros(length, dtype=np.float64)
    a1, a2 = float(a[1]), float(a[2])
    b0, b1, b2 = float(b[0]), float(b[1]), float(b[2])
    x1 = x2 = y1 = y2 = 0.0
    for index in range(length):
        current = x[index]
        value = b0 * current + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2
        y[index] = value
        x2, x1 = x1, current
        y2, y1 = y1, value
        if abs(value) < 1e-12 and index > 64 and abs(y1) < 1e-12:
            break
    return y


def fft_convolve(signal: np.ndarray, kernel: np.ndarray, block_size: int = 1 << 15) -> np.ndarray:
    """Overlap-add FFT convolution, works on 1-D input or per channel."""

    data = np.asarray(signal, dtype=np.float64)
    kernel = np.asarray(kernel, dtype=np.float64)
    if abs(kernel.sum()) < EPS and not np.any(kernel):
        return data.astype(np.float32)

    one_dimensional = data.ndim == 1
    if one_dimensional:
        data = data[:, None]

    frames = data.shape[0]
    channels = data.shape[1]
    tap_length = kernel.size
    step = max(1024, block_size - tap_length + 1)
    n_fft = 1 << int(np.ceil(np.log2(step + tap_length - 1)))
    kernel_spectrum = np.fft.rfft(kernel, n_fft)
    out = np.zeros((frames + tap_length - 1, channels), dtype=np.float64)

    for start in range(0, frames, step):
        chunk = data[start : start + step]
        if chunk.shape[0] == 0:
            break
        spectrum = np.fft.rfft(chunk, n_fft, axis=0) * kernel_spectrum[:, None]
        block = np.fft.irfft(spectrum, n_fft, axis=0)
        stop = min(out.shape[0], start + n_fft)
        out[start:stop] += block[: stop - start]

    out = out[:frames]
    return out[:, 0].astype(np.float32) if one_dimensional else out.astype(np.float32)


def apply_biquad(signal: np.ndarray, kind: str, sample_rate: float, frequency: float, q: float = 0.707, gain_db: float = 0.0):
    """Single biquad pass."""

    if abs(gain_db) < 0.01 and kind in ("lowshelf", "highshelf", "peaking"):
        return np.asarray(signal, dtype=np.float32)
    b, a = biquad_coeffs(kind, sample_rate, frequency, q, gain_db)
    taps = 8192 if frequency < 200 else 4096
    return fft_convolve(signal, impulse_response(b, a, taps))


def highpass(signal: np.ndarray, sample_rate: float, frequency: float, q: float = 0.707):
    return apply_biquad(signal, "highpass", sample_rate, frequency, q)


def lowpass(signal: np.ndarray, sample_rate: float, frequency: float, q: float = 0.707):
    return apply_biquad(signal, "lowpass", sample_rate, frequency, q)


def peaking(signal: np.ndarray, sample_rate: float, frequency: float, gain_db: float, q: float = 1.0):
    return apply_biquad(signal, "peaking", sample_rate, frequency, q, gain_db)


def low_shelf(signal: np.ndarray, sample_rate: float, frequency: float, gain_db: float):
    return apply_biquad(signal, "lowshelf", sample_rate, frequency, 0.707, gain_db)


def high_shelf(signal: np.ndarray, sample_rate: float, frequency: float, gain_db: float):
    return apply_biquad(signal, "highshelf", sample_rate, frequency, 0.707, gain_db)


def bandpass(signal: np.ndarray, sample_rate: float, low_hz: float, high_hz: float):
    """Two-pole band pass built from a high pass and a low pass."""

    filtered = highpass(signal, sample_rate, low_hz, 0.707)
    return lowpass(filtered, sample_rate, high_hz, 0.707)


def tilt(signal: np.ndarray, sample_rate: float, tilt_db: float, pivot_hz: float = 1000.0):
    """Spectral tilt around a pivot frequency, ±tilt_db spread across the band."""

    if abs(tilt_db) < 0.01:
        return np.asarray(signal, dtype=np.float32)
    half = tilt_db / 2.0
    bright = high_shelf(signal, sample_rate, pivot_hz, half)
    return low_shelf(bright, sample_rate, pivot_hz, -half)


def dc_block(signal: np.ndarray, sample_rate: float):
    """Remove DC offset with a very low corner high pass."""

    return highpass(signal, sample_rate, 8.0, 0.707)


__all__ = [
    "biquad_coeffs",
    "impulse_response",
    "fft_convolve",
    "apply_biquad",
    "highpass",
    "lowpass",
    "peaking",
    "low_shelf",
    "high_shelf",
    "bandpass",
    "tilt",
    "dc_block",
]
