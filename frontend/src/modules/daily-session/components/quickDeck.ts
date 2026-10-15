/** Quick Practice flashcards: shape, JSON import parsing, and browser persistence for an uploaded deck. */

export interface QuickCard {
  question: string;
  answer: string;
  category: string;
  subType: string;
  difficulty: string; // '' = unspecified (badge hidden)
  title?: string;
  formula?: string;
  example?: string;
  remember?: string[];
  interviewTip?: string;
  tradeoffs?: string[];
  checklist?: string[];
  steps?: string[];
  /** Cards from an uploaded JSON deck. */
  imported?: boolean;
  sourceId?: string;
  date?: string;
  session?: string;
  raw?: any;
}

export const DECK_CATEGORY = 'My Deck';
const DECK_KEY = 'labninja.quickpractice.deck.v1';
export const MAX_IMPORT_BYTES = 2 * 1024 * 1024;
const MAX_CARDS = 2000;

export interface ParseResult {
  cards: QuickCard[];
  skipped: { index: number; reason: string }[];
  /** Human-readable name of the layout that was recognised, e.g. "CSV table". */
  format?: string;
  error?: string;
  date?: string;
  session?: string;
  deckFormat?: string;
}

const str = (v: unknown): string => {
  if (typeof v === 'string') return v.trim();
  if (typeof v === 'number' || typeof v === 'boolean') return String(v);
  if (Array.isArray(v)) {
    const items = v.map(str).filter(Boolean);
    return items.length > 1 ? items.map((x) => `- ${x}`).join('\n') : items[0] ?? '';
  }
  return '';
};

const formatFormula = (v: unknown): string | undefined => {
  if (!v) return undefined;
  if (typeof v === 'string') return v.trim() || undefined;
  if (typeof v === 'object' && !Array.isArray(v)) {
    return Object.entries(v as Record<string, unknown>)
      .map(([k, val]) => `${k}: ${str(val)}`)
      .join('\n');
  }
  return str(v) || undefined;
};

const norm = (k: string) => k.toLowerCase().replace(/[^a-z0-9]/g, '');
const ALIASES = {
  question: ['question', 'q', 'prompt', 'front', 'term', 'ask', 'query', 'problem', 'questiontext', 'cardfront', 'clue'],
  answer: ['answer', 'a', 'ans', 'back', 'solution', 'explanation', 'response', 'definition', 'reply', 'modelanswer', 'cardback', 'meaning'],
  topic: ['topic', 'category', 'subject', 'tag', 'tags', 'section', 'deck', 'subtype', 'group', 'chapter', 'area'],
  title: ['title', 'name', 'heading', 'label'],
  formula: ['formula', 'equation', 'formulas'],
  example: ['example', 'eg', 'sample', 'examples'],
  remember: ['remember', 'keypoints', 'keytakeaways', 'takeaways', 'notes', 'bullets', 'mnemonic', 'mnemonics', 'rememberthis', 'keyideas'],
  interviewTip: ['interviewtip', 'interviewtips', 'tip', 'tips', 'advice', 'protip', 'pro_tip', 'interviewertip', 'interviewguidance'],
  tradeoffs: ['tradeoffs', 'tradeoff', 'cons', 'drawbacks', 'disadvantages'],
  checklist: ['checklist', 'checklists', 'checks', 'todo', 'itemstocheck'],
  steps: ['steps', 'step', 'algorithm', 'procedure', 'process', 'workflow'],
  difficulty: ['difficulty', 'level'],
  id: ['id', 'number', 'no', 'index'],
} as const;
type Field = keyof typeof ALIASES;

/** First non-empty value among a record's keys that match any alias (case/punctuation-insensitive). */
function pick(rec: Record<string, unknown>, field: Field): unknown {
  const wanted = new Set<string>(ALIASES[field]);
  for (const [k, v] of Object.entries(rec)) {
    if (wanted.has(norm(k))) {
      if (field === 'formula' && typeof v === 'object' && v !== null) return v;
      if (Array.isArray(v) && v.length > 0) return v;
      if (str(v)) return v;
    }
  }
  return undefined;
}

const toList = (v: unknown): string[] => {
  if (Array.isArray(v)) return v.map(str).filter(Boolean);
  const s = str(v);
  if (!s) return [];
  return s.split(/\n+/).map((x) => x.replace(/^[-*•\d.]\s*/, '').trim()).filter(Boolean);
};

