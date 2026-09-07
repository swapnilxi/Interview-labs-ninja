'use client';

/** Minimal portfolio template — plain light background, flat white cards.
 * Also the fallback style used for any unrecognized template id (see
 * portfolio/templates/index.ts). */

import { PortfolioTemplateShell, accentHexFor, type PortfolioTemplateProps } from '../shared';

export function css(a: string): string {
  return `
.pf-tpl-minimal { background: #f2f2f6; }
.pf-tpl-minimal .pf-card { background: #fff; border: 1px solid rgba(0,0,0,.05); box-shadow: 0 1px 0 rgba(255,255,255,.8) inset, 0 22px 42px -26px rgba(24,28,42,.18), 0 10px 20px -16px ${a}30; }
`;
}

export default function MinimalTemplate(props: PortfolioTemplateProps) {
  return <PortfolioTemplateShell {...props} templateId="minimal" css={css(accentHexFor(props.theme))} />;
}
