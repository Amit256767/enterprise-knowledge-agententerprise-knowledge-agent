from collections.abc import Iterable
from typing import Any


def _source_key(source: dict[str, Any]) -> tuple[str, int]:
    return source["document_name"], int(source["page_number"])


def score_prediction(case: dict[str, Any], prediction: dict[str, Any]) -> dict[str, float | int | None]:
    expected = {_source_key(source): source for source in case["expected_evidence"]}
    retrieved = {_source_key(source) for source in prediction.get("retrieved_sources", [])}
    citations = prediction.get("citations", [])
    matching_citations = 0
    for citation in citations:
        reference = expected.get(_source_key(citation))
        quote = citation.get("passage", "").casefold()
        if reference and all(term.casefold() in quote for term in reference["citation_terms"]):
            matching_citations += 1

    expected_terms = case.get("answer_terms", [])
    answer = prediction.get("answer", "").casefold()
    cited_expected = {
        _source_key(citation)
        for citation in citations
        if _source_key(citation) in expected
    }
    return {
        "retrieval_recall": len(retrieved & expected.keys()) / len(expected) if expected else None,
        "answer_correct": int(all(term.casefold() in answer for term in expected_terms)) if expected_terms else None,
        "citation_precision": matching_citations / len(citations) if citations else (1.0 if not expected else 0.0),
        "citation_recall": len(cited_expected) / len(expected) if expected else None,
        "abstention_correct": int(bool(prediction.get("abstained")) == case["expected_abstain"]),
        "conflict_correct": int(bool(prediction.get("conflicting_evidence")) == case["expected_conflict"]),
        "unsupported_no_retrieval": (
            int(not retrieved) if case["expected_abstain"] else None
        ),
    }


def mean(values: Iterable[float | int]) -> float | None:
    values = list(values)
    return sum(values) / len(values) if values else None


def aggregate_scores(
    scores: list[dict[str, float | int | None]], predictions: list[dict[str, Any]]
) -> dict[str, Any]:
    result: dict[str, Any] = {"questions": len(scores)}
    for metric in (
        "retrieval_recall",
        "answer_correct",
        "citation_precision",
        "citation_recall",
        "abstention_correct",
        "conflict_correct",
        "unsupported_no_retrieval",
    ):
        values = [score[metric] for score in scores if score[metric] is not None]
        result[metric] = mean(values)

    latencies = [
        prediction.get("metrics", {}).get("latency_ms")
        for prediction in predictions
        if prediction.get("metrics", {}).get("latency_ms") is not None
    ]
    result["mean_latency_ms"] = mean(latencies)
    known_token_metrics = [
        prediction["metrics"]
        for prediction in predictions
        if prediction.get("metrics", {}).get("prompt_tokens") is not None
        and prediction.get("metrics", {}).get("completion_tokens") is not None
    ]
    result["prompt_tokens"] = (
        sum(item["prompt_tokens"] for item in known_token_metrics) if known_token_metrics else None
    )
    result["completion_tokens"] = (
        sum(item["completion_tokens"] for item in known_token_metrics) if known_token_metrics else None
    )
    known_costs = [
        prediction["metrics"]["estimated_llm_cost_usd"]
        for prediction in predictions
        if prediction.get("metrics", {}).get("estimated_llm_cost_usd") is not None
    ]
    result["estimated_llm_cost_usd"] = round(sum(known_costs), 8) if known_costs else None
    return result
