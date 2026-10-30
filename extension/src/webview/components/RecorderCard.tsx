import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Voice capture component owns the full recording pipeline:
 *
 *   MediaRecorder (webm/opus chunks)
 *     → Blob → decodeAudioData (PCM decode in the browser)
 *     → OfflineAudioContext (resample to 16 kHz, downmix to mono)
 *     → hand-built 16-bit PCM WAV encoder
 *     → base64 string (postMessage-safe) → host uploads raw bytes
 *
 * Why convert here? The backend must not depend on FFmpeg being installed;
 * the browser already ships capable decoders. The WAV output is exactly the
 * format faster-whisper consumes in Milestone 2.
 */

const MAX_RECORDING_MS = 120_000; // 2 minutes — bound size and memory
const TARGET_SAMPLE_RATE = 16_000;

type RecorderState = "idle" | "requesting" | "recording" | "converting";

interface RecorderCardProps {
  /** Called with base64-encoded WAV bytes once a recording is processed. */
  onAudioReady: (base64Wav: string) => void;
  /** Disable while another action (e.g. an upload) is in flight. */
  disabled: boolean;
}

function pickRecorderMimeType(): string | undefined {
  if (typeof MediaRecorder === "undefined") {
    return undefined;
  }
  const candidates = ["audio/webm;codecs=opus", "audio/webm", "audio/ogg;codecs=opus"];
  return candidates.find((type) => MediaRecorder.isTypeSupported(type));
}

function describeMicError(error: unknown): string {
  if (error instanceof DOMException) {
    switch (error.name) {
      case "NotAllowedError":
      case "SecurityError":
        return "Microphone access was denied. Allow the mic for VS Code and try again.";
      case "NotFoundError":
      case "OverconstrainedError":
        return "No microphone was found on this machine.";
      case "NotReadableError":
        return "The microphone is in use by another application.";
      default:
        return error.message;
    }
  }
  return error instanceof Error ? error.message : String(error);
}

async function convertToWavBase64(chunks: Blob[], mimeType: string): Promise<string> {
  const blob = new Blob(chunks, { type: mimeType });
  const raw = await blob.arrayBuffer();
  if (raw.byteLength < 1000) {
    throw new Error("Recording is empty — nothing was sent to the microphone?");
  }

  // 1) Decode the container (webm/opus) into raw PCM via the browser.
  const decodeContext = new AudioContext();
  const decoded = await decodeContext.decodeAudioData(raw);
  void decodeContext.close();

  // 2) Resample to 16 kHz mono (faster-whisper's native input format).
  const length = Math.max(1, Math.ceil(decoded.duration * TARGET_SAMPLE_RATE));
  const offline = new OfflineAudioContext(1, length, TARGET_SAMPLE_RATE);
  const source = offline.createBufferSource();
  source.buffer = decoded;
  source.connect(offline.destination);
  source.start(0);
  const rendered = await offline.startRendering();

  // 3) Encode PCM16 WAV (RIFF header + little-endian samples).
  return encodeBase64(encodeWav(rendered.getChannelData(0), TARGET_SAMPLE_RATE));
}

function encodeWav(samples: Float32Array, sampleRate: number): Uint8Array {
  const bytesPerSample = 2;
  const buffer = new ArrayBuffer(44 + samples.length * bytesPerSample);
  const view = new DataView(buffer);

  const writeString = (offset: number, value: string) => {
    for (let i = 0; i < value.length; i++) {
      view.setUint8(offset + i, value.charCodeAt(i));
    }
  };

  writeString(0, "RIFF");
  view.setUint32(4, 36 + samples.length * bytesPerSample, true);
  writeString(8, "WAVE");
  writeString(12, "fmt ");
  view.setUint32(16, 16, true); // fmt chunk size
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, 1, true); // mono
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * bytesPerSample, true); // byte rate
  view.setUint16(32, bytesPerSample, true); // block align
  view.setUint16(34, 16, true); // bits per sample
  writeString(36, "data");
  view.setUint32(40, samples.length * bytesPerSample, true);

  let offset = 44;
  for (let i = 0; i < samples.length; i++) {
    const clamped = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(offset, clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff, true);
    offset += 2;
  }
  return new Uint8Array(buffer);
}

/** Chunked btoa: String.fromCharCode spread of 5+ MB blows the stack. */
function encodeBase64(bytes: Uint8Array): string {
  let binary = "";
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(binary);
}

export function RecorderCard({ onAudioReady, disabled }: RecorderCardProps) {
  const [state, setState] = useState<RecorderState>("idle");
  const [error, setError] = useState<string | null>(null);
  const [elapsedMs, setElapsedMs] = useState(0);

  const streamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<number | null>(null);

  const cleanup = useCallback(() => {
    if (timerRef.current !== null) {
      window.clearInterval(timerRef.current);
      timerRef.current = null;
    }
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    recorderRef.current = null;
    chunksRef.current = [];
  }, []);

  // Always release the mic if the component unmounts mid-recording.
  useEffect(() => cleanup, [cleanup]);

  const start = useCallback(async () => {
    setError(null);
    setState("requesting");
    try {
      const mimeType = pickRecorderMimeType();
      if (!mimeType) {
        throw new Error("This environment does not support MediaRecorder audio capture.");
      }

      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      const recorder = new MediaRecorder(stream, { mimeType });
      recorderRef.current = recorder;
      chunksRef.current = [];

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          chunksRef.current.push(event.data);
        }
      };

      recorder.onstop = () => {
        const chunks = [...chunksRef.current];
        const type = recorder.mimeType;
        cleanup();
        void (async () => {
          setState("converting");
          try {
            const base64Wav = await convertToWavBase64(chunks, type);
            setState("idle");
            onAudioReady(base64Wav);
          } catch (convertError) {
            setState("idle");
            setError(describeMicError(convertError));
          }
        })();
      };

      recorder.start(250); // collect a chunk every 250 ms
      setState("recording");
      setElapsedMs(0);
      timerRef.current = window.setInterval(() => {
        setElapsedMs((ms) => ms + 100);
      }, 100);
    } catch (startError) {
      cleanup();
      setState("idle");
      setError(describeMicError(startError));
    }
  }, [cleanup, onAudioReady]);

  const stop = useCallback(() => {
    const recorder = recorderRef.current;
    if (recorder && recorder.state !== "inactive") {
      recorder.stop(); // onstop performs conversion + cleanup
    }
  }, []);

  // Hard cap: auto-stop when the maximum recording length is reached.
  useEffect(() => {
    if (state === "recording" && elapsedMs >= MAX_RECORDING_MS) {
      stop();
    }
  }, [state, elapsedMs, stop]);

  const labels: Record<RecorderState, string> = {
    idle: "● Record",
    requesting: "Requesting mic…",
    recording: "■ Stop recording",
    converting: "Processing audio…",
  };

  const busy = state === "requesting" || state === "converting";

  return (
    <section className="card">
      <div className="label">Voice capture</div>
      <div className="record-row">
        <button
          className={`button record-button ${state === "recording" ? "record-button--active" : ""}`}
          onClick={state === "recording" ? stop : () => void start()}
          disabled={disabled || busy || state === "recording" && elapsedMs < 300}
        >
          {labels[state]}
        </button>
        {state === "recording" && (
          <span className="record-timer">● {(elapsedMs / 1000).toFixed(1)}s</span>
        )}
      </div>
      {error && <p className="error">{error}</p>}
      <p className="hint">
        Recordings are converted to 16 kHz mono WAV in the sidebar and stored temporarily
        by the backend. Maximum {MAX_RECORDING_MS / 1000} seconds.
      </p>
    </section>
  );
}
