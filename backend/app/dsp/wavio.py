"""Minimal, dependency-free WAV I/O (16/24/32-bit PCM + 32-bit float).

Keeps the engine installable with nothing but numpy: no soundfile, no ffmpeg,
no model downloads. Everything it writes is a plain RIFF/WAVE file that any
player or editor can open.
"""

from __future__ import annotations

import struct
import wave
from dataclasses import dataclass
from pathlib import Path

import numpy as np

SUPPORTED_EXTENSIONS = (".wav", ".wave")
DTYPE_FOR_WIDTH = {1: np.int8, 2: np.int16, 4: np.int32}


class AudioReadError(ValueError):
    """Raised when a file is not readable audio."""


@dataclass
class AudioFile:
    """Decoded audio plus the metadata the API needs to report."""

    samples: np.ndarray  # float32, shape (frames, channels), range -1..1
    sample_rate: int
    source_format: str = "wav"
    bit_depth: int = 16

    @property
    def channels(self) -> int:
        return int(self.samples.shape[1])

    @property
    def frames(self) -> int:
        return int(self.samples.shape[0])

    @property
    def duration(self) -> float:
        return self.frames / float(self.sample_rate)


def _decode_pcm(raw: bytes, width: int, channels: int) -> np.ndarray:
    """Decode interleaved little-endian PCM into float32 in -1..1."""

    if width not in (1, 2, 3, 4):
        raise AudioReadError(f"unsupported PCM width: {width * 8}-bit")
    if channels < 1:
        raise AudioReadError("invalid channel count")

    if width == 3:
        # 24-bit needs manual unpacking: pad each 3-byte group to 4 bytes.
        usable = len(raw) - (len(raw) % 3)
        data = np.frombuffer(raw[:usable], dtype=np.uint8).reshape(-1, 3)
        padded = np.zeros((data.shape[0], 4), dtype=np.uint8)
        padded[:, 0:3] = data  # little-endian: LSB first, 4th byte stays 0
        ints = padded.view(np.int32).reshape(-1).astype(np.int64)
        # sign-extend the 24-bit two's complement value
        ints = np.where(ints >= (1 << 23), ints - (1 << 24), ints)
        values = ints.astype(np.float64) / float(1 << 23)
    else:
        dtype = DTYPE_FOR_WIDTH[width]
        usable = len(raw) - (len(raw) % (width * channels))
        values = np.frombuffer(raw[:usable], dtype=dtype).astype(np.float64)
        if width == 1:
            values = (values - 128.0) / 128.0
        else:
            values /= float(1 << (width * 8 - 1))

    remainder = values.size % channels
    if remainder:
        values = values[: values.size - remainder]
    if values.size == 0:
        raise AudioReadError("audio file contains no samples")
    return values.reshape(-1, channels).astype(np.float32)


def assert_wav_container(path: str | Path) -> None:
    """Reject anything that is not a RIFF/WAVE file, from the first 12 bytes.

    Queuing a job only to fail inside the worker is a bad experience: the client
    gets an immediate, specific error instead (the studio shows it as a toast).
    Deeper validation still happens when the worker decodes the file.
    """

    try:
        with open(Path(path), "rb") as handle:
            header = handle.read(12)
    except OSError as error:
        raise AudioReadError(str(error)) from error
    if len(header) < 12 or header[:4] != b"RIFF" or header[8:12] != b"WAVE":
        suffix = Path(path).suffix.lower() or "unknown"
        raise AudioReadError(
            f"Unsupported file type ({suffix}). The engine reads WAV audio — 16, 24 or 32-bit PCM."
        )


def load_audio(path: str | Path, max_seconds: float | None = None) -> AudioFile:
    """Read a WAV file from disk."""

    path = Path(path)
    try:
        with wave.open(str(path), "rb") as handle:
            channels = handle.getnchannels()
            width = handle.getsampwidth()
            sample_rate = handle.getframerate()
            frames = handle.getnframes()
            if max_seconds is not None:
                frames = min(frames, int(max_seconds * sample_rate))
            raw = handle.readframes(frames)
    except (wave.Error, EOFError, struct.error) as error:  # not a RIFF/WAVE container
        label = path.suffix.lower() or "unknown"
        raise AudioReadError(
            f"Unsupported file type ({label}). The engine reads WAV audio — 16, 24 or 32-bit PCM."
        ) from error
    except OSError as error:
        raise AudioReadError(str(error)) from error

    if sample_rate < 4000 or sample_rate > 384000:
        raise AudioReadError(f"unusual sample rate: {sample_rate} Hz")
    samples = _decode_pcm(raw, width, channels)
    return AudioFile(samples=samples, sample_rate=sample_rate, bit_depth=width * 8)


