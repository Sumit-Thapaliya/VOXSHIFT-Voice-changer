"""Shared pytest fixtures. Environment is configured before the app imports."""

from __future__ import annotations

import os
import shutil
import sys
import tempfile
from pathlib import Path

import numpy as np
import pytest

BACKEND_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(BACKEND_ROOT))

TEST_DATA_DIR = Path(tempfile.mkdtemp(prefix="voxshift-tests-"))
os.environ.setdefault("VOXSHIFT_DATA_DIR", str(TEST_DATA_DIR))
os.environ.setdefault("VOXSHIFT_TTL_MINUTES", "60")
os.environ.setdefault("VOXSHIFT_WORKERS", "2")

from app.dsp import wavio  # noqa: E402


@pytest.fixture(scope="session")
def data_dir() -> Path:
    return TEST_DATA_DIR


@pytest.fixture(scope="session")
def sample_rate() -> int:
    return 22050


@pytest.fixture(scope="session")
def voice_audio(sample_rate: int) -> np.ndarray:
    """A deterministic 4 second 'voice': harmonic tone with vibrato and room noise."""

    time = np.arange(int(sample_rate * 4)) / sample_rate
    fundamental = 128.0 + 9.0 * np.sin(2 * np.pi * 4.2 * time)
    phase = 2 * np.pi * np.cumsum(fundamental) / sample_rate
    tone = (
        0.42 * np.sign(np.sin(phase))
        + 0.24 * np.sin(2 * phase)
        + 0.14 * np.sin(3 * phase)
        + 0.06 * np.sin(5 * phase)
    )
    envelope = 0.35 + 0.65 * (0.5 + 0.5 * np.sin(2 * np.pi * 1.6 * time))
    noise = np.random.default_rng(4).normal(0.0, 0.0035, time.size)
    return (tone * envelope * 0.42 + noise).astype(np.float32)[:, None]


@pytest.fixture(scope="session")
def voice_file(tmp_path_factory: pytest.TempPathFactory, voice_audio: np.ndarray, sample_rate: int) -> Path:
    path = tmp_path_factory.mktemp("audio") / "voice.wav"
    wavio.write_wav(path, voice_audio, sample_rate, 16)
    return path


@pytest.fixture(scope="session")
def catalog() -> dict:
    from app.main import load_catalog

    return load_catalog()


@pytest.fixture(scope="session")
def client():
    from fastapi.testclient import TestClient

    from app.main import app

    with TestClient(app) as test_client:
        yield test_client


def pytest_sessionfinish(session, exitstatus) -> None:  # noqa: ANN001, ARG001
    shutil.rmtree(TEST_DATA_DIR, ignore_errors=True)
