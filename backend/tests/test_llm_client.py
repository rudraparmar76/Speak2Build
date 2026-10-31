"""Tests for the OpenAI-compatible LLM client using httpx.MockTransport.

No real network: every case is an injected transport that asserts the request
shape and returns a canned response.
"""

import json

import httpx
import pytest

from app.services.llm_client import (
    LLMConfig,
    LLMRequestError,
    LLMUnavailableError,
    OpenAICompatibleLLM,
)


def make_config(**overrides) -> LLMConfig:
    values = {
        "base_url": "http://provider.test/v1",
        "model": "test-model",
        "api_key": "secret-key",
        "timeout_seconds": 10.0,
    }
    values.update(overrides)
    return LLMConfig(**values)


def chat_response(content: str) -> httpx.Response:
    return httpx.Response(
        200,
        json={"choices": [{"message": {"role": "assistant", "content": content}}]},
        request=httpx.Request("POST", "http://provider.test/v1/chat/completions"),
    )


def capture_transport(recorder: dict):
    def handler(request: httpx.Request) -> httpx.Response:
        recorder["request"] = request
        return chat_response("hello")

    return handler


def test_complete_posts_model_and_auth_header():
    captured: dict = {}
    llm = OpenAICompatibleLLM(make_config(), transport=httpx.MockTransport(capture_transport(captured)))

    assert llm.complete("sys", "usr") == "hello"

    request = captured["request"]
    body = json.loads(request.content)
    assert request.url == "http://provider.test/v1/chat/completions"
    assert request.headers["Authorization"] == "Bearer secret-key"
    assert body["model"] == "test-model"
    assert body["messages"] == [
        {"role": "system", "content": "sys"},
        {"role": "user", "content": "usr"},
    ]


def test_complete_without_api_key_omits_auth_header():
    captured: dict = {}
    config = make_config(api_key=None)
    llm = OpenAICompatibleLLM(config, transport=httpx.MockTransport(capture_transport(captured)))

    llm.complete("sys", "usr")

    assert "Authorization" not in captured["request"].headers


def test_complete_without_model_raises_unavailable():
    llm = OpenAICompatibleLLM(make_config(model=""))
    with pytest.raises(LLMUnavailableError, match="SPEAK2BUILD_LLM_MODEL"):
        llm.complete("sys", "usr")


def test_provider_http_error_maps_to_request_error():
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(401, json={"error": "bad key"})

    llm = OpenAICompatibleLLM(make_config(), transport=httpx.MockTransport(handler))
    with pytest.raises(LLMRequestError, match="HTTP 401"):
        llm.complete("sys", "usr")


def test_unexpected_shape_maps_to_request_error():
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(200, json={"unexpected": True})

    llm = OpenAICompatibleLLM(make_config(), transport=httpx.MockTransport(handler))
    with pytest.raises(LLMRequestError, match="shape"):
        llm.complete("sys", "usr")


def test_empty_content_maps_to_request_error():
    def handler(request: httpx.Request) -> httpx.Response:
        return chat_response("")

    llm = OpenAICompatibleLLM(make_config(), transport=httpx.MockTransport(handler))
    with pytest.raises(LLMRequestError, match="empty"):
        llm.complete("sys", "usr")
