/**
 * Small shared helpers used across the portfolio vertical (widget rendering,
 * per-template registry, Template Designer preview). The per-template CSS
 * that used to live here as one big portfolioTemplateCss() switch has moved
 * to portfolio/templates/ — each built-in template now owns its own CSS in
 * its own self-contained module, registered in portfolio/templates/index.ts.
 */

export const ACCENT_HEX: Record<string, string> = {
  violet: '#7c3aed',
  emerald: '#059669',
  blue: '#2563eb',
  rose: '#e11d48',
  amber: '#d97706',
  slate: '#334155',
};

/** First-name/last-name initials for an avatar fallback (used whenever no avatar_url is set). */
export function initials(name: string): string {
  const parts = (name || '').trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '?';
  if (parts.length === 1) return parts[0][0].toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}
