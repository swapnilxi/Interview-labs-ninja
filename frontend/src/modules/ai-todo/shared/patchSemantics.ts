/**
 * Guard against an older backend. Both backends now clear a nullable column when a PATCH sends `null`
 * for it (and still ignore `null` for required ones — see `patch_updates` in
 * backend/modules/ai_todo/shared/patch.py and its fe-apis twin), but a server deployed before that
 * change treats `null` as "leave unchanged": emptying a field then comes back with the old value, and
 * must not be reported as "Saved". Text fields are cleared with '' (stored as-is, works on every
 * version); dates have to be cleared with `null`. See ai-to-do.md, item 0.9.
 *
 * Returns the (human-readable) names of the fields that were sent as `null` but came back set.
 */
export function fieldsServerKept(
  sent: Record<string, any>,
  received: Record<string, any>
): string[] {
  return Object.entries(sent)
    .filter(([key, value]) => value === null && received[key] != null && received[key] !== '')
    .map(([key]) => key.replace(/_/g, ' '));
}
