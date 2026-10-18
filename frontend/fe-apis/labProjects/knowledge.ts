/**
 * fe-apis/labProjects/knowledge.ts
 *
 * Port of backend/modules/lab_projects/knowledge.py: what a lab is told about the selected project --
 * retrieval of saved sections and the prompt text. The tokenizer, the ranking and every prompt string
 * are copied verbatim, so both backends retrieve the same sections and ask the model the same thing --
 * keep the two in sync. Lengths and slices count code points and "whitespace" is Python's (text.ts), so
 * budgets cut at the same character even for emoji and exotic spaces.
 */

import { HttpError } from '../todo/_shared';
import { getProject, listSectionsWithContent, withLabProjectsDb } from './db';
import { collapseWhitespace, cpLength, cpSlice, pyRstrip, pyStrip } from './text';

// ── Retrieval ───────────────────────────────────────────────────────────────

export const MAX_KNOWLEDGE_SECTIONS = 4;
export const MAX_KNOWLEDGE_CHARS = 6000;
export const MAX_SECTION_CHARS = 1800;
// A section has to score at least this fraction of the best one to be worth the prompt space.
const RELATIVE_CUTOFF = 0.3;
// Words in a title count this many times in the section's term statistics.
const TITLE_WEIGHT = 3;
const K1 = 1.5;
const B = 0.75;

const TOKEN = /[\p{L}\p{N}]+/gu;
const STOPWORDS = new Set(
  (
    'a an and are as at be but by for from has have how if in into is it its of on or that the their then ' +
    'there these this to was we what when where which who why will with you your can do does not no so than ' +
    'too very'
  ).split(' ')
);

/** One saved section as the retrieval sees it (newest-first lists, like store.listSectionsWithContent). */
export interface KnowledgeSection {
  id: number;
  title: string;
  content?: string;
  sourceLabName: string;
  sourceGenerationId?: string | null;
  updatedAt: string;
}

/** A saved section chosen for the prompt. */
export interface KnowledgeItem {
  id: number;
  title: string;
  sourceLabName: string;
  updatedAt: string;
  text: string;
}

/** The part of a project the prompt text uses. */
export interface PromptProject {
  name: string;
  description?: string | null;
  context?: string | null;
}

/** Folds simple plurals together ('queries'/'query', 'trees'/'tree'); both sides of a match get the same treatment. */
function stem(token: string): string {
  const n = cpLength(token);
  if (n > 4 && token.endsWith('ies')) return token.slice(0, -3) + 'y';
  if (n > 3 && token.endsWith('s') && !token.endsWith('ss')) return token.slice(0, -1);
  return token;
}

export function tokenize(text: string): string[] {
  const out: string[] = [];
  for (const raw of (text || '').toLowerCase().match(TOKEN) ?? []) {
    if (cpLength(raw) < 2 || STOPWORDS.has(raw)) continue;
    out.push(stem(raw));
  }
  return out;
}

function normalise(text: string): string {
  return collapseWhitespace(pyStrip(text || '').toLowerCase());
}

function unique(items: Iterable<string>): string[] {
  return Array.from(new Set(items));
}

/**
 * [score, index] for every section that shares a term with the query, best first.
 *
 * `sections` must already be newest-first: a tie in score is broken by that order, so newer wins.
 * Scores are integers (BM25 x 1e6, rounded) so both backends order identically.
 */
export function rankSections(
  sections: { title: string; content?: string }[],
  query: string
): [number, number][] {
  const terms = unique(tokenize(query));
  if (!terms.length || !sections.length) return [];
  const docs = sections.map((s) => {
    const titleTokens = tokenize(s.title);
    const doc: string[] = [];
    for (let k = 0; k < TITLE_WEIGHT; k++) doc.push(...titleTokens);
    for (const tok of tokenize(s.content ?? '')) doc.push(tok);
    return doc;
  });
  const n = docs.length;
  const avgLen = docs.reduce((sum, d) => sum + d.length, 0) / n || 1.0;
  const docFreq = new Map<string, number>();
  for (const t of terms) docFreq.set(t, docs.filter((d) => d.includes(t)).length);
  const scored: [number, number][] = [];
  docs.forEach((doc, i) => {
    const counts = new Map<string, number>();
    for (const tok of doc) counts.set(tok, (counts.get(tok) ?? 0) + 1);
    let score = 0.0;
    for (const t of terms) {
      const f = counts.get(t) ?? 0;
      if (!f) continue;
      const df = docFreq.get(t)!;
      const idf = Math.log(1 + (n - df + 0.5) / (df + 0.5));
      score += (idf * (f * (K1 + 1))) / (f + K1 * (1 - B + (B * doc.length) / avgLen));
    }
    if (score > 0) scored.push([Math.floor(score * 1e6 + 0.5), i]);
  });
  scored.sort((a, b) => b[0] - a[0] || a[1] - b[1]);
  return scored;
}

