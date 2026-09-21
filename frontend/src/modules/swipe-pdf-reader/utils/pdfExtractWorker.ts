/**
 * pdfExtractWorker.ts — Web Worker for PDF text extraction via PDF.js.
 *
 * Runs entirely off the main thread so large PDFs don't freeze mobile browsers.
 *
 * Message protocol
 * ─────────────────
 * IN  (main → worker):
 *   { type: 'extract', arrayBuffer: ArrayBuffer, fileName: string }
 *
 * OUT (worker → main):
 *   { type: 'progress', page: number, total: number }            — per page
 *   { type: 'done', pageTexts: PageText[], totalPages: number }  — final result
 *   { type: 'error', message: string }                           — on failure
 */

export interface PageText {
  pageNumber: number;
  text: string;
}

export type WorkerInMessage = {
  type: 'extract';
  arrayBuffer: ArrayBuffer;
  fileName: string;
};

export type WorkerOutMessage =
  | { type: 'progress'; page: number; total: number }
  | { type: 'done'; pageTexts: PageText[]; totalPages: number }
  | { type: 'error'; message: string };

// ── Worker body (runs inside the worker thread) ───────────────────────────────
// This file is used both as the worker entry point AND as a type source.
// The actual worker code is at the bottom, guarded by typeof self check.

if (typeof self !== 'undefined' && typeof window === 'undefined') {
  // We are inside a Worker
  self.onmessage = async (event: MessageEvent<WorkerInMessage>) => {
    const { type, arrayBuffer, fileName } = event.data;
    if (type !== 'extract') return;

    try {
      // Dynamically import PDF.js inside the worker
      // pdfjs-dist/build/pdf.mjs is the ESM build that works in Workers
      const pdfjsLib = await import(
        /* webpackChunkName: "pdfjs-dist" */
        'pdfjs-dist/build/pdf.mjs'
      );

      // Point the worker source to the bundled worker (avoids a separate fetch)
      // In a Web Worker we cannot use URL(..., import.meta.url) so we use the
      // legacy fake-worker approach: set workerSrc to empty string and let
      // pdfjs use its built-in stub (works for text extraction — no rendering needed).
      pdfjsLib.GlobalWorkerOptions.workerSrc = '';

      const loadingTask = pdfjsLib.getDocument({ data: new Uint8Array(arrayBuffer) });
      const pdfDoc = await loadingTask.promise;
      const totalPages = pdfDoc.numPages;

      const pageTexts: PageText[] = [];

      for (let pageNum = 1; pageNum <= totalPages; pageNum++) {
        self.postMessage({ type: 'progress', page: pageNum, total: totalPages } satisfies WorkerOutMessage);

        const page = await pdfDoc.getPage(pageNum);
        const textContent = await page.getTextContent();

        // Concatenate text items, preserving paragraph-ish structure
        let pageText = '';
        let lastY: number | null = null;

        for (const item of textContent.items as Array<{ str: string; transform: number[] }>) {
          const str = item.str ?? '';
          const y = item.transform?.[5] ?? null;

          if (lastY !== null && y !== null && Math.abs(y - lastY) > 5) {
            // New line detected — add a newline if there's content
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

      self.postMessage({ type: 'done', pageTexts, totalPages } satisfies WorkerOutMessage);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      self.postMessage({ type: 'error', message } satisfies WorkerOutMessage);
    }
  };
}
