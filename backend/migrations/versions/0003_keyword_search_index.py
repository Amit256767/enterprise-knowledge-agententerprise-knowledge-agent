"""Add PostgreSQL full-text search index for chunk text."""

from alembic import op

revision = "0003_keyword_search_index"
down_revision = "0002_chunk_embeddings"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        "CREATE INDEX ix_document_chunks_text_fts "
        "ON document_chunks USING gin (to_tsvector('english', text))"
    )


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS ix_document_chunks_text_fts")
