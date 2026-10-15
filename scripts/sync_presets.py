#!/usr/bin/env python3
"""Keep the three copies of `voice-presets.json` in sync.

The preset spec is a single source of truth that three places need:

    shared/voice-presets.json          <- edit this one
    backend/app/data/voice-presets.json   (the engine loads it at boot)
    frontend/lib/voice-presets.json       (the browser engine bundles it)

Usage:

    python3 scripts/sync_presets.py            # copy shared -> backend + frontend
    python3 scripts/sync_presets.py --check     # fail if they differ (CI / tests)
    python3 scripts/sync_presets.py --report    # print a summary of the spec
"""

from __future__ import annotations

import argparse
import hashlib
import json
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
SOURCE = REPO_ROOT / "shared" / "voice-presets.json"
TARGETS = [
    REPO_ROOT / "backend" / "app" / "data" / "voice-presets.json",
    REPO_ROOT / "frontend" / "lib" / "voice-presets.json",
]

MODULE_UNITS = {
    "pitch": "st",
    "formant": "st",
    "ringFreq": "Hz",
    "vibratoRate": "Hz",
    "echoTime": "ms",
}


def digest(payload: dict) -> str:
    canonical = json.dumps(payload, sort_keys=True, separators=(",", ":")).encode()
    return hashlib.sha256(canonical).hexdigest()[:12]


def load(path: Path) -> dict:
    if not path.exists():
        raise SystemExit(f"missing preset spec: {path}")
    return json.loads(path.read_text())


def main() -> int:
    parser = argparse.ArgumentParser(description="Sync the shared preset spec.")
    parser.add_argument("--check", action="store_true", help="verify all copies match, change nothing")
    parser.add_argument("--report", action="store_true", help="print a summary of the spec")
    args = parser.parse_args()

    source = load(SOURCE)
    source_digest = digest(source)

    if args.report:
        print(f"spec_version : {source.get('spec_version')}")
        print(f"digest       : {source_digest}")
        print(f"effects      : {len(source.get('effects', []))}")
        print(f"archetypes   : {len(source.get('archetypes', []))}")
        modules = source.get("defaults") or {}
        print(f"modules      : {len(modules)}")
        for name, value in sorted(modules.items()):
            unit = MODULE_UNITS.get(name, "%" if isinstance(value, (int, float)) else "")
            print(f"  {name:14s} default {value:>8} {unit}")
        return 0

    if args.check:
        ok = True
        for target in TARGETS:
            try:
                copy = load(target)
            except SystemExit as error:
                print(f"FAIL  {target.relative_to(REPO_ROOT)}: {error}")
                ok = False
                continue
            status = "OK  " if digest(copy) == source_digest else "STALE"
            if status == "STALE":
                ok = False
            print(f"{status} {target.relative_to(REPO_ROOT)}  (digest {digest(copy)})")
        print(f"{'OK  ' if ok else 'STALE'} shared/voice-presets.json  (digest {source_digest})")
        return 0 if ok else 1

    payload = json.dumps(source, indent=2) + "\n"
    for target in TARGETS:
        target.parent.mkdir(parents=True, exist_ok=True)
        if target.exists() and target.read_text() == payload:
            print(f"unchanged  {target.relative_to(REPO_ROOT)}")
            continue
        target.write_text(payload)
        print(f"updated    {target.relative_to(REPO_ROOT)}")
    print(f"source digest {source_digest}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
