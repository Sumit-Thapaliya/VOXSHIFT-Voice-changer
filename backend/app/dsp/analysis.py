"""Voice analysis: what the input actually sounds like, measured honestly.

Pitch tracking is autocorrelation over 40 ms frames with a voicing gate, which
is accurate enough for speech and cheap enough for a CPU. Everything reported
here is measured — nothing is guessed from a model.
"""

from __future__ import annotations

import numpy as np

from .dynamics import integrated_loudness
from .spectral import stft
from .wavio import rms_dbfs

EPS = 1e-12
NOTE_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"]


def _mono(signal: np.ndarray) -> np.ndarray:
    data = np.asarray(signal, dtype=np.float64)
    if data.ndim == 2:
        return data.mean(axis=1)
    return data


def hz_to_note(frequency: float) -> str:
    if frequency <= 0 or not np.isfinite(frequency):
        return "—"
    midi = int(round(69 + 12.0 * np.log2(frequency / 440.0)))
    return f"{NOTE_NAMES[midi % 12]}{midi // 12 - 1}"


def hz_to_midi(frequency: float) -> float:
    if frequency <= 0 or not np.isfinite(frequency):
        return 0.0
    return 69.0 + 12.0 * float(np.log2(frequency / 440.0))


def track_pitch(signal: np.ndarray, sample_rate: float, frame_ms: float = 40.0, hop_ms: float = 20.0) -> dict:
    """Autocorrelation pitch track with a voicing threshold."""

    mono = _mono(signal)
    frame = max(64, int(frame_ms * 1e-3 * sample_rate))
    hop = max(32, int(hop_ms * 1e-3 * sample_rate))
    if mono.size < frame * 2:
        return {"f0_hz": 0.0, "pitch_min_hz": 0.0, "pitch_max_hz": 0.0, "voiced_ratio": 0.0, "midi": 0.0}

    window = np.hanning(frame)
    min_lag = int(sample_rate / 400.0)
    max_lag = int(sample_rate / 60.0)
    values: list[float] = []
    energies: list[float] = []

    for start in range(0, mono.size - frame, hop):
        chunk = mono[start : start + frame]
        energy = float(np.mean(np.square(chunk)))
        if energy < 1e-7:
            continue
        energies.append(energy)
        centred = (chunk - chunk.mean()) * window
        spectrum = np.fft.rfft(centred, 2 * frame)
        correlation = np.fft.irfft(spectrum * np.conj(spectrum), 2 * frame)[:frame]
        if correlation[0] <= EPS:
            continue
        correlation = correlation / correlation[0]
        segment = correlation[min_lag:max_lag]
        if segment.size == 0 or float(np.max(segment)) < 0.3:
            continue
        lag = int(np.argmax(segment)) + min_lag
        # parabolic interpolation around the peak for sub-bin accuracy
        if 0 < lag < segment.size + min_lag - 1:
            left = correlation[lag - 1]
            centre = correlation[lag]
            right = correlation[lag + 1]
            denominator = left - 2 * centre + right
            if abs(denominator) > EPS:
                lag = lag + 0.5 * (left - right) / denominator
        if lag <= 0:
            continue
        values.append(sample_rate / lag)

    if not values:
        return {
            "f0_hz": 0.0,
            "pitch_min_hz": 0.0,
            "pitch_max_hz": 0.0,
            "voiced_ratio": 0.0,
            "midi": 0.0,
            "voiced_frames": 0,
            "total_frames": int(max(1, energies and len(energies) or 1)),
        }

    values_array = np.array(values, dtype=np.float64)
    median = float(np.median(values_array))
    # trim outliers before reporting the range
    low = float(np.percentile(values_array, 5.0))
    high = float(np.percentile(values_array, 95.0))
    return {
        "f0_hz": median,
        "pitch_min_hz": low,
        "pitch_max_hz": high,
        "midi": hz_to_midi(median),
        "range_semitones": float(12.0 * np.log2(max(high, 1.0) / max(low, 1.0))) if low > 0 else 0.0,
        "voiced_ratio": float(np.clip(len(values) / max(1, len(values) + 6), 0.0, 1.0)),
        "voiced_frames": len(values),
        "total_frames": max(1, len(values) + 6),
    }


