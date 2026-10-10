from dataclasses import dataclass

import fitz


class PDFProcessingError(ValueError):
    """Raised when a PDF cannot produce usable page text."""


@dataclass(frozen=True)
class PageText:
    page_number: int
    text: str


@dataclass(frozen=True)
class TextChunk:
    page_number: int
    chunk_index: int
    text: str


def extract_pages(data: bytes) -> list[PageText]:
    try:
        with fitz.open(stream=data, filetype="pdf") as pdf:
            if pdf.is_encrypted:
                raise PDFProcessingError("Encrypted PDFs are not supported")
            pages = [
                PageText(page_number=index + 1, text=page.get_text("text").strip())
                for index, page in enumerate(pdf)
            ]
    except PDFProcessingError:
        raise
    except Exception as exc:
        raise PDFProcessingError("Could not read PDF") from exc

    if not any(page.text for page in pages):
        raise PDFProcessingError("PDF contains no extractable text")
    return pages


def split_pages(pages: list[PageText], chunk_size: int, overlap: int) -> list[TextChunk]:
    if chunk_size < 1:
        raise ValueError("chunk_size must be positive")
    if overlap < 0 or overlap >= chunk_size:
        raise ValueError("overlap must be non-negative and smaller than chunk_size")

    chunks: list[TextChunk] = []
    step = chunk_size - overlap
    for page in pages:
        start = 0
        while start < len(page.text):
            text = page.text[start : start + chunk_size].strip()
            if text:
                chunks.append(TextChunk(page.page_number, len(chunks), text))
            if start + chunk_size >= len(page.text):
                break
            start += step
    return chunks

