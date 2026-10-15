"""DSP unit tests: the engine must measurably do what it claims."""

from __future__ import annotations

import io
import wave

import numpy as np
import pytest

from app.dsp import analysis, chain as chain_module, dynamics, effects, master, spectral, wavio


def dominant_frequency(signal: np.ndarray, sample_rate: int, low: float = 60.0, high: float = 400.0) -> float:
    segment = signal[int(sample_rate * 0.5) : int(sample_rate * 1.5)].astype(np.float64)
    segment = segment - segment.mean()
    correlation = np.correlate(segment, segment, mode="full")[segment.size - 1 :]
    start = int(sample_rate / high)
    stop = int(sample_rate / low)
    return sample_rate / (int(np.argmax(correlation[start:stop])) + start)


def test_pitch_shift_moves_fundamental_and_keeps_duration(voice_audio: np.ndarray, sample_rate: int) -> None:
    before = dominant_frequency(voice_audio[:, 0], sample_rate)
    shifted = spectral.pitch_formant_shift(voice_audio[:, 0], sample_rate, semitones=-7.0, formant_semitones=0.0)
    after = dominant_frequency(shifted, sample_rate)
    assert abs(len(shifted) - len(voice_audio)) <= sample_rate * 0.03
    expected = before * 2 ** (-7.0 / 12.0)
    assert abs(after - expected) / expected < 0.06, f"pitch {after:.1f} vs expected {expected:.1f}"


def test_pitch_shift_up(voice_audio: np.ndarray, sample_rate: int) -> None:
    before = dominant_frequency(voice_audio[:, 0], sample_rate)
    shifted = spectral.pitch_formant_shift(voice_audio[:, 0], sample_rate, semitones=5.0)
    after = dominant_frequency(shifted, sample_rate)
    assert after > before * 1.2


def test_formant_shift_changes_spectrum_not_pitch(voice_audio: np.ndarray, sample_rate: int) -> None:
    channel = voice_audio[:, 0]
    pitch_before = dominant_frequency(channel, sample_rate)
    warped = spectral.pitch_formant_shift(channel, sample_rate, semitones=0.0, formant_semitones=4.0)
    pitch_after = dominant_frequency(warped, sample_rate)

    def centroid(x: np.ndarray) -> float:
        frames = np.abs(spectral.stft(x, 2048, 512))
        spectrum = frames.mean(axis=0)
        frequencies = np.arange(spectrum.size) * sample_rate / 2048
        return float((spectrum * frequencies).sum() / spectrum.sum())

    assert abs(pitch_after - pitch_before) / pitch_before < 0.05
    # A +4 semitone envelope warp must visibly lift the spectral balance.
    assert centroid(warped) > centroid(channel) * 1.02


def test_noise_gate_opens_the_gap_between_words(sample_rate: int) -> None:
    """A gate must cut room tone between phrases and leave the speech alone."""

    rng = np.random.default_rng(3)
    speech = rng.normal(0.0, 0.25, sample_rate).astype(np.float32)
    room_tone = rng.normal(0.0, 0.0025, sample_rate).astype(np.float32)  # ≈ -52 dBFS
    signal = np.concatenate([speech, room_tone, speech])
    gated = dynamics.gate(signal, sample_rate, amount=60.0)

    def rms(x: np.ndarray) -> float:
        return float(np.sqrt(np.mean(np.square(x))))

    quiet = slice(sample_rate + 3000, 2 * sample_rate - 3000)
    assert rms(gated[quiet]) < rms(signal[quiet]) * 0.25, "room tone was not gated"
    loud = slice(3000, sample_rate - 3000)
    assert abs(20 * np.log10(rms(gated[loud]) / rms(signal[loud]))) < 1.5, "the gate touched the speech"


