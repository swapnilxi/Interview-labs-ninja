/**
 * copy-pdfjs-cmaps.mjs
 *
 * pdf.js needs its CMaps to decode CID-keyed fonts. Without them, PDFs that
 * embed CID fonts (most non-Latin documents, and many exported/printed PDFs)
 * extract as mojibake. They ship inside pdfjs-dist, so this script copies them
 * into `public/pdfjs/cmaps/` — served same-origin and cacheable by the service
 * worker, which is what makes offline extraction possible.
 *
 * Runs automatically via `postinstall`; safe to run repeatedly and safe to run
 * when pdfjs-dist is absent (it just prints a note and exits 0).
 */

import { cp, mkdir, readdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(here, '..');
const source = path.join(projectRoot, 'node_modules', 'pdfjs-dist', 'cmaps');
const target = path.join(projectRoot, 'public', 'pdfjs', 'cmaps');

if (!existsSync(source)) {
  console.log('[pdfjs] pdfjs-dist not installed yet — skipping CMap copy.');
  process.exit(0);
}

try {
  await mkdir(target, { recursive: true });
  await cp(source, target, { recursive: true, force: true });
  const files = await readdir(target);
  console.log(`[pdfjs] Copied ${files.length} CMap files to public/pdfjs/cmaps.`);
} catch (err) {
  // Never fail an install because of an optional asset copy.
  console.warn('[pdfjs] Could not copy CMaps:', err?.message ?? err);
}
