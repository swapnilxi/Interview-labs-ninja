from __future__ import annotations

import io
import os
import re
import time
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, List

from fastapi import APIRouter, File, HTTPException, UploadFile
from pypdf import PdfReader

from .db import (
    delete_pdf_document,
    get_all_pdf_documents,
    get_pdf_document_by_id,
    save_pdf_document,
)

router = APIRouter(prefix="/api/pdf", tags=["Swipe PDF Reader"])

MAX_PDF_BYTES = int(os.environ.get("LABNINJA_MAX_PDF_MB", "25")) * 1024 * 1024

UPLOAD_DIR = Path(__file__).resolve().parent.parent.parent / "data" / "pdf_uploads"


def _ensure_upload_dir() -> Path:
    env_dir = os.environ.get("LABNINJA_PDF_UPLOAD_DIR")
    if env_dir:
        p = Path(env_dir)
        p.mkdir(parents=True, exist_ok=True)
        return p
    if os.environ.get("VERCEL") or os.environ.get("AWS_LAMBDA_FUNCTION_NAME"):
        p = Path("/tmp/pdf_uploads")
        p.mkdir(parents=True, exist_ok=True)
        return p
    try:
        UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
        return UPLOAD_DIR
    except (OSError, PermissionError):
        p = Path("/tmp/pdf_uploads")
        p.mkdir(parents=True, exist_ok=True)
        return p


def _chunk_text_pages(doc_id: str, doc_name: str, pages_text: List[str]) -> List[Dict[str, Any]]:
    """Chunk extracted page text into formatted swipe cards (~350 words or paragraph boundaries)."""
    chunks: List[Dict[str, Any]] = []
    chunk_index = 0

    for page_idx, page_raw in enumerate(pages_text, start=1):
        lines = page_raw.splitlines()
        current_paras: List[str] = []
        word_count = 0

        for line in lines:
            trimmed = line.strip()
            if not trimmed:
                if current_paras:
                    current_paras.append("")
                continue

            words_in_line = len(trimmed.split())

            if word_count > 0 and (word_count + words_in_line > 350):
                content = "\n".join(current_paras).strip()
                if content:
                    first_line = content.splitlines()[0][:60]
                    title = first_line if first_line else f"Page {page_idx} — Part {len(chunks) + 1}"
                    chunks.append({
                        "id": f"{doc_id}-chunk-{chunk_index}",
                        "documentId": doc_id,
                        "documentTitle": doc_name,
                        "chunkIndex": chunk_index,
                        "pageNumber": page_idx,
                        "title": title,
                        "content": content,
                        "text": content,
                    })
                    chunk_index += 1
                current_paras = [trimmed]
                word_count = words_in_line
            else:
                current_paras.append(trimmed)
                word_count += words_in_line

        if current_paras:
            content = "\n".join(current_paras).strip()
            if content:
                first_line = content.splitlines()[0][:60]
                title = first_line if first_line else f"Page {page_idx}"
                chunks.append({
                    "id": f"{doc_id}-chunk-{chunk_index}",
                    "documentId": doc_id,
                    "documentTitle": doc_name,
                    "chunkIndex": chunk_index,
                    "pageNumber": page_idx,
                    "title": title,
                    "content": content,
                    "text": content,
                })
                chunk_index += 1

    # Fallback if no text extracted
    if not chunks:
        chunks.append({
            "id": f"{doc_id}-chunk-0",
            "documentId": doc_id,
            "documentTitle": doc_name,
            "chunkIndex": 0,
            "pageNumber": 1,
            "title": doc_name,
            "content": "No readable text content found in this document.",
            "text": "No readable text content found in this document.",
        })

    for c in chunks:
        c["totalChunks"] = len(chunks)

    return chunks


@router.post("/upload")
async def upload_pdf(file: UploadFile = File(...)) -> Dict[str, Any]:
    """Upload a PDF to cloud storage, extract text server-side, and save to SQLite."""
    if not file.filename or not file.filename.lower().endswith(".pdf"):
        raise HTTPException(status_code=400, detail="Only .pdf files are supported.")

    # Read at most MAX+1 bytes so an oversized upload is rejected without buffering it all.
    file_bytes = await file.read(MAX_PDF_BYTES + 1)
    if not file_bytes:
        raise HTTPException(status_code=400, detail="Uploaded file is empty.")
    if len(file_bytes) > MAX_PDF_BYTES:
        raise HTTPException(status_code=413, detail=f"PDF is too large (max {MAX_PDF_BYTES // (1024 * 1024)} MB).")
    # Check the magic bytes, not just the extension.
    if not file_bytes[:1024].lstrip().startswith(b"%PDF-"):
        raise HTTPException(status_code=400, detail="File is not a valid PDF.")

    # Save to disk
    target_dir = _ensure_upload_dir()
    timestamp = int(time.time())
    # Never trust the client filename: strip any path and keep only safe characters
    # (a name like "../../x.pdf" must not escape the upload dir).
    base = re.sub(r"[^A-Za-z0-9._-]", "_", os.path.basename(file.filename.replace("\\", "/")))[:100]
    safe_filename = f"{timestamp}_{base}"
    saved_path = target_dir / safe_filename
    if saved_path.resolve().parent != target_dir.resolve():
        raise HTTPException(status_code=400, detail="Invalid file name.")
    saved_path.write_bytes(file_bytes)

    # Extract text with pypdf
    try:
        reader = PdfReader(io.BytesIO(file_bytes))
        pages_text = [page.extract_text() or "" for page in reader.pages]
        total_pages = len(pages_text)
    except Exception as exc:
        raise HTTPException(
            status_code=422,
            detail=f"Could not read PDF ({type(exc).__name__}): {exc}",
        )

    doc_id = f"cloud-pdf-{timestamp}"
    full_text = "\n\n".join(pages_text)
    chunks = _chunk_text_pages(doc_id, file.filename, pages_text)

    now_iso = datetime.utcnow().isoformat() + "Z"
    doc_dict = {
        "id": doc_id,
        "name": file.filename,
        "file_path": str(saved_path),
        "totalPages": total_pages,
        "totalChunks": len(chunks),
        "extractedText": full_text,
        "createdAt": now_iso,
        "updatedAt": now_iso,
    }

    save_pdf_document(doc_dict, chunks)

    ret = get_pdf_document_by_id(doc_id)
    if not ret:
        raise HTTPException(status_code=500, detail="Failed to save cloud document.")
    return ret


@router.get("/documents")
async def list_cloud_documents() -> List[Dict[str, Any]]:
    """List all cloud-stored PDF documents."""
    return get_all_pdf_documents()


@router.get("/documents/{doc_id}")
async def get_cloud_document(doc_id: str) -> Dict[str, Any]:
    """Get complete cloud document details and chunks."""
    doc = get_pdf_document_by_id(doc_id)
    if not doc:
        raise HTTPException(status_code=404, detail="Cloud document not found.")
    return doc


@router.delete("/documents/{doc_id}")
async def delete_cloud_doc(doc_id: str) -> Dict[str, str]:
    """Delete cloud document from database and disk storage."""
    file_path = delete_pdf_document(doc_id)
    if file_path and os.path.exists(file_path):
        try:
            os.remove(file_path)
        except OSError:
            pass
    return {"status": "deleted", "id": doc_id}