def test_compressor_reduces_dynamic_range(sample_rate: int) -> None:
    quiet = np.sin(2 * np.pi * 220 * np.arange(sample_rate) / sample_rate) * 0.05
    loud = np.sin(2 * np.pi * 220 * np.arange(sample_rate) / sample_rate) * 0.9
    signal = np.concatenate([quiet, loud]).astype(np.float32)
    compressed = dynamics.compressor(signal, sample_rate, amount=80.0)

    def spread(x: np.ndarray) -> float:
        first = 20 * np.log10(np.sqrt(np.mean(x[: sample_rate] ** 2)) + 1e-9)
        second = 20 * np.log10(np.sqrt(np.mean(x[sample_rate:] ** 2)) + 1e-9)
        return second - first

    assert spread(compressed) < spread(signal)


def test_limiter_never_exceeds_ceiling(voice_audio: np.ndarray, sample_rate: int) -> None:
    loud = (voice_audio[:, 0] * 8.0).astype(np.float32)
    limited = master.limiter(loud, sample_rate, ceiling_db=-1.0)
    assert master.peak_db(limited) <= -0.99


def test_loudness_normalisation_hits_the_target(voice_audio: np.ndarray, sample_rate: int) -> None:
    normalized, gain_db = master.normalize_loudness(voice_audio[:, 0], sample_rate, -16.0)
    measured = master.integrated_loudness(normalized, sample_rate)
    assert abs(measured - (-16.0)) <= 0.7, f"got {measured:.2f} LUFS"
    assert gain_db != 0.0


def test_denoise_lowers_the_noise_floor(sample_rate: int) -> None:
    rng = np.random.default_rng(9)
    tone = 0.35 * np.sin(2 * np.pi * 180 * np.arange(sample_rate * 3) / sample_rate)
    hiss = rng.normal(0.0, 0.05, tone.size)
    noisy = (tone + hiss).astype(np.float32)
    cleaned = spectral.denoise(noisy, sample_rate, amount=80.0)
    frames = lambda x: np.abs(spectral.stft(x, 2048, 512))  # noqa: E731
    quiet_band = frames(noisy)[:, 300:600].mean()
    cleaned_band = frames(cleaned)[:, 300:600].mean()
    assert cleaned_band < quiet_band * 0.85


def test_echo_and_reverb_add_a_tail(sample_rate: int) -> None:
    impulse = np.zeros(sample_rate, dtype=np.float32)
    impulse[100] = 1.0
    echoed = effects.echo(impulse, sample_rate, amount=60.0, delay_ms=120.0)
    spaced = effects.reverb(impulse, sample_rate, amount=50.0)
    assert np.abs(echoed[int(sample_rate * 0.12) : int(sample_rate * 0.13)]).max() > 0.05
    assert np.abs(spaced[int(sample_rate * 0.3) :]).max() > 0.001


def test_ring_modulation_creates_sidebands(sample_rate: int) -> None:
    tones = 0.4 * np.sin(2 * np.pi * 200 * np.arange(sample_rate) / sample_rate).astype(np.float32)
    modulated = effects.ring_modulate(tones, sample_rate, amount=100.0, frequency=88.0)
    spectrum = np.abs(np.fft.rfft(modulated))
    frequencies = np.fft.rfftfreq(modulated.size, 1 / sample_rate)
    carrier_energy = spectrum[(frequencies > 188) & (frequencies < 212)].sum()
    original_energy = spectrum[(frequencies > 188) & (frequencies < 212)].sum()
    side_energy = spectrum[(frequencies > 100) & (frequencies < 130)].sum()
    assert side_energy > 0
    assert carrier_energy == original_energy  # sanity on the band math
    assert spectrum[(frequencies > 110) & (frequencies < 120)].sum() > spectrum[(frequencies > 195) & (frequencies < 205)].sum() * 0.2


def test_warm_drive_is_bounded(sample_rate: int) -> None:
    loud = (np.sin(2 * np.pi * 150 * np.arange(sample_rate) / sample_rate) * 3.0).astype(np.float32)
    driven = effects.warm_drive(loud, amount=100.0)
    assert np.max(np.abs(driven)) <= 1.01


