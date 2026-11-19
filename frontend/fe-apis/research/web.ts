/**
 * fe-apis/research/web.ts
 *
 * Twin of backend/modules/research/web.py: read-only web research (search, fetch a few pages, return their text).
 * Never logs in, submits forms or runs scripts. Every request is guarded against SSRF (http(s) only, public addresses
 * only, every redirect re-checked, size and time capped). Limits, cleaning and parsing must match the Python module.
 */

import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import http from 'node:http';
import https from 'node:https';

const USER_AGENT = 'Mozilla/5.0 (compatible; LabNinjaResearch/1.0; read-only)';
export const MAX_QUERY_CHARS = 200;
export const MAX_RESULTS = 6;
export const MAX_FETCH = 4;
const MAX_PAGE_BYTES = 400_000;
const PAGE_TEXT_CHARS = 1800;
const SNIPPET_CHARS = 300;
const FETCH_TIMEOUT_MS = 8000;
const MAX_REDIRECTS = 3;
const SEARCH_URL = 'https://html.duckduckgo.com/html/';
const LITE_SEARCH_URL = 'https://lite.duckduckgo.com/lite/';
// DuckDuckGo sometimes answers a burst of queries with a results-free throttling page (HTTP 202) for the form POST.
// A plain GET is no way round it: checked 2026-11-19, a GET of either endpoint gets the bot-check page (HTTP 202,
// "anomaly") while the form POST of both works. So the retry, after a pause, is a form POST to the lite endpoint (its
// own markup, own counter). Answers are remembered for a while so the same query isn't asked twice.
// Twin: SEARCH_RETRY_S / SEARCH_CACHE_* in web.py.
const SEARCH_RETRY_MS = 800;
const SEARCH_CACHE_TTL_MS = 15 * 60_000;
const SEARCH_CACHE_MAX = 100;
const searchCache = new Map<string, { at: number; results: Omit<ResearchResult, 'text'>[] }>();

export class UnsafeUrlError extends Error {}

export interface ResearchResult {
  title: string;
  url: string;
  snippet: string;
  text: string;
}

function publicV4(ip: string): boolean {
  const [a, b] = ip.split('.').map(Number);
  if (a === 0 || a === 10 || a === 127 || a >= 224) return false; // this-net, private, loopback, multicast/reserved
  if (a === 169 && b === 254) return false; // link-local (cloud metadata)
  if (a === 172 && b >= 16 && b <= 31) return false;
  if (a === 192 && b === 168) return false;
  if (a === 100 && b >= 64 && b <= 127) return false; // carrier-grade NAT
  if (a === 192 && b === 0) return false; // IETF / documentation blocks
  if (a === 198 && (b === 18 || b === 19)) return false; // benchmarking
  return true;
}

function publicIp(addr: string): boolean {
  const ip = addr.split('%')[0].toLowerCase();
  if (isIP(ip) === 4) return publicV4(ip);
  if (isIP(ip) !== 6) return false;
  const h = expandV6(ip);
  if (!h) return false;
  // IPv4-mapped (::ffff:a.b.c.d, which URL parsing rewrites as ::ffff:hhhh:hhhh): judged by the embedded IPv4 address.
  if (h.slice(0, 5).every((x) => x === 0) && h[5] === 0xffff) return publicV4(`${h[6] >> 8}.${h[6] & 255}.${h[7] >> 8}.${h[7] & 255}`);
  // Only global unicast (2000::/3) is a public website; this drops ::, ::1, unique-local, link-local, multicast,
  // IPv4-compatible and NAT64. Then the global ranges that embed or tunnel IPv4/documentation space.
  if ((h[0] & 0xe000) !== 0x2000) return false;
  if (h[0] === 0x2002) return false; // 6to4 (embeds an IPv4 address)
  if (h[0] === 0x2001 && (h[1] === 0 || h[1] === 0xdb8)) return false; // Teredo, documentation
  return true;
}

/** The eight 16-bit groups of an IPv6 address (handles '::' and a trailing dotted IPv4), or null. */
function expandV6(ip: string): number[] | null {
  let s = ip;
  const dotted = s.match(/(\d+\.\d+\.\d+\.\d+)$/);
  if (dotted) {
    const p = dotted[1].split('.').map(Number);
    s = s.slice(0, -dotted[1].length) + ((p[0] << 8) | p[1]).toString(16) + ':' + ((p[2] << 8) | p[3]).toString(16);
  }
  const [head, tail] = s.split('::');
  const a = head ? head.split(':') : [];
  const b = tail !== undefined && tail ? tail.split(':') : [];
  const fill = tail === undefined ? 0 : 8 - a.length - b.length;
  if (fill < 0 || (tail === undefined && a.length !== 8)) return null;
  const groups = [...a, ...Array(fill).fill('0'), ...b].map((x) => parseInt(x, 16));
  return groups.length === 8 && groups.every((x) => Number.isInteger(x) && x >= 0 && x <= 0xffff) ? groups : null;
}

