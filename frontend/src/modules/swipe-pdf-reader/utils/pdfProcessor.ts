import { PdfDocument, DocumentChunk } from '../types';
import type { PageText, WorkerOutMessage } from './pdfExtractWorker';

// ── Feature detection ─────────────────────────────────────────────────────────

function canUseWorker(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof Worker !== 'undefined' &&
    typeof URL !== 'undefined'
  );
}

// ── PDF.js extraction (main-thread fallback when Worker unavailable) ───────────

/**
 * Extract text from a PDF using PDF.js directly on the main thread.
 * Used as a fallback when Web Workers are unavailable (SSR, strict CSP).
 */
async function extractWithPdfJs(
  arrayBuffer: ArrayBuffer,
  onProgress?: (page: number, total: number) => void,
): Promise<{ pageTexts: PageText[]; totalPages: number }> {
  // Dynamic import so webpack can tree-shake pdfjs-dist from SSR bundles
  const pdfjsLib = await import(
    /* webpackChunkName: "pdfjs-dist" */
    'pdfjs-dist/build/pdf.mjs'
  );

  // Use the bundled worker (no separate worker.js file needed)
  pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
    'pdfjs-dist/build/pdf.worker.min.mjs',
    import.meta.url,
  ).toString();

  const loadingTask = pdfjsLib.getDocument({ data: new Uint8Array(arrayBuffer) });
  const pdfDoc = await loadingTask.promise;
  const totalPages = pdfDoc.numPages;
  const pageTexts: PageText[] = [];

  for (let pageNum = 1; pageNum <= totalPages; pageNum++) {
    onProgress?.(pageNum, totalPages);

    const page = await pdfDoc.getPage(pageNum);
    const textContent = await page.getTextContent();

    let pageText = '';
    let lastY: number | null = null;

    for (const item of textContent.items as Array<{ str: string; transform: number[] }>) {
      const str = item.str ?? '';
      const y = item.transform?.[5] ?? null;
      if (lastY !== null && y !== null && Math.abs(y - lastY) > 5) {
        pageText += '\n';
      }
      pageText += str;
      lastY = y;
    }

    pageTexts.push({
      pageNumber: pageNum,
      text: pageText.replace(/\n{3,}/g, '\n\n').trim(),
    });
  }

  return { pageTexts, totalPages };
}

/**
 * Extract text from a PDF using a Web Worker (preferred path).
 * Keeps the main thread responsive during large PDF processing.
 */
function extractWithWorker(
  arrayBuffer: ArrayBuffer,
  onProgress?: (page: number, total: number) => void,
): Promise<{ pageTexts: PageText[]; totalPages: number }> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(
      new URL('./pdfExtractWorker.ts', import.meta.url),
      { type: 'module' },
    );

    worker.onmessage = (event: MessageEvent<WorkerOutMessage>) => {
      const msg = event.data;
      if (msg.type === 'progress') {
        onProgress?.(msg.page, msg.total);
      } else if (msg.type === 'done') {
        worker.terminate();
        resolve({ pageTexts: msg.pageTexts, totalPages: msg.totalPages });
      } else if (msg.type === 'error') {
        worker.terminate();
        reject(new Error(msg.message));
      }
    };

    worker.onerror = (err) => {
      worker.terminate();
      reject(new Error(err.message ?? 'Worker error'));
    };

    // Transfer the buffer to the worker (zero-copy)
    worker.postMessage({ type: 'extract', arrayBuffer, fileName: '' }, [arrayBuffer]);
  });
}

// ── Legacy regex-based extractor (ultimate fallback) ──────────────────────────

