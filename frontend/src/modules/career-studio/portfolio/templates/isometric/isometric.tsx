'use client';

/** Isometric portfolio template — diagonal geometric pattern background. */

import { PortfolioTemplateShell, accentHexFor, type PortfolioTemplateProps } from '../shared';

export function css(a: string): string {
  return `
.pf-tpl-isometric {
  background-color: #eef0f7;
  background-image:
    linear-gradient(30deg, ${a}38 12%, transparent 12.5%, transparent 87%, ${a}38 87.5%, ${a}38),
    linear-gradient(150deg, ${a}38 12%, transparent 12.5%, transparent 87%, ${a}38 87.5%, ${a}38),
    linear-gradient(30deg, ${a}38 12%, transparent 12.5%, transparent 87%, ${a}38 87.5%, ${a}38),
    linear-gradient(150deg, ${a}38 12%, transparent 12.5%, transparent 87%, ${a}38 87.5%, ${a}38),
    linear-gradient(60deg, #1e233326 25%, transparent 25.5%, transparent 75%, #1e233326 75%, #1e233326),
    linear-gradient(60deg, #1e233326 25%, transparent 25.5%, transparent 75%, #1e233326 75%, #1e233326);
  background-size: 52px 90px;
  background-position: 0 0, 0 0, 26px 45px, 26px 45px, 0 0, 26px 45px;
}
.pf-tpl-isometric .pf-card {
  background: rgba(255,255,255,.9);
  backdrop-filter: blur(14px); -webkit-backdrop-filter: blur(14px);
  border: 1px solid rgba(255,255,255,.8);
  border-bottom: 3px solid ${a}40;
  box-shadow: 0 1px 0 rgba(255,255,255,.9) inset, 0 30px 60px -28px rgba(24,28,42,.45), 0 14px 26px -18px ${a}55;
}
`;
}

export default function IsometricTemplate(props: PortfolioTemplateProps) {
  return <PortfolioTemplateShell {...props} templateId="isometric" css={css(accentHexFor(props.theme))} />;
}
