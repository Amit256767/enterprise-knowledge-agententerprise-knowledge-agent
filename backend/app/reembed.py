"""Backfill vectors for documents ingested before embeddings were enabled."""

import asyncio

from sqlalchemy import select

from app.ai.providers import embed_in_batches, get_embedding_provider
from app.core.config import get_settings
from app.db.models import Document, DocumentChunk
from app.db.session import SessionLocal


async def reembed_missing_chunks() -> int:
    settings = get_settings()
    provider = get_embedding_provider()
    updated = 0
    while True:
        with SessionLocal() as session:
            chunks = list(
                session.scalars(
                    select(DocumentChunk)
                    .join(Document)
                    .where(Document.status == "processed", DocumentChunk.embedding.is_(None))
                    .order_by(DocumentChunk.id)
                    .limit(settings.embedding_batch_size)
                )
            )
            if not chunks:
                return updated
            vectors = await embed_in_batches(
                provider, [chunk.text for chunk in chunks], settings.embedding_batch_size
            )
            for chunk, vector in zip(chunks, vectors, strict=True):
                chunk.embedding = vector
            session.commit()
            updated += len(chunks)


if __name__ == "__main__":
    print(f"Backfilled embeddings for {asyncio.run(reembed_missing_chunks())} chunks")
