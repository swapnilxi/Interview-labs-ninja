/**
 * fe-apis/ai/utils.ts
 *
 * Small text-processing helpers for cleaning up raw AI text output.
 */

/**
 * Strips a markdown code fence wrapper and extracts the pure HTML document,
 * mirroring backend/modules/ai_lms/router.py's _clean_ai_html_output.
 *
 * Doesn't just strip a *leading* fence: models routinely prepend conversational
 * preamble ("Here is the complete HTML document...") before the fence despite
 * being told not to, which a startsWith('```') check misses entirely, leaking
 * that prose into generated_html and rendering it as visible text above the
 * lesson. Instead, always locate the actual <!doctype html>/<html>...</html>
 * boundaries and slice to those, regardless of what surrounds them.
 */
export function cleanHtmlOutput(text: string): string {
  let cleaned = text.trim();

  if (cleaned.startsWith('```')) {
    cleaned = cleaned.replace(/^```[a-zA-Z0-9_-]*\n?/, '');
    cleaned = cleaned.replace(/\n?```$/, '');
    cleaned = cleaned.trim();
  }

  const lower = cleaned.toLowerCase();
  const docIdx = lower.indexOf('<!doctype html');
  if (docIdx !== -1) {
    cleaned = cleaned.slice(docIdx);
  } else {
    const htmlIdx = lower.indexOf('<html');
    if (htmlIdx !== -1) {
      cleaned = cleaned.slice(htmlIdx);
    }
  }

  const endIdx = cleaned.toLowerCase().lastIndexOf('</html>');
  if (endIdx !== -1) {
    cleaned = cleaned.slice(0, endIdx + 7);
  }

  return cleaned.trim();
}

export function extractJsonObject(text: string): Record<string, any> {
  const cleaned = text.replace(/```[a-z]*\n?/g, '').replace(/`/g, '').trim();
  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  if (start === -1 || end === -1) {
    throw new Error('No JSON object found in response');
  }
  return JSON.parse(cleaned.slice(start, end + 1));
}
