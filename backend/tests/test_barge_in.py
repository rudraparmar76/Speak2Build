"""Unit tests for voice barge-in (speech interruptibility).

Ensures that when TTS is playing and the user speaks, the audio energy detector
triggers barge-in, aborts TTS playback, and seamlessly begins capturing the user's speech.
"""

import time
import threading
import numpy as np
import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.services import audio_store, recorder
from app.services.recorder import MicrophoneRecorder
from app.services.tts import VoiceSpeaker


class BargeInFakeStream:
    """Mock audio stream capable of injecting synthetic silence and speech frames."""

    def __init__(self, callback, samplerate: int, channels: int) -> None:
        self.callback = callback
        self.samplerate = samplerate
        self.channels = channels
        self.started = False
        self.stopped = False
        self.closed = False

    def start(self) -> None:
        self.started = True

    def stop(self) -> None:
        self.stopped = True

    def close(self) -> None:
        self.closed = True

    def push_silence(self, frames: int = 800) -> None:
        chunk = np.zeros((frames, self.channels), dtype=np.float32)
        self.callback(chunk, frames, None, None)

    def push_speech(self, frames: int = 800, amplitude: float = 0.2) -> None:
        # Generate non-zero audio samples with RMS energy > threshold (0.035)
        chunk = np.full((frames, self.channels), amplitude, dtype=np.float32)
        self.callback(chunk, frames, None, None)


@pytest.fixture(autouse=True)
def isolate_storage(monkeypatch: pytest.MonkeyPatch, tmp_path):
    monkeypatch.setattr(audio_store, "_STORAGE_DIR", tmp_path)
    yield


def test_barge_in_triggered_by_speech():
    holder: dict[str, BargeInFakeStream] = {}

    def factory(callback, samplerate, channels):
        stream = BargeInFakeStream(callback, samplerate, channels)
        holder["stream"] = stream
        return stream

    rec = MicrophoneRecorder(stream_factory=factory)
    callback_fired = threading.Event()

    def on_barge_in():
        callback_fired.set()

    ok = rec.start_barge_in(on_barge_in=on_barge_in)
    assert ok is True
    assert rec.barge_in_active is True
    assert rec.barge_in_triggered is False
    assert rec.state == "idle"

    stream = holder["stream"]

    # 1 chunk of silence - should not trigger
    stream.push_silence(800)
    assert rec.barge_in_triggered is False
    assert rec.state == "idle"

    # 1 chunk of speech - needs 2 consecutive chunks
    stream.push_speech(800, amplitude=0.1)
    assert rec.barge_in_triggered is False

    # 2nd chunk of speech - triggers barge in!
    stream.push_speech(800, amplitude=0.1)
    assert rec.barge_in_triggered is True
    assert rec.barge_in_active is False
    assert rec.state == "recording"
    assert callback_fired.wait(timeout=2.0) is True

    # Calling stop() should successfully return the recording
    result = rec.stop()
    assert result.duration_seconds > 0
    assert rec.state == "idle"


def test_barge_in_stop_cleans_up():
    holder: dict[str, BargeInFakeStream] = {}

    def factory(callback, samplerate, channels):
        stream = BargeInFakeStream(callback, samplerate, channels)
        holder["stream"] = stream
        return stream

    rec = MicrophoneRecorder(stream_factory=factory)
    rec.start_barge_in()
    assert rec.barge_in_active is True

    stream = holder["stream"]
    assert stream.started is True

    rec.stop_barge_in()
    assert rec.barge_in_active is False
    assert stream.stopped is True
    assert stream.closed is True
    assert rec.state == "idle"


def test_tts_speak_wires_barge_in():
    started_barge_in = []
    stopped_barge_in = []

    def mock_starter(callback):
        started_barge_in.append(callback)
        return True

    def mock_stopper():
        stopped_barge_in.append(True)

    class FakePlayback:
        def __init__(self):
            self.playing = False
        def play(self, samples, samplerate):
            self.playing = True
        def stop(self):
            self.playing = False

    async def fake_synth(text, voice, rate):
        return np.zeros(1600, dtype=np.float32), 16000

    playback = FakePlayback()
    speaker = VoiceSpeaker(
        synthesizer=fake_synth,
        decode=lambda b: (np.zeros(1600, dtype=np.float32), 16000),
        playback=playback,
        barge_in_starter=mock_starter,
        barge_in_stopper=mock_stopper,
    )

    import asyncio
    asyncio.run(speaker.speak("Testing barge-in hook"))

    assert len(started_barge_in) == 1
    assert playback.playing is True

    # Simulate barge-in firing callback
    cb = started_barge_in[0]
    cb()
    assert playback.playing is False


def test_barge_in_status_api(monkeypatch):
    client = TestClient(app)

    # Initially not triggered
    monkeypatch.setattr(recorder, "is_barge_in_active", lambda: False)
    monkeypatch.setattr(recorder, "is_barge_in_triggered", lambda: False)
    monkeypatch.setattr(recorder, "state", lambda: "idle")

    res = client.get("/api/recording/barge-in-status")
    assert res.status_code == 200
    data = res.json()
    assert data["barge_in_active"] is False
    assert data["barge_in_triggered"] is False
    assert data["state"] == "idle"

    # When triggered
    monkeypatch.setattr(recorder, "is_barge_in_active", lambda: False)
    monkeypatch.setattr(recorder, "is_barge_in_triggered", lambda: True)
    monkeypatch.setattr(recorder, "state", lambda: "recording")

    res2 = client.get("/api/recording/barge-in-status")
    assert res2.status_code == 200
    data2 = res2.json()
    assert data2["barge_in_triggered"] is True
    assert data2["state"] == "recording"



def test_barge_in_silence_auto_stops():
    holder: dict[str, BargeInFakeStream] = {}

    def factory(callback, samplerate, channels):
        stream = BargeInFakeStream(callback, samplerate, channels)
        holder['stream'] = stream
        return stream

    rec = MicrophoneRecorder(stream_factory=factory)
    rec.start_barge_in()
    stream = holder['stream']

    # Trigger barge-in with speech
    stream.push_speech(800, amplitude=0.1)
    stream.push_speech(800, amplitude=0.1)
    assert rec.barge_in_triggered is True
    assert rec.state == 'recording'

    # Feed additional speech frames so audio length >= 12 chunks
    for _ in range(12):
        stream.push_speech(800, amplitude=0.1)

    # Now feed silence chunks to trigger silence auto-stop
    for _ in range(25):
        stream.push_silence(800)

    time.sleep(0.1)
    assert rec.auto_result is not None
    assert rec.auto_result.duration_seconds > 0
