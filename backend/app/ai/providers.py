import math
from dataclasses import dataclass
from typing import Protocol

import httpx
from pydantic import SecretStr

from app.core.config import Settings, get_settings


class ProviderError(RuntimeError):
    """Provider is missing, unreachable, or returned an invalid response."""


class ProviderNotConfigured(ProviderError):
    """Required provider settings have not been supplied."""


@dataclass(frozen=True)
class CompletionResult:
    content: str
    prompt_tokens: int | None = None
    completion_tokens: int | None = None
    model: str | None = None


class EmbeddingProvider(Protocol):
    async def embed(self, texts: list[str]) -> list[list[float]]: ...


class ChatProvider(Protocol):
    async def complete(self, system_prompt: str, user_prompt: str) -> CompletionResult: ...


def _authorization_header(secret: SecretStr | None) -> dict[str, str]:
    if secret is None or not secret.get_secret_value():
        return {}
    return {"Authorization": f"Bearer {secret.get_secret_value()}"}


class OpenAICompatibleEmbeddingProvider:
    def __init__(self, settings: Settings):
        self.base_url = settings.embedding_api_base_url.rstrip("/")
        self.api_key = settings.embedding_api_key
        self.model = settings.embedding_model
        self.dimensions = settings.embedding_dimensions

    async def embed(self, texts: list[str]) -> list[list[float]]:
        if not self.base_url or not self.model:
            raise ProviderNotConfigured("Embedding provider is not configured")
        if not texts:
            return []
        try:
            async with httpx.AsyncClient(timeout=60) as client:
                response = await client.post(
                    f"{self.base_url}/embeddings",
                    headers=_authorization_header(self.api_key),
                    json={"model": self.model, "input": texts, "dimensions": self.dimensions},
                )
                response.raise_for_status()
                data = response.json()["data"]
            if len(data) != len(texts):
                raise ProviderError("Embedding provider returned the wrong number of vectors")
            if all(isinstance(item, dict) and isinstance(item.get("index"), int) for item in data):
                data = sorted(data, key=lambda item: item["index"])
                if [item["index"] for item in data] != list(range(len(texts))):
                    raise ProviderError("Embedding provider returned invalid vector indexes")
            vectors = [item["embedding"] for item in data]
            for vector in vectors:
                if (
                    not isinstance(vector, list)
                    or len(vector) != self.dimensions
                    or any(not isinstance(value, (int, float)) or not math.isfinite(value) for value in vector)
                ):
                    raise ProviderError("Embedding provider returned an invalid vector")
            return [[float(value) for value in vector] for vector in vectors]
        except ProviderError:
            raise
        except (httpx.HTTPError, ValueError, KeyError, TypeError) as exc:
            raise ProviderError("Embedding provider request failed") from exc


class OpenAICompatibleChatProvider:
    def __init__(self, settings: Settings):
        self.base_url = settings.llm_api_base_url.rstrip("/")
        self.api_key = settings.llm_api_key
        self.model = settings.llm_model

    async def complete(self, system_prompt: str, user_prompt: str) -> CompletionResult:
        if not self.base_url or not self.model:
            raise ProviderNotConfigured("Chat provider is not configured")
        try:
            async with httpx.AsyncClient(timeout=90) as client:
                response = await client.post(
                    f"{self.base_url}/chat/completions",
                    headers=_authorization_header(self.api_key),
                    json={
                        "model": self.model,
                        "temperature": 0,
                        "max_tokens": 1200,
                        "messages": [
                            {"role": "system", "content": system_prompt},
                            {"role": "user", "content": user_prompt},
                        ],
                    },
                )
                response.raise_for_status()
                payload = response.json()
                content = payload["choices"][0]["message"]["content"]
            if not isinstance(content, str):
                raise ProviderError("Chat provider returned a non-text answer")
            usage = payload.get("usage") or {}
            return CompletionResult(
                content=content,
                prompt_tokens=usage.get("prompt_tokens") if isinstance(usage.get("prompt_tokens"), int) else None,
                completion_tokens=usage.get("completion_tokens") if isinstance(usage.get("completion_tokens"), int) else None,
                model=payload.get("model") or self.model,
            )
        except ProviderError:
            raise
        except (httpx.HTTPError, ValueError, KeyError, IndexError, TypeError) as exc:
            raise ProviderError("Chat provider request failed") from exc


def get_embedding_provider() -> EmbeddingProvider:
    return OpenAICompatibleEmbeddingProvider(get_settings())


def get_chat_provider() -> ChatProvider:
    return OpenAICompatibleChatProvider(get_settings())


async def embed_in_batches(
    provider: EmbeddingProvider, texts: list[str], batch_size: int
) -> list[list[float]]:
    vectors: list[list[float]] = []
    for start in range(0, len(texts), batch_size):
        vectors.extend(await provider.embed(texts[start : start + batch_size]))
    if len(vectors) != len(texts):
        raise ProviderError("Embedding provider returned the wrong number of vectors")
    return vectors
