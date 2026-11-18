'use client';

import { openLoginModal } from '@/components/auth/LoginModal';
import { Fragment, useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useLocationSearch } from '@/lib/navigation/useLocationSearch';
import Icon from '@/components/ui/AppIcon';
import ThemeToggleIcon from '@/modules/common/ThemeToggleIcon';
import BrandMark from '@/modules/common/BrandMark';
import { initialsFor } from '@/lib/ui/initials';
import { useIsNativeApp } from '@/lib/pwa/installApp';
import { LAB_GROUPS, LABS_HOME, LABS_PROJECT_LINK, isLabsPath, labsInGroup } from '@/modules/labs/common/labCatalog';
import { useAuth } from '@/contexts/AuthContext';
import {
  SidebarMode,
  applySidebarMode,
  getStoredSidebarMode,
  setStoredSidebarMode,
  subscribeSidebarMode,
} from '@/lib/services/sidebarService';

/** iOS system colours for the icon tiles (`.nav-tile[data-tint]` in tailwind.css, light and dark values). */
type Tint = 'blue' | 'indigo' | 'purple' | 'pink' | 'red' | 'orange' | 'green' | 'teal' | 'cyan' | 'brown' | 'gray';

interface SidebarLink {
  label: string;
  path: string;
  icon: string;
  tint: Tint;
}

const DAILY_SESSION_LINKS: SidebarLink[] = [
  { label: 'Daily Session', path: '/daily-session?tab=session', icon: 'AcademicCapIcon', tint: 'blue' },
  { label: 'Practice Mode', path: '/daily-session?tab=practice', icon: 'SparklesIcon', tint: 'indigo' },
  { label: 'Quick Practice', path: '/daily-session?tab=quick-practice', icon: 'BoltIcon', tint: 'orange' },
  { label: 'Progress Dashboard', path: '/daily-session?tab=progress', icon: 'ChartBarIcon', tint: 'green' },
  { label: 'Question Bank', path: '/daily-session?tab=question-bank', icon: 'BookOpenIcon', tint: 'teal' },
];

// The Labs menu (labCatalog.ts): the Labs home, each group of labs, then Labs Project. Each lab keeps one tile colour.
const LAB_TINTS: Record<string, Tint> = {
  '/labs': 'gray',
  '/dsa-lab': 'blue',
  '/system-design-lab': 'indigo',
  '/cv-lab': 'teal',
  '/communication-lab': 'green',
  '/finance-lab': 'orange',
  '/python-lab': 'purple',
  '/genai-lab': 'red',
  '/labs-project': 'cyan',
};
const toLink = (l: { label: string; path: string; icon: string }): SidebarLink => ({
  label: l.label,
  path: l.path,
  icon: l.icon,
  tint: LAB_TINTS[l.path] ?? 'gray',
});
const LAB_GROUP_LINKS = LAB_GROUPS.map((g) => ({ ...g, links: labsInGroup(g.id).map(toLink) }));
const LAB_LINKS: SidebarLink[] = [toLink(LABS_HOME), ...LAB_GROUP_LINKS.flatMap((g) => g.links), toLink(LABS_PROJECT_LINK)];
/** Icon rail: a thin divider before each of these (between the groups of the Labs menu). */
const LAB_RAIL_DIVIDERS = [...LAB_GROUP_LINKS.map((g) => g.links[0]?.path), LABS_PROJECT_LINK.path].filter(Boolean) as string[];

const CAREER_LINKS: SidebarLink[] = [
  { label: 'Profiles', path: '/career?tab=profiles', icon: 'IdentificationIcon', tint: 'blue' },
  { label: 'Resumes', path: '/career?tab=resumes', icon: 'DocumentTextIcon', tint: 'indigo' },
  { label: 'Portfolios', path: '/career?tab=portfolios', icon: 'GlobeAltIcon', tint: 'teal' },
  { label: 'Templates', path: '/career?tab=templates', icon: 'SwatchIcon', tint: 'pink' },
];

const AI_TODO_LINKS: SidebarLink[] = [
  { label: 'Quick Daily', path: '/ai-todo?tab=quick', icon: 'BoltIcon', tint: 'orange' },
  { label: 'Smart To-Do', path: '/ai-todo?tab=smart', icon: 'CpuChipIcon', tint: 'purple' },
  { label: 'Plan & Project', path: '/ai-todo?tab=plan', icon: 'MapIcon', tint: 'green' },
  { label: 'Goals', path: '/ai-todo?tab=goals', icon: 'ViewfinderCircleIcon', tint: 'red' },
];

