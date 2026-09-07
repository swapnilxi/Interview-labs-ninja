/**
 * Registry of built-in portfolio templates — id -> self-contained component
 * (+ a matching css(accentHex) export each template also exposes, reused by
 * the Template Designer's HTML-string preview). Adding a new template means
 * adding a new folder here and registering it below — no shared switch
 * statement to edit. `modern3d` and `visionary` are deliberately absent: they
 * bypass this whole system in the live browser (see PortfolioWidgetsView.tsx's
 * special-cases) because they're full Three.js/motion page components, not a
 * CSS treatment over the shared widget shell. Each template's css() is
 * self-scoped to its own `.pf-tpl-<id>` class, so a live-only template can't
 * just borrow another one's css() here — the id wouldn't match the selector.
 * templatePreview.ts's card-thumbnail renderer aliases `modern3d`/`visionary`
 * to `minimal` for exactly this reason; see the comment there before "fixing"
 * this by adding them to CSS_REGISTRY.
 *
 * Every built-in template also has a sibling `prompt.md` in its folder — an
 * editable design spec. Edit it and ask Claude Code to sync the
 * implementation to match, instead of hand-editing the component directly.
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
import type { PortfolioTemplateProps } from './shared';

export const REGISTRY: Record<string, ComponentType<PortfolioTemplateProps>> = {
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