/** Paragraph-sized pieces of a Markdown body; a blank line inside a code fence doesn't split it. */
function blocksOf(text: string): string[] {
  const blocks: string[] = [];
  let current: string[] = [];
  let inFence = false;
  for (const line of text.split('\n')) {
    if (pyStrip(line).startsWith('```')) inFence = !inFence;
    if (!inFence && !pyStrip(line)) {
      if (current.length) {
        blocks.push(current.join('\n'));
        current = [];
      }
      continue;
    }
    current.push(line);
  }
  if (current.length) blocks.push(current.join('\n'));
  return blocks;
}

const OMISSION = '\n[… the rest of this section is saved in the project]';

/**
 * The whole section if it fits `budget` characters, else its title block plus the passages that mention
 * the query terms, closed by a note that the rest was left out (the note counts toward the budget).
 */
export function excerptFor(content: string, terms: string[], budget: number): string {
  const text = pyStrip(content || '');
  if (cpLength(text) <= budget) return text;
  budget = Math.max(budget - cpLength(OMISSION), 1);
  const blocks = blocksOf(text);
  const wanted = new Set(terms);
  const ranked = blocks
    .map((b, i): [number, number] => {
      let hits = 0;
      for (const t of new Set(tokenize(b))) if (wanted.has(t)) hits++;
      return [hits, i];
    })
    .sort((a, b) => b[0] - a[0] || a[1] - b[1]);
  const chosen = new Set<number>([0]);
  let used = Math.min(cpLength(blocks[0]), budget);
  for (const [hits, i] of ranked) {
    if (hits === 0) break;
    if (chosen.has(i) || used + cpLength(blocks[i]) + 2 > budget) continue;
    chosen.add(i);
    used += cpLength(blocks[i]) + 2;
  }
  let out = Array.from(chosen)
    .sort((a, b) => a - b)
    .map((i) => blocks[i])
    .join('\n\n');
  if (cpLength(out) > budget) out = pyRstrip(cpSlice(out, 0, budget - 1)) + '…';
  return out + OMISSION;
}

/**
 * The saved sections worth putting in this generation's prompt, most relevant first.
 *
 * Left out on purpose: a section copied from the very page-section being (re)generated (its old text
 * would anchor the new one), one identical to the content being revised, and exact duplicates of
 * another section (the newest copy stays).
 */
export function selectKnowledge(
  sections: KnowledgeSection[],
  query: string,
  opts: { excludeGenerationPrefix?: string; existingContent?: string } = {}
): KnowledgeItem[] {
  const prefix = opts.excludeGenerationPrefix ?? '';
  const current = normalise(opts.existingContent ?? '');
  const seen = new Set<string>();
  const corpus: KnowledgeSection[] = [];
  for (const s of sections) {
    // newest first
    if (prefix && (s.sourceGenerationId || '').startsWith(prefix)) continue;
    const key = normalise(s.content ?? '');
    if (!key || key === current || seen.has(key)) continue;
    seen.add(key);
    corpus.push(s);
  }

  const ranked = rankSections(corpus, query);
  if (!ranked.length) return [];
  const cutoff = ranked[0][0] * RELATIVE_CUTOFF;
  const terms = unique(tokenize(query));
  const picked: KnowledgeItem[] = [];
  let remaining = MAX_KNOWLEDGE_CHARS;
  for (const [score, i] of ranked.slice(0, MAX_KNOWLEDGE_SECTIONS)) {
    if (score < cutoff || remaining < 300) break;
    const s = corpus[i];
    const text = excerptFor(s.content ?? '', terms, Math.min(MAX_SECTION_CHARS, remaining));
    remaining -= cpLength(text);
    picked.push({
      id: s.id,
      title: s.title,
      sourceLabName: s.sourceLabName,
      updatedAt: s.updatedAt,
      text,
    });
  }
  return picked;
}

/**
 * The user's active project and the saved knowledge relevant to `query`, or an HTTP error.
 *
 * 404 for a project that doesn't exist *for this user* (the same answer for someone else's), 409 for an
 * archived one. Synchronous, like every fe-apis db function.
 */
export function loadProjectContext(
  userId: number,
  projectId: number,
  opts: { query: string; excludeGenerationPrefix?: string; existingContent?: string }
): { project: PromptProject & { id: number }; knowledge: KnowledgeItem[] } {
  return withLabProjectsDb(() => {
    const project = getProject(userId, projectId);
    if (!project) throw new HttpError(404, 'Project not found.');
    if (project.status !== 'active')
      throw new HttpError(409, 'This project is archived. Restore it or pick another project.');
    const sections = listSectionsWithContent(userId, projectId);
    const knowledge = selectKnowledge(sections, opts.query, {
      excludeGenerationPrefix: opts.excludeGenerationPrefix,
      existingContent: opts.existingContent,
    });
    return { project, knowledge };
  });
}

