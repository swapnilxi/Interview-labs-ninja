import React from 'react';

/**
 * ai-lms's AI/learning-domain line-icon set, ported from AI-Bootcamp-reference's
 * `components/ui/Icon.tsx` (kept close to verbatim — it's pure, self-drawn SVG
 * with zero backend coupling). Renamed `AbIcon`/`AbIconName` so it never
 * collides with the app-wide `@/components/ui/AppIcon` (a heroicons wrapper).
 *
 * Every glyph sits on a 24x24 grid with a 1.5 stroke, so icons sit evenly next
 * to each other. Domain icons describe AI engineering concepts (a network, a
 * model, an agent loop, a vector index) rather than generic shapes, so a card
 * can be identified from its icon alone.
 */

export type AbIconName =
  // AI & learning domain
  | 'path'
  | 'network'
  | 'model'
  | 'agent'
  | 'lab'
  | 'project'
  | 'practice'
  | 'vector'
  | 'code'
  | 'terminal'
  | 'chip'
  | 'graph'
  | 'career'
  | 'session'
  // UI
  | 'menu'
  | 'close'
  | 'arrow'
  | 'check'
  | 'calendar'
  | 'clock'
  | 'user'
  | 'lock'
  | 'mail'
  | 'phone'
  | 'location'
  | 'edit'
  | 'delete'
  | 'settings'
  | 'bell'
  | 'search'
  | 'video'
  | 'format'
  | 'star'
  // Roles (loosely: labs-ninja's user / editor / admin / superadmin)
  | 'role-user'
  | 'role-editor'
  | 'role-admin'
  | 'role-superadmin';

export type AbIconVariant = 'line' | 'filled';

export interface AbIconProps extends React.SVGProps<SVGSVGElement> {
  name: AbIconName;
  variant?: AbIconVariant;
  size?: 20 | 24 | 32 | 48 | number;
  className?: string;
  ariaLabel?: string;
}

export function AbIcon({
  name,
  variant = 'line',
  size = 24,
  className = '',
  ariaLabel,
  ...props
}: AbIconProps) {
  const isDecorative = !ariaLabel;

  const baseSvgProps = {
    viewBox: '0 0 24 24',
    width: size,
    height: size,
    className: `shrink-0 ${className}`,
    ...(isDecorative
      ? { 'aria-hidden': 'true' as const }
      : { role: 'img', 'aria-label': ariaLabel }),
    ...props,
  };

  const lineStyleProps = {
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.5,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
  };

  const filledStyleProps = { fill: 'currentColor', stroke: 'none' };

  return (
    <svg {...baseSvgProps} {...(variant === 'line' ? lineStyleProps : filledStyleProps)}>
      {renderIconPaths(name, variant)}
    </svg>
  );
}

