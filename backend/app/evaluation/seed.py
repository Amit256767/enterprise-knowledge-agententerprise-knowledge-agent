"""Upload the small reference corpus used by the repeatable RAG evaluation."""

import json
from pathlib import Path

import fitz
import httpx

PROJECT_ROOT = Path(__file__).resolve().parents[3]
CORPUS_PATH = PROJECT_ROOT / "evaluation" / "reference_corpus.jsonl"
API_URL = "http://127.0.0.1:8000"


def make_pdf(page_number: int, passage: str) -> bytes:
    document = fitz.open()
    for index in range(page_number):
        page = document.new_page()
        if index == page_number - 1:
            page.insert_textbox(fitz.Rect(54, 54, 550, 760), passage, fontsize=12)
    content = document.tobytes()
    document.close()
    return content


def main() -> None:
    with httpx.Client(timeout=120) as client:
        existing_response = client.get(f"{API_URL}/documents")
        if not existing_response.is_success:
            raise RuntimeError(f"Could not list existing documents (HTTP {existing_response.status_code})")
        existing_names = {
            item["filename"]
            for item in existing_response.json()
            if item["status"] == "processed"
        }
        for line in CORPUS_PATH.read_text(encoding="utf-8").splitlines():
            item = json.loads(line)
            if item["document_name"] in existing_names:
                print(f"Already present: {item['document_name']}")
                continue
            pdf = make_pdf(item["page_number"], item["passage"])
            response = client.post(
                f"{API_URL}/documents",
                files={"file": (item["document_name"], pdf, "application/pdf")},
            )
            if response.status_code == 409:
                print(f"Already present: {item['document_name']}")
            elif response.is_success:
                print(f"Uploaded: {item['document_name']}")
            else:
                raise RuntimeError(
                    f"Upload failed for {item['document_name']} (HTTP {response.status_code})"
                )


if __name__ == "__main__":
    main()
