/**
 * fe-apis/labProjects/text.ts
 *
 * Python's string behaviour, for the places where the Python module (backend/modules/lab_projects) and
 * this twin must agree to the character: `len()` counts code points (JS `.length` counts UTF-16 units, so
 * an emoji is 2) and `str.strip()` / `\s` use Python's idea of whitespace (it includes U+001C-U+001F and
 * U+0085 but not U+FEFF; JS is the other way round). Prompt budgets, excerpts and length limits all go
 * through these so both backends cut at the same place.
 */

/** The characters Python's `str.isspace()` accepts, as the inside of a regex character class. */
const PY_WS =
  '\\t-\\r\\x1c-\\x1f \\x85\\xa0\\u1680\\u2000-\\u200a\\u2028\\u2029\\u202f\\u205f\\u3000';

const LEADING = new RegExp(`^[${PY_WS}]+`);
const TRAILING = new RegExp(`[${PY_WS}]+$`);
const RUN = new RegExp(`[${PY_WS}]+`, 'g');

/** `str.strip()` */
export function pyStrip(s: string): string {
  return s.replace(LEADING, '').replace(TRAILING, '');
}

/** `str.rstrip()` */
export function pyRstrip(s: string): string {
  return s.replace(TRAILING, '');
}

/** `re.sub(r"\s+", " ", s)` */
export function collapseWhitespace(s: string): string {
  return s.replace(RUN, ' ');
}

/** `len(s)`: code points. */
export function cpLength(s: string): number {
  let n = 0;
  for (const _ of s) n++;
  return n;
}

/** `s[start:end]` by code points (non-negative bounds). */
export function cpSlice(s: string, start: number, end?: number): string {
  return Array.from(s).slice(start, end).join('');
}