type TileSize = 'row' | 'sm' | 'rail' | 'railSub';
const TILE_CLASS: Record<TileSize, string> = { row: '', sm: 'nav-tile-sm', rail: 'nav-tile-rail', railSub: 'nav-tile-rail-sub' };
/** Glyph ≈ 58% of the tile, as in iOS Settings. */
const TILE_GLYPH: Record<TileSize, number> = { row: 19, sm: 17, rail: 22, railSub: 18 };

/**
 * An iOS app-icon tile: a rounded square in the item's colour with a white filled glyph. `soft` is the tinted
 * second-level look (coloured glyph on a light wash), used for sub-items that are not the current page.
 */
function NavTile({
  icon,
  tint,
  size = 'row',
  soft = false,
  children,
}: {
  icon?: string;
  tint: Tint;
  size?: TileSize;
  soft?: boolean;
  children?: ReactNode;
}) {
  return (
    <span className={`nav-tile ${TILE_CLASS[size]} ${soft ? 'nav-tile-soft' : ''}`} data-tint={tint} aria-hidden="true">
      {children ?? <Icon name={icon as any} size={TILE_GLYPH[size]} variant="solid" />}
    </span>
  );
}

interface SidebarProps {
  isOpen: boolean;
  onClose: () => void;
  /** null until the header has read the stored theme (first render): the toggle then draws both icons and CSS picks one. */
  theme: 'light' | 'dark' | null;
  onToggleTheme: () => void;
  mode?: SidebarMode;
  onModeChange?: (mode: SidebarMode) => void;
  onOpenDrawer?: () => void;
}

