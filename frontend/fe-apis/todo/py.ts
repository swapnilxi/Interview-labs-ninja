/**
 * fe-apis/todo/py.ts
 *
 * Python-compatible formatting, so AI prompts and stored JSON come out byte-identical to the
 * FastAPI backend (in local dev both backends can read and write the same SQLite file).
 */

/** `json.dumps`'s ensure_ascii: anything outside printable ASCII becomes `\uXXXX`. */
function ensureAscii(json: string): string {
  return json.replace(/[\u007f-￿]/g, (c) => `\\u${c.charCodeAt(0).toString(16).padStart(4, '0')}`);
}

function dumpsCompact(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(dumpsCompact).join(', ')}]`;
  if (value && typeof value === 'object') {
    const entries = Object.entries(value).filter(([, v]) => v !== undefined);
    return `{${entries.map(([k, v]) => `${ensureAscii(JSON.stringify(k))}: ${dumpsCompact(v)}`).join(', ')}}`;
  }
  return ensureAscii(JSON.stringify(value ?? null));
}

/** `json.dumps(value)` (`', '` / `': '` separators), or `json.dumps(value, indent=n)` when indent is given. */
export function pyJsonDumps(value: unknown, indent?: number): string {
  if (indent !== undefined) return ensureAscii(JSON.stringify(value, null, indent));
  return dumpsCompact(value);
}

/** `str(float)` — Pydantic float fields print as `4.0`, not `4`. */
export function pyFloat(n: number): string {
  return Number.isInteger(n) && Math.abs(n) < 1e16 ? `${n}.0` : String(n);
}

/** f-string / `str()` of a value that may be None or a bool. */
export function pyStr(value: unknown): string {
  if (value === null || value === undefined) return 'None';
  if (typeof value === 'boolean') return value ? 'True' : 'False';
  return String(value);
}

/** `str(exc)` for the "AI … failed: {exc}" details. */
export function errMsg(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
