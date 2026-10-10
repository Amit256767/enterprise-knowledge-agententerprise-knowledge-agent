from dataclasses import dataclass, replace
from uuid import UUID

from sqlalchemy import func, literal_column, select
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.db.models import Document, DocumentChunk


@dataclass(frozen=True)
class Evidence:
    chunk_id: UUID
    document_id: UUID
    document_name: str
    page_number: int
    passage: str
    similarity: float


def retrieve_evidence(db: Session, query_vector: list[float]) -> list[Evidence]:
    settings = get_settings()
    if len(query_vector) != settings.embedding_dimensions:
        raise ValueError("Query embedding dimension does not match configured dimensions")

    distance = DocumentChunk.embedding.cosine_distance(query_vector)
    statement = (
        select(DocumentChunk, Document, distance.label("distance"))
        .join(Document, DocumentChunk.document_id == Document.id)
        .where(
            Document.status == "processed",
            DocumentChunk.embedding.is_not(None),
            distance <= 1 - settings.retrieval_min_similarity,
        )
        .order_by(distance)
        .limit(settings.retrieval_top_k)
    )
    return [
        Evidence(
            chunk_id=chunk.id,
            document_id=document.id,
            document_name=document.filename,
            page_number=chunk.page_number,
            passage=chunk.text,
            similarity=1 - float(distance_value),
        )
        for chunk, document, distance_value in db.execute(statement).all()
    ]


def retrieve_keyword_evidence(db: Session, query_text: str) -> list[Evidence]:
    settings = get_settings()
    query = func.websearch_to_tsquery("english", query_text)
    document_text = func.to_tsvector(literal_column("'english'"), DocumentChunk.text)
    rank = func.ts_rank_cd(document_text, query)
    statement = (
        select(DocumentChunk, Document, rank.label("rank"))
        .join(Document, DocumentChunk.document_id == Document.id)
        .where(
            Document.status == "processed",
            document_text.op("@@")(query),
        )
        .order_by(rank.desc())
        .limit(settings.retrieval_top_k)
    )
    return [
        Evidence(
            chunk_id=chunk.id,
            document_id=document.id,
            document_name=document.filename,
            page_number=chunk.page_number,
            passage=chunk.text,
            similarity=float(rank_value),
        )
        for chunk, document, rank_value in db.execute(statement).all()
    ]


def retrieve_hybrid_evidence(
    db: Session, query_text: str, query_vector: list[float]
) -> list[Evidence]:
    rankings = [
        retrieve_evidence(db, query_vector),
        retrieve_keyword_evidence(db, query_text),
    ]
    fused_scores: dict[UUID, float] = {}
    by_id: dict[UUID, Evidence] = {}
    for ranking in rankings:
        for position, item in enumerate(ranking, start=1):
            fused_scores[item.chunk_id] = fused_scores.get(item.chunk_id, 0.0) + 1 / (60 + position)
            by_id[item.chunk_id] = item
    ordered_ids = sorted(fused_scores, key=fused_scores.get, reverse=True)
    return [
        replace(by_id[item_id], similarity=fused_scores[item_id])
        for item_id in ordered_ids[: get_settings().retrieval_top_k]
    ]