/** Identifies one lab page-section (and, with `generatedAt`, one generation of it). */
export function generationRef(
  lab: string,
  topicId: string,
  subtopicId: string,
  sectionId: string,
  generatedAt?: string | null
): string {
  const base = `${lab}|${topicId}|${subtopicId}|${sectionId}@`;
  return generatedAt ? base + generatedAt : base;
}

// ── Prompt text ─────────────────────────────────────────────────────────────

function projectBlock(project: PromptProject): string {
  const lines = [`Project: ${project.name}`];
  const description = pyStrip(project.description || '');
  if (description) lines.push(`Project description: ${description}`);
  let block = lines.join('\n');
  const context = pyStrip(project.context || '');
  if (context) {
    block +=
      '\n\nProject context (written by the learner; the authoritative source on this project):' +
      `\n"""\n${context}\n"""`;
  } else {
    block += '\n\nThe learner has not written any further project context yet.';
  }
  return block;
}

function knowledgeBlock(knowledge: KnowledgeItem[]): string {
  if (!knowledge.length) return '';
  const entries = knowledge.map(
    (k, i) =>
      `[${i + 1}] "${k.title}" — from ${k.sourceLabName}, updated ${cpSlice(String(k.updatedAt), 0, 10)}\n"""\n${k.text}\n"""`
  );
  return (
    'Saved project knowledge (sections the learner chose to keep from their labs, most relevant first, ' +
    'each with its title, source lab and last-updated date):\n' +
    entries.join('\n')
  );
}

function contextBlocks(
  project: PromptProject | null | undefined,
  knowledge: KnowledgeItem[]
): string {
  if (!project) return '';
  let out = '\n\n' + projectBlock(project);
  const kb = knowledgeBlock(knowledge);
  if (kb) out += '\n\n' + kb;
  return out;
}

const NO_INVENTION =
  '- Use only facts that appear in the project description, the project context or the saved knowledge. ' +
  'Never invent project requirements, datasets, numbers or decisions.';
const CONFLICTS =
  '- Saved knowledge is background, not a script: refer to it by its title instead of repeating it. If saved ' +
  'sections contradict each other or the project context, follow the project context first, then the newer ' +
  'section, and mention the contradiction in one line instead of silently picking a side.';

/** [role suffix, project + knowledge blocks, project rules] for a lab section prompt; all '' without a project. */
export function sectionPromptParts(
  project: PromptProject | null | undefined,
  knowledge: KnowledgeItem[]
): [string, string, string] {
  if (!project) return ['', '', ''];
  const rules =
    `\n\nProject rules (this section is written FOR the project “${project.name}”, not as a generic lesson):\n` +
    '- Let the project shape the content itself: take the examples, code, data, constraints and trade-offs from ' +
    "the project's own domain, and tie each major part to the project's real situation. Do not paste the project " +
    'description back, and do not write a generic lesson with a project footnote.\n' +
    "- Explain how this section's concepts, tools and techniques apply to the project, and what the learner " +
    'should do or decide next because of them.\n' +
    `${NO_INVENTION} If something you need is missing, say so under a bold **Assumptions & open questions** ` +
    'heading (at most 3 bullets) and state the assumption you made; leave that heading out when nothing is missing.\n' +
    `${CONFLICTS}\n` +
    `- End the section with a bold line **Applying this to ${project.name}** followed by 3-5 concrete bullets. ` +
    'This may add up to about 200 words beyond the usual length.';
  return [
    ', for a learner who is applying it to a real project',
    contextBlocks(project, knowledge),
    rules,
  ];
}

/** [project + knowledge blocks, project rules] for a quiz prompt; both '' without a project. */
export function quizPromptParts(
  project: PromptProject | null | undefined,
  knowledge: KnowledgeItem[]
): [string, string] {
  if (!project) return ['', ''];
  const rules =
    `\n\nProject rules (the learner is applying this topic to the project “${project.name}”):\n` +
    "- Make at least half of the questions test how this topic applies to the project's situation, using only " +
    'what the project description, project context and saved knowledge say. Keep the rest about the topic itself.\n' +
    '- Each such question must still stand alone: state the relevant project fact inside the question.\n' +
    `${NO_INVENTION} If a project fact you need is missing, ask about the topic instead, or state the assumption ` +
    "in the question's explanation.\n" +
    `${CONFLICTS}`;
  return [contextBlocks(project, knowledge), rules];
}