async function extractWithRegex(file: File): Promise<{ pageTexts: PageText[]; totalPages: number }> {
  const arrayBuffer = await file.arrayBuffer();
  const uint8Array = new Uint8Array(arrayBuffer);

  // Convert to binary string to find /Type /Page markers and text blocks
  let rawStr = '';
  const CHUNK = 0x8000;
  for (let i = 0; i < uint8Array.length; i += CHUNK) {
    rawStr += String.fromCharCode.apply(null, Array.from(uint8Array.subarray(i, i + CHUNK)));
  }

  const pageMatches = rawStr.match(/\/Type\s*\/Page\b/g);
  const estimatedPages = pageMatches ? Math.max(1, pageMatches.length) : 1;

  const textMatches = rawStr.match(/\(([^\\()]|\\[\s\S])*\)/g) || [];
  let extractedText = textMatches
    .map((t) => t.slice(1, -1).replace(/\\([0-7]{3})/g, (_, oct) => String.fromCharCode(parseInt(oct, 8))))
    .map((t) => t.replace(/\\(.)/g, '$1'))
    .filter((t) => t.trim().length > 2)
    .join(' ');

  if (!extractedText || extractedText.length < 50) {
    extractedText = await new Promise<string>((resolve) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        const res = (e.target?.result as string) || '';
        resolve(res.replace(/[^\x20-\x7E\n\r\t]/g, ' ').replace(/\s+/g, ' ').trim() || `Document ${file.name}`);
      };
      reader.onerror = () => resolve(`Document content for ${file.name}`);
      reader.readAsText(file);
    });
  }

  const words = extractedText.split(/\s+/).filter(Boolean);
  const wordsPerPage = Math.max(120, Math.ceil(words.length / estimatedPages));
  const pageTexts: PageText[] = [];

  for (let i = 0; i < estimatedPages; i++) {
    const pageWords = words.slice(i * wordsPerPage, (i + 1) * wordsPerPage);
    if (pageWords.length > 0 || i === 0) {
      pageTexts.push({
        pageNumber: i + 1,
        text: pageWords.join(' ') || `[Page ${i + 1} Content]`,
      });
    }
  }

  return { pageTexts, totalPages: pageTexts.length };
}

// ── Public extraction API ─────────────────────────────────────────────────────

export interface ExtractionResult {
  text: string;
  totalPages: number;
  pageTexts: PageText[];
}

/**
 * Extract text from a PDF file using the best available method:
 *   1. Web Worker + PDF.js  (preferred — non-blocking, accurate)
 *   2. Main-thread PDF.js   (fallback when Workers unavailable)
 *   3. Regex parser         (last resort — handles some uncompressed PDFs)
 *
 * @param file     The File object from the browser file picker
 * @param onProgress  Optional callback fired per-page: (currentPage, totalPages)
 */
export async function extractPdfTextBestEffort(
  file: File,
  onProgress?: (currentPage: number, totalPages: number) => void,
): Promise<ExtractionResult> {
  let pageTexts: PageText[];
  let totalPages: number;

  // Try Web Worker path first
  if (canUseWorker()) {
    try {
      const arrayBuffer = await file.arrayBuffer();
      const result = await extractWithWorker(arrayBuffer, onProgress);
      pageTexts = result.pageTexts;
      totalPages = result.totalPages;
    } catch (workerErr) {
      console.warn('[pdfProcessor] Worker failed, falling back to main-thread PDF.js:', workerErr);
      try {
        const arrayBuffer = await file.arrayBuffer();
        const result = await extractWithPdfJs(arrayBuffer, onProgress);
        pageTexts = result.pageTexts;
        totalPages = result.totalPages;
      } catch (pdfjsErr) {
        console.warn('[pdfProcessor] PDF.js failed, falling back to regex:', pdfjsErr);
        const result = await extractWithRegex(file);
        pageTexts = result.pageTexts;
        totalPages = result.totalPages;
      }
    }
  } else {
    // No Worker available — try main-thread PDF.js
    try {
      const arrayBuffer = await file.arrayBuffer();
      const result = await extractWithPdfJs(arrayBuffer, onProgress);
      pageTexts = result.pageTexts;
      totalPages = result.totalPages;
    } catch (err) {
      console.warn('[pdfProcessor] PDF.js failed (no worker), falling back to regex:', err);
      const result = await extractWithRegex(file);
      pageTexts = result.pageTexts;
      totalPages = result.totalPages;
    }
  }

  // Filter out empty pages
  const filteredPages = pageTexts.filter((p) => p.text.trim().length > 0);
  const finalPages = filteredPages.length > 0 ? filteredPages : pageTexts;

  return {
    text: finalPages.map((p) => p.text).join('\n\n'),
    totalPages,
    pageTexts: finalPages,
  };
}

/**
 * Legacy entry point — kept for backward compatibility.
 * Delegates to extractPdfTextBestEffort without progress reporting.
 */
export async function extractPdfTextWithPages(file: File): Promise<ExtractionResult> {
  return extractPdfTextBestEffort(file);
}

// ── Chunking (unchanged from original) ───────────────────────────────────────

/**
 * Splits extracted text into readable semantic chunks preserving paragraph
 * structure and page numbers. Avoids breaking sentences unnecessarily.
 * Each chunk: chunkIndex, totalChunks, pageNumber (PDFs), title, content,
 * keyTakeaway, highlightTerms.
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
    const rawPageText = pageItem.text.trim();
    if (!rawPageText) continue;

    const rawParagraphs = rawPageText
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

  const words = cleanContent
    .replace(/[^a-zA-Z0-9\s]/g, '')
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
