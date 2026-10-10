import fitz
import pytest

from app.ingestion.pdf import PDFProcessingError, PageText, extract_pages, split_pages


def make_pdf(*page_texts: str) -> bytes:
    document = fitz.open()
    for text in page_texts:
        page = document.new_page()
        page.insert_text((72, 72), text)
    data = document.tobytes()
    document.close()
    return data


def test_extract_pages_preserves_one_based_page_numbers() -> None:
    pages = extract_pages(make_pdf("First page", "Second page"))

    assert [(page.page_number, page.text) for page in pages] == [
        (1, "First page"),
        (2, "Second page"),
    ]


def test_extract_pages_keeps_page_numbers_across_blank_pages() -> None:
    pages = extract_pages(make_pdf("First page", "", "Third page"))

    assert [page.page_number for page in pages] == [1, 2, 3]
    assert pages[1].text == ""


def test_extract_pages_rejects_non_pdf_and_scanned_empty_pdf() -> None:
    with pytest.raises(PDFProcessingError):
        extract_pages(b"not a pdf")
    with pytest.raises(PDFProcessingError, match="no extractable text"):
        extract_pages(make_pdf(""))


def test_split_pages_keeps_chunks_within_page_and_overlaps() -> None:
    chunks = split_pages([PageText(3, "abcdefghij"), PageText(4, "klmnop")], 6, 2)

    assert [(chunk.page_number, chunk.text) for chunk in chunks] == [
        (3, "abcdef"),
        (3, "efghij"),
        (4, "klmnop"),
    ]
    assert [chunk.chunk_index for chunk in chunks] == [0, 1, 2]
