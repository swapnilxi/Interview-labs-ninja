/**
 * Registry of built-in portfolio templates — id -> self-contained component
 * (+ a matching css(accentHex) export each template also exposes, reused by
 * the Template Designer's HTML-string preview). Adding a new template means
 * adding a new folder here and registering it below — no shared switch
 * statement to edit. `modern3d` is deliberately absent: it bypasses this
 * whole system in the live browser (see PortfolioWidgetsView.tsx's Modern3DView
 * special-case) — only the backend needs a static CSS fallback for it.
 */

import type { ComponentType } from 'react';
import AuroraTemplate, { css as auroraCss } from './aurora/aurora';
import BlueprintTemplate, { css as blueprintCss } from './blueprint/blueprint';
import CarbonTemplate, { css as carbonCss } from './carbon/carbon';
import DotsTemplate, { css as dotsCss } from './dots/dots';
import IsometricTemplate, { css as isometricCss } from './isometric/isometric';
import LinkxTemplate, { css as linkxCss } from './linkx/linkx';
import MeshTemplate, { css as meshCss } from './mesh/mesh';
import MinimalTemplate, { css as minimalCss } from './minimal/minimal';
import ModernTemplate, { css as modernCss } from './modern/modern';
import type { PortfolioTemplateProps } from './shared';

export const REGISTRY: Record<string, ComponentType<PortfolioTemplateProps>> = {
  modern: ModernTemplate,
  linkx: LinkxTemplate,
  minimal: MinimalTemplate,
  isometric: IsometricTemplate,
  aurora: AuroraTemplate,
  blueprint: BlueprintTemplate,
  dots: DotsTemplate,
  mesh: MeshTemplate,
  carbon: CarbonTemplate,
};

const CSS_REGISTRY: Record<string, (accentHex: string) => string> = {
  modern: modernCss,
  linkx: linkxCss,
  minimal: minimalCss,
  isometric: isometricCss,
  aurora: auroraCss,
  blueprint: blueprintCss,
  dots: dotsCss,
  mesh: meshCss,
  carbon: carbonCss,
};

export function getTemplate(id: string | null | undefined): ComponentType<PortfolioTemplateProps> {
  return REGISTRY[id || ''] || REGISTRY.minimal;
}

export function getCss(id: string | null | undefined, accentHex: string): string {
  const fn = CSS_REGISTRY[id || ''] || CSS_REGISTRY.minimal;
  return fn(accentHex);
}

export { BASE_CSS } from './shared';
