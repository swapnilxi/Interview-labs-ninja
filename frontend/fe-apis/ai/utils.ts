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

// ── Lenient extraction: use whatever objects a reply managed to deliver ──────────
//
// Port of extract_json_items in backend/modules/common/ai/utils.py — keep the two in sync (the same cases are checked
// against both). The strict extractors above are all-or-nothing, which is the wrong failure mode for one-object-per-item
// answers: every provider silently cuts a reply off at max_tokens, so a long answer arrives as `[ {..}, {..}, {` with no
// closing bracket although most of the results were there. Models also answer a one-item request with a bare `{..}`.

function cleanReply(text: string | null | undefined): string {
  let t = (text ?? '').replace(/<think>[\s\S]*?<\/think>/gi, '');
  const openThink = t.toLowerCase().indexOf('<think>');
  if (openThink !== -1) t = t.slice(0, openThink); // the model never got past its reasoning
  return t.replace(/```[a-zA-Z]*\n?/g, '').trim().replace(/^`+|`+$/g, '').trim();
}

/** Index of the bracket closing the `[` or `{` at `start` (string literals are skipped); -1 if it never closes. */
function balancedEnd(text: string, start: number): number {
  const close = text[start] === '[' ? ']' : '}';
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = start; i < text.length; i++) {
    const ch = text[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === '\\') escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') inString = true;
    else if (ch === '[' || ch === '{') depth++;
    else if (ch === ']' || ch === '}') {
      depth--;
      if (depth === 0) return ch === close ? i : -1;
    }
  }
  return -1;
}

function tryParse(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

const isObject = (v: unknown): v is Record<string, any> => typeof v === 'object' && v !== null && !Array.isArray(v);

/** The objects that arrived whole inside the `[` at `start`, which was never closed (a reply cut off mid-list). */
function salvageObjects(text: string, start: number): Record<string, any>[] {
  const items: Record<string, any>[] = [];
  let i = start + 1;
  while (i < text.length) {
    const ch = text[i];
    if (ch === '{') {
      const end = balancedEnd(text, i);
      if (end === -1) break; // the object the reply stopped in the middle of
      const obj = tryParse(text.slice(i, end + 1));
      if (isObject(obj)) items.push(obj);
      i = end + 1;
    } else if (ch === ']') {
      break;
    } else {
      i++;
    }
  }
  return items;
}

function excerpt(text: string, limit = 120): string {
  const oneLine = text.split(/\s+/).filter(Boolean).join(' ');
  return oneLine.length <= limit ? oneLine : oneLine.slice(0, limit).trimEnd() + '…';
}

/**
 * The JSON objects in an LLM reply that was supposed to be an array of them. `complete` is false when the reply was
 * cut off and only the objects that arrived whole are returned; a single bare `{..}` comes back as `[obj]`. Throws, in
 * words a user can act on, when there is nothing to use (the text is what the AI actually said).
 */
export function extractJsonItems(text: string | null | undefined): { items: Record<string, any>[]; complete: boolean } {
  const cleaned = cleanReply(text);
  if (!cleaned) throw new Error('the AI returned an empty reply');

  let cutOff = false;
  for (let i = 0; i < cleaned.length; i++) {
    if (cleaned[i] !== '[') continue;
    const end = balancedEnd(cleaned, i);
    if (end !== -1) {
      const value = tryParse(cleaned.slice(i, end + 1));
      if (Array.isArray(value) && value.every(isObject)) return { items: value as Record<string, any>[], complete: true };
      continue; // "[note]" in some prose, not JSON
    }
    if (cleaned.slice(i + 1).trimStart().startsWith('{')) {
      // an unclosed list of objects: the reply stopped mid-list
      const items = salvageObjects(cleaned, i);
      if (items.length) return { items, complete: false };
      cutOff = true;
      break;
    }
  }

  if (!cutOff) {
    for (let i = 0; i < cleaned.length; i++) {
      if (cleaned[i] !== '{') continue;
      const end = balancedEnd(cleaned, i);
      if (end === -1) continue;
      const value = tryParse(cleaned.slice(i, end + 1));
      if (isObject(value)) return { items: [value], complete: true };
    }
  }

  if (cutOff) throw new Error("the AI's reply was cut off before it finished its first result (too much asked in one reply)");
  throw new Error(`the AI's reply had no JSON list in it (it began: \u201c${excerpt(cleaned)}\u201d)`);
}
