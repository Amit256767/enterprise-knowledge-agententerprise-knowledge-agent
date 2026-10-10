import json
import re
import unicodedata
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field

from app.retrieval.vector_search import Evidence


class CitationDraft(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)

    chunk_id: UUID
    quote: str = Field(min_length=1)


class AnswerDraft(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)

    answer: str = Field(min_length=1)
    abstained: bool
    conflicting_evidence: bool
    citations: list[CitationDraft]


class Citation(BaseModel):
    chunk_id: UUID
    document_id: UUID
    document_name: str
    page_number: int
    passage: str


class RetrievedSource(BaseModel):
    chunk_id: UUID
    document_id: UUID
    document_name: str
    page_number: int
    score: float


class ChatMetrics(BaseModel):
    latency_ms: int
    additional_searches: int
    search_tools: list[str]
    llm_calls: int
    prompt_tokens: int | None = None
    completion_tokens: int | None = None
    estimated_llm_cost_usd: float | None = None


class ChatResponse(BaseModel):
    answer: str
    abstained: bool
    conflicting_evidence: bool
    citations: list[Citation]
    retrieved_sources: list[RetrievedSource] = Field(default_factory=list)
    metrics: ChatMetrics | None = None


class CitationValidationError(ValueError):
    pass


def _normalize_quote(value: str) -> str:
    return re.sub(r"\s+", " ", unicodedata.normalize("NFKC", value).casefold()).strip()


def format_evidence(evidence: list[Evidence]) -> str:
    return json.dumps(
        [
            {
                "chunk_id": str(item.chunk_id),
                "source_document": item.document_name,
                "page_number": item.page_number,
                "passage": item.passage,
            }
            for item in evidence
        ],
        ensure_ascii=False,
    )


def validate_answer_draft(draft: AnswerDraft, evidence: list[Evidence]) -> ChatResponse:
    if draft.abstained:
        return ChatResponse(
            answer=draft.answer,
            abstained=True,
            conflicting_evidence=False,
            citations=[],
        )

    by_id = {item.chunk_id: item for item in evidence}
    verified: list[Citation] = []
    seen: set[UUID] = set()
    for citation in draft.citations:
        source = by_id.get(citation.chunk_id)
        normalized_quote = _normalize_quote(citation.quote)
        if (
            source is None
            or citation.chunk_id in seen
            or len(normalized_quote) < 8
            or normalized_quote not in _normalize_quote(source.passage)
        ):
            raise CitationValidationError("Citation did not match retrieved evidence")
        seen.add(citation.chunk_id)
        verified.append(
            Citation(
                chunk_id=source.chunk_id,
                document_id=source.document_id,
                document_name=source.document_name,
                page_number=source.page_number,
                passage=citation.quote,
            )
        )

    if not verified:
        raise CitationValidationError("A non-abstaining answer must cite retrieved evidence")
    if draft.conflicting_evidence and len(verified) < 2:
        raise CitationValidationError("Conflicting evidence must cite at least two passages")
    return ChatResponse(
        answer=draft.answer,
        abstained=False,
        conflicting_evidence=draft.conflicting_evidence,
        citations=verified,
    )
