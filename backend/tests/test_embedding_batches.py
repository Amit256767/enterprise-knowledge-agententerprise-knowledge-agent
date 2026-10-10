import asyncio

import pytest

from app.ai.providers import ProviderError, embed_in_batches


class RecordingProvider:
    def __init__(self):
        self.calls: list[list[str]] = []

    async def embed(self, texts: list[str]) -> list[list[float]]:
        self.calls.append(texts)
        return [[float(len(text))] for text in texts]


def test_embedding_batches_preserve_input_order() -> None:
    provider = RecordingProvider()
    vectors = asyncio.run(embed_in_batches(provider, ["a", "bb", "ccc"], 2))

    assert provider.calls == [["a", "bb"], ["ccc"]]
    assert vectors == [[1.0], [2.0], [3.0]]


def test_embedding_batch_rejects_missing_vectors() -> None:
    class ShortProvider:
        async def embed(self, texts: list[str]) -> list[list[float]]:
            return []

    with pytest.raises(ProviderError):
        asyncio.run(embed_in_batches(ShortProvider(), ["input"], 1))
