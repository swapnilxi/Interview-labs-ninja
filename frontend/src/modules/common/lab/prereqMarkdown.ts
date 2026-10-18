/** One heading of a Prerequisites section and the specific skills listed under it. */
export interface PrereqGroup {
  title: string;
  items: string[];
}

/** Markdown for a lab's Prerequisites section: a bold title, then bold group headings with bullets. */
export function prereqMarkdown(heading: string, groups: PrereqGroup[]): string {
  const parts = [`**${heading}**`];
  for (const g of groups) {
    if (g.items.length) parts.push(`**${g.title}**\n\n${g.items.map((i) => `- ${i}`).join('\n')}`);
  }
  return parts.join('\n\n');
}