def write_wav(
    path: str | Path,
    samples: np.ndarray,
    sample_rate: int,
    bit_depth: int = 16,
) -> Path:
    """Write float samples (-1..1) to a PCM WAV file."""

    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    data = np.asarray(samples, dtype=np.float64)
    if data.ndim == 1:
        data = data[:, None]
    if bit_depth not in (16, 24, 32):
        raise ValueError("bit depth must be 16, 24 or 32")

    peak = float(np.max(np.abs(data))) if data.size else 0.0
    if peak > 1.0:  # never wrap: scale down instead of clipping the container
        data = data / peak

    if bit_depth == 24:
        scaled = np.clip(data, -1.0, 1.0) * (2**23 - 1)
        ints = np.rint(scaled).astype(np.int32)
        packed = ints.astype("<i4").view(np.uint8).reshape(-1, 4)[:, :3].copy()
        payload = packed.tobytes()
    else:
        limit = float(2 ** (bit_depth - 1) - 1)
        scaled = np.rint(np.clip(data, -1.0, 1.0) * limit).astype(DTYPE_FOR_WIDTH[bit_depth // 8])
        payload = scaled.tobytes()

    with wave.open(str(path), "wb") as handle:
        handle.setnchannels(int(data.shape[1]))
        handle.setsampwidth(bit_depth // 8)
        handle.setframerate(int(sample_rate))
        handle.writeframes(payload)
    return path


def write_wav_bytes(samples: np.ndarray, sample_rate: int, bit_depth: int = 16) -> bytes:
    """Same as :func:`write_wav` but returns the file in memory (for tests)."""

    import io

    buffer = io.BytesIO()
    data = np.asarray(samples, dtype=np.float64)
    if data.ndim == 1:
        data = data[:, None]
    if bit_depth == 24:
        scaled = np.clip(data, -1.0, 1.0) * (2**23 - 1)
        ints = np.rint(scaled).astype(np.int32)
        payload = ints.astype("<i4").view(np.uint8).reshape(-1, 4)[:, :3].copy().tobytes()
    else:
        limit = float(2 ** (bit_depth - 1) - 1)
        payload = np.rint(np.clip(data, -1.0, 1.0) * limit).astype(DTYPE_FOR_WIDTH[bit_depth // 8]).tobytes()
    with wave.open(buffer, "wb") as handle:
        handle.setnchannels(int(data.shape[1]))
        handle.setsampwidth(bit_depth // 8)
        handle.setframerate(int(sample_rate))
        handle.writeframes(payload)
    return buffer.getvalue()


def resample_linear(samples: np.ndarray, source_rate: int, target_rate: int) -> np.ndarray:
    """Linear resampling; used for sample-rate conversion and pitch shifting."""

    if source_rate == target_rate:
        return samples
    data = np.asarray(samples, dtype=np.float64)
    one_dimensional = data.ndim == 1
    if one_dimensional:
        data = data[:, None]
    frames = data.shape[0]
    target_frames = max(1, int(round(frames * target_rate / float(source_rate))))
    positions = np.linspace(0.0, frames - 1.0, target_frames)
    source_index = np.arange(frames, dtype=np.float64)
    out = np.empty((target_frames, data.shape[1]), dtype=np.float32)
    for channel in range(data.shape[1]):
        out[:, channel] = np.interp(positions, source_index, data[:, channel]).astype(np.float32)
    return out[:, 0] if one_dimensional else out


def peak_dbfs(samples: np.ndarray) -> float:
    peak = float(np.max(np.abs(samples))) if np.size(samples) else 0.0
    return 20.0 * float(np.log10(max(peak, 1e-9)))


def rms_dbfs(samples: np.ndarray) -> float:
    if np.size(samples) == 0:
        return -120.0
    rms = float(np.sqrt(np.mean(np.square(np.asarray(samples, dtype=np.float64)))))
    return 20.0 * float(np.log10(max(rms, 1e-9)))


__all__ = [
    "SUPPORTED_EXTENSIONS",
    "assert_wav_container",
    "AudioFile",
    "AudioReadError",
    "load_audio",
    "write_wav",
    "write_wav_bytes",
    "resample_linear",
    "peak_dbfs",
    "rms_dbfs",
]


# ---------------------------------------------------------------------------
# Compatibility surface used by the routers and the test-suite
# ---------------------------------------------------------------------------

#: Decoding is numpy-only: WAV in, WAV out, nothing to install.
SUPPORTED_WAV_EXT = SUPPORTED_EXTENSIONS
#: Extras we would accept if a system ffmpeg happened to be present.
COMPRESSED_EXT = (".mp3", ".m4a", ".aac", ".ogg", ".opus", ".flac")

AudioDecodeError = AudioReadError


def ffmpeg_available() -> bool:
    """True when a `ffmpeg` binary can be executed (optional, never required)."""

    import shutil as _shutil

    return _shutil.which("ffmpeg") is not None


FFMPEG = ffmpeg_available()


def decode_audio(path: str | Path, target_rate: int | None = None) -> tuple[np.ndarray, int]:
    """Read `path` and return (samples[N, C] float32, sample_rate)."""

    audio = load_audio(path)
    samples = audio.samples
    rate = audio.sample_rate
    if target_rate and int(target_rate) != rate:
        samples = resample(samples, rate, int(target_rate))
        rate = int(target_rate)
    return np.ascontiguousarray(samples, dtype=np.float32), int(rate)


def resample(samples: np.ndarray, source_rate: int, target_rate: int) -> np.ndarray:
    """Resample 1-D or (frames, channels) audio by linear interpolation."""

    return resample_linear(samples, int(source_rate), int(target_rate))


def peak_db(samples: np.ndarray) -> float:
    return peak_dbfs(samples)


def duration_seconds(samples: np.ndarray, sample_rate: int) -> float:
    frames = np.asarray(samples).shape[0]
    return float(frames) / float(sample_rate or 1)


def waveform_peaks(samples: np.ndarray, points: int = 160) -> list[float]:
    """Downsample to `points` normalised peak values (for the Studio waveform)."""

    data = np.asarray(samples, dtype=np.float32)
    if data.ndim == 2:
        data = data.max(axis=1)
    points = max(8, int(points))
    if data.size == 0:
        return [0.0] * points
    usable = (data.size // points) * points
    if usable == 0:
        padded = np.zeros(points, dtype=np.float32)
        padded[: data.size] = data
        values = np.abs(padded)
    else:
        values = np.abs(data[:usable].reshape(points, -1)).max(axis=1)
    peak = float(values.max()) if values.size else 0.0
    if peak > 0:
        values = values / peak
    return [round(float(value), 4) for value in values]
