import { PdfDocument, DocumentChunk } from '../types';

// ── Types ─────────────────────────────────────────────────────────────────────
//
// pdf.js objects are described with the minimal shape this module relies on.
// Keeping the surface small means the reader does not break when pdf.js
// renames internal classes between releases.

export interface PageText {
  pageNumber: number;
  text: string;
}

interface PdfTextItem {
  str: string;
  width?: number;
  height?: number;
  transform?: number[];
  hasEOL?: boolean;
}

interface PdfPageProxy {
  getTextContent(): Promise<{ items: Array<PdfTextItem | { type: string }> }>;
  cleanup?(): void;
}

interface PdfDocumentProxy {
  numPages: number;
  getPage(pageNumber: number): Promise<PdfPageProxy>;
  destroy?(): Promise<void>;
}

interface PdfLoadingTask {
  promise: Promise<PdfDocumentProxy>;
  destroy?(): Promise<void>;
}

interface PdfJsLib {
  GlobalWorkerOptions: { workerSrc: string };
  getDocument(src: Record<string, unknown>): PdfLoadingTask;
}

/** Error raised when a PDF cannot be turned into readable text. */
export type PdfExtractionErrorCode = 'no-text' | 'encrypted' | 'unsupported' | 'too-large';

export class PdfExtractionError extends Error {
  readonly code: PdfExtractionErrorCode;

  constructor(message: string, code: PdfExtractionErrorCode) {
    super(message);
    this.name = 'PdfExtractionError';
    this.code = code;
  }
}

// ── pdf.js loading ────────────────────────────────────────────────────────────

/**
 * CMaps are shipped as static files (copied from pdfjs-dist by
 * `scripts/copy-pdfjs-cmaps.mjs` on install). They are what lets pdf.js decode
 * CID-keyed fonts — without them, non-Latin and many embedded-font PDFs come
 * out as mojibake, which is the usual "text is not encoded properly" symptom.
 */
const CMAPS_URL = '/pdfjs/cmaps/';
const CMAP_PROBE_URL = `${CMAPS_URL}UniJIS-UCS2-H.bcmap`;

let pdfJsPromise: Promise<PdfJsLib> | null = null;
let cmapsAvailable: Promise<boolean> | null = null;

/**
 * pdf.js 5+/6+ targets very recent engines. Older mobile browsers (iOS < 17.4,
 * older Android WebViews) are missing a couple of statics and fail to even
 * load the library. The legacy build covers most of that gap; these two fill
 * in the rest so extraction degrades gracefully instead of throwing.
 */
function installLegacyPolyfills(): void {
  if (typeof Promise === 'undefined') return;

  const promiseCtor = Promise as unknown as Record<string, unknown>;
  if (typeof promiseCtor.withResolvers !== 'function') {
    promiseCtor.withResolvers = function withResolvers<T>() {
      let resolve!: (value: T | PromiseLike<T>) => void;
      let reject!: (reason?: unknown) => void;
      const promise = new Promise<T>((res, rej) => {
        resolve = res;
        reject = rej;
      });
      return { promise, resolve, reject };
    };
  }

  const objectCtor = Object as unknown as Record<string, unknown>;
  if (typeof objectCtor.hasOwn !== 'function') {
    objectCtor.hasOwn = (target: object, key: PropertyKey) =>
      Object.prototype.hasOwnProperty.call(target, key);
  }
}

function loadPdfJs(): Promise<PdfJsLib> {
  if (!pdfJsPromise) {
    installLegacyPolyfills();
    pdfJsPromise = import('pdfjs-dist/legacy/build/pdf.mjs')
      .then((mod) => {
        const lib = mod as unknown as PdfJsLib;
        // In browser environments, assign workerSrc for background parsing.
        // In Node.js / serverless environments, omit workerSrc so pdf.js parses inline
        // without DOM worker DataClone errors.
        if (typeof window !== 'undefined') {
          lib.GlobalWorkerOptions.workerSrc = new URL(
            'pdfjs-dist/legacy/build/pdf.worker.min.mjs',
            import.meta.url,
          ).toString();
        }
        return lib;
      })
      .catch((err) => {
        pdfJsPromise = null;
        throw err;
      });
  }
  return pdfJsPromise;
}

/** One HEAD request per session; the answer cannot change without a reload. */
function areCMapsAvailable(): Promise<boolean> {
  if (typeof window === 'undefined') {
    return Promise.resolve(false);
  }
  if (!cmapsAvailable) {
    cmapsAvailable = fetch(CMAP_PROBE_URL, { method: 'HEAD' })
      .then((res) => res.ok)
      .catch(() => false);
  }
  return cmapsAvailable;
}

