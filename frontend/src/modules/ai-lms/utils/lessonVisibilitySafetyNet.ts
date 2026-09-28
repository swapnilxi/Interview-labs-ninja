/** Injects a minimal, defensive stylesheet into an AI-generated lesson's <head> so
 * headings/dividers/links stay visible even if the model's own CSS only fully
 * accounted for one color-scheme (light or dark), not both.
 *
 * Inserted as the FIRST thing in <head>, so the lesson's own <style> block (which
 * always appears later in source order) still wins on equal-specificity rules for
 * elements it actually styled -- this is a fallback, not an override. The one
 * exception is `hr`: given `!important` so it can never end up fully invisible
 * regardless of what (if anything) the lesson's own CSS declares for it, since a
 * plain unstyled divider is the single most commonly reported invisible element.
 */
export function withVisibilitySafetyNet(html: string): string {
  if (!html) return html;

  const safetyNet = `<style>
    :root { color-scheme: light dark; }
    hr { border: none !important; border-top: 1px solid rgba(128, 128, 128, 0.4) !important; margin: 2rem 0; }
  </style>`;

  const headMatch = html.match(/<head[^>]*>/i);
  if (!headMatch || headMatch.index === undefined) return html;

  const insertAt = headMatch.index + headMatch[0].length;
  return html.slice(0, insertAt) + safetyNet + html.slice(insertAt);
}
