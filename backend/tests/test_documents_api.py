from uuid import UUID

import fitz
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, event, select
from sqlalchemy.orm import Session
from sqlalchemy.pool import StaticPool

from app.ai.providers import get_embedding_provider
from app.api.documents import get_db
from app.db.models import Base, Document, DocumentChunk
from app.main import app


class FakeEmbeddingProvider:
    async def embed(self, texts: list[str]) -> list[list[float]]:
        return [[1.0] + [0.0] * 1535 for _ in texts]


@pytest.fixture
def client_and_db():
    engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )

    @event.listens_for(engine, "connect")
    def enable_sqlite_foreign_keys(connection, _record):
        cursor = connection.cursor()
        cursor.execute("PRAGMA foreign_keys=ON")
        cursor.close()

    Base.metadata.create_all(engine)

    def override_get_db():
        with Session(engine) as session:
            yield session

    app.dependency_overrides[get_db] = override_get_db
    app.dependency_overrides[get_embedding_provider] = FakeEmbeddingProvider
    with TestClient(app) as client:
        yield client, engine
    app.dependency_overrides.clear()
    Base.metadata.drop_all(engine)
    engine.dispose()


def make_pdf() -> bytes:
    document = fitz.open()
    document.new_page().insert_text((72, 72), "Quarterly revenue was 42 million.")
    data = document.tobytes()
    document.close()
    return data


def test_upload_and_list_document(client_and_db) -> None:
    client, engine = client_and_db
    response = client.post(
        "/documents",
        files={"file": ("report.pdf", make_pdf(), "application/pdf")},
    )

    assert response.status_code == 201
    result = response.json()
    assert result["filename"] == "report.pdf"
    assert result["status"] == "processed"
    assert result["page_count"] == 1
    with Session(engine) as session:
        chunks = list(session.scalars(select(DocumentChunk)))
        assert len(chunks) == 1
        assert chunks[0].page_number == 1
        assert "42 million" in chunks[0].text
        assert chunks[0].embedding[0] == 1.0

    listed = client.get("/documents")
    assert listed.status_code == 200
    assert len(listed.json()) == 1


def test_duplicate_upload_returns_conflict(client_and_db) -> None:
    client, _engine = client_and_db
    payload = make_pdf()
    first = client.post("/documents", files={"file": ("report.pdf", payload, "application/pdf")})
    second = client.post("/documents", files={"file": ("copy.pdf", payload, "application/pdf")})

    assert first.status_code == 201
    assert second.status_code == 409
    assert second.json()["detail"]["document_id"] == first.json()["id"]


def test_failed_provider_upload_can_be_retried(client_and_db) -> None:
    client, _engine = client_and_db
    from app.ai.providers import ProviderNotConfigured

    class MissingProvider:
        async def embed(self, _texts: list[str]) -> list[list[float]]:
            raise ProviderNotConfigured("not configured")

    payload = make_pdf()
    app.dependency_overrides[get_embedding_provider] = MissingProvider
    failed = client.post("/documents", files={"file": ("report.pdf", payload, "application/pdf")})
    app.dependency_overrides[get_embedding_provider] = FakeEmbeddingProvider
    retried = client.post("/documents", files={"file": ("report.pdf", payload, "application/pdf")})

    assert failed.status_code == 503
    assert retried.status_code == 201
    assert retried.json()["status"] == "processed"
    assert retried.json()["id"] == failed.json()["detail"]["document_id"]



def test_rejects_non_pdf_upload(client_and_db) -> None:
    client, _engine = client_and_db
    response = client.post(
        "/documents", files={"file": ("note.txt", b"plain text", "text/plain")}
    )

    assert response.status_code == 415


def test_deleting_document_cleans_up_chunks(client_and_db) -> None:
    client, engine = client_and_db
    created = client.post(
        "/documents",
        files={"file": ("report.pdf", make_pdf(), "application/pdf")},
    ).json()

    deleted = client.delete(f"/documents/{created['id']}")

    assert deleted.status_code == 204
    with Session(engine) as session:
        assert session.get(Document, UUID(created["id"])) is None
        assert list(session.scalars(select(DocumentChunk))) == []