// ── Text reconstruction ──────────────────────────────────────────────────────

/** Trim, drop invisible/control characters, collapse runs of whitespace. */
function normalizeWhitespace(input: string): string {
  return input
    .replace(/\u0000/g, '')
    .replace(/[\u00AD\u200B\u200C\u200D\uFEFF]/g, '')
    .replace(/\r\n?/g, '\n')
    .replace(/[^\S\n]+/g, ' ')
    .replace(/ ?\n ?/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/**
 * Rebuild a page's text from pdf.js text items.
 *
 * Naive concatenation (`pageText += item.str`) glues words together whenever a
 * PDF positions text without explicit spaces — columns, tables and justified
 * lines all end up as "wordwordword". This version inserts a space when there
 * is a horizontal gap between glyph runs, and honours the line-break flag
 * pdf.js already computes.
 */
function textItemsToText(items: Array<PdfTextItem | { type: string }>): string {
  let out = '';
  let prev: PdfTextItem | null = null;

  for (const raw of items) {
    if (!('str' in raw)) continue; // TextMarkedContent markers carry no text
    const item = raw as PdfTextItem;

    if (!item.str) {
      if (item.hasEOL) out += '\n';
      continue;
    }

    if (prev?.transform && item.transform) {
      const prevSize = Math.abs(prev.height ?? prev.transform[3] ?? 0) || 1;
      const size = Math.abs(item.height ?? item.transform[3] ?? 0) || 1;
      const fontSize = Math.max(prevSize, size, 1);
      const sameLine = Math.abs((item.transform[5] ?? 0) - (prev.transform[5] ?? 0)) < fontSize * 0.6;

      if (sameLine) {
        const gap = (item.transform[4] ?? 0) - ((prev.transform[4] ?? 0) + (prev.width ?? 0));
        const startsWithPunctuation = /^[\s,.;:!?%)\]}]/.test(item.str);
        if (gap > fontSize * 0.15 && !/\s$/.test(out) && !startsWithPunctuation) {
          out += ' ';
        }
      }
    }

    out += item.str;
    if (item.hasEOL) out += '\n';
    prev = item;
  }

  return out;
}

/**
 * pdf.js emits one newline per visual line. Treating every newline as a
 * paragraph produces broken, half-sentence cards, so re-flow wrapped lines back
 * into paragraphs while keeping real breaks (blank lines, headings, bullets,
 * sentences that ended a line).
 */
