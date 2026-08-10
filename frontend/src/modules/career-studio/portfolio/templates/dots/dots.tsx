'use client';

/** Dots portfolio template — subtle dot-grid background. */

import { PortfolioTemplateShell, accentHexFor, type PortfolioTemplateProps } from '../shared';

export function css(a: string): string {
  return `
.pf-tpl-dots {
  background-color: #f4f5f9;
  background-image: radial-gradient(${a}26 1.4px, transparent 1.6px);
  background-size: 18px 18px;
}
.pf-tpl-dots .pf-card {
  background: #fff;
  border: 1px solid rgba(0,0,0,.04);
  box-shadow: 0 1px 0 rgba(255,255,255,.8) inset, 0 24px 46px -24px rgba(24,28,42,.26), 0 12px 22px -16px ${a}30;
}
`;
}

export default function DotsTemplate(props: PortfolioTemplateProps) {
  return <PortfolioTemplateShell {...props} templateId="dots" css={css(accentHexFor(props.theme))} />;
}