export async function checkPublicUrl(url: string): Promise<URL> {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    throw new UnsafeUrlError('Only http(s) links can be read.');
  }
  if ((u.protocol !== 'http:' && u.protocol !== 'https:') || !u.hostname) throw new UnsafeUrlError('Only http(s) links can be read.');
  if (u.username || u.password) throw new UnsafeUrlError("Links with credentials can't be read.");
  const host = u.hostname.replace(/^\[|\]$/g, '');
  let addrs: string[];
  try {
    addrs = isIP(host) ? [host] : (await lookup(host, { all: true })).map((a) => a.address);
  } catch {
    throw new UnsafeUrlError(`Can't resolve ${host}.`);
  }
  if (!addrs.length || !addrs.every(publicIp)) throw new UnsafeUrlError("That address isn't a public website.");
  return u;
}

type RawResponse = { status: number; location: string | null; contentType: string; body: Uint8Array };

/**
 * One request with node:http(s), no redirects followed, the body capped at MAX_PAGE_BYTES. Not `fetch`: checked
 * 2026-11-19, DuckDuckGo answers every request from Node's fetch (undici) with its bot-check page (HTTP 202, no
 * results), whatever the headers, while the same request through node:https (and Python's urllib) gets the results.
 * No Accept-Encoding is sent, so the body comes back uncompressed, as with urllib.
 */
function rawRequest(url: string, form: string | undefined): Promise<RawResponse> {
  const u = new URL(url);
  const client = u.protocol === 'https:' ? https : http;
  return new Promise<RawResponse>((resolve, reject) => {
    const req = client.request(
      u,
      {
        method: form !== undefined ? 'POST' : 'GET',
        headers: {
          'User-Agent': USER_AGENT,
          Accept: 'text/html,*/*;q=0.5',
          ...(form !== undefined
            ? { 'Content-Type': 'application/x-www-form-urlencoded', 'Content-Length': Buffer.byteLength(form) }
            : {}),
        },
      },
      (res) => {
        const chunks: Buffer[] = [];
        let total = 0;
        const done = () => {
          clearTimeout(timer);
          const header = res.headers['content-type'];
          resolve({
            status: res.statusCode ?? 0,
            location: typeof res.headers.location === 'string' ? res.headers.location : null,
            contentType: Array.isArray(header) ? header.join(', ') : header ?? '',
            body: new Uint8Array(Buffer.concat(chunks).subarray(0, MAX_PAGE_BYTES)),
          });
        };
        res.on('data', (chunk: Buffer) => {
          chunks.push(chunk);
          total += chunk.length;
          if (total >= MAX_PAGE_BYTES) {
            res.destroy();
            done();
          }
        });
        res.on('end', done);
        res.on('error', (err) => {
          clearTimeout(timer);
          reject(err);
        });
      }
    );
    const timer = setTimeout(() => req.destroy(new Error('timed out')), FETCH_TIMEOUT_MS);
    req.on('error', (err) => {
      clearTimeout(timer);
      reject(err);
    });
    req.end(form);
  });
}

/** GET (or form POST) `url`, following up to MAX_REDIRECTS redirects through the public-host check. */
export async function safeGet(url: string, form?: string): Promise<{ url: string; contentType: string; body: Uint8Array }> {
  let current = url;
  let body = form;
  for (let hop = 0; hop <= MAX_REDIRECTS; hop += 1) {
    await checkPublicUrl(current);
    const res = await rawRequest(current, body);
    const location = [301, 302, 303, 307, 308].includes(res.status) ? res.location : null;
    if (location) {
      current = new URL(location, current).toString();
      body = undefined;
      continue;
    }
    if (res.status < 200 || res.status > 299) throw new Error(`HTTP ${res.status}`);
    return { url: current, contentType: res.contentType, body: res.body };
  }
  throw new UnsafeUrlError('Too many redirects.');
}

// ── Text ────────────────────────────────────────────────────────────────────

const DROP_RE = /<(script|style|noscript|svg|nav|header|footer|form|aside)\b[\s\S]*?<\/\1\s*>/gi;
const TAG_RE = /<[^>]+>/g;
const TITLE_RE = /<title[^>]*>([\s\S]*?)<\/title>/i;

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', '#39': "'", '#x27': "'" };
function unescapeHtml(s: string): string {
  return s.replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (m, e: string) => {
    if (e[0] === '#') {
      const code = e[1].toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(code) && code > 0 && code < 0x110000 ? String.fromCodePoint(code) : m;
    }
    return ENTITIES[e.toLowerCase()] ?? m;
  });
}
const squash = (s: string) => unescapeHtml(s).replace(/\s+/g, ' ').trim();
const clip = (s: string, n: number) => Array.from(s).slice(0, n).join('');

export function pageText(raw: Uint8Array, contentType: string, limit = PAGE_TEXT_CHARS): { title: string; text: string } {
  if (contentType && !/html|text/i.test(contentType)) return { title: '', text: '' };
  const doc = new TextDecoder('utf-8', { fatal: false }).decode(raw);
  const t = doc.match(TITLE_RE);
  const title = t ? clip(squash(t[1].replace(TAG_RE, ' ')), 140) : '';
  const body = doc.replace(DROP_RE, ' ').replace(TAG_RE, ' ');
  return { title, text: clip(squash(body), limit).trim() };
}