function mergeWrappedLines(input: string): string {
  const isListItem = (line: string) =>
    /^([•▪●◦‣*\-–—]|\d{1,3}[.)]|[a-zA-Z][.)])\s+/.test(line);
  const endsSentence = (line: string) => /[.!?:;”"'’)\]]\s*$/.test(line);

  const out: string[] = [];

  for (const rawLine of input.split('\n')) {
    const line = rawLine.trim();
    if (!line) {
      if (out.length > 0 && out[out.length - 1] !== '') out.push('');
      continue;
    }

    if (out.length === 0) {
      out.push(line);
      continue;
    }

    const prevIndex = out.length - 1;
    const prev = out[prevIndex];

    if (!prev) {
      out.push(line);
      continue;
    }

    // Re-join words split across lines with a hyphen, e.g. "convo-\nlution".
    if (/[A-Za-z]-$/.test(prev) && /^[a-z]/.test(line)) {
      out[prevIndex] = prev.slice(0, -1) + line;
      continue;
    }

    if (isListItem(line) || endsSentence(prev) || prev.length < 40) {
      out.push(line);
    } else {
      out[prevIndex] = `${prev} ${line}`;
    }
  }

  return out.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

// ── Public extraction API ────────────────────────────────────────────────────

export interface ExtractionResult {
  text: string;
  totalPages: number;
  /** One entry per PDF page — empty pages are kept so page numbers stay true. */
  pageTexts: PageText[];
}

const PAGE_YIELD_INTERVAL = 4;

/**
 * Extract text from a PDF.
 *
 * Runs on the main thread but pdf.js performs the heavy parsing in its own
 * worker, so the UI stays responsive. (The previous version wrapped pdf.js in a
 * second, nested web worker whose module-worker bootstrap fails on many mobile
 * browsers — every extraction fell through to a regex parser that emitted
 * binary garbage.)
 */
export async function extractPdfTextBestEffort(
  file: File,
  onProgress?: (currentPage: number, totalPages: number) => void,
): Promise<ExtractionResult> {
  const arrayBuffer = await file.arrayBuffer();

  let lib: PdfJsLib;
  try {
    lib = await loadPdfJs();
  } catch (err) {
    console.error('[pdfProcessor] Could not load pdf.js:', err);
    throw new PdfExtractionError(
      'The PDF engine could not start on this device. Use the Paste Text tab instead.',
      'unsupported',
    );
  }

  const cmaps = await areCMapsAvailable();

  let pdfDoc: PdfDocumentProxy;
  try {
    pdfDoc = await lib.getDocument({
      data: new Uint8Array(arrayBuffer),
      // Fonts are never rendered here, so skip font loading entirely — this
      // avoids network fetches and speeds up mobile extraction.
      disableFontFace: true,
      useSystemFonts: false,
      isEvalSupported: false,
      cMapUrl: cmaps ? CMAPS_URL : undefined,
      cMapPacked: cmaps,
      // 0 = only errors, so missing optional assets do not spam the console.
      verbosity: 0,
    }).promise;
  } catch (err) {
    const name = (err as { name?: string })?.name;
    if (name === 'PasswordException') {
      throw new PdfExtractionError(
        'This PDF is password-protected. Unlock it first, then open it again.',
        'encrypted',
      );
    }
    if (name === 'InvalidPDFException') {
      throw new PdfExtractionError(
        'This file is not a valid PDF, or it is corrupted. Try re-exporting it.',
        'unsupported',
      );
    }
    console.error('[pdfProcessor] PDF.js failed to open the document:', err);
    throw new PdfExtractionError(
      'This PDF could not be opened on this device. Try the Paste Text tab instead.',
      'unsupported',
    );
  }

  const totalPages = pdfDoc.numPages;
  const pageTexts: PageText[] = [];

  try {
    for (let pageNum = 1; pageNum <= totalPages; pageNum++) {
      onProgress?.(pageNum, totalPages);

      try {
        const page = await pdfDoc.getPage(pageNum);
        const textContent = await page.getTextContent();
        const rawText = textItemsToText(textContent.items);
        pageTexts.push({
          pageNumber: pageNum,
          text: mergeWrappedLines(normalizeWhitespace(rawText)),
        });
        page.cleanup?.();
      } catch (pageErr) {
        console.warn(`[pdfProcessor] Page ${pageNum} could not be read:`, pageErr);
        pageTexts.push({ pageNumber: pageNum, text: '' });
      }

      // Let the browser paint progress updates on large documents.
      if (pageNum % PAGE_YIELD_INTERVAL === 0) {
        await new Promise((resolve) => setTimeout(resolve, 0));
      }
    }
  } finally {
    if (pdfDoc.destroy) {
      pdfDoc.destroy().catch(() => {});
    }
  }

  const readablePages = pageTexts.filter((p) => p.text.trim().length > 0);

  if (readablePages.length === 0) {
    throw new PdfExtractionError(
      'No selectable text found — this looks like a scanned PDF (images only). Use the Paste Text tab, or run it through OCR first.',
      'no-text',
    );
  }

  return {
    text: readablePages.map((p) => p.text).join('\n\n'),
    totalPages,
    pageTexts,
  };
}

/** Backward-compatible alias. */
export async function extractPdfTextWithPages(file: File): Promise<ExtractionResult> {
  return extractPdfTextBestEffort(file);
}

// ── Chunking ─────────────────────────────────────────────────────────────────

/**
 * Splits extracted text into readable semantic chunks preserving paragraph
 * structure and page numbers. Avoids breaking sentences unnecessarily.
 */
export function processDocumentChunks(
  docId: string,
  docTitle: string,
  sourceType: 'pdf' | 'paste',
  pageTexts: { pageNumber: number; text: string }[]
): PdfDocument {
  const chunks: DocumentChunk[] = [];
  let currentChunkIndex = 1;

  for (const pageItem of pageTexts) {
    // Re-flowing wrapped lines is a PDF-specific fix; pasted text keeps the
    // line breaks the user typed.
    const pageText =
      sourceType === 'pdf'
        ? mergeWrappedLines(normalizeWhitespace(pageItem.text))
        : normalizeWhitespace(pageItem.text);
    if (!pageText) continue;

    const rawParagraphs = pageText
      .split(/\n\s*\n+/)
      .map((p) => p.trim())
      .filter(Boolean);

    const paragraphs: string[] = [];
    if (rawParagraphs.length === 1 && rawParagraphs[0].length > 700) {
      const lines = rawParagraphs[0].split(/\n+/).map((l) => l.trim()).filter(Boolean);
      if (lines.length > 1) {
        paragraphs.push(...lines);
      } else {
        paragraphs.push(rawParagraphs[0]);
      }
    } else {
      paragraphs.push(...rawParagraphs);
    }

    let accumulator = '';

    for (let i = 0; i < paragraphs.length; i++) {
      const p = paragraphs[i];

      if (p.length > 800) {
        if (accumulator.trim()) {
          chunks.push(
            createChunkObject({
              docId, docTitle,
              chunkIndex: currentChunkIndex++,
              pageNumber: sourceType === 'pdf' ? pageItem.pageNumber : undefined,
              content: accumulator.trim(),
            })
          );
          accumulator = '';
        }

        const sentences = p.match(/[^.!?]+[.!?]+(\s+|$)|[^.!?]+$/g) || [p];
        let sentenceAcc = '';
        for (const sent of sentences) {
          if ((sentenceAcc + sent).length > 600 && sentenceAcc.length > 120) {
            chunks.push(
              createChunkObject({
                docId, docTitle,
                chunkIndex: currentChunkIndex++,
                pageNumber: sourceType === 'pdf' ? pageItem.pageNumber : undefined,
                content: sentenceAcc.trim(),
              })
            );
            sentenceAcc = sent;
          } else {
            sentenceAcc += sent;
          }
        }
        if (sentenceAcc.trim()) {
          accumulator = sentenceAcc.trim();
        }
        continue;
      }

      if ((accumulator + '\n\n' + p).length > 650 && accumulator.length > 150) {
        chunks.push(
          createChunkObject({
            docId, docTitle,
            chunkIndex: currentChunkIndex++,
            pageNumber: sourceType === 'pdf' ? pageItem.pageNumber : undefined,
            content: accumulator.trim(),
          })
        );
        accumulator = p;
      } else {
        accumulator = accumulator ? accumulator + '\n\n' + p : p;
      }
    }

    if (accumulator.trim()) {
      chunks.push(
        createChunkObject({
          docId, docTitle,
          chunkIndex: currentChunkIndex++,
          pageNumber: sourceType === 'pdf' ? pageItem.pageNumber : undefined,
          content: accumulator.trim(),
        })
      );
    }
  }

  if (chunks.length === 0) {
    chunks.push(
      createChunkObject({
        docId, docTitle,
        chunkIndex: 1,
        pageNumber: sourceType === 'pdf' ? 1 : undefined,
        content: pageTexts.map((p) => p.text).join('\n\n') || 'No readable text content found.',
      })
    );
  }

  const totalChunks = chunks.length;
  chunks.forEach((c) => { c.totalChunks = totalChunks; });

  const fullText = pageTexts.map((p) => p.text).join('\n\n');

  return {
    id: docId,
    name: docTitle,
    sourceType,
    totalPages: sourceType === 'pdf' ? pageTexts.length : undefined,
    totalChunks,
    extractedText: fullText,
    chunks,
    createdAt: new Date().toISOString(),
  };
}

function createChunkObject(params: {
  docId: string;
  docTitle: string;
  chunkIndex: number;
  pageNumber?: number;
  content: string;
}): DocumentChunk {
  const cleanContent = params.content.trim();
  const firstSentenceMatch = cleanContent.match(/^[^.!?]+[.!?]/);
  const firstSentence = firstSentenceMatch
    ? firstSentenceMatch[0].replace(/[.!?]$/, '')
    : cleanContent.split('\n')[0];
  let title = firstSentence.length > 60 ? firstSentence.slice(0, 57) + '...' : firstSentence;
  if (!title || title.length < 4) title = `Section ${params.chunkIndex}`;

  // Unicode-aware so non-Latin documents still get useful highlight terms.
  const words = cleanContent
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 5);
  const uniqueTerms = Array.from(new Set(words.map((w) => w.toLowerCase()))).slice(0, 3);

  return {
    id: `${params.docId}-chunk-${params.chunkIndex}`,
    documentId: params.docId,
    documentTitle: params.docTitle,
    chunkIndex: params.chunkIndex,
    totalChunks: 0,
    pageNumber: params.pageNumber,
    title,
    content: cleanContent,
    keyTakeaway: `Key point from chunk ${params.chunkIndex}`,
    highlightTerms: uniqueTerms,
  };
}
