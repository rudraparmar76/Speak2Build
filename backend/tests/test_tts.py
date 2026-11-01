"""Tests for the text-to-speech playback service and its endpoints.

None of these touch the network or a sound card: synthesis and playback are
injected fakes throughout, matching the recorder.py test strategy.
"""

import asyncio

import pytest
from fastapi.testclient import TestClient

import numpy as np

from app.main import app
from app.services import tts as tts_service
from app.services.tts import VoiceSpeaker


class FakeSynthesizer:
    """Records calls and returns a deterministic payload per invocation."""

    def __init__(self, fail_on_texts: set[str] | None = None):
        self.calls: list[tuple[str, str, str]] = []
        self.fail_on = fail_on_texts or set()

    async def __call__(self, text: str, voice: str, rate: str) -> bytes:
        self.calls.append((text, voice, rate))
        if text in self.fail_on:
            raise tts_service.SynthesisError("provider rejected the request")
        return b"fake-mp3-" + text.encode("utf-8")


class FakeDecoder:
    """Turns each fake MP3 into a fixed number of synthetic samples."""

    def __init__(self, samples: int = 2400, rate: int = 240):
        self.samples = samples
        self.rate = rate

    def __call__(self, mp3_bytes: bytes) -> tuple[np.ndarray, int]:
        return np.zeros(self.samples, dtype=np.float32), self.rate


class FakePlayback:
    """PlaybackController double that records play/stop ordering."""

    def __init__(self):
        self.events: list[str] = []
        self.failing = False

    def play(self, samples, samplerate) -> None:
        if self.failing:
            raise tts_service.PlaybackUnavailableError("no output device")
        self.events.append(f"play:{samplerate}")

    def stop(self) -> None:
        self.events.append("stop")


def build_speaker(synth: FakeSynthesizer | None = None, playback: FakePlayback | None = None):
    return VoiceSpeaker(synthesizer=synth, decode=FakeDecoder(), playback=playback or FakePlayback())


@pytest.fixture()
def client(monkeypatch):
    fake_synth = FakeSynthesizer()
    fake_play = FakePlayback()
    test_speaker = VoiceSpeaker(
        synthesizer=fake_synth, decode=FakeDecoder(), playback=fake_play
    )
    monkeypatch.setattr(tts_service, "speaker", test_speaker)
    monkeypatch.setattr(tts_service, "speak", test_speaker.speak)
    monkeypatch.setattr(tts_service, "stop", test_speaker.stop)
    return TestClient(app), test_speaker, fake_synth, fake_play


# ---------------------------------------------------------------- service --

def test_speak_plays_and_reports_duration():
    speaker = build_speaker(synth=FakeSynthesizer())

    result = asyncio.run(speaker.speak("hello world"))

    assert result.characters == len("hello world")
    assert result.duration_seconds == pytest.approx(2400 / 240)
    assert result.voice == tts_service.DEFAULT_VOICE


def test_second_speak_supersedes_first():
    synth = FakeSynthesizer()
    playback = FakePlayback()
    speaker = VoiceSpeaker(synthesizer=synth, decode=FakeDecoder(), playback=playback)

    asyncio.run(speaker.speak("first"))
    speaker.stop()
    asyncio.run(speaker.speak("second"))

    assert playback.events == ["play:240", "stop", "play:240"]


def test_stop_is_a_safe_noop_when_idle():
    playback = FakePlayback()
    speaker = VoiceSpeaker(synthesizer=FakeSynthesizer(), decode=FakeDecoder(), playback=playback)
    assert speaker.stop() is False


def test_playback_failure_is_typed():
    playback = FakePlayback()
    playback.failing = True
    speaker = VoiceSpeaker(synthesizer=FakeSynthesizer(), decode=FakeDecoder(), playback=playback)
    with pytest.raises(tts_service.PlaybackUnavailableError):
        asyncio.run(speaker.speak("can't play me"))


def test_synthesis_failure_is_typed():
    synth = FakeSynthesizer(fail_on_texts={"boom"})
    speaker = VoiceSpeaker(synthesizer=synth, decode=FakeDecoder(), playback=FakePlayback())
    with pytest.raises(tts_service.SynthesisError):
        asyncio.run(speaker.speak("boom"))


def test_custom_voice_and_rate_reach_synthesizer():
    synth = FakeSynthesizer()
    speaker = VoiceSpeaker(synthesizer=synth, decode=FakeDecoder(), playback=FakePlayback())
    asyncio.run(speaker.speak("hello", voice="en-GB-SoniaNeural", rate="+10%"))
    assert synth.calls[0][1:] == ("en-GB-SoniaNeural", "+10%")


# --------------------------------------------------------------- endpoint --

def test_play_endpoint_starts_playback(client):
    api, speaker, synth, playback = client
    response = api.post("/api/tts/play", json={"text": "I have one question."})
    assert response.status_code == 200
    body = response.json()
    assert body["played"] is True
    assert body["characters"] == len("I have one question.")
    assert body["voice"] == tts_service.DEFAULT_VOICE


def test_play_endpoint_rejects_blank_and_overlong_text(client):
    api, _, _, _ = client

    blank = api.post("/api/tts/play", json={"text": "   "})
    assert blank.status_code == 422

    overlong = api.post("/api/tts/play", json={"text": "x" * 2001})
    assert overlong.status_code == 422


def test_play_endpoint_rejects_malformed_rate(client):
    api, _, _, _ = client
    bad = api.post("/api/tts/play", json={"text": "hi", "rate": "plus ten percent"})
    assert bad.status_code == 422


def test_play_endpoint_maps_synthesis_failure_to_502(client):
    api, _, synth, _ = client
    synth.fail_on.add("trigger failure")
    response = api.post("/api/tts/play", json={"text": "trigger failure"})
    assert response.status_code == 502
    assert "rejected" in response.json()["detail"]


def test_play_endpoint_maps_playback_failure_to_503(client):
    api, speaker, _, playback = client
    playback.failing = True
    response = api.post("/api/tts/play", json={"text": "cannot hear me"})
    assert response.status_code == 503


def test_stop_endpoint_succeeds_even_when_idle(client):
    api, _, _, playback = client
    response = api.post("/api/tts/stop")
    assert response.status_code == 200
    assert response.json()["stopped"] is False


def test_stop_endpoint_reports_and_clears_active_playback(client):
    api, speaker, _, playback = client
    import asyncio

    loop = asyncio.get_event_loop_policy().new_event_loop()
    try:
        loop.run_until_complete(speaker.speak("still talking"))
    finally:
        loop.close()

    response = api.post("/api/tts/stop")
    assert response.status_code == 200
    assert response.json()["stopped"] is True
    assert "stop" in playback.events