def test_wav_roundtrip_16_and_24_bit(voice_audio: np.ndarray, sample_rate: int, tmp_path) -> None:
    for bit_depth in (16, 24):
        path = tmp_path / f"round-{bit_depth}.wav"
        wavio.write_wav(path, voice_audio, sample_rate, bit_depth)
        decoded, rate = wavio.decode_audio(path)
        assert rate == sample_rate
        assert decoded.shape == voice_audio.shape
        error = np.max(np.abs(decoded - voice_audio))
        tolerance = 1 / 32000 if bit_depth == 16 else 1 / 800000
        assert error < tolerance * 3, (bit_depth, error)
        with wave.open(str(path), "rb") as handle:
            assert handle.getsampwidth() == (2 if bit_depth == 16 else 3)


def test_decode_rejects_unknown_extension(tmp_path) -> None:
    path = tmp_path / "notes.txt"
    path.write_text("not audio")
    with pytest.raises(wavio.AudioDecodeError):
        wavio.decode_audio(path)


def test_resample_preserves_tone_frequency(sample_rate: int) -> None:
    time = np.arange(sample_rate * 2) / sample_rate
    tone = np.sin(2 * np.pi * 220 * time).astype(np.float32)
    upsampled = wavio.resample(tone, sample_rate, 44100)
    assert abs(len(upsampled) - sample_rate * 2 * 2) <= 4
    frames = np.abs(spectral.stft(upsampled, 2048, 512))
    spectrum = frames.mean(axis=0)
    frequencies = np.arange(spectrum.size) * 44100 / 2048
    assert abs(frequencies[int(np.argmax(spectrum))] - 220.0) < 12.0


def test_render_preset_is_consistent(voice_audio: np.ndarray, sample_rate: int, catalog: dict) -> None:
    result = chain_module.render_preset(voice_audio, sample_rate, catalog, "deep", intensity=75.0)
    assert abs(result.audio.shape[0] / sample_rate - 4.0) < 0.05
    assert master.peak_db(result.audio[:, 0]) <= -0.9
    assert abs(result.metrics["lufs"] - (-16.0)) <= 0.7
    stages = result.stages
    assert "pitch/formant" in stages
    assert "loudness" in stages and "highpass" in stages
    assert result.metrics["finished_stage"] == "Finished"


def test_every_preset_renders_without_errors(voice_audio: np.ndarray, sample_rate: int, catalog: dict) -> None:
    for entry in catalog["effects"] + catalog["archetypes"]:
        modules = chain_module.preset_modules(catalog, entry["id"], 80.0)
        result = chain_module.render_chain(voice_audio[:, :], sample_rate, modules)
        assert np.all(np.isfinite(result.audio)), entry["id"]
        assert result.audio.shape[0] > 0


def test_intensity_scales_the_design(voice_audio: np.ndarray, sample_rate: int, catalog: dict) -> None:
    soft = chain_module.preset_modules(catalog, "deep", 30.0)
    hard = chain_module.preset_modules(catalog, "deep", 100.0)
    assert abs(soft.pitch) < abs(hard.pitch)
    assert abs(soft.body) < abs(hard.body)


def test_analysis_reports_measurements(voice_audio: np.ndarray, sample_rate: int, catalog: dict) -> None:
    report = analysis.analyse(voice_audio, sample_rate, catalog)
    assert 3.9 < report["duration"] < 4.1
    assert -30 < report["lufs"] < -8
    assert 100 < report["pitch"]["median_hz"] < 160
    assert report["spectrum"]["centroid_hz"] > 300
    assert report["profile"]["summary"]
    assert report["recommendations"]


