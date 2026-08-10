'use client';

/** Carbon portfolio template — diagonal carbon-fiber-style hairline pattern. */

import { PortfolioTemplateShell, accentHexFor, type PortfolioTemplateProps } from '../shared';

export function css(a: string): string {
  return `
.pf-tpl-carbon {
  background-color: #eef1f5;
  background-image: repeating-linear-gradient(45deg, ${a}0d 0, ${a}0d 1px, transparent 1px, transparent 11px);
}
.pf-tpl-carbon .pf-card {
  background: #fff;
  border: 1px solid #e2e6ee;
  box-shadow: 0 1px 0 rgba(255,255,255,.8) inset, 0 20px 38px -22px rgba(24,28,42,.32), 0 10px 20px -14px ${a}30;
}
`;
}

export default function CarbonTemplate(props: PortfolioTemplateProps) {
  return <PortfolioTemplateShell {...props} templateId="carbon" css={css(accentHexFor(props.theme))} />;
}
