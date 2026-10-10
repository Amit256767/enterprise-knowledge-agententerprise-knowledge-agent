from uuid import uuid4

from sqlalchemy.dialects import postgresql

from app.retrieval import vector_search
from app.retrieval.vector_search import Evidence


def make_evidence(name: str) -> Evidence:
    return Evidence(uuid4(), uuid4(), name, 1, f"Passage from {name}", 0.8)


def test_hybrid_rank_fusion_promotes_shared_results(monkeypatch) -> None:
    first, shared, keyword_only = (make_evidence(name) for name in ("first", "shared", "keyword"))
    monkeypatch.setattr(vector_search, "retrieve_evidence", lambda _db, _vector: [first, shared])
    monkeypatch.setattr(
        vector_search,
        "retrieve_keyword_evidence",
        lambda _db, _query: [shared, keyword_only],
    )

    results = vector_search.retrieve_hybrid_evidence(object(), "query", [0.0])

    assert results[0].chunk_id == shared.chunk_id
    assert len({result.chunk_id for result in results}) == 3


def test_keyword_search_uses_postgres_full_text_query(monkeypatch) -> None:
    captured = {}

    class Result:
        def all(self):
            return []

    class FakeSession:
        def execute(self, statement):
            captured["statement"] = statement
            return Result()

    assert vector_search.retrieve_keyword_evidence(FakeSession(), "policy retention") == []
    sql = str(captured["statement"].compile(dialect=postgresql.dialect()))
    assert "websearch_to_tsquery" in sql
    assert "@@" in sql
    assert "to_tsvector('english'" in sql
