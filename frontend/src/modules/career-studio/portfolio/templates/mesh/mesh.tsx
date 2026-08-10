'use client';

/** Mesh portfolio template — multi-color radial-gradient mesh background. */

import { PortfolioTemplateShell, accentHexFor, type PortfolioTemplateProps } from '../shared';

export function css(a: string): string {
  return `
.pf-tpl-mesh {
  background:
    radial-gradient(closest-side at 0% 0%, ${a}3a, transparent),
    radial-gradient(closest-side at 100% 18%, #22d3ee40, transparent),
    radial-gradient(closest-side at 28% 92%, #f59e0b38, transparent),
    radial-gradient(closest-side at 92% 100%, ${a}30, transparent),
    linear-gradient(160deg, #eef0f8, #eaf0fb);
}
.pf-tpl-mesh .pf-card {
  background: rgba(255,255,255,.74);
  backdrop-filter: blur(20px); -webkit-backdrop-filter: blur(20px);
  border: 1px solid rgba(255,255,255,.9);
  box-shadow: 0 1px 0 rgba(255,255,255,.9) inset, 0 28px 56px -28px rgba(24,28,42,.24), 0 14px 30px -18px ${a}59;
}
`;
}

export default function MeshTemplate(props: PortfolioTemplateProps) {
  return <PortfolioTemplateShell {...props} templateId="mesh" css={css(accentHexFor(props.theme))} />;
}
