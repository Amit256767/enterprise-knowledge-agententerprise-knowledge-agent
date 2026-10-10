import asyncio

from app.ai.providers import CompletionResult
from app.agent import search
from app.retrieval.vector_search import Evidence


class FakeEmbeddingProvider:
    async def embed(self, texts: list[str]) -> list[list[float]]:
        return [[0.0] * 1536 for _ in texts]


class PlannedChatProvider:
    def __init__(self, actions: list[str]):
        self.actions = actions
        self.calls = 0

    async def complete(self, _system: str, _user: str) -> CompletionResult:
        action = self.actions[self.calls]
        self.calls += 1
        return CompletionResult(content=action, prompt_tokens=10, completion_tokens=5)


def sample_evidence() -> Evidence:
    from uuid import uuid4

    return Evidence(uuid4(), uuid4(), "guide.pdf", 1, "A supporting passage.", 0.8)


def test_agent_stops_after_configured_search_limit(monkeypatch) -> None:
    monkeypatch.setattr(search, "retrieve_evidence", lambda _db, _vector: [sample_evidence()])
    monkeypatch.setattr(search, "retrieve_keyword_evidence", lambda _db, _query: [sample_evidence()])
    monkeypatch.setattr(search, "retrieve_hybrid_evidence", lambda _db, _query, _vector: [sample_evidence()])
    provider = PlannedChatProvider([
        '{"tool":"keyword","query":"policy limit"}',
        '{"tool":"hybrid","query":"policy threshold"}',
    ])

    result = asyncio.run(
        search.run_controlled_search("policy", object(), FakeEmbeddingProvider(), provider)
    )

    assert result.additional_searches == 2
    assert result.tools_used == ["vector", "keyword", "hybrid"]
    assert provider.calls == 2


def test_agent_finishes_without_searching_again(monkeypatch) -> None:
    monkeypatch.setattr(search, "retrieve_evidence", lambda _db, _vector: [sample_evidence()])
    provider = PlannedChatProvider(['{"tool":"finish","query":""}'])

    result = asyncio.run(
        search.run_controlled_search("policy", object(), FakeEmbeddingProvider(), provider)
    )

    assert result.additional_searches == 0
    assert provider.calls == 1


def test_invalid_tool_response_cannot_execute_a_tool(monkeypatch) -> None:
    monkeypatch.setattr(search, "retrieve_evidence", lambda _db, _vector: [sample_evidence()])
    provider = PlannedChatProvider(['{"tool":"shell","query":"do something"}'])

    result = asyncio.run(
        search.run_controlled_search("policy", object(), FakeEmbeddingProvider(), provider)
    )

    assert result.additional_searches == 0
    assert result.tools_used == ["vector"]


def test_agent_stops_when_it_repeats_a_search(monkeypatch) -> None:
    monkeypatch.setattr(search, "retrieve_evidence", lambda _db, _vector: [sample_evidence()])
    monkeypatch.setattr(search, "retrieve_keyword_evidence", lambda _db, _query: [sample_evidence()])
    provider = PlannedChatProvider([
        '{"tool":"keyword","query":"same query"}',
        '{"tool":"keyword","query":"same   query"}',
    ])

    result = asyncio.run(
        search.run_controlled_search("policy", object(), FakeEmbeddingProvider(), provider)
    )

    assert result.additional_searches == 1
    assert provider.calls == 2
