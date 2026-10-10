from app.evaluation.metrics import aggregate_scores, score_prediction


def test_evaluation_scores_retrieval_answer_citations_and_abstention() -> None:
    case = {
        "expected_evidence": [
            {"document_name": "travel.pdf", "page_number": 2, "citation_terms": ["$75", "per day"]}
        ],
        "answer_terms": ["75", "per day"],
        "expected_abstain": False,
        "expected_conflict": False,
    }
    prediction = {
        "answer": "The allowance is $75 per day.",
        "abstained": False,
        "conflicting_evidence": False,
        "retrieved_sources": [{"document_name": "travel.pdf", "page_number": 2}],
        "citations": [{
            "document_name": "travel.pdf",
            "page_number": 2,
            "passage": "Employees may expense meals up to $75 per day.",
        }],
        "metrics": {"latency_ms": 120, "prompt_tokens": 100, "completion_tokens": 20},
    }

    score = score_prediction(case, prediction)
    aggregate = aggregate_scores([score], [prediction])

    assert score == {
        "retrieval_recall": 1.0,
        "answer_correct": 1,
        "citation_precision": 1.0,
        "citation_recall": 1.0,
        "abstention_correct": 1,
        "conflict_correct": 1,
        "unsupported_no_retrieval": None,
    }
    assert aggregate["mean_latency_ms"] == 120
    assert aggregate["prompt_tokens"] == 100
