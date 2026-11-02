"""Tests for the local Piper TTS engine and hybrid engine selection."""

import asyncio

import numpy as np
import pytest

from app.services import tts as tts_service
from app.services import voice_local


# --------------------------------------------------- rate/length mapping --

def test_rate_to_length_scale_faster():
    # '+15%' means 15% faster speech.
    assert voice_local._rate_to_length_scale("+15%") == pytest.approx(1.0 / 1.15, abs=1e-3)


def test_rate_to_length_scale_slower():
    # '-20%' means 20% slower speech.
    assert voice_local._rate_to_length_scale("-20%") == pytest.approx(1.2)


def test_rate_to_length_scale_normal_and_garbage():
    assert voice_local._rate_to_length_scale("+0%") == pytest.approx(1.0)
    assert voice_local._rate_to_length_scale(None) == pytest.approx(1.0)
    assert voice_local._rate_to_length_scale("banana") == pytest.approx(1.0)


# ------------------------------------------------------- engine selection --

@pytest.fixture()
def engine_env(monkeypatch):
    def set_engine(value: str) -> None:
        monkeypatch.setenv(tts_service.ENGINE_ENV, value)
    return set_engine


def test_hybrid_uses_local_engine_first(engine_env, monkeypatch):
    engine_env("piper")
    local_calls = []

    async def fake_local(text, voice_name=None, rate=None):
        local_calls.append(text)
        return (np.zeros(2400, dtype=np.float32), 24000)

    async def fail_edge(text, voice, rate):
        raise AssertionError("edge must not be called when the local engine works")

    monkeypatch.setattr(voice_local, "synthesize_local_async", fake_local)
    monkeypatch.setattr(tts_service, "_edge_synthesize", fail_edge)

    result = asyncio.run(tts_service._hybrid_synthesize("hello", "some-voice", "+0%"))
    assert isinstance(result, tuple)
    assert local_calls == ["hello"]


def test_hybrid_falls_back_to_edge_on_local_failure(engine_env, monkeypatch):
    engine_env("piper")

    async def broken_local(text, voice_name=None, rate=None):
        raise RuntimeError("Piper voice not downloaded")

    async def fake_edge(text, voice, rate):
        return b"mp3-from-cloud"

    monkeypatch.setattr(voice_local, "synthesize_local_async", broken_local)
    monkeypatch.setattr(tts_service, "_edge_synthesize", fake_edge)

    result = asyncio.run(tts_service._hybrid_synthesize("hello", "en-US-X", "+0%"))
    assert result == b"mp3-from-cloud"


def test_hybrid_edge_mode_skips_local(engine_env, monkeypatch):
    engine_env("edge")

    async def fail_local(text, voice_name=None, rate=None):
        raise AssertionError("local engine must not run in edge mode")

    edge_calls = []

    async def fake_edge(text, voice, rate):
        edge_calls.append((text, voice, rate))
        return b"mp3"

    monkeypatch.setattr(voice_local, "synthesize_local_async", fail_local)
    monkeypatch.setattr(tts_service, "_edge_synthesize", fake_edge)

    result = asyncio.run(tts_service._hybrid_synthesize("hello", "en-US-AndrewNeural", "+0%"))
    assert result == b"mp3"
    assert edge_calls == [("hello", "en-US-AndrewNeural", "+0%")]


def test_hybrid_does_not_swallow_cancellation(engine_env, monkeypatch):
    engine_env("piper")

    async def cancel_local(text, voice_name=None, rate=None):
        raise asyncio.CancelledError()

    async def fail_edge(text, voice, rate):
        raise AssertionError("edge must not run after cancellation")

    monkeypatch.setattr(voice_local, "synthesize_local_async", cancel_local)
    monkeypatch.setattr(tts_service, "_edge_synthesize", fail_edge)

    with pytest.raises(asyncio.CancelledError):
        asyncio.run(tts_service._hybrid_synthesize("hello", "v", "+0%"))


# ------------------------------------------------ speaker tuple handling --

def test_speaker_accepts_predecoded_local_audio(monkeypatch):
    import io
    import wave

    from app.services.tts import VoiceSpeaker

    samples = (np.ones(960, dtype=np.float32) * 0.5)

    async def local_synth(text, voice, rate):
        return (samples, 24000)

    class FakePlayback:
        def __init__(self):
            self.played: list[tuple[int, int]] = []

        def play(self, s, rate):
            self.played.append((s.size, rate))

        def stop(self):
            pass

    playback = FakePlayback()
    speaker = VoiceSpeaker(synthesizer=local_synth, decode=None, playback=playback)
    result = asyncio.run(speaker.speak("local voice"))

    assert result.duration_seconds == pytest.approx(960 / 24000, abs=0.01)
    assert result.sample_rate == 24000
    assert playback.played == [(960, 24000)]
