/**
 * Splits the AI-written "Approaches" markdown into tabs: one per approach, plus a Summary tab for the
 * comparison table and the interview narration. Returns null when the text doesn't have at least two
 * recognisable approach headings (a hand-edited prompt can produce any shape), so the caller can fall
 * back to showing the plain document.
 *
 * An approach heading is a bold-only line or a markdown heading that starts with "Approach <n>"
 * ("**Approach 2 — Prefix counts**", "### Approach 2: Prefix counts"), outside code fences.
 */

export interface ApproachTab {
  id: string;
  kind: 'approach' | 'summary';
  /** "Approach 2" or "Summary". */
  label: string;
  /** The approach's short name ("Prefix counts"), without the "(optimal)" marker. */
  name: string;
  optimal: boolean;
  /** Markdown for the tab, heading line included. */
  body: string;
}

const BOLD_APPROACH = /^\s{0,3}\*\*\s*Approach\s+(\d+)\b\s*[—–:.-]*\s*(.*?)\s*\*\*\s*$/i;
const HEADING_APPROACH =
  /^\s{0,3}#{1,6}\s+(?:\*\*)?\s*Approach\s+(\d+)\b\s*[—–:.-]*\s*(.*?)\s*(?:\*\*)?\s*$/i;
const SUMMARY_HEADING = /^\s{0,3}(?:#{1,6}\s+|\*\*\s*)(?:Progression at a glance|At a glance)\b/i;
const BOLD_ONLY = /^\s{0,3}\*\*[^*].*\*\*\s*$/;

interface Marker {
  line: number;
  kind: 'approach' | 'summary';
  number?: number;
  rawName?: string;
}

export function parseApproachTabs(
  content: string
): { preface: string; tabs: ApproachTab[] } | null {
  const lines = content.split('\n');
  const markers: Marker[] = [];
  let inFence = false;
  lines.forEach((line, i) => {
    if (/^\s{0,3}(```|~~~)/.test(line)) {
      inFence = !inFence;
      return;
    }
    if (inFence) return;
    const m = BOLD_APPROACH.exec(line) ?? HEADING_APPROACH.exec(line);
    if (m) markers.push({ line: i, kind: 'approach', number: Number(m[1]), rawName: m[2] });
    else if (SUMMARY_HEADING.test(line) && markers.some((x) => x.kind === 'approach')) {
      markers.push({ line: i, kind: 'summary' });
    }
  });

  const approaches = markers.filter((m) => m.kind === 'approach');
  if (approaches.length < 2) return null;

  const firstLine = approaches[0].line;
  const summary = markers.find((m) => m.kind === 'summary');
  const tabs: ApproachTab[] = [];

  approaches.forEach((m, n) => {
    const nextMarker = markers.find((x) => x.line > m.line);
    const end = nextMarker ? nextMarker.line : lines.length;
    const rawName = (m.rawName ?? '').replace(/\*\*/g, '');
    const optimal = /\boptimal\b/i.test(rawName);
    const name = rawName
      .replace(/\(\s*optimal\s*\)/i, '')
      .replace(/\boptimal\b\s*$/i, '')
      .replace(/[\s—–:.-]+$/, '')
      .trim();
    tabs.push({
      id: `approach-${n + 1}`,
      kind: 'approach',
      label: `Approach ${m.number ?? n + 1}`,
      name,
      optimal,
      body: lines.slice(m.line, end).join('\n').trim(),
    });
  });

  if (summary) {
    tabs.push({
      id: 'summary',
      kind: 'summary',
      label: 'Summary',
      name: '',
      optimal: false,
      body: lines.slice(summary.line).join('\n').trim(),
    });
  }

  // Whatever comes before the first approach, minus a leading bold title ("**Approaches — Two Sum**"):
  // the section header already says it.
  const pre = lines.slice(0, firstLine);
  const firstContent = pre.findIndex((l) => l.trim() !== '');
  if (firstContent !== -1 && BOLD_ONLY.test(pre[firstContent])) pre.splice(firstContent, 1);
  return { preface: pre.join('\n').trim(), tabs };
}
