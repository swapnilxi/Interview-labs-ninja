/**
 * fe-apis/dailySession/dedup.ts
 *
 * Twin of backend/modules/daily_session/dedup.py: question fingerprints and duplicate detection for the Question
 * Bank. It must produce the same hashes and the same verdicts as the Python module, so change both together.
 *
 *   fingerprint  SHA-256 of the normalised text (lower-case, punctuation/spacing stripped), first 32 hex chars.
 *   simhash      64-bit SimHash over word uni+bi-grams (MD5 per feature), stored as a signed SQLite INTEGER.
 *
 * QuestionIndex: an in-memory inverted index of stemmed content words (candidate lookup, so a check never scans the
 * whole bank) followed by Jaccard / containment / SimHash scoring. It also answers "what does the bank already
 * cover for this topic?" for the generator prompt. Unlike Python it never reads the stored hash columns: it
 * recomputes them from the text (node:sqlite returns INTEGERs as JS numbers, which cannot hold 64 bits).
 */

import { createHash } from 'crypto';

const STOPWORDS = new Set([
  'the', 'a', 'an', 'of', 'to', 'and', 'in', 'on', 'for', 'is', 'are', 'was', 'were', 'be', 'been', 'by', 'or',
  'how', 'do', 'does', 'did', 'you', 'your', 'would', 'what', 'why', 'with', 'that', 'this', 'it', 'its', 'as',
  'when', 'from', 'at', 'can', 'could', 'should', 'will', 'which', 'who', 'about', 'into', 'than', 'then',
  'they', 'their', 'them', 'there', 'where', 'while', 'if', 'so', 'we', 'our', 'me', 'my', 'i', 'tell', 'explain',
  'describe', 'design', 'walk', 'through', 'between', 'using', 'use', 'used', 'need', 'needs', 'not', 'no',
  'has', 'have', 'had', 'per', 'each', 'any', 'all', 'more', 'most', 'some', 'such', 'also', 'both', 'one',
]);

const SUFFIXES = ['ization', 'ations', 'ation', 'ingly', 'ments', 'ment', 'ings', 'ing', 'ies', 'ied', 'ers', 'er',
  'ed', 'es', 'ly', 's'];

const words = (text: string): string[] => (text || '').toLowerCase().match(/[a-z0-9]+/g) ?? [];

export function normalize(text: string): string {
  return words(text).join(' ');
}

function stem(word: string): string {
  for (const suf of SUFFIXES) {
    if (word.endsWith(suf) && word.length - suf.length >= 3) {
      return word.slice(0, -suf.length) + (suf === 'ies' || suf === 'ied' ? 'y' : '');
    }
  }
  return word;
}

export function contentStems(text: string): Set<string> {
  return new Set(words(text).filter((w) => !STOPWORDS.has(w) && w.length > 1).map(stem));
}

export function fingerprint(text: string): string {
  return createHash('sha256').update(normalize(text), 'utf8').digest('hex').slice(0, 32);
}

export function simhash(text: string): bigint {
  const ws = words(text).filter((w) => !STOPWORDS.has(w));
  const feats = [...ws, ...ws.slice(1).map((b, i) => `${ws[i]} ${b}`)];
  if (!feats.length) return BigInt(0);
  const acc = new Array<number>(64).fill(0);
  for (const f of feats) {
    const h = createHash('md5').update(f, 'utf8').digest().readBigUInt64BE(0);
    for (let bit = 0; bit < 64; bit++) acc[bit] += (h >> BigInt(bit)) & BigInt(1) ? 1 : -1;
  }
  let out = BigInt(0);
  for (let bit = 0; bit < 64; bit++) if (acc[bit] > 0) out |= BigInt(1) << BigInt(bit);
  return out;
}

/** SQLite INTEGER is signed 64-bit (Python: _to_signed). */
export function toSigned(v: bigint): bigint {
  return v >= BigInt(1) << BigInt(63) ? v - (BigInt(1) << BigInt(64)) : v;
}

export function hamming(a: bigint, b: bigint): number {
  let x = a ^ b;
  let n = 0;
  while (x) {
    n += Number(x & BigInt(1));
    x >>= BigInt(1);
  }
  return n;
}