function makeCard(question: string, answer: string, extra: Partial<QuickCard> = {}): QuickCard {
  const diff = extra.difficulty ?? '';
  return {
    question,
    answer,
    category: DECK_CATEGORY,
    subType: extra.subType || 'General',
    difficulty: /^(easy|medium|hard)$/i.test(diff) ? diff[0].toUpperCase() + diff.slice(1).toLowerCase() : '',
    title: extra.title,
    formula: extra.formula,
    example: extra.example,
    remember: extra.remember?.length ? extra.remember : undefined,
    interviewTip: extra.interviewTip,
    tradeoffs: extra.tradeoffs?.length ? extra.tradeoffs : undefined,
    checklist: extra.checklist?.length ? extra.checklist : undefined,
    steps: extra.steps?.length ? extra.steps : undefined,
    imported: true,
    sourceId: extra.sourceId,
    date: extra.date,
    session: extra.session,
    raw: extra.raw,
  };
}

interface Collector {
  cards: QuickCard[];
  skipped: ParseResult['skipped'];
  n: number;
  usedAliases: boolean;
  meta: {
    date?: string;
    session?: string;
    format?: string;
  };
}

function fromRecord(rec: Record<string, unknown>, topicHint: string, c: Collector): boolean {
  const question = str(pick(rec, 'question'));
  if (!question) return false;
  c.n++;
  const answer = str(pick(rec, 'answer'));
  if (!answer) {
    c.skipped.push({ index: c.n, reason: `no answer found for "${question.slice(0, 40)}"` });
    return true;
  }
  const keys = Object.keys(rec);
  if (!keys.includes('question') || !keys.includes('answer')) c.usedAliases = true;
  c.cards.push(
    makeCard(question, answer, {
      subType: str(pick(rec, 'topic')) || topicHint,
      title: str(pick(rec, 'title')) || undefined,
      formula: formatFormula(pick(rec, 'formula')),
      example: str(pick(rec, 'example')) || undefined,
      remember: toList(pick(rec, 'remember')),
      interviewTip: str(pick(rec, 'interviewTip')) || undefined,
      tradeoffs: toList(pick(rec, 'tradeoffs')),
      checklist: toList(pick(rec, 'checklist')),
      steps: toList(pick(rec, 'steps')),
      difficulty: str(pick(rec, 'difficulty')),
      sourceId: str(pick(rec, 'id')) || undefined,
      date: c.meta.date,
      session: c.meta.session,
      raw: rec,
    }),
  );
  return true;
}

/** Walks any JSON shape and collects the question/answer pairs it can recognise. */
function collect(node: unknown, topicHint: string, c: Collector, depth = 0): void {
  if (depth > 6 || node == null) return;
  if (Array.isArray(node)) {
    // ["question", "answer"] pairs
    if (node.length === 2 && node.every((x) => typeof x === 'string') && depth > 0) {
      c.n++;
      c.usedAliases = true;
      c.cards.push(makeCard(node[0].trim(), node[1].trim(), { subType: topicHint }));
      return;
    }
    node.forEach((x) => collect(x, topicHint, c, depth + 1));
    return;
  }
  if (typeof node !== 'object') return;
  const rec = node as Record<string, unknown>;
  if (fromRecord(rec, topicHint, c)) return;
  const entries = Object.entries(rec);

  // Priority 1: Check known wrapper arrays/objects (e.g. { "questions": [...] }, { "cards": [...] })
  const wrappers = ['questions', 'cards', 'items', 'data', 'flashcards', 'deck', 'results', 'qa', 'qna', 'faq'];
  for (const [k, v] of entries) {
    if (wrappers.includes(norm(k)) && v && typeof v === 'object') {
      collect(v, topicHint, c, depth + 1);
      return;
    }
  }

  // Priority 2: Key-value map where key = question, value = answer: { "Question text?": "Answer text", ... }
  if (
    entries.length &&
    entries.every(([, v]) => typeof v === 'string' && str(v).length > 0) &&
    entries.some(([k]) => k.trim().length > 12 || /\?$/.test(k.trim()))
  ) {
    entries.forEach(([k, v]) => {
      c.n++;
      c.usedAliases = true;
      c.cards.push(makeCard(k.trim(), str(v), { subType: topicHint }));
    });
    return;
  }

  // Priority 3: Any other nested object
  for (const [k, v] of entries) {
    if (v && typeof v === 'object') collect(v, str(k) || topicHint, c, depth + 1);
  }
}

