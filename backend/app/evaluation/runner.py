"""Run the checked-in evaluation questions against the local chat API."""

import json
from pathlib import Path

import httpx

from app.evaluation.metrics import aggregate_scores, score_prediction

PROJECT_ROOT = Path(__file__).resolve().parents[3]
DATASET_PATH = PROJECT_ROOT / "evaluation" / "questions.jsonl"
API_URL = "http://127.0.0.1:8000"


def main() -> None:
    cases = [json.loads(line) for line in DATASET_PATH.read_text(encoding="utf-8").splitlines()]
    predictions = []
    with httpx.Client(timeout=180) as client:
        for case in cases:
            response = client.post(f"{API_URL}/chat", json={"question": case["question"]})
            if not response.is_success:
                raise RuntimeError(f"Evaluation request {case['id']} failed (HTTP {response.status_code})")
            prediction = response.json()
            predictions.append(prediction)
            print(f"Completed: {case['id']}")

    scores = [
        score_prediction(case, prediction)
        for case, prediction in zip(cases, predictions, strict=True)
    ]
    print(json.dumps(aggregate_scores(scores, predictions), indent=2))


if __name__ == "__main__":
    main()