/** [fingerprint, signed simhash] ready to store in the questions table (Python: hashes_for). */
export function hashesFor(text: string): [string, bigint] {
  return [fingerprint(text), toSigned(simhash(text))];
}

export class QuestionIndex {
  // Same thresholds as Python: 0.5 Jaccard of stemmed content words, or one question almost fully contained in a
  // longer one, or a SimHash within 4 bits with at least some shared vocabulary.
  static JACCARD_THRESHOLD = 0.5;
  static CONTAINMENT_THRESHOLD = 0.8;
  static SIMHASH_BITS = 4;

  texts: string[] = [];
  private stems: Set<string>[] = [];
  private sims: bigint[] = [];
  private fps = new Set<string>();
  private inv = new Map<string, number[]>();

  /** Build from the bank's question texts in id order; exact repeats in the bank add nothing (Python: load). */
  static fromTexts(texts: Iterable<string | null | undefined>): QuestionIndex {
    const idx = new QuestionIndex();
    for (const text of texts) {
      if (!text) continue;
      const fp = fingerprint(text);
      if (idx.fps.has(fp)) continue;
      idx.addHashed(text, fp, simhash(text));
    }
    return idx;
  }

  private addHashed(text: string, fp: string, sim: bigint): void {
    const pos = this.texts.length;
    const stems = contentStems(text);
    this.texts.push(text);
    this.stems.push(stems);
    this.sims.push(sim);
    this.fps.add(fp);
    for (const s of stems) {
      const list = this.inv.get(s);
      if (list) list.push(pos);
      else this.inv.set(s, [pos]);
    }
  }

  add(text: string): void {
    this.addHashed(text, fingerprint(text), simhash(text));
  }

  get size(): number {
    return this.texts.length;
  }

  /** [reason, matching existing question] or null when the text is new. */
  findDuplicate(text: string): [string, string] | null {
    if (this.fps.has(fingerprint(text))) return ['exact', text];
    const stems = contentStems(text);
    if (!stems.size) return null;
    const sim = simhash(text);
    // candidates: any existing question sharing at least 2 content words (or 1 if the text is tiny)
    const hits = new Map<number, number>();
    for (const s of stems) for (const pos of this.inv.get(s) ?? []) hits.set(pos, (hits.get(pos) ?? 0) + 1);
    const need = stems.size >= 3 ? 2 : 1;
    for (const [pos, shared] of hits) {
      if (shared < need) continue;
      const other = this.stems[pos];
      const union = new Set([...stems, ...other]).size;
      const jac = union ? shared / union : 0;
      const small = Math.min(stems.size, other.size);
      if (jac >= QuestionIndex.JACCARD_THRESHOLD) return ['paraphrase', this.texts[pos]];
      if (small >= 4 && shared / small >= QuestionIndex.CONTAINMENT_THRESHOLD) return ['contained', this.texts[pos]];
      if (jac >= 0.3 && hamming(sim, this.sims[pos]) <= QuestionIndex.SIMHASH_BITS) return ['near-hash', this.texts[pos]];
    }
    return null;
  }

  isDuplicate(text: string): boolean {
    return this.findDuplicate(text) !== null;
  }

  /** The k existing questions sharing the most content words with `query` (ties: newest first). */
  related(query: string, k = 25): string[] {
    const q = contentStems(query);
    if (!q.size) return [];
    const score = new Map<number, number>();
    for (const s of q) for (const pos of this.inv.get(s) ?? []) score.set(pos, (score.get(pos) ?? 0) + 1);
    return [...score.entries()]
      .sort((a, b) => b[1] - a[1] || b[0] - a[0])
      .slice(0, k)
      .map(([pos]) => this.texts[pos]);
  }

  /** How many bank questions touch every content word of `phrase`: lower means less-explored ground. */
  coverage(phrase: string): number {
    const q = [...contentStems(phrase)];
    if (!q.length) return 0;
    const sets = q.map((s) => new Set(this.inv.get(s) ?? []));
    let common = sets[0];
    for (const set of sets.slice(1)) common = new Set([...common].filter((p) => set.has(p)));
    return common.size;
  }
}
