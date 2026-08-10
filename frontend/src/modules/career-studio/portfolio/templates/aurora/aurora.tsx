'use client';

/** Aurora portfolio template — soft multi-color radial-gradient glow background. */

import { PortfolioTemplateShell, accentHexFor, type PortfolioTemplateProps } from '../shared';

export function css(a: string): string {
  return `
.pf-tpl-aurora {
  background:
    radial-gradient(closest-side at 18% 12%, ${a}3d, transparent),
    radial-gradient(closest-side at 84% 6%, #f472b640, transparent),
    radial-gradient(closest-side at 60% 100%, ${a}2e, transparent),
    linear-gradient(160deg, #f6f5fc, #f0f2fb);
}
.pf-tpl-aurora .pf-card {
  background: rgba(255,255,255,.72);
  backdrop-filter: blur(20px); -webkit-backdrop-filter: blur(20px);
  border: 1px solid rgba(255,255,255,.9);
  box-shadow: 0 1px 0 rgba(255,255,255,.9) inset, 0 28px 56px -28px rgba(24,28,42,.24), 0 14px 30px -18px ${a}66;
}
`;
}

export default function AuroraTemplate(props: PortfolioTemplateProps) {
  return <PortfolioTemplateShell {...props} templateId="aurora" css={css(accentHexFor(props.theme))} />;
}
