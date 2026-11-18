import { DocxError, extractDocxText } from './docx';

/**
 * Plain text out of a document the user picks (PDF, Word, text or Markdown), entirely in the browser: nothing is uploaded, so it
 * works the same with the FastAPI backend, the Next.js one, or offline. (Daily Session's resume upload does this on the server and
 * only on FastAPI, see `POST /sessions/upload-resume`.)
 */

export const DOCUMENT_ACCEPT = '.pdf,.docx,.txt,.md,.markdown';
export const DOCUMENT_TYPES_LABEL = 'PDF, DOCX, TXT or Markdown';

/** Same cap as the server-side resume upload. */
export const MAX_DOCUMENT_BYTES = 20 * 1024 * 1024;

/** An error whose message can be shown to the person as is. */
export class DocumentError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DocumentError';
  }
}

export type DocumentKind = 'pdf' | 'docx' | 'text';

export function documentKind(filename: string): DocumentKind | null {
  const ext = /\.([^.]+)$/.exec(filename.toLowerCase())?.[1];
  if (ext === 'pdf') return 'pdf';
  if (ext === 'docx') return 'docx';
  if (ext === 'txt' || ext === 'md' || ext === 'markdown' || ext === 'text') return 'text';
  return null;
}

// Built from char codes so no invisible character sits in the source (and no control character in a regex)
const BOM = String.fromCharCode(0xfeff);
const NUL = String.fromCharCode(0);
const NBSP = String.fromCharCode(0xa0);

/** Same line endings everywhere, no byte-order mark or NULs, no trailing spaces, at most one blank line in a row. */
export function cleanDocumentText(raw: string): string {
  return (raw.startsWith(BOM) ? raw.slice(1) : raw)
    .split(NUL)
    .join('')
    .replace(/\r\n?/g, '\n')
    .split(NBSP)
    .join(' ')
    .replace(/[ \t]+$/gm, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

async function readPdf(file: File, onProgress?: (label: string) => void): Promise<string> {
  const mod = await import('@/modules/swipe-pdf-reader/utils/pdfProcessor');
  try {
    const result = await mod.extractPdfTextBestEffort(file, (page, total) =>
      onProgress?.(total > 1 ? `Reading page ${page} of ${total}…` : 'Reading…')
    );
    return result.text;
  } catch (e) {
    if (e instanceof mod.PdfExtractionError) {
      if (e.code === 'no-text') {
        throw new DocumentError(
          'No selectable text found: this looks like a scanned PDF (images only). Run it through OCR, or paste the text instead.'
        );
      }
      if (e.code === 'encrypted') {
        throw new DocumentError('This PDF is password-protected. Unlock it first, then try again.');
      }
      throw new DocumentError(
        'This PDF could not be opened here. Try re-exporting it, or paste the text instead.'
      );
    }
    throw e;
  }
}

/** The cleaned text of a PDF, DOCX, TXT or Markdown file. Throws `DocumentError` with a message that can be shown as is. */
export async function readDocumentText(
  file: File,
  onProgress?: (label: string) => void
): Promise<string> {
  const kind = documentKind(file.name);
  if (!kind) {
    throw new DocumentError(
      /\.(doc|rtf|odt|pages)$/i.test(file.name)
        ? 'Save it as a .docx or PDF first, then choose it again.'
        : `Choose a ${DOCUMENT_TYPES_LABEL} file.`
    );
  }
  if (file.size > MAX_DOCUMENT_BYTES) {
    throw new DocumentError(`This file is larger than ${MAX_DOCUMENT_BYTES / (1024 * 1024)} MB.`);
  }

  let raw: string;
  try {
    if (kind === 'pdf') raw = await readPdf(file, onProgress);
    else if (kind === 'docx') raw = await extractDocxText(file);
    else {
      raw = await file.text();
      if (raw.slice(0, 4096).includes(NUL)) {
        throw new DocumentError('This does not look like a text file.');
      }
    }
  } catch (e) {
    if (e instanceof DocumentError) throw e;
    if (e instanceof DocxError) throw new DocumentError(e.message);
    console.error('[documentText] Could not read the file:', e);
    throw new DocumentError(
      'Could not read this file. Try another one, or paste the text instead.'
    );
  }

  const text = cleanDocumentText(raw);
  if (!text) throw new DocumentError('There is no text in this file.');
  return text;
}

/**
 * Fits `text` into `max` characters. A cut falls on a paragraph break when one is near the end, never inside a surrogate pair.
 * `total` is the length before cutting, so the caller can say how much did not fit.
 */
export function fitToLimit(
  text: string,
  max: number
): { text: string; cut: boolean; total: number } {
  const total = text.length;
  if (total <= max) return { text, cut: false, total };
  let head = text.slice(0, max);
  const paragraph = head.lastIndexOf('\n\n');
  if (paragraph > max * 0.85) head = head.slice(0, paragraph);
  else if (/[\ud800-\udbff]$/.test(head)) head = head.slice(0, -1);
  return { text: head.trimEnd(), cut: true, total };
}

/** "Payments_platform-brief.docx" -> "Payments platform brief", a starting point for a project name. */
export function titleFromFilename(filename: string, max: number): string {
  const base = filename
    .replace(/\.[^./\\]+$/, '')
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return (base.charAt(0).toUpperCase() + base.slice(1)).slice(0, max).trim();
}
