import { lmsService } from '../services/lmsService';

export interface ExtractedFilesResult {
  /** Every file's extracted text, each preceded by a clear "--- File: name ---" marker,
   * ready to append to a context/README textarea. */
  combinedText: string;
  /** Filenames that extracted successfully, in upload order. */
  fileNames: string[];
  /** filename -> error message, for any file that failed to extract (upload continues
   * with the rest rather than aborting the whole batch on one bad file). */
  errors: Record<string, string>;
}

/**
 * Extracts text from multiple uploaded documents (PDF/MD/TXT/DOCX) sequentially,
 * reusing the existing single-file `/lms/upload-source` endpoint per file. Sequential
 * (not Promise.all) so large PDFs don't all hit the server at once and so the error
 * message for a specific file is unambiguous.
 *
 * Shared by the Project README/context editor and the Subject AI-context editor, both
 * of which support multiple documents plus typed text combined into one context.
 */
export async function extractMultipleFiles(files: File[]): Promise<ExtractedFilesResult> {
  const parts: string[] = [];
  const fileNames: string[] = [];
  const errors: Record<string, string> = {};

  for (const file of files) {
    try {
      const res = await lmsService.uploadSourceFile(file);
      parts.push(`--- File: ${res.filename} ---\n${res.text}`);
      fileNames.push(res.filename);
    } catch (err: unknown) {
      errors[file.name] = err instanceof Error ? err.message : 'Failed to extract text.';
    }
  }

  return { combinedText: parts.join('\n\n'), fileNames, errors };
}

/** Merges newly-uploaded filenames into the existing comma-joined source-name label,
 * without duplicating a name that's already there. */
export function mergeSourceNames(existing: string, newNames: string[]): string {
  const current = existing
    .split(',')
    .map((n) => n.trim())
    .filter(Boolean);
  for (const name of newNames) {
    if (!current.includes(name)) current.push(name);
  }
  return current.join(', ');
}
