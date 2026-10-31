"""Tests for the recorder state machine, using a fake audio stream.

These tests never touch real hardware: the stream factory is injected, which
is exactly the seam the real `sounddevice` implementation plugs into.
"""

import re

import numpy as np
import pytest

from app.services import audio_store, recorder
from app.services.recorder import (
    MAX_RECORDING_SECONDS,
    MicrophoneRecorder,
    MicrophoneUnavailableError,
    NoActiveRecordingError,
    RecordingBusyError,
)


class FakeStream:
    """Pretends to be a sounddevice InputStream.

    `push()` delivers frames synchronously as if the audio callback ran,
    which is how the real stream invokes the recorder.
    """

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

    def push(self, frames: int) -> None:
        self.callback(
            np.zeros((frames, self.channels), dtype=np.float32), frames, None, None
        )


@pytest.fixture(autouse=True)
def isolate_storage(monkeypatch: pytest.MonkeyPatch, tmp_path):
    """Keep test recordings out of the shared temp directory."""
    monkeypatch.setattr(audio_store, "_STORAGE_DIR", tmp_path)
    yield


def make_recorder() -> tuple[MicrophoneRecorder, dict]:
    holder: dict[str, FakeStream] = {}

    def factory(callback, samplerate, channels) -> FakeStream:
        stream = FakeStream(callback, samplerate, channels)
        holder["stream"] = stream
        return stream

    # The stream only exists once start() invokes the factory.
    return MicrophoneRecorder(stream_factory=factory), holder


def test_start_opens_stream_and_reports_config():
    rec, holder = make_recorder()
    info = rec.start()
    stream = holder["stream"]
    assert stream.started
    assert info.sample_rate == 16000
    assert info.channels == 1


def test_second_start_is_busy():
    rec, holder = make_recorder()
    rec.start()
    with pytest.raises(RecordingBusyError):
        rec.start()


def test_stop_finalizes_stores_and_is_reusable():
    rec, holder = make_recorder()
    rec.start()
    stream = holder["stream"]
    stream.push(16000)  # 1 second of silence at 16 kHz

    result = rec.stop()
    assert stream.stopped and stream.closed
    assert result.sample_rate == 16000
    assert result.channels == 1
    assert result.duration_seconds == pytest.approx(1.0, abs=0.01)
    assert result.size_bytes == 16000 * 2 + 44

    stored = audio_store.path_for(result.audio_id)
    assert stored.exists()
    assert re.fullmatch(r"[0-9a-f]{32}", result.audio_id)

    # State resets: a brand new session works afterwards.
    rec, _ = make_recorder()
    rec.start()
    rec.stop()


def test_stop_without_start_rejected():
    rec, _ = make_recorder()
    with pytest.raises(NoActiveRecordingError):
        rec.stop()


def test_cancel_discards_without_storing():
    rec, holder = make_recorder()
    rec.start()
    holder["stream"].push(8000)
    rec.cancel()
    assert list((audio_store._STORAGE_DIR).glob("*.wav")) == []
    assert rec.state == "idle"


def test_auto_stop_finalizes_and_later_stop_returns_same_result(monkeypatch):
    monkeypatch.setattr(recorder, "MAX_RECORDING_SECONDS", 0.05)
    rec, holder = make_recorder()
    rec.start()
    holder["stream"].push(8000)
    import time

    time.sleep(0.15)  # let the watchdog fire
    result = rec.stop()
    assert result.duration_seconds == pytest.approx(0.5, abs=0.05)


def test_dto_constants_sane():
    assert MAX_RECORDING_SECONDS == 120.0
