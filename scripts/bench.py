#!/usr/bin/env python3
"""Render every preset over a synthetic take and print CPU timings.

    python3 scripts/bench.py                 # 30 s stereo, 44.1 kHz
    python3 scripts/bench.py --seconds 60 --sample-rate 48000 --preset deep

Useful for answering the only question that matters without a GPU: how much
faster than real time does the engine run on *this* machine?
"""

from __future__ import annotations

import argparse
import json
import sys
import time
from pathlib import Path

import numpy as np

REPO_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(REPO_ROOT / "backend"))

from app.dsp import chain as chain_module  # noqa: E402


def synthetic_voice(sample_rate: int, seconds: float, f0: float = 128.0) -> np.ndarray:
    time = np.arange(int(sample_rate * seconds)) / sample_rate
    signal = np.zeros_like(time)
    for harmonic in range(1, 45):
        frequency = f0 * harmonic
        if frequency > sample_rate * 0.42:
            break
        amplitude = sum(
            np.exp(-0.5 * ((frequency - centre) / width) ** 2) for centre, width in ((700, 180), (1150, 220), (2600, 300))
        ) + 0.05
        signal = signal + amplitude / (harmonic**0.8) * np.sin(2 * np.pi * frequency * time)
    gate = (np.sin(2 * np.pi * 1.1 * time) > -0.55).astype(np.float64)
    hiss = np.random.default_rng(11).normal(0.0, 0.002, time.size)
    mono = (0.3 * signal / np.max(np.abs(signal)) * gate + hiss).astype(np.float32)
    return np.stack([mono, np.roll(mono, 37)], axis=1).astype(np.float32)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--seconds", type=float, default=30.0)
    parser.add_argument("--sample-rate", type=int, default=44100)
    parser.add_argument("--preset", default=None, help="single preset id (default: all of them)")
    parser.add_argument("--intensity", type=float, default=80.0)
    parser.add_argument("--json", action="store_true", help="print machine readable results")
    args = parser.parse_args()

    catalog = json.loads((REPO_ROOT / "shared" / "voice-presets.json").read_text())
    audio = synthetic_voice(args.sample_rate, args.seconds)
    audio_mb = audio.nbytes / (1024 * 1024)
    print(
        f"source: {args.seconds:g} s stereo @ {args.sample_rate} Hz ({audio_mb:.1f} MiB) · "
        f"CPU threads: {chain_module.MODULE_RANGES and __import__('os').cpu_count()}"
    )

    ids = [args.preset] if args.preset else [entry["id"] for entry in catalog["effects"] + catalog["archetypes"]]
    results = []
    for preset_id in ids:
        modules = chain_module.preset_modules(catalog, preset_id, args.intensity)
        started = time.perf_counter()
        result = chain_module.render_chain(audio, args.sample_rate, modules)
        elapsed = time.perf_counter() - started
        row = {
            "preset": preset_id,
            "seconds": round(elapsed, 3),
            "realtime_factor": round(args.seconds / elapsed, 1),
            "lufs": result.metrics["lufs"],
            "peak_dbfs": result.metrics["peak_dbfs"],
            "stages": len(result.stages),
        }
        results.append(row)
        print(
            f"{preset_id:16s} {row['seconds']:6.2f} s   {row['realtime_factor']:5.1f}x realtime   "
            f"{row['lufs']:6.2f} LUFS  peak {row['peak_dbfs']:6.2f} dBFS  {row['stages']} stages"
        )

    slowest = max(results, key=lambda row: row["seconds"])
    print(
        f"\nslowest: {slowest['preset']} at {slowest['realtime_factor']}x realtime · "
        f"{len(results)} presets rendered"
    )
    if args.json:
        print(json.dumps(results, indent=2))
    return 0


if __name__ == "__main__":
    sys.exit(main())
