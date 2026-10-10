import hashlib
from uuid import UUID

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status
from pydantic import BaseModel, ConfigDict
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.ai.providers import (
    EmbeddingProvider,
    ProviderError,
    ProviderNotConfigured,
    embed_in_batches,
    get_embedding_provider,
)
from app.core.config import get_settings
from app.db.models import Document, DocumentChunk
from app.db.session import SessionLocal
from app.ingestion.pdf import PDFProcessingError, extract_pages, split_pages

router = APIRouter(prefix="/documents", tags=["documents"])
PDF_SIGNATURE = b"%PDF-"


class DocumentResponse(BaseModel):
    id: UUID
    filename: str
    size_bytes: int
    status: str
    page_count: int
    error_message: str | None

    model_config = ConfigDict(from_attributes=True)


def get_db():
    with SessionLocal() as session:
        yield session


async def read_limited(file: UploadFile, limit: int) -> bytes:
    data = bytearray()
    while part := await file.read(min(1024 * 1024, limit + 1 - len(data))):
        data.extend(part)
        if len(data) > limit:
            raise HTTPException(status_code=413, detail="PDF exceeds the upload size limit")
    return bytes(data)


@router.post("", response_model=DocumentResponse, status_code=status.HTTP_201_CREATED)
async def upload_document(
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    embedding_provider: EmbeddingProvider = Depends(get_embedding_provider),
) -> Document:
    settings = get_settings()
    if file.content_type != "application/pdf":
        raise HTTPException(status_code=415, detail="Only application/pdf uploads are accepted")
    if not file.filename or len(file.filename) > 255:
        raise HTTPException(status_code=400, detail="Filename is missing or too long")

    try:
        data = await read_limited(file, settings.max_upload_bytes)
    finally:
        await file.close()

    if not data or not data.startswith(PDF_SIGNATURE):
        raise HTTPException(status_code=400, detail="Upload does not have a valid PDF signature")

    digest = hashlib.sha256(data).hexdigest()
    existing = db.scalar(select(Document).where(Document.content_sha256 == digest))
    if existing and existing.status != "failed":
        raise HTTPException(
            status_code=409,
            detail={"message": "This PDF has already been uploaded", "document_id": str(existing.id)},
        )

    if existing:
        document = existing
        document.status = "processing"
        document.error_message = None
        db.commit()
    else:
        document = Document(
            filename=file.filename,
            content_sha256=digest,
            size_bytes=len(data),
            status="processing",
        )
    db.add(document)
    try:
        db.flush()
        pages = extract_pages(data)
        chunks = split_pages(pages, settings.chunk_size_chars, settings.chunk_overlap_chars)
        vectors = await embed_in_batches(
            embedding_provider,
            [chunk.text for chunk in chunks],
            settings.embedding_batch_size,
        )
        document.page_count = len(pages)
        document.chunks = [
            DocumentChunk(
                page_number=chunk.page_number,
                chunk_index=chunk.chunk_index,
                text=chunk.text,
                embedding=vector,
            )
            for chunk, vector in zip(chunks, vectors, strict=True)
        ]
        document.status = "processed"
        db.commit()
        db.refresh(document)
        return document
    except (PDFProcessingError, ProviderError) as exc:
        db.rollback()
        failed = db.scalar(select(Document).where(Document.content_sha256 == digest))
        if failed is None:
            failed = Document(
                filename=file.filename,
                content_sha256=digest,
                size_bytes=len(data),
            )
        failed.status = "failed"
        failed.error_message = str(exc)
        db.add(failed)
        try:
            db.commit()
        except IntegrityError:
            db.rollback()
            raise HTTPException(status_code=409, detail="This PDF has already been uploaded") from exc
        error_status = 422 if isinstance(exc, PDFProcessingError) else (
            503 if isinstance(exc, ProviderNotConfigured) else 502
        )
        raise HTTPException(
            status_code=error_status,
            detail={"document_id": str(failed.id), "message": str(exc)},
        ) from exc
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(status_code=409, detail="This PDF has already been uploaded") from exc


@router.get("", response_model=list[DocumentResponse])
def list_documents(db: Session = Depends(get_db)) -> list[Document]:
    return list(db.scalars(select(Document).order_by(Document.created_at.desc())))


@router.get("/{document_id}", response_model=DocumentResponse)
def get_document(document_id: UUID, db: Session = Depends(get_db)) -> Document:
    document = db.get(Document, document_id)
    if document is None:
        raise HTTPException(status_code=404, detail="Document not found")
    return document


@router.delete("/{document_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_document(document_id: UUID, db: Session = Depends(get_db)) -> None:
    document = db.get(Document, document_id)
    if document is None:
        raise HTTPException(status_code=404, detail="Document not found")
    db.delete(document)
    db.commit()