// ── Search ──────────────────────────────────────────────────────────────────

const RESULT_RE = /<a[^>]+class="result__a"[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/g;
const SNIPPET_RE = /class="result__snippet"[^>]*>([\s\S]*?)<\/a>/g;
// lite.duckduckgo.com: <a rel="nofollow" href="URL" class='result-link'>Title</a> ... <td class='result-snippet'>..</td>
const LITE_RESULT_RE = /<a\b([^>]*class=['"]result-link['"][^>]*)>([\s\S]*?)<\/a>/g;
const LITE_HREF_RE = /href="([^"]+)"/;
const LITE_SNIPPET_RE = /class=['"]result-snippet['"][^>]*>([\s\S]*?)<\/td>/g;

type RawHit = { href: string; title: string; snippet: string };

/** [{href, title, snippet}] from a results page; `lite` picks the lite endpoint's markup. */
function parseResults(doc: string, lite: boolean): RawHit[] {
  if (lite) {
    const snippets = [...doc.matchAll(LITE_SNIPPET_RE)].map((m) => m[1]);
    const hits: RawHit[] = [];
    [...doc.matchAll(LITE_RESULT_RE)].forEach((m, i) => {
      const href = m[1].match(LITE_HREF_RE);
      if (href) hits.push({ href: href[1], title: m[2], snippet: snippets[i] ?? '' });
    });
    return hits;
  }
  const snippets = [...doc.matchAll(SNIPPET_RE)].map((m) => m[1]);
  return [...doc.matchAll(RESULT_RE)].map((m, i) => ({ href: m[1], title: m[2], snippet: snippets[i] ?? '' }));
}

function realUrl(href: string): string {
  let h = unescapeHtml(href);
  if (h.startsWith('//')) h = `https:${h}`;
  try {
    return new URL(h).searchParams.get('uddg') ?? h;
  } catch {
    return h;
  }
}

export async function webSearch(query: string, maxResults = MAX_RESULTS): Promise<Omit<ResearchResult, 'text'>[]> {
  const q = clip(squash(query), MAX_QUERY_CHARS);
  if (!q) return [];
  const cacheKey = `${q.toLowerCase()}|${maxResults}`;
  const hit = searchCache.get(cacheKey);
  if (hit && Date.now() - hit.at < SEARCH_CACHE_TTL_MS) return hit.results.map((r) => ({ ...r }));
  let hits: RawHit[] = [];
  for (let attempt = 0; attempt < 2; attempt += 1) {
    let doc = '';
    try {
      const form = new URLSearchParams({ q }).toString();
      const { body } = await safeGet(attempt === 0 ? SEARCH_URL : LITE_SEARCH_URL, form);
      doc = new TextDecoder('utf-8', { fatal: false }).decode(body);
    } catch {
      doc = '';
    }
    hits = parseResults(doc, attempt === 1);
    if (hits.length) break;
    if (attempt === 0) await new Promise((resolve) => setTimeout(resolve, SEARCH_RETRY_MS));
  }
  const out: Omit<ResearchResult, 'text'>[] = [];
  const seen = new Set<string>();
  hits.forEach((m) => {
    if (out.length >= maxResults) return;
    const url = realUrl(m.href);
    let host = '';
    try {
      host = new URL(url).host;
    } catch {
      return;
    }
    if (!url.startsWith('http') || host.includes('duckduckgo.com') || seen.has(url)) return;
    seen.add(url);
    out.push({
      title: clip(squash(m.title.replace(TAG_RE, ' ')), 140),
      url,
      snippet: clip(squash(m.snippet.replace(TAG_RE, ' ')), SNIPPET_CHARS),
    });
  });
  if (out.length) {
    // An empty answer is never cached: it is usually the throttling page.
    if (searchCache.size >= SEARCH_CACHE_MAX) searchCache.delete(searchCache.keys().next().value as string);
    searchCache.set(cacheKey, { at: Date.now(), results: out.map((r) => ({ ...r })) });
  }
  return out;
}

/** Searches, then reads the text of the top `fetch` pages (a page that fails keeps its snippet). */
export async function research(query: string, fetchCount = 3, maxResults = MAX_RESULTS): Promise<{ query: string; results: ResearchResult[] }> {
  const n = Math.min(Math.max(Math.trunc(fetchCount) || 0, 0), MAX_FETCH);
  const found = await webSearch(query, maxResults);
  const results: ResearchResult[] = await Promise.all(
    found.map(async (r, i): Promise<ResearchResult> => {
      if (i >= n) return { ...r, text: '' };
      try {
        const page = await safeGet(r.url);
        const { title, text } = pageText(page.body, page.contentType);
        return { ...r, title: r.title || title, text };
      } catch {
        return { ...r, text: '' };
      }
    })
  );
  return { query: clip(squash(query), MAX_QUERY_CHARS), results };
}
