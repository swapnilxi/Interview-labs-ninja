'use client';

/**
 * Presentational portfolio renderer shared by the editor preview and the
 * public shared page (/p/[slug]). Pure props, no store. Looks up the chosen
 * template in the registry and delegates rendering to that self-contained
 * component — this file just owns the "which template" decision (plus the
 * Modern3D/Visionary special-cases, which bypass the template-CSS system
 * entirely).
 */

import type { PortfolioTheme, PortfolioWidget } from '../shared/types';
import Modern3DView from './templates/modern3d/Modern3DView';
import VisionaryView from './templates/visionary/VisionaryView';
import { getTemplate } from './templates';

export default function PortfolioWidgetsView({
  widgets,
  theme,
  emptyText = 'Nothing here yet.',
}: {
  widgets: PortfolioWidget[];
  theme?: PortfolioTheme | null;
  emptyText?: string;
}) {
  const template = theme?.template || 'modern3d';

  // Modern3D and Visionary each own their whole page shell (Three.js hero,
  // scroll reveals, custom cursor) instead of the shared background+card
  // treatment every other template uses — bypass the registry entirely
  // rather than trying to nest them.
  if (template === 'modern3d') {
    return <Modern3DView widgets={widgets} theme={theme} />;
  }
  if (template === 'visionary') {
    return <VisionaryView widgets={widgets} theme={theme} />;
  }

  const Template = getTemplate(template);
  return <Template widgets={widgets} theme={theme} emptyText={emptyText} />;
}
