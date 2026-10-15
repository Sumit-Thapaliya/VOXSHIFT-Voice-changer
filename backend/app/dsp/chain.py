"""The voice chain: a plain-data description of a voice design.

`shared/voice-presets.json` is the single source of truth for the parameter
ranges and for every shipped preset. The browser engine and this Python engine
read the same numbers, which is why a design forged in the browser sounds the
same when it is rendered here.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Callable, Iterable

import numpy as np

from . import analysis, dynamics, effects, filters, spectral

ProgressCallback = Callable[[str, int], None]


@dataclass
class MasterSpec:
    highpass_hz: float = 60.0
    lowpass_hz: float = 0.0
    denoise: float = 0.0
    output_gain_db: float = 0.0
    normalize: bool = True
    target_lufs: float = -16.0
    limiter_ceiling_db: float = -1.0
    trim_silence: bool = False
    fade_ms: float = 8.0

    @classmethod
    def from_dict(cls, payload: dict | None) -> "MasterSpec":
        payload = payload or {}
        defaults = cls()
        return cls(
            highpass_hz=_number(payload.get("highpassHz"), defaults.highpass_hz, 0.0, 400.0),
            lowpass_hz=_number(payload.get("lowpassHz"), defaults.lowpass_hz, 0.0, 20000.0),
            denoise=_number(payload.get("denoise"), defaults.denoise, 0.0, 100.0),
            output_gain_db=_number(payload.get("outputGainDb"), defaults.output_gain_db, -24.0, 24.0),
            normalize=bool(payload.get("normalize", defaults.normalize)),
            target_lufs=_number(payload.get("targetLufs"), defaults.target_lufs, -30.0, -8.0),
            limiter_ceiling_db=_number(payload.get("limiterCeilingDb"), defaults.limiter_ceiling_db, -6.0, 0.0),
            trim_silence=bool(payload.get("trimSilence", defaults.trim_silence)),
            fade_ms=_number(payload.get("fadeMs"), defaults.fade_ms, 0.0, 200.0),
        )

    def to_dict(self) -> dict:
        return {
            "highpassHz": self.highpass_hz,
            "lowpassHz": self.lowpass_hz,
            "denoise": self.denoise,
            "outputGainDb": self.output_gain_db,
            "normalize": self.normalize,
            "targetLufs": self.target_lufs,
            "limiterCeilingDb": self.limiter_ceiling_db,
            "trimSilence": self.trim_silence,
            "fadeMs": self.fade_ms,
        }


#: module -> (default, minimum, maximum)
MODULE_RANGES: dict[str, tuple[float, float, float]] = {
    "pitch": (0.0, -24.0, 24.0),
    "formant": (0.0, -12.0, 12.0),
    "body": (0.0, 0.0, 100.0),
    "presence": (0.0, 0.0, 100.0),
    "air": (0.0, 0.0, 100.0),
    "warmth": (0.0, 0.0, 100.0),
    "growl": (0.0, 0.0, 100.0),
    "ring": (0.0, 0.0, 100.0),
    "ringFreq": (88.0, 30.0, 400.0),
    "vibrato": (0.0, 0.0, 100.0),
    "vibratoRate": (5.2, 3.0, 9.0),
    "breath": (0.0, 0.0, 100.0),
    "gate": (0.0, 0.0, 100.0),
    "comp": (0.0, 0.0, 100.0),
    "deess": (0.0, 0.0, 100.0),
    "space": (0.0, 0.0, 100.0),
    "echo": (0.0, 0.0, 100.0),
    "echoTime": (190.0, 40.0, 600.0),
}

#: modules that make sense to scale with an intensity control
SCALABLE = (
    "pitch",
    "formant",
    "body",
    "presence",
    "air",
    "warmth",
    "growl",
    "ring",
    "vibrato",
    "breath",
    "gate",
    "comp",
    "deess",
    "space",
    "echo",
)


def _number(value, default: float, minimum: float, maximum: float) -> float:
    try:
        number = float(value)
    except (TypeError, ValueError):
        return float(default)
    if not np.isfinite(number):
        return float(default)
    return float(np.clip(number, minimum, maximum))


@dataclass
class VoiceChain:
    """Validated voice design."""

    modules: dict[str, float] = field(default_factory=dict)
    master: MasterSpec = field(default_factory=MasterSpec)

    @classmethod
    def from_dict(cls, payload: dict | None) -> "VoiceChain":
        payload = payload or {}
        raw_modules = payload.get("modules") if isinstance(payload.get("modules"), dict) else payload
        modules: dict[str, float] = {}
        for name, (default, minimum, maximum) in MODULE_RANGES.items():
            if isinstance(raw_modules, dict) and name in raw_modules:
                modules[name] = _number(raw_modules.get(name), default, minimum, maximum)
            else:
                modules[name] = default
        master = MasterSpec.from_dict(payload.get("master") if isinstance(payload.get("master"), dict) else None)
        return cls(modules=modules, master=master)

    def with_intensity(self, intensity: float) -> "VoiceChain":
        """Scale every module toward its neutral value by `intensity` %."""

        strength = float(np.clip(_number(intensity, 100.0, 0.0, 100.0), 0.0, 100.0)) / 100.0
        blended = {}
        for name, value in self.modules.items():
            if name in SCALABLE:
                blended[name] = value * strength
            elif name == "ringFreq":
                blended[name] = value
            elif name == "vibratoRate":
                blended[name] = value
            elif name == "echoTime":
                blended[name] = value
            else:
                blended[name] = value
        return VoiceChain(modules=blended, master=self.master)

    def is_neutral(self) -> bool:
        return all(abs(self.modules[name]) < 1e-6 for name in SCALABLE)

    def to_dict(self) -> dict:
        return {"modules": dict(self.modules), "master": self.master.to_dict()}


def render(
    samples: np.ndarray,
    sample_rate: int,
    chain: VoiceChain,
    progress: ProgressCallback | None = None,
) -> tuple[np.ndarray, list[str]]:
    """Run a full voice design over `samples` (float32, -1..1).

    Returns the rendered audio and the list of stages that actually ran.
    """

    def report(stage: str, percent: int) -> None:
        if progress:
            progress(stage, percent)

    modules = chain.modules
    master = chain.master
    audio = np.asarray(samples, dtype=np.float32)
    stages: list[str] = []

    report("Cleaning", 8)
    if master.denoise > 0.5:
        audio = spectral.denoise(audio, sample_rate, master.denoise)
        stages.append("denoise")
    audio = dynamics.dc_block(audio, sample_rate)

    if master.highpass_hz > 0:
        audio = filters.highpass(audio, sample_rate, master.highpass_hz, 0.707)
        stages.append("highpass")
    if master.lowpass_hz > 0 and master.lowpass_hz < sample_rate / 2.0:
        audio = filters.lowpass(audio, sample_rate, master.lowpass_hz, 0.707)
        stages.append("lowpass")

    report("Shifting", 34)
    if abs(modules["pitch"]) > 0.01 or abs(modules["formant"]) > 0.01:
        audio = spectral.pitch_shift(audio, sample_rate, modules["pitch"], modules["formant"])
        stages.append("pitch/formant")

    report("Shaping tone", 52)
    if modules["body"] > 0.5:
        audio = filters.low_shelf(audio, sample_rate, 180.0, 7.0 * modules["body"] / 100.0)
        stages.append("body")
    if modules["presence"] > 0.5:
        audio = filters.peaking(audio, sample_rate, 3200.0, 7.0 * modules["presence"] / 100.0, 0.9)
        stages.append("presence")
    if modules["air"] > 0.5:
        audio = filters.high_shelf(audio, sample_rate, 9000.0, 8.0 * modules["air"] / 100.0)
        stages.append("air")

    report("Dynamics", 66)
    if modules["gate"] > 0.5:
        audio = dynamics.noise_gate(audio, sample_rate, modules["gate"])
        stages.append("gate")
    if modules["deess"] > 0.5:
        audio = spectral.de_ess(audio, sample_rate, modules["deess"])
        stages.append("deess")
    if modules["comp"] > 0.5:
        audio = dynamics.compressor(audio, sample_rate, modules["comp"])
        stages.append("comp")

    report("Character", 78)
    if modules["warmth"] > 0.5:
        audio = dynamics.soft_saturate(audio, modules["warmth"], asymmetry=0.35)
        stages.append("warmth")
    if modules["growl"] > 0.5:
        audio = dynamics.subharmonic(audio, sample_rate, modules["growl"])
        audio = dynamics.soft_saturate(audio, min(70.0, modules["growl"] * 0.7), asymmetry=0.6)
        stages.append("growl")
    if modules["ring"] > 0.5:
        audio = effects.ring_modulate(audio, sample_rate, modules["ring"], modules["ringFreq"])
        stages.append("ring")
    if modules["vibrato"] > 0.5:
        audio = effects.vibrato(audio, sample_rate, modules["vibrato"], modules["vibratoRate"])
        stages.append("vibrato")
    if modules["breath"] > 0.5:
        audio = effects.breath(audio, sample_rate, modules["breath"])
        stages.append("breath")

    report("Space and time", 88)
    if modules["echo"] > 0.5:
        audio = effects.echo(audio, sample_rate, modules["echo"], modules["echoTime"], 0.32)
        stages.append("echo")
    if modules["space"] > 0.5:
        audio = effects.reverb(audio, sample_rate, modules["space"], decay_s=1.1 + 1.4 * modules["space"] / 100.0)
        stages.append("space")

    report("Mastering", 95)
    if master.trim_silence:
        audio = dynamics.trim_silence(audio, sample_rate)
        stages.append("trim")
    if master.normalize:
        audio, _gain = dynamics.normalise_to_lufs(audio, sample_rate, master.target_lufs, master.limiter_ceiling_db)
        stages.append("loudness")
    elif master.limiter_ceiling_db < 0:
        audio = dynamics.limiter(audio, sample_rate, master.limiter_ceiling_db)
        stages.append("limiter")
    if abs(master.output_gain_db) > 0.01:
        audio = (np.asarray(audio, dtype=np.float64) * 10.0 ** (master.output_gain_db / 20.0)).astype(np.float32)
        stages.append("gain")
    if master.fade_ms > 0:
        audio = dynamics.apply_fades(audio, sample_rate, master.fade_ms)
        stages.append("fades")

    report("Finished", 100)
    peak = float(np.max(np.abs(audio))) if audio.size else 0.0
    if peak > 1.0:
        audio = (audio / peak).astype(np.float32)
    return audio.astype(np.float32), stages


# ---------------------------------------------------------------------------
# Flat parameter surface used by the API, the CLI and the tests
# ---------------------------------------------------------------------------

#: flat field -> (default, minimum, maximum). Master fields live in the same
#: struct so a render request is one dictionary end to end.
FLAT_RANGES: dict[str, tuple[float, float, float]] = {
    **{name: values for name, values in MODULE_RANGES.items()},
    "highpassHz": (60.0, 0.0, 500.0),
    "lowpassHz": (0.0, 0.0, 20000.0),
    "denoise": (0.0, 0.0, 100.0),
    "outputGainDb": (0.0, -24.0, 24.0),
    "targetLufs": (-16.0, -30.0, -6.0),
    "limiterCeilingDb": (-1.0, -6.0, 0.0),
    "fadeMs": (8.0, 0.0, 200.0),
}

MODULE_LABELS: dict[str, tuple[str, str]] = {
    "pitch": ("Pitch", "st"),
    "formant": ("Formant", "st"),
    "body": ("Body", "%"),
    "presence": ("Presence", "%"),
    "air": ("Air", "%"),
    "warmth": ("Warmth", "%"),
    "growl": ("Growl", "%"),
    "ring": ("Ring modulation", "%"),
    "vibrato": ("Vibrato", "%"),
    "breath": ("Breath", "%"),
    "gate": ("Noise gate", "%"),
    "comp": ("Compression", "%"),
    "deess": ("De-esser", "%"),
    "space": ("Space", "%"),
    "echo": ("Echo", "%"),
    "denoise": ("Denoise", "%"),
}


@dataclass
class ModuleSet:
    """Every knob of one render, flat and validated."""

    pitch: float = 0.0
    formant: float = 0.0
    body: float = 0.0
    presence: float = 0.0
    air: float = 0.0
    warmth: float = 0.0
    growl: float = 0.0
    ring: float = 0.0
    ringFreq: float = 88.0
    vibrato: float = 0.0
    vibratoRate: float = 5.2
    breath: float = 0.0
    gate: float = 0.0
    comp: float = 0.0
    deess: float = 0.0
    space: float = 0.0
    echo: float = 0.0
    echoTime: float = 190.0
    highpassHz: float = 60.0
    lowpassHz: float = 0.0
    denoise: float = 0.0
    outputGainDb: float = 0.0
    normalize: bool = True
    targetLufs: float = -16.0
    limiterCeilingDb: float = -1.0
    trimSilence: bool = False
    fadeMs: float = 8.0

    def modules(self) -> dict[str, float]:
        return {name: float(getattr(self, name)) for name in MODULE_RANGES}

    def master(self) -> MasterSpec:
        return MasterSpec(
            highpass_hz=self.highpassHz,
            lowpass_hz=self.lowpassHz,
            denoise=self.denoise,
            output_gain_db=self.outputGainDb,
            normalize=self.normalize,
            target_lufs=self.targetLufs,
            limiter_ceiling_db=self.limiterCeilingDb,
            trim_silence=self.trimSilence,
            fade_ms=self.fadeMs,
        )

    def to_chain(self) -> VoiceChain:
        return VoiceChain(modules=self.modules(), master=self.master())

    def to_dict(self) -> dict:
        payload = {name: float(getattr(self, name)) for name in FLAT_RANGES}
        payload["normalize"] = bool(self.normalize)
        return payload

    def describe(self) -> list[dict]:
        """Human-readable list of the modules that actually do something."""

        summary: list[dict] = []
        for name, (label, unit) in MODULE_LABELS.items():
            value = float(getattr(self, name, 0.0))
            if abs(value) > 0.5:
                summary.append({"module": name, "label": label, "value": round(value, 2), "unit": unit})
        return summary


@dataclass
class RenderResult:
    """What one render produced, with the numbers to prove it."""

    audio: np.ndarray
    sample_rate: int
    metrics: dict
    stages: list[str]
    modules: ModuleSet | None = None

    @property
    def duration(self) -> float:
        return self.metrics.get("duration", 0.0)


def clamp_module(name: str, value) -> float:
    default, minimum, maximum = FLAT_RANGES.get(name, (0.0, -1e9, 1e9))
    return _number(value, default, minimum, maximum)


def modules_from_mapping(values: dict | None, master_values: dict | None = None) -> ModuleSet:
    """Build a validated :class:`ModuleSet` from loose dictionaries."""

    payload: dict = dict(values or {})
    if isinstance(master_values, dict):
        payload.update(master_values)
    data: dict[str, float | bool] = {}
    for name in FLAT_RANGES:
        if name in payload and payload[name] is not None and payload[name] != "":
            data[name] = clamp_module(name, payload[name])
        else:
            data[name] = FLAT_RANGES[name][0]
    data["normalize"] = bool(payload.get("normalize", payload.get("normalise", True)))
    return ModuleSet(**data)  # type: ignore[arg-type]


def blend_intensity(values: dict, defaults: dict, intensity: float) -> dict:
    """Scale a preset toward its neutral defaults (0 % = bypass, 100 % = full)."""

    strength = float(np.clip(_number(intensity, 100.0, 0.0, 100.0), 0.0, 100.0)) / 100.0
    blended: dict[str, float] = {}
    for name, value in (values or {}).items():
        neutral = defaults.get(name, 0.0)
        blended[name] = neutral + (float(value) - float(neutral)) * strength
    return blended


def preset_modules(catalog: dict, preset_id: str, intensity: float = 100.0) -> ModuleSet:
    """Look a preset (effect or archetype) up in the catalogue and scale it."""

    entry = None
    for candidate in list(catalog.get("effects", [])) + list(catalog.get("archetypes", [])):
        if candidate.get("id") == preset_id:
            entry = candidate
            break
    if entry is None:
        raise ValueError(f"Unknown preset: {preset_id}")

    chain_payload = entry.get("chain") or {}
    master_keys = ("highpassHz", "lowpassHz", "denoise", "outputGainDb", "normalize", "targetLufs", "limiterCeilingDb", "trimSilence", "fadeMs")
    # the shared spec stores either a flat chain or {modules, master}
    nested_modules = chain_payload.get("modules")
    if isinstance(nested_modules, dict):
        values = dict(nested_modules)
    else:
        values = {key: value for key, value in chain_payload.items() if key in MODULE_RANGES}
    values.update({key: value for key, value in chain_payload.items() if key in master_keys and not isinstance(value, dict)})
    master_values = dict(catalog.get("master_defaults") or {})
    master_values.update(dict(chain_payload.get("master") or {}))
    for key in master_keys:
        if key in chain_payload and not isinstance(chain_payload[key], dict):
            master_values[key] = chain_payload[key]
    values = {key: value for key, value in values.items() if key in MODULE_RANGES}

    defaults = dict(catalog.get("defaults") or {})
    if intensity < 100.0:
        values = blend_intensity(values, defaults, intensity)
    return modules_from_mapping(values, master_values)


def render_chain(
    audio: np.ndarray,
    sample_rate: int,
    modules: ModuleSet,
    progress: Callable[[int, str], None] | None = None,
) -> RenderResult:
    """Render one :class:`ModuleSet` and report the measurements."""

    reported: list[tuple[str, int]] = []

    def relay(stage: str, percent: int) -> None:
        reported.append((stage, percent))
        if progress:
            progress(percent, stage)

    rendered, stages = render(audio, sample_rate, modules.to_chain(), progress=relay)
    metrics = measure_output(rendered, sample_rate, stages, reported)
    return RenderResult(audio=rendered, sample_rate=sample_rate, metrics=metrics, stages=stages, modules=modules)


def render_preset(
    audio: np.ndarray,
    sample_rate: int,
    catalog: dict,
    preset_id: str,
    intensity: float = 100.0,
    progress: Callable[[int, str], None] | None = None,
) -> RenderResult:
    """Convenience wrapper: preset id in, finished audio out."""

    return render_chain(audio, sample_rate, preset_modules(catalog, preset_id, intensity), progress)


def measure_output(
    audio: np.ndarray,
    sample_rate: int,
    stages: list[str] | None = None,
    reported: list[tuple[str, int]] | None = None,
) -> dict:
    """Metrics reported with every finished job."""

    data = np.asarray(audio, dtype=np.float32)
    analysis_report = analysis.analyse(data, sample_rate)
    metrics = {
        "duration": round(data.shape[0] / float(sample_rate), 3),
        "sample_rate": int(sample_rate),
        "channels": int(data.shape[1]) if data.ndim == 2 else 1,
        "peak_dbfs": round(analysis_report["peak_dbfs"], 2),
        "true_peak_dbfs": round(analysis_report["true_peak_dbfs"], 2),
        "rms_dbfs": round(analysis_report["rms_dbfs"], 2),
        "lufs": round(analysis_report["lufs"], 2),
        "dynamic_range_db": round(analysis_report["dynamic_range_db"], 2),
        "crest_factor_db": round(analysis_report["crest_factor_db"], 2),
        "noise_floor_dbfs": round(analysis_report["noise_floor_dbfs"], 2),
        "clipping_ratio": analysis_report["clipping_ratio"],
        "dc_offset": round(analysis_report["dc_offset"], 5),
        "stages": list(stages or []),
    }
    if reported:
        metrics["finished_stage"] = reported[-1][0] if reported else "Finished"
        metrics["progress_marks"] = [percent for _stage, percent in reported]
    return metrics


def merge_chains(base: VoiceChain, override: Iterable[dict]) -> VoiceChain:
    """Utility for tests and for chaining presets (used by the CLI script)."""

    merged = base.to_dict()
    for patch in override:
        for key, value in (patch.get("modules") or {}).items():
            merged["modules"][key] = value
        for key, value in (patch.get("master") or {}).items():
            merged["master"][key] = value
    return VoiceChain.from_dict(merged)


__all__ = [
    "VoiceChain",
    "MasterSpec",
    "MODULE_RANGES",
    "FLAT_RANGES",
    "ModuleSet",
    "RenderResult",
    "blend_intensity",
    "measure_output",
    "merge_chains",
    "modules_from_mapping",
    "preset_modules",
    "render",
    "render_chain",
    "render_preset",
]
