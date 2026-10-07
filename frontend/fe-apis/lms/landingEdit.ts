/**
 * Landing-page editing helpers: manual/AI sections and the prompts for AI edits.
 * Twin of backend/modules/ai_lms/landing_edit.py -- change both together.
 *
 * A section is HTML wrapped in `<!-- lms:section:ID source=manual|ai -->` ...
 * `<!-- /lms:section:ID -->` markers. The lms:auto regions are never touched here.
 */
import crypto from 'crypto';

export interface LandingSection {
  id: string;
  source: 'manual' | 'ai';
  title: string;
  html: string;
}

export const SECTION_HTML_MAX = 40_000;
export const PAGE_HTML_MAX = 400_000;

const sectionRe = () =>
  /<!--[ \t]*lms:section:([a-z0-9-]+)[ \t]+source=(manual|ai)[ \t]*-->([\s\S]*?)<!--[ \t]*\/lms:section:\1[ \t]*-->/g;
const AUTO_MARKER = /<!--[ \t\r\n]*\/?lms:auto:[a-z][a-z0-9-]*[ \t\r\n]*-->/g;

const unescapeHtml = (t: string) =>
  t.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&');
export const escapeHtml = (t: string) =>
  t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#x27;');

function titleOf(fragment: string): string {
  const m = /<h[1-6][^>]*>([\s\S]*?)<\/h[1-6]>/i.exec(fragment);
  return m ? unescapeHtml(m[1].replace(/<[^>]+>/g, '')).trim() : '';
}

export function listSections(page: string): LandingSection[] {
  return [...page.matchAll(sectionRe())].map((m) => ({
    id: m[1],
    source: m[2] as 'manual' | 'ai',
    title: titleOf(m[3]),
    html: m[3].trim(),
  }));
}

export const newSectionId = () => 's' + crypto.randomBytes(4).toString('hex');

export const wrapSection = (id: string, source: 'manual' | 'ai', fragment: string) =>
  `<!-- lms:section:${id} source=${source} -->\n${fragment.trim()}\n<!-- /lms:section:${id} -->`;

/** Section HTML must be an inert fragment: no document wrapper or code fences. */
export function stripUnsafe(fragment: string): string {
  let frag = fragment;
  if (/<body/i.test(frag)) frag = frag.replace(/^[\s\S]*?<body[^>]*>/i, '');
  frag = frag.replace(/<\/body>[\s\S]*$/i, '');
  frag = frag.replace(/<!doctype[^>]*>|<\/?html[^>]*>|<head>[\s\S]*?<\/head>/gi, '');
  frag = frag.trim().replace(/^```(?:html)?\s*|\s*```$/g, '');
  return frag.trim();
}

export const manualSectionHtml = (title: string, body: string) =>
  `<section class="lms-user-section" style="padding:32px 0;border-top:1px solid var(--line,#e7e1d4)">\n` +
  `  <h2>${escapeHtml(title.trim())}</h2>\n  ${body.trim()}\n</section>`;

function find(page: string, id: string): RegExpMatchArray | undefined {
  return [...page.matchAll(sectionRe())].find((m) => m[1] === id);
}

/** Insert a wrapped section: after an existing one, at the start of <main>, or (default) at the end. */
export function insertSection(page: string, block: string, afterId?: string | null, position: 'start' | 'end' = 'end'): string {
  if (afterId) {
    const m = find(page, afterId);
    if (!m) throw new SectionNotFound(afterId);
    const end = (m.index as number) + m[0].length;
    return page.slice(0, end) + '\n\n' + block + page.slice(end);
  }
  if (position === 'start') {
    const m = /<main\b[^>]*>/i.exec(page);
    if (m) {
      const end = m.index + m[0].length;
      return page.slice(0, end) + '\n\n' + block + page.slice(end);
    }
  }
  for (const closer of [/<\/main>/gi, /<\/body>/gi]) {
    const all = [...page.matchAll(closer)];
    if (all.length) {
      const idx = all[all.length - 1].index as number;
      return page.slice(0, idx) + block + '\n' + page.slice(idx);
    }
  }
  return page + '\n' + block + '\n';
}

export class SectionNotFound extends Error {}

