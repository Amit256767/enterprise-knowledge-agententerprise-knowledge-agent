from uuid import uuid4

import pytest

from app.retrieval.answer import (
    AnswerDraft,
    CitationDraft,
    CitationValidationError,
    validate_answer_draft,
)
from app.retrieval.vector_search import Evidence


@pytest.fixture
def evidence() -> list[Evidence]:
    return [
        Evidence(
            chunk_id=uuid4(),
            document_id=uuid4(),
            document_name="policy.pdf",
            page_number=4,
            passage="The retention period is seven years for financial records.",
            similarity=0.82,
        ),
        Evidence(
            chunk_id=uuid4(),
            document_id=uuid4(),
            document_name="policy-update.pdf",
            page_number=2,
            passage="The retention period is five years for financial records.",
            similarity=0.79,
        ),
    ]


def test_verified_citation_has_actual_document_and_page(evidence) -> None:
    draft = AnswerDraft(
        answer="The documents state different retention periods.",
        abstained=False,
        conflicting_evidence=True,
        citations=[
            CitationDraft(chunk_id=evidence[0].chunk_id, quote="seven years for financial records"),
            CitationDraft(chunk_id=evidence[1].chunk_id, quote="five years for financial records"),
        ],
    )

    answer = validate_answer_draft(draft, evidence)

    assert answer.conflicting_evidence is True
    assert [(item.document_name, item.page_number) for item in answer.citations] == [
        ("policy.pdf", 4),
        ("policy-update.pdf", 2),
    ]


def test_forged_chunk_or_quote_is_rejected(evidence) -> None:
    wrong_chunk = AnswerDraft(
        answer="The period is seven years.",
        abstained=False,
        conflicting_evidence=False,
        citations=[CitationDraft(chunk_id=uuid4(), quote="seven years for financial records")],
    )
    wrong_quote = AnswerDraft(
        answer="The period is ten years.",
        abstained=False,
        conflicting_evidence=False,
        citations=[CitationDraft(chunk_id=evidence[0].chunk_id, quote="ten years for financial records")],
    )

    with pytest.raises(CitationValidationError):
        validate_answer_draft(wrong_chunk, evidence)
    with pytest.raises(CitationValidationError):
        validate_answer_draft(wrong_quote, evidence)


def test_abstention_has_no_citations(evidence) -> None:
    draft = AnswerDraft(
        answer="The evidence is insufficient.",
        abstained=True,
        conflicting_evidence=False,
        citations=[CitationDraft(chunk_id=evidence[0].chunk_id, quote="The retention period")],
    )

    response = validate_answer_draft(draft, evidence)

    assert response.abstained is True
    assert response.citations == []
