'use client';

/** Blueprint portfolio template — grid-line background, accent top border. */

import { PortfolioTemplateShell, accentHexFor, type PortfolioTemplateProps } from '../shared';

export function css(a: string): string {
  return `
.pf-tpl-blueprint {
  background-color: #f6f8fc;
  background-image:
    linear-gradient(${a}14 1px, transparent 1px),
    linear-gradient(90deg, ${a}14 1px, transparent 1px);
  background-size: 22px 22px;
}
.pf-tpl-blueprint .pf-card {
  background: #fff;
  border-top: 3px solid ${a};
  box-shadow: 0 1px 0 rgba(255,255,255,.8) inset, 0 22px 42px -24px rgba(24,28,42,.28), 0 12px 24px -16px ${a}30;
}
`;
}

export default function BlueprintTemplate(props: PortfolioTemplateProps) {
  return <PortfolioTemplateShell {...props} templateId="blueprint" css={css(accentHexFor(props.theme))} />;
}
