/**
 * fe-apis/dsaLab/text.ts
 *
 * Twin of `has_lone_surrogate` / `printable` in backend/modules/dsa_lab/week_plan.py. A JSON string such as
 * "\ud800" is an unpaired UTF-16 surrogate. Python can't encode it as UTF-8 (storing or answering with it
 * is a 500), so both twins refuse it up front, with the message the field's other length / type rules use.
 */

// A high surrogate not followed by a low one, or a low surrogate not preceded by a high one.
const LONE_SURROGATE = /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/;
const LONE_SURROGATES = new RegExp(LONE_SURROGATE.source, 'g');

/** True when `text` holds an unpaired surrogate. */
export function hasLoneSurrogate(text: string): boolean {
  return LONE_SURROGATE.test(text);
}

/** `text` with every lone surrogate shown as U+FFFD, for messages that quote what the caller sent. */
export function printable(text: string): string {
  return text.replace(LONE_SURROGATES, '�');
}
