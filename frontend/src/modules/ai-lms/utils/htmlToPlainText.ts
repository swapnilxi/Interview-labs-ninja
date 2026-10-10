/** Extracts readable block-level text (paragraphs, list items, headings) from a
 * lesson's generated HTML document, for feeding into the Swipe Read card deck. */
export function extractReadableParagraphs(html: string): string[] {
  if (typeof window === 'undefined' || !html) return [];

  const doc = new DOMParser().parseFromString(html, 'text/html');
  const blocks = doc.body.querySelectorAll('h1, h2, h3, h4, p, li, blockquote, pre');
  const paragraphs: string[] = [];

  blocks.forEach((el) => {
    const text = (el.textContent || '').replace(/\s+/g, ' ').trim();
    if (text) paragraphs.push(text);
  });

  if (paragraphs.length === 0) {
    const fallback = (doc.body.textContent || '').replace(/\s+/g, ' ').trim();
    if (fallback) paragraphs.push(fallback);
  }

  return paragraphs;
}