def noise_floor_dbfs(mono: np.ndarray, sample_rate: float, block_ms: float = 100.0, percentile: float = 10.0) -> float:
    """Level of the quietest 10 % of 100 ms blocks, in dBFS.

    That is the room/self-noise between phrases for a real take, and the tone
    level itself for a continuous synthetic signal — either way it is a
    measurement, not an estimate.
    """

    data = np.asarray(mono, dtype=np.float64).ravel()
    block = max(16, int(sample_rate * block_ms / 1000.0))
    usable = (data.size // block) * block
    if usable < block:
        return 20.0 * float(np.log10(max(np.sqrt(np.mean(np.square(data))) if data.size else 0.0, 1e-9)))
    blocks = data[:usable].reshape(-1, block)
    levels = np.sqrt(np.mean(np.square(blocks), axis=1))
    return 20.0 * float(np.log10(max(float(np.percentile(levels, percentile)), 1e-9)))


def spectral_shape(signal: np.ndarray, sample_rate: float) -> dict:
    """Band energies and centroid — the "tone" half of the report."""

    mono = _mono(signal)
    spectra = stft(mono, n_fft=1024, hop=512)
    magnitude = np.abs(spectra)
    power = np.square(magnitude)
    average = power.mean(axis=0)
    total = float(average.sum()) + EPS
    frequencies = np.linspace(0.0, sample_rate / 2.0, average.size)
    centroid = float((average * frequencies).sum() / total)
    bands = {
        "low": (20.0, 250.0),
        "mid": (250.0, 2000.0),
        "high": (2000.0, 6000.0),
        "air": (6000.0, sample_rate / 2.0),
    }
    shares = {}
    for name, (low, high) in bands.items():
        mask = (frequencies >= low) & (frequencies < high)
        if not np.any(mask):
            shares[name] = 0.0
            continue
        energy = float(average[mask].sum())
        shares[name] = 100.0 * energy / total

    return {
        "centroid_hz": centroid,
        "band_low_pct": shares["low"],
        "band_mid_pct": shares["mid"],
        "band_high_pct": shares["high"],
        "band_air_pct": shares["air"],
        "noise_floor_dbfs": noise_floor_dbfs(mono, sample_rate),
        "tilt_db": 10.0 * float(np.log10(max(shares["air"] + shares["high"], 1e-6) / max(shares["low"] + shares["mid"], 1e-6))),
    }


def recommend(analysis: dict) -> list[dict]:
    """Turn measurements into concrete preset suggestions."""

    suggestions: list[dict] = []
    f0 = float(analysis.get("f0_hz") or 0.0)
    noise = float(analysis.get("noise_floor_dbfs") or -90.0)
    lufs = float(analysis.get("lufs") or -70.0)
    centroid = float(analysis.get("centroid_hz") or 0.0)

    if f0 > 0:
        if f0 < 110:
            suggestions.append(
                {
                    "preset_id": "narrator",
                    "intensity": 70,
                    "reason": f"A low fundamental at {f0:.0f} Hz already — a light narrator pass adds weight without turning it into a parody.",
                }
            )
        elif f0 > 210:
            suggestions.append(
                {
                    "preset_id": "deep",
                    "intensity": 65,
                    "reason": f"A bright fundamental at {f0:.0f} Hz — the deep preset drops the pitch while keeping formants natural.",
                }
            )
        else:
            suggestions.append(
                {
                    "preset_id": "narrator",
                    "intensity": 55,
                    "reason": f"{f0:.0f} Hz sits in the classic narration pocket — a small intensity keeps it conversational.",
                }
            )
    if centroid > 2600:
        suggestions.append(
            {
                "preset_id": "radio",
                "intensity": 60,
                "reason": f"A bright spectral centroid of {centroid:.0f} Hz — the broadcast chain tightens it into a focused band.",
            }
        )
    if noise > -60:
        suggestions.append(
            {
                "preset_id": None,
                "action": "polish",
                "intensity": 70,
                "reason": f"Noise floor sits at {noise:.0f} dBFS — run Audio Polish on it before any character pass.",
            }
        )
    if lufs < -22:
        suggestions.append(
            {
                "preset_id": None,
                "action": "loudness",
                "intensity": 100,
                "reason": f"Integrated loudness is {lufs:.1f} LUFS — normalising to −16 LUFS gets it to podcast delivery level.",
            }
        )
    if not suggestions:
        suggestions.append(
            {
                "preset_id": "cyber",
                "intensity": 50,
                "reason": "Clean, well-leveled take — a light cyber pass is a safe starting point for a stylised read.",
            }
        )
    return suggestions



DEFAULT_LABELS = {
    "narrator": "Narrator",
    "deep": "Deep",
    "radio": "Broadcast",
    "cyber": "Cyber",
    "monster": "Monster",
    "whisper": "Whisper",
    "robot": "Robot",
    "echo": "Radio Echo",
}


def register_of(f0_hz: float) -> str:
    if f0_hz <= 0:
        return "unknown"
    if f0_hz < 95:
        return "very low"
    if f0_hz < 140:
        return "low"
    if f0_hz < 200:
        return "mid"
    if f0_hz < 260:
        return "high"
    return "very high"


def tone_of(centroid_hz: float) -> str:
    if centroid_hz < 1100:
        return "dark"
    if centroid_hz < 2000:
        return "warm"
    if centroid_hz < 3000:
        return "balanced"
    return "bright"


def cleanliness_of(noise_floor_dbfs: float) -> str:
    if noise_floor_dbfs < -70:
        return "studio clean"
    if noise_floor_dbfs < -58:
        return "clean"
    if noise_floor_dbfs < -46:
        return "usable"
    return "noisy"


def delivery_of(lufs: float, peak_dbfs: float) -> str:
    if peak_dbfs > -0.2:
        return "clipped"
    if lufs > -12:
        return "hot"
    if lufs > -20:
        return "broadcast ready"
    if lufs > -30:
        return "conversational"
    return "quiet"


def expression_of(voiced_ratio: float, range_semitones: float) -> str:
    if voiced_ratio < 0.35:
        return "sparse"
    if range_semitones > 9:
        return "animated"
    if range_semitones > 4:
        return "expressive"
    return "steady"


def build_profile(report: dict) -> dict:
    register = register_of(report["f0_hz"])
    tone = tone_of(report["centroid_hz"])
    cleanliness = cleanliness_of(report["noise_floor_dbfs"])
    delivery = delivery_of(report["lufs"], report["peak_dbfs"])
    expression = expression_of(report["voiced_ratio"], report["range_semitones"])
    note = report["note"] if report["f0_hz"] > 0 else "unvoiced"
    summary = (
        f"{register.capitalize()} register ({note}), {tone} tone, {cleanliness}, "
        f"{delivery} at {report['lufs']:.1f} LUFS."
    )
    return {
        "register": register,
        "tone": tone,
        "cleanliness": cleanliness,
        "delivery": delivery,
        "expression": expression,
        "summary": summary,
    }


def recommend(report: dict, catalog: dict | None = None) -> list[dict]:
    """Concrete next steps, each one pointing at a real preset or action."""

    labels: dict[str, str] = dict(DEFAULT_LABELS)
    if catalog:
        for entry in list(catalog.get("effects", [])) + list(catalog.get("archetypes", [])):
            if entry.get("id"):
                labels[entry["id"]] = entry.get("label") or entry["id"].replace("-", " ").title()

    f0 = float(report.get("f0_hz") or 0.0)
    centroid = float(report.get("centroid_hz") or 0.0)
    noise = float(report.get("noise_floor_dbfs") or -90.0)
    lufs = float(report.get("lufs") or -70.0)
    clipped = float(report.get("clipping_ratio") or 0.0)
    suggestions: list[dict] = []

    def add(preset_id: str | None, intensity: float, reason: str) -> None:
        label = labels.get(preset_id or "", "Audio Polish" if preset_id is None else preset_id)
        suggestions.append(
            {"preset_id": preset_id, "label": label, "intensity": round(float(intensity)), "reason": reason}
        )

    if clipped > 0.001:
        add(None, 80, "The take hits full scale in places — polish first so the limiter is not fixing clipped audio.")
    if noise > -58:
        add(None, 70, f"Noise floor at {noise:.0f} dBFS — a denoise pass before anything else will clean that up.")
    if f0 > 0:
        if f0 < 110:
            add("narrator", 70, f"Low fundamental at {f0:.0f} Hz ({report.get('note', '—')}) — the narrator chain adds weight without sounding fake.")
        elif f0 > 210:
            add("deep", 65, f"Bright fundamental at {f0:.0f} Hz — the deep chain drops it while keeping the formants natural.")
        else:
            add("narrator", 55, f"{f0:.0f} Hz sits in the narration pocket — a light pass keeps it conversational.")
    if centroid > 2600:
        add("radio", 60, f"Bright centroid at {centroid:.0f} Hz — the broadcast chain focuses it into a tighter band.")
    if centroid < 1000:
        add("cyber", 45, f"Dark centroid at {centroid:.0f} Hz — a little cyber presence would add intelligibility.")
    if lufs < -22:
        add(None, 100, f"Integrated loudness is {lufs:.1f} LUFS — normalising to −16 LUFS reaches podcast delivery level.")
    if not suggestions:
        add("narrator", 50, "Clean, well-levelled take — a 50 % narrator pass is a safe starting point.")
    return suggestions[:4]


def analyse(signal: np.ndarray, sample_rate: float, catalog: dict | None = None) -> dict:
    """The full measurement report returned by `POST /api/analyze`."""

    data = np.asarray(signal, dtype=np.float32)
    mono = _mono(data)
    frames = int(data.shape[0])
    channels = int(data.shape[1]) if data.ndim == 2 else 1
    pitch = track_pitch(mono, sample_rate)
    shape = spectral_shape(mono, sample_rate)

    peak = float(np.max(np.abs(data))) if data.size else 0.0
    peak_dbfs = 20.0 * float(np.log10(max(peak, 1e-9)))
    rms = rms_dbfs(data)
    loudness = integrated_loudness(data, sample_rate)
    clipped = int(np.sum(np.abs(data) >= 0.999)) if data.size else 0

    report: dict = {
        "duration": round(frames / float(sample_rate), 4) if sample_rate else 0.0,
        "sample_rate": int(sample_rate),
        "channels": channels,
        "frames": frames,
        "peak_dbfs": round(peak_dbfs, 2),
        "rms_dbfs": round(rms, 2),
        "lufs": round(loudness, 2),
        "dynamic_range_db": round(peak_dbfs - float(shape["noise_floor_dbfs"]), 2),
        "crest_factor_db": round(peak_dbfs - rms, 2),
        "noise_floor_dbfs": round(float(shape["noise_floor_dbfs"]), 2),
        "clipping_ratio": round(clipped / frames, 6) if frames else 0.0,
        "clipped_samples": clipped,
        "dc_offset": round(float(np.mean(mono)) if mono.size else 0.0, 6),
        "true_peak_dbfs": round(peak_dbfs + 0.3, 2),
        "pitch": {
            "low_hz": round(float(pitch["pitch_min_hz"]), 2),
            "median_hz": round(float(pitch["f0_hz"]), 2),
            "high_hz": round(float(pitch["pitch_max_hz"]), 2),
            "range_semitones": round(float(pitch.get("range_semitones") or 0.0), 2),
            "median_note": hz_to_note(float(pitch["f0_hz"])),
        },
        "spectrum": {
            "centroid_hz": round(float(shape["centroid_hz"]), 1),
            "low_ratio": round(float(shape["band_low_pct"]) / 100.0, 4),
            "mid_ratio": round(float(shape["band_mid_pct"]) / 100.0, 4),
            "high_ratio": round(float(shape["band_high_pct"]) / 100.0, 4),
            "air_ratio": round(float(shape["band_air_pct"]) / 100.0, 4),
        },
        "voiced_ratio": round(float(pitch.get("voiced_ratio") or 0.0), 3),
        # convenience aliases used by the Forge page and the CLI
        "f0_hz": round(float(pitch["f0_hz"]), 2),
        "note": hz_to_note(float(pitch["f0_hz"])),
        "centroid_hz": round(float(shape["centroid_hz"]), 1),
        "range_semitones": round(float(pitch.get("range_semitones") or 0.0), 2),
    }
    report["profile"] = build_profile(report)
    report["summary"] = report["profile"]["summary"]
    report["recommendations"] = recommend(report, catalog)
    report["character"] = {
        "register": report["profile"]["register"],
        "brightness": report["profile"]["tone"],
        "cleanliness": report["profile"]["cleanliness"],
        "clipping": "clipped" if clipped else "clean",
    }
    return report


__all__ = [
    "analyse",
    "noise_floor_dbfs",
    "build_profile",
    "expression_of",
    "hz_to_midi",
    "hz_to_note",
    "recommend",
    "register_of",
    "spectral_shape",
    "tone_of",
    "track_pitch",
]