export default function Sidebar({
  isOpen,
  onClose,
  theme,
  onToggleTheme,
  mode: propMode,
  onModeChange: propOnModeChange,
  onOpenDrawer,
}: SidebarProps) {
  const pathname = usePathname();
  const isNativeApp = useIsNativeApp();
  // Live ?query (same on server and first client render): the 'current tab' highlight must not read window.location in render.
  const search = useLocationSearch();
  const { user, isGuest, isAdmin, logout } = useAuth();
  const [internalMode, setInternalMode] = useState<SidebarMode>('icon-only');

  const mode = propMode ?? internalMode;
  const setMode = (newMode: SidebarMode) => {
    if (propOnModeChange) {
      propOnModeChange(newMode);
    } else {
      setStoredSidebarMode(newMode);
      setInternalMode(newMode);
    }
  };

  // Enable the content-shift transition only after first paint (see `sidebar-animate` in tailwind.css).
  useEffect(() => {
    const id = requestAnimationFrame(() =>
      requestAnimationFrame(() => document.documentElement.classList.add('sidebar-animate'))
    );
    return () => cancelAnimationFrame(id);
  }, []);

  useEffect(() => {
    const stored = getStoredSidebarMode();
    setInternalMode(stored);
    // Hydration can drop the pre-paint `has-sidebar-rail` class (seen on dark-mode loads),
    // leaving content under the rail; re-assert it from the stored mode.
    applySidebarMode(stored);
    return subscribeSidebarMode((m) => setInternalMode(m));
  }, []);

  const isDailySessionRoute =
    pathname === '/daily-session' ||
    pathname === '/progress-dashboard' ||
    pathname === '/question-bank';
  const isLabRoute = isLabsPath(pathname);
  const isCareerRoute = pathname === '/career' || pathname.startsWith('/career/');
  const isAiTodoRoute = pathname === '/ai-todo';

  const isSwapnilxi = user?.email?.toLowerCase() === 'swapnilgupta.xi@gmail.com';
  const mySpaceLabel = isSwapnilxi ? 'swapnilxi space' : 'MySpace';
  const mySpacePath = isSwapnilxi ? '/daily-session?tab=swapnilxi-space' : '/daily-session?tab=myspace';
  const dailySessionLinks: SidebarLink[] = [
    ...DAILY_SESSION_LINKS,
    {
      label: mySpaceLabel,
      path: mySpacePath,
      icon: isSwapnilxi ? 'ShieldCheckIcon' : 'UserCircleIcon',
      tint: isSwapnilxi ? 'indigo' : 'pink',
    },
  ];

  // Menu groups start closed; the group of the page you are on opens itself (effects below).
  const [dailySessionOpen, setDailySessionOpen] = useState(false);
  const [labsOpen, setLabsOpen] = useState(false);
  const [careerOpen, setCareerOpen] = useState(false);
  const [todoOpen, setTodoOpen] = useState(false);

  // Icon rail: which groups are expanded inline (sub-icons render directly under the main icon).
  const [railOpen, setRailOpen] = useState({ daily: false, labs: false, todo: false, career: false });
  const setRailGroup = (g: keyof typeof railOpen, open: boolean) => setRailOpen((cur) => ({ ...cur, [g]: open }));

  // Rail tooltip: fixed-position so the scrolling <nav> can't clip it.
  const [railTip, setRailTip] = useState<{ label: string; top: number } | null>(null);
  const tip = (label: string) => ({
    onMouseEnter: (e: React.MouseEvent<HTMLElement>) => {
      const r = e.currentTarget.getBoundingClientRect();
      setRailTip({ label, top: r.top + r.height / 2 });
    },
    onMouseLeave: () => setRailTip(null),
    onFocus: (e: React.FocusEvent<HTMLElement>) => {
      const r = e.currentTarget.getBoundingClientRect();
      setRailTip({ label, top: r.top + r.height / 2 });
    },
    onBlur: () => setRailTip(null),
  });

  useEffect(() => {
    if (isDailySessionRoute) setRailGroup('daily', true);
    if (isLabRoute) setRailGroup('labs', true);
    if (isAiTodoRoute) setRailGroup('todo', true);
    if (isCareerRoute) setRailGroup('career', true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isDailySessionRoute, isLabRoute, isAiTodoRoute, isCareerRoute]);

  useEffect(() => {
    if (isDailySessionRoute) setDailySessionOpen(true);
  }, [isDailySessionRoute]);

  useEffect(() => {
    if (isLabRoute) setLabsOpen(true);
  }, [isLabRoute]);

  useEffect(() => {
    if (isCareerRoute) setCareerOpen(true);
  }, [isCareerRoute]);

  useEffect(() => {
    if (isAiTodoRoute) setTodoOpen(true);
  }, [isAiTodoRoute]);

  const isDailySessionTabActive = (path: string) => {
    const currentTab = new URLSearchParams(search).get('tab') || 'session';
    const targetTab = new URLSearchParams(path.split('?')[1] || '').get('tab') || 'session';
    return (
      (pathname === '/daily-session' ||
        pathname === '/progress-dashboard' ||
        pathname === '/question-bank') &&
      currentTab === targetTab
    );
  };

  const isCareerLinkActive = (path: string) => {
    const currentTab = new URLSearchParams(search).get('tab') || 'resumes';
    const targetTab = new URLSearchParams(path.split('?')[1] || '').get('tab');
    if (targetTab) {
      return (pathname === '/career' || pathname.startsWith('/career/')) && currentTab === targetTab;
    }
    return pathname === path;
  };

  const isAiTodoTabActive = (path: string) => {
    if (pathname !== '/ai-todo') return false;
    const currentTab = new URLSearchParams(search).get('tab') || 'quick';
    const targetTab = new URLSearchParams(path.split('?')[1] || '').get('tab') || 'quick';
    return currentTab === targetTab;
  };

  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKeyDown);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = '';
    };
  }, [isOpen, onClose]);

  const isActivePath = (path: string) =>
    path === '/swipe-learn'
      ? pathname === '/swipe-learn' || pathname === '/swipelearn'
      : pathname === path;

  const drawerRowClass = (active: boolean) => `drawer-row ${active ? 'drawer-row-active' : ''}`;
  const drawerHeadClass = (active: boolean) => `drawer-row drawer-row-head ${active ? 'drawer-row-active' : ''}`;

  const labDrawerRow = (link: SidebarLink) => (
    <Link
      key={link.path}
      href={link.path}
      onClick={onClose}
      aria-current={isActivePath(link.path) ? 'page' : undefined}
      className={`${drawerRowClass(isActivePath(link.path))} drawer-row-sub`}
    >
      <NavTile icon={link.icon} tint={link.tint} size="sm" soft={!isActivePath(link.path)} />
      <span className="min-w-0 flex-1 truncate">{link.label}</span>
    </Link>
  );

  /** Icon rail item: a 48px platter (hover / current) around the tile. `sub` = a 40px platter inside an open group. */
  const railItemClass = (active: boolean, sub = false) =>
    `rail-item ${sub ? 'rail-item-sub' : ''} ${active ? 'rail-item-active' : ''}`;

  /** A single rail destination: its tile, the current-page marker on the rail edge, and an optional corner dot. */
  const renderRailLink = (href: string, icon: string, tint: Tint, label: string, active: boolean, tipLabel = label, dot?: string) => (
    <Link
      href={href}
      className={railItemClass(active)}
      aria-label={label}
      aria-current={active ? 'page' : undefined}
      {...tip(tipLabel)}
    >
      <NavTile icon={icon} tint={tint} size="rail" />
      {dot && <span aria-hidden="true" className={`rail-dot ${dot}`} />}
      {active && <span aria-hidden="true" className="rail-indicator" />}
    </Link>
  );

  /** A rail destination drawn as a flat outlined glyph (the quiet round style of the theme, log out and hide buttons), not a tile. */
  const renderRailQuietLink = (href: string, icon: string, label: string, active: boolean) => (
    <Link
      href={href}
      className={`rail-item rail-item-quiet ${active ? 'rail-item-active' : ''}`}
      aria-label={label}
      aria-current={active ? 'page' : undefined}
      {...tip(label)}
    >
      <Icon name={icon} size={20} variant="outline" />
      {active && <span aria-hidden="true" className="rail-indicator" />}
    </Link>
  );

  /** A rail group: main tile (navigates + expands) with a chevron badge; sub-tiles sit directly below and push the rest down. */
  const renderRailGroup = (
    id: keyof typeof railOpen,
    href: string,
    icon: string,
    tint: Tint,
    label: string,
    links: SidebarLink[],
    groupActive: boolean,
    isLinkActive: (path: string) => boolean,
    dividerBefore: string[] = []
  ) => {
    const open = railOpen[id];
    return (
      <div className="relative flex w-full flex-col items-center gap-1">
        <div className="relative h-[48px] w-[48px]">
          <Link
            href={href}
            onClick={() => setRailGroup(id, true)}
            className={railItemClass(groupActive)}
            aria-label={label}
            {...tip(label)}
          >
            <NavTile icon={icon} tint={tint} size="rail" />
            {groupActive && <span aria-hidden="true" className="rail-indicator" />}
          </Link>
          <button
            type="button"
            onClick={() => setRailGroup(id, !open)}
            aria-expanded={open}
            aria-label={`${open ? 'Collapse' : 'Expand'} ${label} sub-menu`}
            className="rail-chevron"
          >
            <Icon name="ChevronDownIcon" size={10} variant="solid" className={`transition-transform ${open ? 'rotate-180' : ''}`} />
          </button>
        </div>
        {open && (
          <div className="rail-subgroup">
            {links.map((link) => {
              const active = isLinkActive(link.path);
              return (
                <Fragment key={link.path}>
                  {dividerBefore.includes(link.path) && <span aria-hidden="true" className="rail-subgroup-divider" />}
                  <Link
                    href={link.path}
                    aria-label={link.label}
                    aria-current={active ? 'page' : undefined}
                    className={railItemClass(active, true)}
                    {...tip(link.label)}
                  >
                    <NavTile icon={link.icon} tint={link.tint} size="railSub" soft={!active} />
                  </Link>
                </Fragment>
              );
            })}
          </div>
        )}
      </div>
    );
  };

  return (
    <>
      {/* ─────────────────────────────────────────────────────────────
          1. ICON-ONLY DOCKED SIDEBAR RAIL (VISIBLE WHEN mode === 'icon-only')
          ───────────────────────────────────────────────────────────── */}
      {mode === 'icon-only' && (
        <aside
          aria-label="Icon Sidebar"
          className="app-rail fixed top-0 bottom-0 z-[110] w-[60px] border-r hidden md:flex flex-col justify-between items-center transition-transform duration-200"
        >
          {/* Top header: 60px height to perfectly match app-header height end-to-end */}
          <div className="flex items-center justify-center w-full h-[60px] border-b border-[color:var(--color-separator)] flex-shrink-0">
            <button
              type="button"
              onClick={onOpenDrawer ?? onClose}
              className="rail-item rail-item-quiet"
              aria-label="Expand full sidebar"
              {...tip('Expand sidebar')}
            >
              <Icon name="ChevronRightIcon" size={20} variant="outline" />
            </button>
          </div>

          {/* Middle navigation items */}
          <nav className="flex-1 w-full overflow-y-auto overscroll-contain scrollbar-none flex flex-col items-center gap-1 pt-2 pb-[4rem] min-h-0">
            {renderRailGroup('daily', '/daily-session', 'AcademicCapIcon', 'blue', 'Daily Session', dailySessionLinks, isDailySessionRoute, isDailySessionTabActive)}

            {renderRailLink('/swipe-learn', 'Square3Stack3DIcon', 'pink', 'SwipeLearn', isActivePath('/swipe-learn'), 'SwipeLearn · Feed', 'bg-primary')}

            {renderRailLink('/swipe-pdf-reader', 'DocumentTextIcon', 'red', 'Swipe PDF Reader', isActivePath('/swipe-pdf-reader'), 'Swipe PDF Reader · New', 'bg-emerald-500')}

            {renderRailGroup('labs', LABS_HOME.path, 'BeakerIcon', 'green', 'Labs', LAB_LINKS, isLabRoute, (path) => pathname === path, LAB_RAIL_DIVIDERS)}

            <span aria-hidden="true" className="my-1 h-px w-[24px] flex-shrink-0 bg-[color:var(--color-separator)]" />

            {renderRailGroup('todo', '/ai-todo', 'ClipboardDocumentCheckIcon', 'orange', 'Personalised To-Do', AI_TODO_LINKS, isAiTodoRoute, isAiTodoTabActive)}

            {renderRailLink('/ai-lms', 'SparklesIcon', 'purple', 'AI LMS', pathname === '/ai-lms' || pathname.startsWith('/ai-lms/'))}

            {renderRailLink('/linkedin-post-generator', 'PencilSquareIcon', 'cyan', 'LinkedIn Post Generator', isActivePath('/linkedin-post-generator'))}

            {renderRailGroup('career', '/career', 'BriefcaseIcon', 'brown', 'Career Studio', CAREER_LINKS, isCareerRoute, isCareerLinkActive)}

            {isAdmin && renderRailLink('/admin', 'ShieldCheckIcon', 'gray', 'Admin Portal', isActivePath('/admin'))}
          </nav>

          {/* Bottom actions: all flat outlined glyphs (Install app and Settings are links, the rest buttons). */}
          <div className="flex flex-col items-center gap-0.5 w-full py-2 border-t border-[color:var(--color-separator)] flex-shrink-0">
            {/* Settings ▸ Install app (the APK and the web app). Nothing to install from inside the Android app. */}
            {!isNativeApp &&
              renderRailQuietLink('/config?section=install', 'ArrowDownTrayIcon', 'Install app', pathname === '/config' && new URLSearchParams(search).get('section') === 'install')}

            {renderRailQuietLink('/config', 'Cog6ToothIcon', 'Settings', pathname === '/config' && new URLSearchParams(search).get('section') !== 'install')}

            <button
              type="button"
              onClick={onToggleTheme}
              className="rail-item rail-item-quiet"
              aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} theme`}
              {...tip(theme === 'dark' ? 'Light Theme' : 'Dark Theme')}
            >
              <ThemeToggleIcon theme={theme} size={20} variant="outline" />
            </button>

            {isGuest ? (
              <button
                type="button"
                onClick={() => openLoginModal()}
                className="rail-item rail-item-quiet"
                aria-label="Log in"
                {...tip('Log in')}
              >
                <Icon name="UserCircleIcon" size={20} variant="outline" />
              </button>
            ) : (
              <button
                type="button"
                onClick={logout}
                className="rail-item rail-item-quiet"
                aria-label="Log out"
                {...tip(`Log out (${user?.email})`)}
              >
                <Icon name="ArrowRightOnRectangleIcon" size={20} variant="outline" />
              </button>
            )}

            <button
              type="button"
              onClick={() => setMode('hidden')}
              className="rail-item rail-item-quiet rail-item-danger"
              aria-label="Hide sidebar menu completely"
              {...tip('Hide sidebar menu')}
            >
              <Icon name="EyeSlashIcon" size={20} variant="outline" />
            </button>
          </div>
        </aside>
      )}

      {/* Rail Tooltip - Rendered outside aside */}
      {mode === 'icon-only' && railTip && (
        <div
          role="tooltip"
          style={{ top: railTip.top }}
          className="rail-tooltip pointer-events-none fixed left-[68px] z-[360] -translate-y-1/2 whitespace-nowrap px-2.5 py-1 text-[13px] font-medium text-popover-foreground animate-in fade-in-0 duration-100"
        >
          {railTip.label}
        </div>
      )}

      {/* ─────────────────────────────────────────────────────────────
          2. MENU (isOpen === true). md and up: a drawer from the left. Phones: a bottom sheet opened from the tab bar's
          More tab (or the header avatar), laid out like an iOS grouped list. Same links and groups at every size.
          ───────────────────────────────────────────────────────────── */}
      <div
        className={`app-drawer-backdrop ${isOpen ? 'is-open' : ''}`}
        onClick={onClose}
        aria-hidden="true"
      />

      <aside className="app-drawer" data-open={isOpen ? 'true' : 'false'} aria-hidden={!isOpen} aria-label="Menu">
        <div className="app-drawer-grabber md:hidden" aria-hidden="true">
          <span />
        </div>

        {/* Top Header */}
        <div className="app-drawer-head">
          <div className="flex items-center gap-2.5">
            <BrandMark size={26} />
            <span className="font-heading text-[17px] font-semibold tracking-[-0.02em] text-foreground">Lab-Ninja</span>
          </div>
          <div className="flex items-center gap-1.5">
            {/* The icon rail exists from md up only, so its controls do too. */}
            <button
              type="button"
              onClick={() => {
                setMode('icon-only');
                onClose();
              }}
              className="theme-toggle hidden md:inline-flex"
              aria-label="Collapse to icon rail"
              title="Collapse to icon rail"
            >
              <Icon name="ChevronLeftIcon" size={18} variant="outline" />
            </button>
            <button
              type="button"
              onClick={() => {
                setMode('hidden');
                onClose();
              }}
              className="theme-toggle hidden md:inline-flex hover:bg-rose-500/15 hover:text-rose-600 dark:hover:text-rose-400"
              aria-label="Hide sidebar"
              title="Hide sidebar completely"
            >
              <Icon name="XMarkIcon" size={18} variant="outline" />
            </button>
            <button type="button" onClick={onClose} className="sheet-done md:hidden">
              Done
            </button>
          </div>
        </div>

        {/* Drawer Links Navigation */}
        <nav className="app-drawer-nav scrollbar-clean">
          {/* Phones: the account card leads, as in iOS Settings (the md+ footer below holds the same actions). */}
          <section className="drawer-group md:hidden" aria-label="Account">
            {isGuest ? (
              <button
                type="button"
                onClick={() => {
                  onClose();
                  openLoginModal();
                }}
                className="drawer-row drawer-row-tall"
              >
                <span className="drawer-avatar" aria-hidden="true">
                  <Icon name="UserIcon" size={20} variant="solid" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[16px] font-semibold text-foreground">Log in</span>
                  <span className="block text-[13px] text-muted-foreground">You&rsquo;re browsing as a guest</span>
                </span>
                <Icon name="ChevronRightIcon" size={16} className="drawer-chevron" />
              </button>
            ) : (
              <div className="drawer-row drawer-row-tall">
                <span className="drawer-avatar" aria-hidden="true">
                  {initialsFor(user?.display_name || user?.email)}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[16px] font-semibold text-foreground">
                    {user?.display_name || 'Your account'}
                  </span>
                  {user?.email && (
                    <span className="block truncate text-[13px] text-muted-foreground">{user.email}</span>
                  )}
                </span>
              </div>
            )}
            <Link href="/config" onClick={onClose} className={drawerRowClass(pathname === '/config')}>
              <NavTile icon="Cog6ToothIcon" tint="gray" />
              <span className="min-w-0 flex-1 truncate">Settings</span>
              <Icon name="ChevronRightIcon" size={16} className="drawer-chevron" />
            </Link>
            {/* Settings ▸ Install app (the APK and the web app). Nothing to install from inside the Android app. */}
            {!isNativeApp && (
              <Link
                href="/config?section=install"
                onClick={onClose}
                className={drawerRowClass(false)}
              >
                <NavTile icon="ArrowDownTrayIcon" tint="blue" />
                <span className="min-w-0 flex-1 truncate">Install app</span>
                <Icon name="ChevronRightIcon" size={16} className="drawer-chevron" />
              </Link>
            )}
            <div className="drawer-row">
              <NavTile tint="indigo">
                <ThemeToggleIcon theme={theme} size={19} variant="solid" />
              </NavTile>
              <span className="min-w-0 flex-1 truncate">Appearance</span>
              <div className="ios-segmented" role="radiogroup" aria-label="Appearance">
                {(['light', 'dark'] as const).map((option) => {
                  const selected = (theme ?? 'light') === option;
                  return (
                    <button
                      key={option}
                      type="button"
                      role="radio"
                      aria-checked={selected}
                      onClick={() => {
                        if (!selected) onToggleTheme();
                      }}
                      className={`ios-segment ${selected ? 'ios-segment-active' : ''}`}
                    >
                      {option === 'light' ? 'Light' : 'Dark'}
                    </button>
                  );
                })}
              </div>
            </div>
            {/* A shortcut to the one accent selector (Settings ▸ Appearance), with the current colour: not a second picker. */}
            <Link href="/config#appearance" onClick={onClose} className="drawer-row">
              <NavTile icon="SwatchIcon" tint="pink" />
              <span className="min-w-0 flex-1 truncate">Accent colour</span>
              <span aria-hidden="true" className="h-[1.375rem] w-[1.375rem] flex-shrink-0 rounded-full bg-primary shadow-[inset_0_0_0_1px_rgba(0,0,0,0.12)]" />
              <Icon name="ChevronRightIcon" size={16} className="drawer-chevron" />
            </Link>
          </section>

          <section className="drawer-group" aria-label="Daily Session">
            <button
              type="button"
              onClick={() => setDailySessionOpen((prev) => !prev)}
              className={drawerHeadClass(isDailySessionRoute)}
              aria-expanded={dailySessionOpen}
            >
              <NavTile icon="AcademicCapIcon" tint="blue" />
              <span className="min-w-0 flex-1 truncate">Daily Session</span>
              <Icon
                name="ChevronDownIcon"
                size={16}
                variant="outline"
                className={`drawer-chevron transition-transform duration-200 ${dailySessionOpen ? 'rotate-180' : ''}`}
              />
            </button>

            {dailySessionOpen &&
              dailySessionLinks.map((link) => (
                <Link
                  key={link.path}
                  href={link.path}
                  onClick={onClose}
                  aria-current={isDailySessionTabActive(link.path) ? 'page' : undefined}
                  className={`${drawerRowClass(isDailySessionTabActive(link.path))} drawer-row-sub`}
                >
                  <NavTile icon={link.icon} tint={link.tint} size="sm" soft={!isDailySessionTabActive(link.path)} />
                  <span className="min-w-0 flex-1 truncate">{link.label}</span>
                  {(link.label === 'swapnilxi space' || link.label === 'MySpace') && (
                    <span className={`drawer-badge ${link.label === 'swapnilxi space' ? 'drawer-badge-warm' : ''}`}>
                      {link.label === 'swapnilxi space' ? 'VIP' : 'Private'}
                    </span>
                  )}
                </Link>
              ))}
          </section>

          <section className="drawer-group" aria-label="Learn">
            <Link
              href="/swipe-learn"
              onClick={onClose}
              aria-current={isActivePath('/swipe-learn') ? 'page' : undefined}
              className={drawerRowClass(isActivePath('/swipe-learn'))}
            >
              <NavTile icon="Square3Stack3DIcon" tint="pink" />
              <span className="min-w-0 flex-1 truncate">SwipeLearn</span>
              <span className="drawer-badge">Feed</span>
            </Link>
            <Link
              href="/swipe-pdf-reader"
              onClick={onClose}
              aria-current={isActivePath('/swipe-pdf-reader') ? 'page' : undefined}
              className={drawerRowClass(isActivePath('/swipe-pdf-reader'))}
            >
              <NavTile icon="DocumentTextIcon" tint="red" />
              <span className="min-w-0 flex-1 truncate">Swipe PDF Reader</span>
              <span className="drawer-badge drawer-badge-new">New</span>
            </Link>
            <Link
              href="/ai-lms"
              onClick={onClose}
              aria-current={isActivePath('/ai-lms') ? 'page' : undefined}
              className={drawerRowClass(isActivePath('/ai-lms'))}
            >
              <NavTile icon="SparklesIcon" tint="purple" />
              <span className="min-w-0 flex-1 truncate">AI LMS</span>
            </Link>
          </section>

          <section className="drawer-group" aria-label="Labs">
            <button
              type="button"
              onClick={() => setLabsOpen((prev) => !prev)}
              className={drawerHeadClass(isLabRoute)}
              aria-expanded={labsOpen}
            >
              <NavTile icon="BeakerIcon" tint="green" />
              <span className="min-w-0 flex-1 truncate">Labs</span>
              <Icon
                name="ChevronDownIcon"
                size={16}
                variant="outline"
                className={`drawer-chevron transition-transform duration-200 ${labsOpen ? 'rotate-180' : ''}`}
              />
            </button>

            {labsOpen && (
              <>
                {labDrawerRow(toLink(LABS_HOME))}
                {LAB_GROUP_LINKS.map((group) => (
                  <div key={group.id} role="group" aria-labelledby={`drawer-labs-${group.id}`} className="flex flex-col">
                    <p id={`drawer-labs-${group.id}`} className="px-[1.5rem] pb-1 pt-2.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      {group.label}
                    </p>
                    {group.links.map(labDrawerRow)}
                  </div>
                ))}
                {labDrawerRow(toLink(LABS_PROJECT_LINK))}
              </>
            )}
          </section>

          {/* Personalised To-do Accordion with Subtabs */}
          <section className="drawer-group" aria-label="Personalised To-do">
            <button
              type="button"
              onClick={() => setTodoOpen((prev) => !prev)}
              className={drawerHeadClass(isAiTodoRoute)}
              aria-expanded={todoOpen}
            >
              <NavTile icon="ClipboardDocumentCheckIcon" tint="orange" />
              <span className="min-w-0 flex-1 truncate">Personalised To-do</span>
              <Icon
                name="ChevronDownIcon"
                size={16}
                variant="outline"
                className={`drawer-chevron transition-transform duration-200 ${todoOpen ? 'rotate-180' : ''}`}
              />
            </button>

            {todoOpen &&
              AI_TODO_LINKS.map((link) => (
                <Link
                  key={link.path}
                  href={link.path}
                  onClick={onClose}
                  aria-current={isAiTodoTabActive(link.path) ? 'page' : undefined}
                  className={`${drawerRowClass(isAiTodoTabActive(link.path))} drawer-row-sub`}
                >
                  <NavTile icon={link.icon} tint={link.tint} size="sm" soft={!isAiTodoTabActive(link.path)} />
                  <span className="min-w-0 flex-1 truncate">{link.label}</span>
                </Link>
              ))}
          </section>

          {/* CAREER STUDIO INTEGRATION */}
          <section className="drawer-group" aria-label="Create">
            <Link
              href="/linkedin-post-generator"
              onClick={onClose}
              aria-current={isActivePath('/linkedin-post-generator') ? 'page' : undefined}
              className={drawerRowClass(isActivePath('/linkedin-post-generator'))}
            >
              <NavTile icon="PencilSquareIcon" tint="cyan" />
              <span className="min-w-0 flex-1 truncate">LinkedIn Post Generator</span>
            </Link>
            <button
              type="button"
              onClick={() => setCareerOpen((prev) => !prev)}
              className={drawerHeadClass(isCareerRoute)}
              aria-expanded={careerOpen}
            >
              <NavTile icon="BriefcaseIcon" tint="brown" />
              <span className="min-w-0 flex-1 truncate">Career Studio</span>
              <Icon
                name="ChevronDownIcon"
                size={16}
                variant="outline"
                className={`drawer-chevron transition-transform duration-200 ${careerOpen ? 'rotate-180' : ''}`}
              />
            </button>

            {careerOpen &&
              CAREER_LINKS.map((link) => (
                <Link
                  key={link.path}
                  href={link.path}
                  onClick={onClose}
                  aria-current={isCareerLinkActive(link.path) ? 'page' : undefined}
                  className={`${drawerRowClass(isCareerLinkActive(link.path))} drawer-row-sub`}
                >
                  <NavTile icon={link.icon} tint={link.tint} size="sm" soft={!isCareerLinkActive(link.path)} />
                  <span className="min-w-0 flex-1 truncate">{link.label}</span>
                </Link>
              ))}
          </section>

          {isAdmin && (
            <section className="drawer-group" aria-label="Admin">
              <Link
                href="/admin"
                onClick={onClose}
                aria-current={isActivePath('/admin') ? 'page' : undefined}
                className={drawerRowClass(isActivePath('/admin'))}
              >
                <NavTile icon="ShieldCheckIcon" tint="gray" />
                <span className="min-w-0 flex-1 truncate">Admin Portal</span>
              </Link>
            </section>
          )}

          {/* Phones: Log out sits on its own at the end, away from everyday rows. */}
          {!isGuest && (
            <section className="drawer-group md:hidden" aria-label="Session">
              <button
                type="button"
                onClick={() => {
                  logout();
                  onClose();
                }}
                className="drawer-row drawer-row-destructive"
              >
                <span className="min-w-0 flex-1 truncate text-center">Log out</span>
              </button>
            </section>
          )}
        </nav>

        {/* Drawer Footer (md and up; phones have the account card and Log out above) */}
        <div className="app-drawer-foot">
          {isGuest ? (
            <button type="button" onClick={() => { onClose(); openLoginModal(); }} className="app-nav-link flex-1">
              <Icon name="UserCircleIcon" size={18} variant="outline" />
              <span>Log in</span>
            </button>
          ) : (
            <button
              type="button"
              onClick={() => {
                logout();
                onClose();
              }}
              className="app-nav-link flex-1"
              title={user?.email}
            >
              <Icon name="ArrowRightOnRectangleIcon" size={18} variant="outline" />
              <span className="truncate">Log out</span>
            </button>
          )}
          {!isNativeApp && (
            <Link
              href="/config?section=install"
              onClick={onClose}
              className="theme-toggle"
              aria-label="Install app"
              title="Install app"
            >
              <Icon name="ArrowDownTrayIcon" size={18} variant="outline" />
            </Link>
          )}
          <Link
            href="/config"
            onClick={onClose}
            className="theme-toggle"
            aria-label="Settings"
            title="Settings"
          >
            <Icon name="Cog6ToothIcon" size={18} variant="outline" />
          </Link>
          <button
            type="button"
            onClick={onToggleTheme}
            className="theme-toggle"
            aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} theme`}
            title={`Switch to ${theme === 'dark' ? 'light' : 'dark'} theme`}
          >
            <ThemeToggleIcon theme={theme} size={18} variant="outline" />
          </button>
          <button
            type="button"
            onClick={() => {
              const nextMode = mode === 'icon-only' ? 'hidden' : 'icon-only';
              setMode(nextMode);
              if (nextMode === 'hidden') onClose();
            }}
            className="theme-toggle"
            aria-label={mode === 'icon-only' ? 'Hide sidebar completely' : 'Dock sidebar as icon rail'}
            title={mode === 'icon-only' ? 'Hide sidebar completely' : 'Dock sidebar as icon rail'}
          >
            <Icon name={mode === 'icon-only' ? 'EyeSlashIcon' : 'Bars3BottomLeftIcon'} size={18} variant="outline" />
          </button>
        </div>
      </aside>
    </>
  );
}
