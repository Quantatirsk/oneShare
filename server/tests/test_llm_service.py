import json
import sys
from pathlib import Path
from types import SimpleNamespace

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from llm_service import LLMRequest, LLMService, Message


class AsyncChunkStream:
    def __init__(self, chunks):
        self._chunks = chunks

    def __aiter__(self):
        self._iterator = iter(self._chunks)
        return self

    async def __anext__(self):
        try:
            return next(self._iterator)
        except StopIteration:
            raise StopAsyncIteration


class FakeCompletions:
    def __init__(self, stream_chunks=None, completion_response=None):
        self.stream_chunks = stream_chunks or []
        self.completion_response = completion_response

    async def create(self, **kwargs):
        if kwargs.get("stream"):
            return AsyncChunkStream(self.stream_chunks)
        return self.completion_response


def make_service(completions):
    service = LLMService()
    service.client = SimpleNamespace(
        chat=SimpleNamespace(completions=completions)
    )
    return service


def chunk_with_content(content):
    return SimpleNamespace(
        choices=[SimpleNamespace(delta=SimpleNamespace(content=content))]
    )


def parse_sse_event(event):
    assert event.startswith("data: ")
    return json.loads(event.removeprefix("data: ").strip())


@pytest.mark.asyncio
async def test_stream_skips_empty_choices_and_chunks_without_content():
    service = make_service(
        FakeCompletions(
            stream_chunks=[
                SimpleNamespace(choices=[]),
                SimpleNamespace(choices=[SimpleNamespace(delta=None)]),
                SimpleNamespace(choices=[SimpleNamespace(delta=SimpleNamespace())]),
                chunk_with_content(None),
                chunk_with_content(""),
                chunk_with_content("hello"),
                chunk_with_content(" world"),
            ]
        )
    )

    request = LLMRequest(messages=[Message(role="user", content="hi")])
    events = [
        parse_sse_event(event)
        async for event in service.chat_completion_stream(request)
    ]

    assert events == [
        {"content": "hello"},
        {"content": " world"},
        {"done": True},
    ]


@pytest.mark.asyncio
async def test_chat_completion_handles_empty_choices():
    service = make_service(
        FakeCompletions(completion_response=SimpleNamespace(choices=[]))
    )

    request = LLMRequest(messages=[Message(role="user", content="hi")])
    response = await service.chat_completion(request)

    assert response.success is True
    assert response.data == ""
