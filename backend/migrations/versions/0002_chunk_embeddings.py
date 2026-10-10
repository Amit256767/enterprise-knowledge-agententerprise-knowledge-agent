"""Add pgvector embeddings to document chunks."""

from alembic import op
import sqlalchemy as sa
from pgvector.sqlalchemy import Vector

from app.core.config import get_settings

revision = "0002_chunk_embeddings"
down_revision = "0001_documents_chunks"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("CREATE EXTENSION IF NOT EXISTS vector")
    op.add_column(
        "document_chunks",
        sa.Column("embedding", Vector(get_settings().embedding_dimensions), nullable=True),
    )
    op.execute(
        "CREATE INDEX ix_document_chunks_embedding_hnsw "
        "ON document_chunks USING hnsw (embedding vector_cosine_ops)"
    )


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS ix_document_chunks_embedding_hnsw")
    op.drop_column("document_chunks", "embedding")