function parseJsonLike(text: string): { data: unknown; how: string } | null {
  const t = text.trim().replace(/^﻿/, '');
  try {
    return { data: JSON.parse(t), how: 'JSON' };
  } catch {
    /* try the looser layouts below */
  }
  try {
    return { data: JSON.parse(`[${t.replace(/,\s*$/, '')}]`), how: 'JSON (objects without an outer [ ])' };
  } catch {
    /* next */
  }
  const lines = t.split(/\r?\n/).filter((l) => l.trim());
  if (lines.length > 1 && lines.every((l) => l.trim().startsWith('{'))) {
    try {
      return { data: lines.map((l) => JSON.parse(l.trim().replace(/,\s*$/, ''))), how: 'JSON Lines' };
    } catch {
      /* next */
    }
  }
  try {
    const cleaned = t.replace(/^\s*\/\/.*$/gm, '').replace(/,(\s*[}\]])/g, '$1');
    return { data: JSON.parse(cleaned), how: 'JSON (trailing commas / comments ignored)' };
  } catch {
    return null;
  }
}

/** Minimal CSV/TSV reader: quoted fields, escaped quotes, embedded newlines. */
function parseDelimited(text: string, delim: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let q = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (q) {
      if (ch === '"' && text[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (ch === '"') q = false;
      else cell += ch;
    } else if (ch === '"' && cell === '') q = true;
    else if (ch === delim) {
      row.push(cell);
      cell = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(cell);
      cell = '';
      if (row.some((x) => x.trim())) rows.push(row);
      row = [];
    } else cell += ch;
  }
  row.push(cell);
  if (row.some((x) => x.trim())) rows.push(row);
  return rows;
}

function parseCsv(text: string, c: Collector): boolean {
  const first = text.split(/\r?\n/, 1)[0] ?? '';
  const [delim, count] = ['\t', ',', ';'].map((d) => [d, first.split(d).length] as const).sort((a, b) => b[1] - a[1])[0];
  if (count < 2) return false;
  const rows = parseDelimited(text, delim);
  if (rows.length < 1 || rows[0].length < 2) return false;
  const header = rows[0].map(norm);
  const hasHeader = header.some((h) => (ALIASES.question as readonly string[]).includes(h)) && header.some((h) => (ALIASES.answer as readonly string[]).includes(h));
  (hasHeader ? rows.slice(1) : rows).forEach((r) => {
    const rec: Record<string, unknown> = {};
    if (hasHeader) rows[0].forEach((h, i) => (rec[h.trim()] = r[i] ?? ''));
    else {
      rec.question = r[0];
      rec.answer = r[1];
      if (r[2]) rec.topic = r[2];
    }
    if (!fromRecord(rec, '', c)) {
      c.n++;
      c.skipped.push({ index: c.n, reason: 'row has no question' });
    }
  });
  return c.cards.length > 0;
}

/** "Q: ... A: ..." blocks (numbered or bold-marked), or "## Question" headings followed by the answer. */
function parseQaText(text: string, c: Collector): string | null {
  const Q = String.raw`(?:\*\*|__)?\s*(?:Q(?:uestion)?\s*\d*|Front)\s*(?:\*\*|__)?\s*[:.)\-]\s*(?:\*\*|__)?\s*`;
  const A = String.raw`(?:\*\*|__)?\s*(?:A(?:nswer)?\s*\d*|Back)\s*(?:\*\*|__)?\s*[:.)\-]\s*(?:\*\*|__)?\s*`;
  const re = new RegExp(String.raw`(?:^|\n)\s*${Q}([\s\S]+?)\n\s*${A}([\s\S]+?)(?=\n\s*${Q}|\s*$)`, 'gi');
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    c.n++;
    c.cards.push(makeCard(m[1].replace(/\s+/g, ' ').trim(), m[2].trim()));
  }
  if (c.cards.length) return 'Q: / A: text';

  const blocks = text.split(/\n(?=#{1,4}\s+\S)/).map((x) => x.trim()).filter((x) => /^#{1,4}\s/.test(x));
  if (blocks.length >= 2) {
    blocks.forEach((blk) => {
      const [head, ...rest] = blk.split('\n');
      const answer = rest.join('\n').trim();
      c.n++;
      if (answer) c.cards.push(makeCard(head.replace(/^#{1,4}\s+/, '').trim(), answer));
      else c.skipped.push({ index: c.n, reason: `heading "${head.slice(0, 30)}" has no text under it` });
    });
    if (c.cards.length) return 'Markdown headings (heading = question, text below = answer)';
  }
  return null;
}

/** Turns almost any pasted/uploaded text into cards: JSON of any shape, JSONL, CSV/TSV, Q/A text, markdown. */
export function parseDeckJson(text: string): ParseResult {
  const input = text.trim();
  if (!input) return { cards: [], skipped: [], error: 'Nothing to import yet.' };
  const c: Collector = {
    cards: [],
    skipped: [],
    n: 0,
    usedAliases: false,
    meta: {},
  };
  let format = '';

  const json = parseJsonLike(input);
  if (json) {
    if (typeof json.data === 'object' && json.data !== null && !Array.isArray(json.data)) {
      const root = json.data as Record<string, unknown>;
      if (root.date) c.meta.date = str(root.date);
      if (root.session) c.meta.session = str(root.session);
      if (root.format) c.meta.format = str(root.format);
    }
    collect(json.data, '', c);
    format = json.how + (c.usedAliases ? ', field names mapped automatically' : '');
  } else if (parseCsv(input, c)) {
    format = input.split(/\r?\n/, 1)[0].includes('\t') ? 'TSV table' : 'CSV table';
  } else {
    c.cards = [];
    c.skipped = [];
    c.n = 0;
    format = parseQaText(input, c) ?? '';
  }

  if (c.cards.length > MAX_CARDS) return { cards: [], skipped: [], error: `Too many cards (${c.cards.length}). The limit is ${MAX_CARDS}.` };
  if (!c.cards.length) {
    return {
      cards: [],
      skipped: c.skipped,
      error: json ? 'I could not find question/answer pairs in that JSON.' : 'I could not recognise that format automatically.',
    };
  }
  return {
    cards: c.cards,
    skipped: c.skipped,
    format,
    date: c.meta.date,
    session: c.meta.session,
    deckFormat: c.meta.format,
  };
}

/** Cards returned by the AI converter (/sessions/convert-flashcards) -> deck cards. */
export function cardsFromAi(items: any[]): QuickCard[] {
  return items.flatMap((it) =>
    it && typeof it.question === 'string' && typeof it.answer === 'string' && it.question.trim() && it.answer.trim()
      ? [
          makeCard(it.question.trim(), it.answer.trim(), {
            subType: str(it.topic),
            title: str(it.title) || undefined,
            formula: str(it.formula) || undefined,
            example: str(it.example) || undefined,
            remember: toList(it.remember),
            difficulty: str(it.difficulty),
            sourceId: str(it.id) || undefined,
          }),
        ]
      : [],
  );
}

export function loadDeck(): QuickCard[] {
  try {
    const raw = JSON.parse(localStorage.getItem(DECK_KEY) || '[]');
    return Array.isArray(raw) ? raw.filter((c) => c && typeof c.question === 'string' && typeof c.answer === 'string') : [];
  } catch {
    return [];
  }
}

/** Returns false if the browser refused to store it (e.g. quota). */
export function saveDeck(cards: QuickCard[]): boolean {
  try {
    localStorage.setItem(DECK_KEY, JSON.stringify(cards));
    return true;
  } catch {
    return false;
  }
}

/** Merge new cards into a deck, replacing ones with the same id (or, lacking an id, the same question). */
export function mergeDeck(existing: QuickCard[], incoming: QuickCard[]): QuickCard[] {
  const keyOf = (c: QuickCard) => (c.sourceId ? `id:${c.sourceId}` : `q:${c.question.toLowerCase()}`);
  const map = new Map(existing.map((c) => [keyOf(c), c] as const));
  incoming.forEach((c) => map.set(keyOf(c), c));
  return [...map.values()];
}
