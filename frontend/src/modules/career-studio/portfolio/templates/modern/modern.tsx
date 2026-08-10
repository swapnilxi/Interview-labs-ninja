'use client';

/** Modern portfolio template — soft radial-gradient background, glassy card
 * with an accent-colored top border and backdrop blur. */

import { PortfolioTemplateShell, accentHexFor, type PortfolioTemplateProps } from '../shared';

export function css(a: string): string {
  return `
.pf-tpl-modern {
  background: linear-gradient(135deg, #f6f5fb 0%, #f3effc 45%, #eef2fc 100%);
  background-image:
    radial-gradient(620px circle at 90% -10%, ${a}36, transparent 62%),
    radial-gradient(560px circle at -12% 110%, #06b6d42e, transparent 62%),
    linear-gradient(135deg, #f6f5fb 0%, #f3effc 45%, #eef2fc 100%);
}
.pf-tpl-modern .pf-card {
  background: rgba(255,255,255,.72);
  backdrop-filter: blur(20px); -webkit-backdrop-filter: blur(20px);
  border: 1px solid rgba(255,255,255,.9);
  border-top: 3px solid ${a};
  box-shadow: 0 1px 0 rgba(255,255,255,.9) inset, 0 30px 60px -30px rgba(24,28,42,.22), 0 14px 30px -20px ${a}40;
}
`;
}

export default function ModernTemplate(props: PortfolioTemplateProps) {
  return <PortfolioTemplateShell {...props} templateId="modern" css={css(accentHexFor(props.theme))} />;
}
