/**
 * fe-apis/rag/index.ts
 *
 * Shared RAG (retrieval-augmented generation) pipeline: chunk text, embed the
 * chunks, store them, and later retrieve the ones most relevant to a query --
 * generic over WHO is indexing WHAT, so any fe-api module can use it, not just
 * the one that happened to need it first (originally built for fe-apis/lms's
 * Project/Subject context; see fe-apis/lms/index.ts's thin wrapper handlers for
 * the pattern any other module can follow).
 *
 * Import from this package (`from 'fe-apis/rag'`), not from `storage` directly,
 * the same convention fe-apis/ai and fe-apis/voice already use.
 *
 * Usage (any module, any ownerId scheme of its own choosing):
 *
 *   import { indexDocument, retrieve, clearIndex } from 'fe-apis/rag';
 *
 *   await indexDocument('career_studio_resume', resumeId, [{ sourceLabel: '', text: resumeText }], settings);
 *   const chunks = await retrieve('career_studio_resume', resumeId, 'years of Python experience', settings);
 *   clearIndex('career_studio_resume', resumeId);
 *
 * `namespace` is a short, stable string identifying the CALLER + entity type
 * (e.g. "ai_lms_subject", "career_studio_resume") -- it exists purely so two
 * different modules' rows never collide in the shared rag_chunks table; it is
 * never interpreted or validated beyond that. `ownerId` is whatever id the
 * caller already uses for that entity.
 *
 * Storage is a single shared SQLite table (fe-apis/rag/storage.ts), queried with
 * brute-force cosine similarity at retrieval time -- no vector-index extension or
 * external service, since realistic corpus sizes here (a project's own documents,
 * a resume, a lesson's source material) are tens to low hundreds of chunks, not
 * millions. Embeddings come from fe-apis/ai's embedTexts, which already picks
 * whichever embedding-capable provider (OpenAI, Gemini, or a local Ollama) the
 * caller has configured -- this package has no provider logic of its own.
 *
 * Mirrors backend/modules/common/rag/__init__.py.
 */

import { embedTexts, type AISettingsPayload } from '../ai';
import * as storage from './storage';

export { NoEmbeddingProviderError } from '../ai';

export const DEFAULT_CHUNK_SIZE = 2000;
export const DEFAULT_TOP_K = 5;

export interface RagSection {
  sourceLabel: string;
  text: string;
}

export interface RetrievedChunk {
  content: string;
  sourceLabel: string;
  score: number;
}

/** Split one document's text into small, individually-retrievable chunks,
 * splitting on paragraph boundaries (`\n\n`) and accumulating until a chunk would
 * exceed `chunkSize`. Generic/plain -- callers with their own natural
 * sub-document boundaries (e.g. ai_lms's multi-file uploads) should pre-split
 * into sections and pass each through indexDocument's `sections` list instead of
 * relying on this alone to find those boundaries. */
export function chunkText(text: string, chunkSize: number = DEFAULT_CHUNK_SIZE): string[] {
  const paragraphs = text
    .split('\n\n')
    .map((p) => p.trim())
    .filter(Boolean);
  const chunks: string[] = [];
  let current = '';
  for (const para of paragraphs) {
    const candidate = current ? `${current}\n\n${para}` : para;
    if (candidate.length > chunkSize && current) {
      chunks.push(current);
      current = para;
    } else {
      current = candidate;
    }
  }
  if (current) chunks.push(current);
  return chunks;
}

/** Plain cosine similarity -- no dependency, fine at the corpus sizes this
 * package is meant for (see module docstring). */
export function cosineSimilarity(a: number[], b: number[]): number {
  if (!a.length || !b.length || a.length !== b.length) return 0;
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  if (normA === 0 || normB === 0) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

/** Chunk + embed + store one owner's document(s), replacing any previous index
 * for (namespace, ownerId). `sections` lets the caller pre-split on its own known
 * sub-document boundaries (e.g. one per uploaded file) so a chunk never straddles
 * two unrelated sources -- pass a single `[{ sourceLabel: '', text: fullText }]`
 * for a plain document.
 *
 * Returns the number of chunks indexed. Throws NoEmbeddingProviderError (from
 * fe-apis/ai) if no embedding-capable provider is configured/reachable --
 * callers should turn that into a clear, actionable message rather than a bare
 * 500, since RAG is meant to be an optional enhancement, not a hard dependency. */
export async function indexDocument(
  namespace: string,
  ownerId: string,
  sections: RagSection[],
  settings: AISettingsPayload,
  chunkSize: number = DEFAULT_CHUNK_SIZE
): Promise<number> {
  const chunkSpecs: { content: string; source_label: string }[] = [];
  for (const { sourceLabel, text } of sections) {
    for (const content of chunkText(text, chunkSize)) {
      chunkSpecs.push({ content, source_label: sourceLabel });
    }
  }

  if (chunkSpecs.length === 0) {
    storage.deleteChunks(namespace, ownerId);
    return 0;
  }

  const vectors = await embedTexts(
    chunkSpecs.map((c) => c.content),
    settings
  );
  const chunks = chunkSpecs.map((spec, i) => ({ ...spec, embedding: vectors[i] }));
  storage.saveChunks(namespace, ownerId, chunks);
  return chunks.length;
}

/** Embed `queryText` and return the top-k most similar indexed chunks for
 * (namespace, ownerId), by brute-force cosine similarity. Returns [] (never
 * throws) if nothing is indexed or embedding the query fails -- retrieval is
 * meant to degrade gracefully into "no extra context", not break whatever
 * generation call is using it. */
export async function retrieve(
  namespace: string,
  ownerId: string,
  queryText: string,
  settings: AISettingsPayload,
  topK: number = DEFAULT_TOP_K
): Promise<RetrievedChunk[]> {
  const chunks = storage.getChunks(namespace, ownerId);
  if (chunks.length === 0) return [];

  let queryVec: number[];
  try {
    queryVec = (await embedTexts([queryText], settings))[0];
  } catch {
    return [];
  }

  const scored = chunks.map((c) => ({ score: cosineSimilarity(queryVec, c.embedding), c }));
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, topK).map(({ score, c }) => ({
    content: c.content,
    sourceLabel: c.source_label,
    score,
  }));
}

/** Drop the index for (namespace, ownerId). Returns the number of chunks removed. */
export function clearIndex(namespace: string, ownerId: string): number {
  return storage.deleteChunks(namespace, ownerId);
}

/** Chunk count for (namespace, ownerId) -- 0 if never indexed. */
export function indexStatus(namespace: string, ownerId: string): number {
  return storage.countChunks(namespace, ownerId);
}