/** Swap a section with its neighbour ("up" = earlier on the page); an edge section stays put. */
export function moveSection(page: string, id: string, direction: 'up' | 'down'): string {
  const spans = [...page.matchAll(sectionRe())].map((m) => ({ id: m[1], start: m.index as number, end: (m.index as number) + m[0].length }));
  const idx = spans.findIndex((sp) => sp.id === id);
  if (idx < 0) throw new SectionNotFound(id);
  const other = direction === 'up' ? idx - 1 : idx + 1;
  if (other < 0 || other >= spans.length) return page;
  const [a, b] = [spans[idx], spans[other]].sort((x, y) => x.start - y.start);
  return page.slice(0, a.start) + page.slice(b.start, b.end) + page.slice(a.end, b.start) + page.slice(a.start, a.end) + page.slice(b.end);
}

/** Replace a section's block (same id/source) with new inner HTML. */
export function replaceSection(page: string, id: string, source: 'manual' | 'ai', fragment: string): string {
  const m = find(page, id);
  if (!m) throw new SectionNotFound(id);
  const start = m.index as number;
  return page.slice(0, start) + wrapSection(id, source, fragment) + page.slice(start + m[0].length);
}

export function removeSection(page: string, id: string): string {
  const m = find(page, id);
  if (!m) throw new SectionNotFound(id);
  const start = m.index as number;
  const end = start + m[0].length;
  const rest = page.slice(end);
  return rest.trim() ? page.slice(0, start).trimEnd() + '\n\n' + rest.trimStart() : page.slice(0, start).trimEnd() + '\n';
}

/** AI page edits must keep every lms:auto marker the page had. */
export function autoMarkersIntact(before: string, after: string): boolean {
  return [...new Set(before.match(AUTO_MARKER) ?? [])].every((mk) => after.includes(mk));
}

export const pageEditPrompt = (instruction: string, page: string) => `You are updating the landing page of an online class according to the editor's instruction.

Editor's instruction:
"""
${instruction.trim()}
"""

Current landing page HTML:
"""
${page}
"""

RULES:
1. Apply the instruction and change as little else as possible.
2. Keep every HTML comment marker EXACTLY as is, including \`<!-- lms:auto:NAME -->...<!-- /lms:auto:NAME -->\`
   pairs (the app refreshes the content inside them) and \`<!-- lms:section:ID source=... -->\` pairs.
3. Keep it a single self-contained document: inline CSS, no external CDNs, links relative.
4. Output ONLY the complete updated HTML document, from <!DOCTYPE html> to </html>. No code fences, no commentary.`;

export const pageGeneratePrompt = (instruction: string, className: string, description: string, outline: string, template: string) => `Design the landing page for the online class "${className}".
Class description: ${description || '(none)'}

Editor's brief:
"""
${instruction.trim()}
"""

Class contents (for context; the app fills the lists in itself):
${outline || '(empty so far)'}

Start from this page, which already has the app's required structure:
"""
${template}
"""

RULES:
1. Keep every \`<!-- lms:auto:NAME -->...<!-- /lms:auto:NAME -->\` marker pair exactly as is: the app keeps
   the class name, description, counts and subject/project/lesson lists current inside them.
2. Rework layout, copy, colors and extra sections to follow the brief. Single self-contained document,
   inline CSS, no external CDNs, links relative.
3. Output ONLY the complete HTML document, from <!DOCTYPE html> to </html>. No code fences, no commentary.`;

export function sectionPrompt(instruction: string, page: string): string {
  const style = (/<style[\s\S]*?<\/style>/i.exec(page)?.[0] ?? '').slice(0, 6000);
  return `Write ONE new section for an online class's landing page.

Editor's instruction:
"""
${instruction.trim()}
"""

The page's stylesheet (reuse its CSS variables and classes so the section matches):
"""
${style}
"""

RULES:
1. Output a single \`<section>...</section>\` fragment starting with an <h2> heading. No <html>/<head>/<body>,
   no code fences, no commentary.
2. No external CDNs; inline any extra CSS in a <style> inside the fragment; keep it self-contained.
3. Do not include lms:auto or lms:section comment markers.`;
}