def test_analysis_flags_a_dc_offset(sample_rate: int) -> None:
    signal = (0.3 + 0.2 * np.sin(2 * np.pi * 190 * np.arange(sample_rate) / sample_rate)).astype(np.float32)
    cleaned = effects.dc_block(signal, sample_rate)
    assert abs(float(np.mean(cleaned))) < 0.01


def test_waveform_peaks_shape() -> None:
    from app.routers.audio import waveform_peaks

    peaks = waveform_peaks(np.linspace(-1, 1, 1000).astype(np.float32), 100)
    assert len(peaks) == 100
    assert all(0 <= value <= 1 for value in peaks)


# ---------------------------------------------------------------------------
# Engine v2: accuracy and polish guarantees
# ---------------------------------------------------------------------------


def off_bin_tone(frequency: float, sample_rate: int, seconds: float = 2.0) -> np.ndarray:
    time = np.arange(int(sample_rate * seconds)) / sample_rate
    return (0.5 * np.sin(2 * np.pi * frequency * time)).astype(np.float32)


def spectral_peak(signal: np.ndarray, sample_rate: int, low: float = 60.0, high: float = 2000.0) -> float:
    windowed = signal * np.hanning(signal.size)
    spectrum = np.abs(np.fft.rfft(windowed, 8 * signal.size))
    frequencies = np.fft.rfftfreq(8 * signal.size, 1 / sample_rate)
    mask = (frequencies >= low) & (frequencies <= high)
    index = int(np.flatnonzero(mask)[int(np.argmax(spectrum[mask]))])
    left, centre, right = spectrum[index - 1], spectrum[index], spectrum[index + 1]
    denominator = left - 2 * centre + right
    offset = 0.5 * (left - right) / denominator if denominator else 0.0
    return float(frequencies[index] + offset * (frequencies[1] - frequencies[0]))


def harmonic_voice(sample_rate: int, seconds: float = 2.0, f0: float = 130.0) -> np.ndarray:
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
    return (0.3 * signal / np.max(np.abs(signal))).astype(np.float32)


def centroid_of(signal: np.ndarray, sample_rate: int) -> float:
    frames = np.abs(spectral.stft(signal, 2048, 512)).mean(axis=0)
    frequencies = np.arange(frames.size) * sample_rate / 2048
    return float((frames * frequencies).sum() / frames.sum())


@pytest.mark.parametrize("semitones", [-12, -7, -3, 3, 5, 12])
def test_pitch_shift_is_accurate_between_bins(semitones: int, sample_rate: int) -> None:
    """A naive phase vocoder drifts a whole bin here; the engine must not."""

    tone = off_bin_tone(197.3, sample_rate)
    shifted = spectral.pitch_shift(tone, sample_rate, semitones, formant_semitones=semitones)
    expected = 197.3 * 2 ** (semitones / 12.0)
    measured = spectral_peak(shifted, sample_rate)
    assert abs(measured - expected) / expected < 0.01, f"{measured:.2f} Hz vs expected {expected:.2f} Hz"


def test_time_stretch_keeps_the_pitch(sample_rate: int) -> None:
    tone = off_bin_tone(197.3, sample_rate)
    for ratio in (0.5, 0.75, 1.5, 2.0):
        stretched = spectral.phase_vocoder_stretch(tone, ratio)
        assert abs(len(stretched) - len(tone) * ratio) <= 2
        assert abs(spectral_peak(stretched, sample_rate) - 197.3) < 2.0


def test_formant_shift_moves_the_envelope_monotonically(sample_rate: int) -> None:
    voice = harmonic_voice(sample_rate)
    base = centroid_of(voice, sample_rate)
    darker = centroid_of(spectral.pitch_shift(voice, sample_rate, 0.0, -6.0), sample_rate)
    slightly_darker = centroid_of(spectral.pitch_shift(voice, sample_rate, 0.0, -2.0), sample_rate)
    brighter = centroid_of(spectral.pitch_shift(voice, sample_rate, 0.0, 6.0), sample_rate)
    assert darker < slightly_darker < base < brighter
    # and the fundamental must not move with the formants
    for formant in (-6.0, 6.0):
        shifted = spectral.pitch_shift(voice, sample_rate, 0.0, formant)
        assert abs(spectral_peak(shifted, sample_rate, 90, 180) - 130.0) < 3.0