function renderIconPaths(name: AbIconName, variant: AbIconVariant): React.ReactNode {
  switch (name) {
    /* AI & learning domain */

    case 'path':
      return (
        <>
          <circle cx="5" cy="19" r="2" />
          <circle cx="12" cy="12" r="2" />
          <circle cx="19" cy="5" r="2" />
          <path d="M6.5 17.5 10.5 13.5" />
          <path d="M13.5 10.5 17.5 6.5" />
        </>
      );

    case 'network':
      return (
        <>
          <circle cx="4" cy="7" r="1.6" />
          <circle cx="4" cy="17" r="1.6" />
          <circle cx="12" cy="5" r="1.6" />
          <circle cx="12" cy="12" r="1.6" />
          <circle cx="12" cy="19" r="1.6" />
          <circle cx="20" cy="12" r="1.6" />
          <path d="M5.5 7 10.5 5.4M5.5 7.6 10.6 11.3M5.5 16.4 10.6 12.7M5.5 17 10.5 18.6" />
          <path d="M13.5 5.6 18.6 11.2M13.6 12 18.4 12M13.5 18.4 18.6 12.8" />
        </>
      );

    case 'model':
      return (
        <>
          <rect x="3" y="4" width="18" height="16" rx="2.5" />
          <path d="M3 9h18M3 15h18" />
          <circle cx="7.5" cy="6.5" r="0.9" />
          <circle cx="12" cy="12" r="0.9" />
          <circle cx="16.5" cy="17.5" r="0.9" />
        </>
      );

    case 'agent':
      return (
        <>
          <path d="M19 10a7 7 0 1 0-1.2 6.4" />
          <polyline points="19,5 19,10 14,10" />
          <circle cx="12" cy="12" r="2.4" />
          <path d="M17.8 16.4 21 19.6" />
        </>
      );

    case 'lab':
      return (
        <>
          <path d="M9 3v6.2L4.3 17.6A2 2 0 0 0 6 20.6h12a2 2 0 0 0 1.7-3L15 9.2V3" />
          <path d="M8 3h8" />
          <path d="M7.2 14.5h9.6" />
          <circle cx="11" cy="17" r="0.9" />
          <circle cx="14" cy="18" r="0.6" />
        </>
      );

    case 'project':
      return (
        <>
          <path d="M20.5 7.5 12 3 3.5 7.5v9L12 21l8.5-4.5z" />
          <path d="M3.5 7.5 12 12l8.5-4.5M12 12v9" />
        </>
      );

    case 'practice':
      return (
        <>
          <circle cx="12" cy="12" r="8.5" />
          <circle cx="12" cy="12" r="4.5" />
          <circle cx="12" cy="12" r="1" />
        </>
      );

    case 'vector':
      return (
        <>
          <rect x="3.5" y="3.5" width="17" height="17" rx="2.5" />
          <circle cx="8" cy="8" r="1.1" />
          <circle cx="15" cy="7" r="1.1" />
          <circle cx="10" cy="14" r="1.1" />
          <circle cx="17" cy="15.5" r="1.1" />
          <path d="M8 8 10 14M15 7 17 15.5" />
        </>
      );

    case 'code':
      return (
        <>
          <polyline points="8.5,8 4.5,12 8.5,16" />
          <polyline points="15.5,8 19.5,12 15.5,16" />
          <line x1="13.5" y1="5.5" x2="10.5" y2="18.5" />
        </>
      );

    case 'terminal':
      return (
        <>
          <rect x="3" y="4" width="18" height="16" rx="2.5" />
          <polyline points="7.5,10 10,12.5 7.5,15" />
          <line x1="12.5" y1="15.5" x2="16.5" y2="15.5" />
        </>
      );

    case 'chip':
      return (
        <>
          <rect x="7" y="7" width="10" height="10" rx="1.6" />
          <path d="M10 2.5v4.5M14 2.5v4.5M10 17v4.5M14 17v4.5" />
          <path d="M2.5 10H7M2.5 14H7M17 10h4.5M17 14h4.5" />
        </>
      );

    case 'graph':
      return (
        <>
          <polyline points="3.5,20 3.5,4" />
          <polyline points="3.5,20 20.5,20" />
          <polyline points="7,16 11,11 14.5,13.5 20,6" />
          <circle cx="11" cy="11" r="0.9" />
          <circle cx="14.5" cy="13.5" r="0.9" />
        </>
      );

    case 'career':
      return (
        <>
          <path d="M3.5 20.5h17" />
          <rect x="4.5" y="13" width="4.5" height="7.5" rx="1" />
          <rect x="10" y="9" width="4.5" height="11.5" rx="1" />
          <rect x="15.5" y="4.5" width="4.5" height="16" rx="1" />
        </>
      );

    case 'session':
      return (
        <>
          <path d="M3.5 6.5a2 2 0 0 1 2-2h13a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H9l-4.5 3.5V16.5a2 2 0 0 1-1-2z" />
          <line x1="8" y1="9.5" x2="16" y2="9.5" />
          <line x1="8" y1="12.5" x2="13" y2="12.5" />
        </>
      );

    /* UI */

    case 'menu':
      return (
        <>
          <line x1="4" y1="7" x2="20" y2="7" />
          <line x1="4" y1="12" x2="20" y2="12" />
          <line x1="4" y1="17" x2="20" y2="17" />
        </>
      );

    case 'close':
      return (
        <>
          <line x1="6" y1="6" x2="18" y2="18" />
          <line x1="18" y1="6" x2="6" y2="18" />
        </>
      );

    case 'arrow':
      return (
        <>
          <line x1="4" y1="12" x2="19" y2="12" />
          <polyline points="13.5,6.5 19,12 13.5,17.5" />
        </>
      );

    case 'check':
      return <polyline points="4.5,12.5 9.5,17.5 19.5,6.5" />;

    case 'calendar':
      return (
        <>
          <rect x="3.5" y="5" width="17" height="15.5" rx="2.5" />
          <line x1="3.5" y1="9.5" x2="20.5" y2="9.5" />
          <line x1="8" y1="2.8" x2="8" y2="6.5" />
          <line x1="16" y1="2.8" x2="16" y2="6.5" />
        </>
      );

    case 'clock':
      return (
        <>
          <circle cx="12" cy="12" r="8.5" />
          <polyline points="12,7 12,12 15.5,14" />
        </>
      );

    case 'user':
      return (
        <>
          <circle cx="12" cy="8" r="3.8" />
          <path d="M5 20c0-3.5 3-5.5 7-5.5s7 2 7 5.5" />
        </>
      );

    case 'lock':
      return (
        <>
          <rect x="4.5" y="10.5" width="15" height="10" rx="2.2" />
          <path d="M8 10.5V7.8a4 4 0 0 1 8 0v2.7" />
          <circle cx="12" cy="15.5" r="1" />
        </>
      );

    case 'mail':
      return (
        <>
          <rect x="3" y="5.5" width="18" height="13" rx="2.2" />
          <polyline points="3.8,7 12,13 20.2,7" />
        </>
      );

    case 'phone':
      return (
        <path d="M6.2 3.5h3l1.6 4-2 1.4a12 12 0 0 0 6.3 6.3l1.4-2 4 1.6v3a2 2 0 0 1-2.2 2A16.6 16.6 0 0 1 4.2 5.7a2 2 0 0 1 2-2.2z" />
      );

    case 'location':
      return (
        <>
          <path d="M12 21s7-5.6 7-11a7 7 0 1 0-14 0c0 5.4 7 11 7 11z" />
          <circle cx="12" cy="10" r="2.6" />
        </>
      );

    case 'edit':
      return (
        <>
          <path d="M4 20h4L19 9a2.5 2.5 0 0 0-3.5-3.5L4.5 16.5z" />
          <line x1="14.5" y1="6.5" x2="17.5" y2="9.5" />
        </>
      );

    case 'delete':
      return (
        <>
          <polyline points="4,6.5 20,6.5" />
          <path d="M6.5 6.5 7.5 20a1.5 1.5 0 0 0 1.5 1.3h6a1.5 1.5 0 0 0 1.5-1.3l1-13.5" />
          <path d="M9.5 6.5V4.3A1.3 1.3 0 0 1 10.8 3h2.4a1.3 1.3 0 0 1 1.3 1.3v2.2" />
        </>
      );

    case 'settings':
      return (
        <>
          <circle cx="12" cy="12" r="3.2" />
          <path d="M12 2.5v2.8M12 18.7v2.8M21.5 12h-2.8M5.3 12H2.5M18.7 5.3l-2 2M7.3 16.7l-2 2M18.7 18.7l-2-2M7.3 7.3l-2-2" />
        </>
      );

    case 'bell':
      return (
        <>
          <path d="M6.5 10a5.5 5.5 0 0 1 11 0c0 4 1.5 5.5 1.5 5.5H5s1.5-1.5 1.5-5.5z" />
          <path d="M10.2 18.8a2 2 0 0 0 3.6 0" />
        </>
      );

    case 'search':
      return (
        <>
          <circle cx="11" cy="11" r="6.8" />
          <line x1="16" y1="16" x2="20.5" y2="20.5" />
        </>
      );

    case 'video':
      return (
        <>
          <rect x="3" y="6" width="12.5" height="12" rx="2.2" />
          <polygon points="15.5,10.5 21,7.5 21,16.5 15.5,13.5" />
        </>
      );

    case 'format':
      return (
        <>
          <line x1="4.5" y1="6.5" x2="19.5" y2="6.5" />
          <line x1="4.5" y1="12" x2="15" y2="12" />
          <line x1="4.5" y1="17.5" x2="17" y2="17.5" />
        </>
      );

    case 'star':
      return variant === 'filled' ? (
        <path d="M12 3 14.6 9.1 21 9.7l-4.8 4.3 1.4 6.3L12 17l-5.6 3.3 1.4-6.3L3 9.7l6.4-.6z" />
      ) : (
        <polygon points="12,3 14.6,9.1 21,9.7 16.2,14 17.6,20.3 12,17 6.4,20.3 7.8,14 3,9.7 9.4,9.1" />
      );

    /* Roles */

    case 'role-user':
      return (
        <>
          <circle cx="12" cy="8" r="3.8" />
          <path d="M5 20c0-3.5 3-5.5 7-5.5s7 2 7 5.5" />
        </>
      );

    case 'role-editor':
      return (
        <>
          <circle cx="12" cy="7.5" r="3.5" />
          <path d="M5 20c0-3.4 3-5.3 7-5.3s7 1.9 7 5.3" />
          <polyline points="9.5,17.5 11.3,19.3 15,15.5" />
        </>
      );

    case 'role-admin':
      return (
        <>
          <path d="M12 2.5 4.5 6v5c0 5 3.3 9.2 7.5 10.5 4.2-1.3 7.5-5.5 7.5-10.5V6z" />
          <polyline points="9,11.8 11.2,14 15.2,9.5" />
        </>
      );

    case 'role-superadmin':
      return (
        <>
          <path d="M12 2.5 4.5 6v5c0 5 3.3 9.2 7.5 10.5 4.2-1.3 7.5-5.5 7.5-10.5V6z" />
          <path d="M8.5 13.5 10.3 9.5 12 12.2 13.7 9.5 15.5 13.5" />
        </>
      );

    default:
      return null;
  }
}
