"""Shared RAG (retrieval-augmented generation) pipeline: chunk text, embed the
chunks, store them, and later retrieve the ones most relevant to a query --
generic over WHO is indexing WHAT, so any module can use it, not just the one
that happened to need it first (originally built for modules.ai_lms's Project/
Subject context; see modules/ai_lms/router.py's thin wrapper endpoints for the
pattern any other module can follow).

Import from this package (`from modules.common.rag import ...`), not from
`storage` directly, the same convention modules.common.ai/voice already use.

Usage (any module, any owner_id scheme of its own choosing):

    from modules.common.rag import index_document, retrieve, clear_index

    index_document("career_studio_resume", resume_id, [("", resume_text)], ai_settings)
    chunks = retrieve("career_studio_resume", resume_id, "years of Python experience", ai_settings)
    clear_index("career_studio_resume", resume_id)

`namespace` is a short, stable string identifying the CALLER + entity type
(e.g. "ai_lms_subject", "career_studio_resume") -- it exists purely so two
different modules' rows never collide in the shared rag_chunks table; it is
never interpreted or validated beyond that. `owner_id` is whatever id the
caller already uses for that entity (a subject id, a resume id, ...).

Storage is a single shared SQLite table (modules.common.rag.storage), queried
with brute-force cosine similarity at retrieval time -- no vector-index
extension or external service, since realistic corpus sizes here (a project's
own documents, a resume, a lesson's source material) are tens to low hundreds
of chunks, not millions. Embeddings come from modules.common.ai.embed_texts,
which already picks whichever embedding-capable provider (OpenAI, Gemini, or a
local Ollama) the caller has configured -- this package has no provider logic
of its own.
"""

from __future__ import annotations

from typing import Any, Dict, List, Tuple

from modules.common.ai import AISettings, NoEmbeddingProviderError, embed_texts

from . import storage

__all__ = [
    "chunk_text",
    "cosine_similarity",
    "index_document",
    "retrieve",
    "clear_index",
    "index_status",
    "NoEmbeddingProviderError",
]

DEFAULT_CHUNK_SIZE = 2000
DEFAULT_TOP_K = 5


def chunk_text(text: str, chunk_size: int = DEFAULT_CHUNK_SIZE) -> List[str]:
    """Split one document's text into small, individually-retrievable chunks,
    splitting on paragraph boundaries (`\\n\\n`) and accumulating until a chunk
    would exceed `chunk_size`. Generic/plain -- callers with their own natural
    sub-document boundaries (e.g. ai_lms's multi-file uploads) should pre-split
    into sections and pass each through `index_document`'s `sections` list
    instead of relying on this alone to find those boundaries."""
    paragraphs = [p.strip() for p in text.split("\n\n") if p.strip()]
    chunks: List[str] = []
    current = ""
    for para in paragraphs:
        candidate = f"{current}\n\n{para}" if current else para
        if len(candidate) > chunk_size and current:
            chunks.append(current)
            current = para
        else:
            current = candidate
    if current:
        chunks.append(current)
    return chunks


def cosine_similarity(a: List[float], b: List[float]) -> float:
    """Plain-Python cosine similarity -- no numpy dependency, fine at the corpus
    sizes this package is meant for (see module docstring)."""
    if not a or not b or len(a) != len(b):
        return 0.0
    dot = sum(x * y for x, y in zip(a, b))
    norm_a = sum(x * x for x in a) ** 0.5
    norm_b = sum(y * y for y in b) ** 0.5
    if norm_a == 0 or norm_b == 0:
        return 0.0
    return dot / (norm_a * norm_b)


def index_document(
    namespace: str,
    owner_id: str,
    sections: List[Tuple[str, str]],
    settings: AISettings,
    chunk_size: int = DEFAULT_CHUNK_SIZE,
) -> int:
    """Chunk + embed + store one owner's document(s), replacing any previous index
    for (namespace, owner_id). `sections` is a list of (source_label, text) pairs
    -- pass a single `[("", full_text)]` for a plain document, or one entry per
    sub-document (e.g. per uploaded file) when the caller already knows those
    boundaries, so a chunk never straddles two unrelated sources.

    Returns the number of chunks indexed. Raises NoEmbeddingProviderError (from
    modules.common.ai) if no embedding-capable provider is configured/reachable --
    callers should turn that into a clear, actionable message rather than a bare
    500, since RAG is meant to be an optional enhancement, not a hard dependency.
    """
    chunk_specs: List[Dict[str, Any]] = []
    for source_label, text in sections:
        for content in chunk_text(text, chunk_size):
            chunk_specs.append({"content": content, "source_label": source_label})

    if not chunk_specs:
        storage.delete_chunks(namespace, owner_id)
        return 0

    vectors = embed_texts([c["content"] for c in chunk_specs], settings)
    chunks = [{**spec, "embedding": vec} for spec, vec in zip(chunk_specs, vectors)]
    storage.save_chunks(namespace, owner_id, chunks)
    return len(chunks)


def retrieve(
    namespace: str,
    owner_id: str,
    query_text: str,
    settings: AISettings,
    top_k: int = DEFAULT_TOP_K,
) -> List[Dict[str, Any]]:
    """Embed `query_text` and return the top-k most similar indexed chunks for
    (namespace, owner_id), by brute-force cosine similarity, each as
    {"content", "source_label", "score"}. Returns [] (never raises) if nothing is
    indexed or embedding the query fails -- retrieval is meant to degrade
    gracefully into "no extra context", not break whatever generation call is
    using it."""
    chunks = storage.get_chunks(namespace, owner_id)
    if not chunks:
        return []
    try:
        query_vec = embed_texts([query_text], settings)[0]
    except Exception:
        return []
    scored = [(cosine_similarity(query_vec, c["embedding"]), c) for c in chunks]
    scored.sort(key=lambda pair: pair[0], reverse=True)
    return [
        {"content": c["content"], "source_label": c["source_label"], "score": score}
        for score, c in scored[:top_k]
    ]


def clear_index(namespace: str, owner_id: str) -> int:
    """Drop the index for (namespace, owner_id). Returns the number of chunks removed."""
    return storage.delete_chunks(namespace, owner_id)


def index_status(namespace: str, owner_id: str) -> int:
    """Chunk count for (namespace, owner_id) -- 0 if never indexed."""
    return storage.count_chunks(namespace, owner_id)
