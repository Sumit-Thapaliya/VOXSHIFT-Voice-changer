"""Pydantic models shared by the engine's routes."""

from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, Field, field_validator

MODULE_RANGES: dict[str, tuple[float, float]] = {
    # v1 presentation table: these are the slider bounds the studio UI binds to and
    # the defaults used when a field is omitted. It is NOT the validation bound --
    # these values are never rejected, and the enforced envelope lives in
    # ``app.dsp.chain.FLAT_RANGES`` (pitch -24..24 st, formant -12..12 st), where
    # anything outside is clamped rather than refused. Keep the two in step with
    # ``shared/voice-presets.json`` ``ranges``, which mirrors this table.
    "pitch": (-12.0, 12.0),
    "formant": (-6.0, 6.0),
    "body": (0.0, 100.0),
    "presence": (0.0, 100.0),
    "air": (0.0, 100.0),
    "warmth": (0.0, 100.0),
    "growl": (0.0, 100.0),
    "ring": (0.0, 100.0),
    "ringFreq": (30.0, 400.0),
    "vibrato": (0.0, 100.0),
    "vibratoRate": (3.0, 9.0),
    "breath": (0.0, 100.0),
    "gate": (0.0, 100.0),
    "comp": (0.0, 100.0),
    "deess": (0.0, 100.0),
    "space": (0.0, 100.0),
    "echo": (0.0, 100.0),
    "echoTime": (40.0, 600.0),
}

DEFAULT_MODULES: dict[str, float] = {
    "pitch": 0.0,
    "formant": 0.0,
    "body": 0.0,
    "presence": 0.0,
    "air": 0.0,
    "warmth": 0.0,
    "growl": 0.0,
    "ring": 0.0,
    "ringFreq": 88.0,
    "vibrato": 0.0,
    "vibratoRate": 5.2,
    "breath": 0.0,
    "gate": 0.0,
    "comp": 0.0,
    "deess": 0.0,
    "space": 0.0,
    "echo": 0.0,
    "echoTime": 190.0,
}

# Modules whose value is a strength in percent and therefore follows the
# global "intensity" blend used by the Studio slider.
INTENSITY_SCALED = (
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


class MasterSpec(BaseModel):
    highpassHz: float = Field(default=60.0, ge=0.0, le=500.0)
    lowpassHz: float = Field(default=0.0, ge=0.0, le=20000.0, description="0 disables the low-pass")
    denoise: float = Field(default=0.0, ge=0.0, le=100.0)
    outputGainDb: float = Field(default=0.0, ge=-24.0, le=24.0)
    normalize: bool = True
    targetLufs: float = Field(default=-16.0, ge=-30.0, le=-6.0)
    limiterCeilingDb: float = Field(default=-1.0, ge=-6.0, le=0.0)
    trimSilence: bool = False
    fadeMs: float = Field(default=8.0, ge=0.0, le=200.0)


class VoiceChain(BaseModel):
    """A complete, validated voice design."""

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
    master: MasterSpec = Field(default_factory=MasterSpec)

    @field_validator(
        *[name for name in MODULE_RANGES if name != "master"],
        mode="before",
    )
    @classmethod
    def _coerce(cls, value: Any, info) -> float:  # noqa: ANN001 - pydantic signature
        limit = MODULE_RANGES[info.field_name]
        if value is None or value == "":
            return 0.0
        return float(value)

    def clamped(self) -> "VoiceChain":
        data: dict[str, Any] = {}
        for name, (low, high) in MODULE_RANGES.items():
            data[name] = min(high, max(low, float(getattr(self, name))))
        data["master"] = self.master
        return VoiceChain(**data)

    def to_modules(self) -> dict[str, float]:
        return {name: float(getattr(self, name)) for name in MODULE_RANGES}


class RenderRequest(BaseModel):
    """Either a full chain or a preset reference, never both required."""

    preset_id: str | None = None
    archetype_id: str | None = None
    chain: VoiceChain | None = None
    intensity: float = Field(default=75.0, ge=0.0, le=100.0)
    name: str | None = Field(default=None, max_length=120)
    bit_depth: Literal[16, 24] = 16
    sample_rate: int | None = Field(default=None, ge=8000, le=96000)
    project_id: str | None = None


class PolishRequest(BaseModel):
    denoise: float = Field(default=65.0, ge=0.0, le=100.0)
    deess: float = Field(default=35.0, ge=0.0, le=100.0)
    gate: float = Field(default=25.0, ge=0.0, le=100.0)
    comp: float = Field(default=35.0, ge=0.0, le=100.0)
    highpassHz: float = Field(default=70.0, ge=0.0, le=500.0)
    targetLufs: float = Field(default=-16.0, ge=-30.0, le=-6.0)
    limiterCeilingDb: float = Field(default=-1.0, ge=-6.0, le=0.0)
    trimSilence: bool = True
    fadeMs: float = Field(default=12.0, ge=0.0, le=200.0)
    bit_depth: Literal[16, 24] = 16
    sample_rate: int | None = Field(default=None, ge=8000, le=96000)


class VoiceProfileIn(BaseModel):
    name: str = Field(min_length=1, max_length=64)
    description: str | None = Field(default=None, max_length=280)
    color: str = Field(default="#b597ee", pattern=r"^#[0-9a-fA-F]{6}$")
    tags: list[str] = Field(default_factory=list, max_length=8)
    chain: VoiceChain
    archetype_id: str | None = None


class VoiceProfile(VoiceProfileIn):
    id: str
    created_at: str
    updated_at: str
    render_count: int = 0


class ProjectIn(BaseModel):
    name: str = Field(min_length=1, max_length=96)
    source_name: str | None = Field(default=None, max_length=160)
    source_seconds: float | None = Field(default=None, ge=0)
    chain: VoiceChain
    intensity: float = Field(default=75.0, ge=0.0, le=100.0)
    preset_id: str | None = None
    notes: str | None = Field(default=None, max_length=1000)
    render_ids: list[str] = Field(default_factory=list, max_length=24)


class Project(ProjectIn):
    id: str
    created_at: str
    updated_at: str


class JobStatus(BaseModel):
    id: str
    kind: Literal["render", "polish"]
    state: Literal["queued", "running", "done", "failed", "cancelled", "expired"]
    progress: int = 0
    stage: str = "Queued"
    message: str | None = None
    created_at: str
    started_at: str | None = None
    finished_at: str | None = None
    duration_ms: int | None = None
    source_name: str | None = None
    preset_id: str | None = None
    voice_name: str | None = None
    result: dict[str, Any] | None = None
