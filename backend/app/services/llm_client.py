"""Provider-agnostic LLM access over the OpenAI-compatible chat API.

The OpenAI chat-completions protocol is the de-facto industry envelope: it
covers OpenAI itself, LM Studio, Ollama (`/v1`), vLLM, Groq, Together,
Mistral, and countless gateways. One client here means every provider works
through env config alone — never hardcoded keys, per CLAUDE.md.

Configuration (environment variables, read per call so a re-run takes effect
without code changes):
- SPEAK2BUILD_LLM_BASE_URL  e.g. https://api.openai.com/v1 or http://127.0.0.1:11434/v1
- SPEAK2BUILD_LLM_MODEL     required to enable LLM features (e.g. gpt-4o-mini)
- SPEAK2BUILD_LLM_API_KEY   optional for local servers; sent as Bearer if set
- SPEAK2BUILD_LLM_TIMEOUT   request timeout in seconds (default 60)
"""

import dataclasses
import logging
import os
import time
from pathlib import Path

import httpx

logger = logging.getLogger(__name__)

# Load .env from the backend directory so local dev works without `setx`
try:
    from dotenv import load_dotenv
    load_dotenv(Path(__file__).resolve().parents[2] / ".env")
except Exception:
    pass  # dotenv optional; env vars may come from the shell instead

BASE_URL_ENV = "SPEAK2BUILD_LLM_BASE_URL"
MODEL_ENV = "SPEAK2BUILD_LLM_MODEL"
API_KEY_ENV = "SPEAK2BUILD_LLM_API_KEY"
TIMEOUT_ENV = "SPEAK2BUILD_LLM_TIMEOUT"

DEFAULT_BASE_URL = "https://api.openai.com/v1"
DEFAULT_TIMEOUT_SECONDS = 120.0

# Retry configuration for transient errors (429 rate-limit, 5xx server errors)
MAX_RETRIES = 3
BASE_RETRY_DELAY_SECONDS = 2.0  # doubles each attempt: 2s → 4s → 8s
RETRIABLE_STATUS_CODES = {429, 500, 502, 503}


class LLMError(Exception):
    """Base class: mapped to 503/502 at the route layer."""


class LLMUnavailableError(LLMError):
    """Wrong or missing configuration, or the provider cannot be reached."""


class LLMRequestError(LLMError):
    """The provider answered, but with an error or an unusable body."""


@dataclasses.dataclass(frozen=True)
class LLMConfig:
    base_url: str
    model: str
    api_key: str | None
    timeout_seconds: float


def load_config_from_env() -> LLMConfig:
    return LLMConfig(
        base_url=(os.environ.get(BASE_URL_ENV) or DEFAULT_BASE_URL).rstrip("/"),
        model=os.environ.get(MODEL_ENV) or "",
        api_key=os.environ.get(API_KEY_ENV) or None,
        timeout_seconds=_timeout_from_env(),
    )


def _timeout_from_env() -> float:
    raw = os.environ.get(TIMEOUT_ENV)
    if not raw:
        return DEFAULT_TIMEOUT_SECONDS
    try:
        return max(5.0, float(raw))
    except ValueError:
        return DEFAULT_TIMEOUT_SECONDS


class OpenAICompatibleLLM:
    """Minimal chat-completions client; no provider SDK dependency."""

    def __init__(
        self,
        config: LLMConfig,
        transport: httpx.BaseTransport | None = None,
    ) -> None:
        # `transport` is a test seam (httpx.MockTransport) that keeps network
        # behavior testable without real requests.
        self._config = config
        self._transport = transport

    def complete(self, system: str, user: str) -> str:
        if not self._config.model:
            raise LLMUnavailableError(
                "No LLM model configured. Set SPEAK2BUILD_LLM_MODEL "
                "(and SPEAK2BUILD_LLM_BASE_URL / API_KEY as needed)."
            )
        headers = {"Content-Type": "application/json"}
        if self._config.api_key:
            headers["Authorization"] = f"Bearer {self._config.api_key}"

        body = {
            "model": self._config.model,
            "temperature": 0.2,
            "messages": [
                {"role": "system", "content": system},
                {"role": "user", "content": user},
            ],
        }
        url = f"{self._config.base_url}/chat/completions"

        last_error: Exception | None = None
        for attempt in range(1, MAX_RETRIES + 1):
            try:
                # Per-call Client so the test seam (transport) can be honored;
                # connection reuse is not meaningful at this call frequency.
                with httpx.Client(
                    timeout=self._config.timeout_seconds,
                    transport=self._transport,
                ) as http:
                    response = http.post(url, headers=headers, json=body)
            except httpx.TimeoutException as exc:
                last_error = LLMRequestError(
                    f"LLM request timed out after {self._config.timeout_seconds}s"
                )
                last_error.__cause__ = exc
                # Timeouts are retriable
                if attempt < MAX_RETRIES:
                    delay = BASE_RETRY_DELAY_SECONDS * (2 ** (attempt - 1))
                    logger.warning(
                        "LLM timeout on attempt %d/%d, retrying in %.1fs",
                        attempt, MAX_RETRIES, delay,
                    )
                    time.sleep(delay)
                    continue
                raise last_error from exc
            except httpx.HTTPError as exc:
                raise LLMUnavailableError(
                    f"Cannot reach the LLM at {self._config.base_url}: {exc}"
                ) from exc

            # Retry on rate-limit (429) and server errors (5xx)
            if response.status_code in RETRIABLE_STATUS_CODES and attempt < MAX_RETRIES:
                # Respect Retry-After header if present, else exponential backoff
                retry_after = response.headers.get("Retry-After")
                if retry_after:
                    try:
                        delay = max(1.0, float(retry_after))
                    except ValueError:
                        delay = BASE_RETRY_DELAY_SECONDS * (2 ** (attempt - 1))
                else:
                    delay = BASE_RETRY_DELAY_SECONDS * (2 ** (attempt - 1))
                logger.warning(
                    "LLM provider returned HTTP %d on attempt %d/%d, "
                    "retrying in %.1fs...",
                    response.status_code, attempt, MAX_RETRIES, delay,
                )
                time.sleep(delay)
                continue

            if response.status_code != 200:
                raise LLMRequestError(
                    f"LLM provider returned HTTP {response.status_code}: "
                    f"{response.text[:300]}"
                )

            # Success — parse the response
            try:
                data = response.json()
            except ValueError as exc:
                raise LLMRequestError("LLM provider returned a non-JSON body") from exc
            try:
                content = data["choices"][0]["message"]["content"]
            except (KeyError, IndexError, TypeError) as exc:
                raise LLMRequestError(
                    f"Unexpected response shape: {str(data)[:200]}"
                ) from exc
            if not content:
                raise LLMRequestError("LLM returned an empty completion")
            return content

        # Should not reach here, but just in case
        raise last_error or LLMRequestError("LLM request failed after all retries")