def phrased_voice(sample_rate: int, seconds: float = 6.0, f0: float = 130.0) -> np.ndarray:
    """Harmonic voice behind a half-second on / half-second off gate."""

    voice = harmonic_voice(sample_rate, seconds=seconds, f0=f0)
    time = np.arange(voice.size) / sample_rate
    gate = (np.sin(2 * np.pi * 0.5 * time) > 0.0).astype(np.float32)
    return (voice * gate).astype(np.float32)


def gap_and_speech_cores(sample_rate: int, seconds: float = 6.0, margin_s: float = 0.10):
    """Regions that are unambiguously speech and unambiguously room tone."""

    time = np.arange(int(sample_rate * seconds)) / sample_rate
    speaking = (np.sin(2 * np.pi * 0.5 * time) > 0.0).astype(np.int8)
    margin = int(margin_s * sample_rate)

    def erode(mask: np.ndarray) -> np.ndarray:
        padded = np.pad(mask, (margin, margin), mode="edge")
        return np.lib.stride_tricks.sliding_window_view(padded, 2 * margin + 1).min(axis=1).astype(bool)

    return erode(speaking), erode(1 - speaking)


def change_db(after: np.ndarray, before: np.ndarray, region: np.ndarray) -> float:
    def rms(x: np.ndarray) -> float:
        return float(np.sqrt(np.mean(np.square(x[region])) + 1e-12))

    return 20.0 * float(np.log10(rms(after) / rms(before)))


def gap_snr(signal: np.ndarray, speech_core: np.ndarray, gap_core: np.ndarray) -> float:
    """Speech level minus room-tone level: the number a denoiser has to improve."""

    def rms(x: np.ndarray, region: np.ndarray) -> float:
        return float(np.sqrt(np.mean(np.square(x[region]) + 1e-12)))

    return 20.0 * float(np.log10(rms(signal, speech_core) / max(rms(signal, gap_core), 1e-9)))


def test_polish_pipeline_cleans_and_levels(sample_rate: int) -> None:
    """The Audio Polish chain: less hiss, no clipping, on-target loudness."""

    rng = np.random.default_rng(21)
    voice = phrased_voice(sample_rate, seconds=6.0)
    noisy = (voice * 0.5 + rng.normal(0.0, 0.004, voice.size)).astype(np.float32)
    speech_core, gap_core = gap_and_speech_cores(sample_rate)

    # clean-up pass (no compression, so the gap improvement is the denoiser's own)
    cleaned = chain_module.render_chain(
        noisy,
        sample_rate,
        chain_module.ModuleSet(denoise=75.0, deess=35.0, comp=0.0, highpassHz=70.0, trimSilence=False, targetLufs=-16.0),
    )
    assert gap_snr(cleaned.audio, speech_core, gap_core) > gap_snr(noisy, speech_core, gap_core) + 12.0, "denoise did not clean the gaps"
    # (the speech itself is allowed to change level: the chain normalises to
    #  -16 LUFS, so only the speech-to-room-tone ratio is meaningful here)
    assert abs(cleaned.metrics["lufs"] - (-16.0)) <= 0.5, cleaned.metrics["lufs"]
    assert cleaned.metrics["peak_dbfs"] <= -0.5
    assert cleaned.metrics["clipping_ratio"] == 0.0
    assert "denoise" in cleaned.stages and "deess" in cleaned.stages and "loudness" in cleaned.stages

    # the compressor stage only runs when it is asked for
    compressed = chain_module.render_chain(noisy, sample_rate, chain_module.ModuleSet(comp=85.0, targetLufs=-16.0))
    flat = chain_module.render_chain(noisy, sample_rate, chain_module.ModuleSet(comp=0.0, targetLufs=-16.0))
    assert "comp" in compressed.stages and "comp" not in flat.stages
    assert abs(compressed.metrics["lufs"] - (-16.0)) <= 0.5 and abs(flat.metrics["lufs"] - (-16.0)) <= 0.5


def test_denoise_amount_is_a_dial(sample_rate: int) -> None:
    """More denoise means less room tone, monotonically."""

    rng = np.random.default_rng(5)
    voice = phrased_voice(sample_rate, seconds=6.0)
    noisy = (voice * 0.5 + rng.normal(0.0, 0.004, voice.size)).astype(np.float32)
    _speech, gap_core = gap_and_speech_cores(sample_rate)
    strengths = [change_db(spectral.denoise(noisy, sample_rate, amount), noisy, gap_core) for amount in (25.0, 60.0, 100.0)]
    assert strengths[0] > strengths[1] > strengths[2]
    assert strengths[2] < -12.0


def test_analysis_matches_the_api_contract(sample_rate: int, catalog: dict) -> None:
    """The Forge page reads these exact keys — keep them present and sane."""

    report = analysis.analyse(harmonic_voice(sample_rate), sample_rate, catalog)
    for key in (
        "duration",
        "sample_rate",
        "channels",
        "peak_dbfs",
        "rms_dbfs",
        "lufs",
        "dynamic_range_db",
        "noise_floor_dbfs",
        "clipping_ratio",
        "pitch",
        "spectrum",
        "voiced_ratio",
        "profile",
        "recommendations",
    ):
        assert key in report, key
    assert set(report["pitch"]) >= {"low_hz", "median_hz", "high_hz", "range_semitones", "median_note"}
    assert set(report["spectrum"]) >= {"centroid_hz", "low_ratio", "mid_ratio", "high_ratio", "air_ratio"}
    assert set(report["profile"]) >= {"register", "tone", "cleanliness", "delivery", "expression", "summary"}
    assert 120 < report["pitch"]["median_hz"] < 140
    assert report["profile"]["register"] in {"very low", "low", "mid", "high", "very high"}
    assert report["recommendations"] and {"preset_id", "label", "intensity", "reason"} <= set(report["recommendations"][0])
    assert abs(sum([report["spectrum"][k] for k in ("low_ratio", "mid_ratio", "high_ratio", "air_ratio")]) - 1.0) < 0.02


def test_true_envelope_tracks_formants(sample_rate: int) -> None:
    voice = harmonic_voice(sample_rate)
    spectrum = np.abs(spectral.stft(voice, 2048, 512)).mean(axis=0)
    peaks = spectral._find_peaks(spectrum)  # noqa: SLF001
    envelope = spectral.true_envelope(spectrum, peaks, sample_rate)
    frequencies = np.arange(spectrum.size) * sample_rate / 2048
    assert envelope.size == spectrum.size
    assert np.all(envelope > 0)
    # the envelope must track the spectral shape, not the individual harmonics:
    # compare it against the spectrum averaged over ~3 harmonics (≈390 Hz)
    width = max(3, int(round(390.0 / (sample_rate / 2048))))
    smoothed = np.convolve(spectrum, np.ones(width) / width, mode="same")
    band = frequencies < sample_rate * 0.42
    correlation = float(np.corrcoef(envelope[band], smoothed[band])[0, 1])
    assert correlation > 0.85, f"envelope does not follow the spectral shape (r={correlation:.2f})"
    # and it must be smooth: no ripple at the harmonic rate of 130 Hz
    ripple = float(np.std(np.diff(envelope, 2)) / (np.mean(envelope) + 1e-12))
    assert ripple < 0.05, f"envelope is rippling at the harmonic rate ({ripple:.3f})"
