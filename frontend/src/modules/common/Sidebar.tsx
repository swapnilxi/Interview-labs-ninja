'use client';

import { openLoginModal } from '@/components/auth/LoginModal';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useLocationSearch } from '@/lib/navigation/useLocationSearch';
import Icon from '@/components/ui/AppIcon';
import ThemeToggleIcon from '@/modules/common/ThemeToggleIcon';
import { useAuth } from '@/contexts/AuthContext';
import {
  SidebarMode,
  applySidebarMode,
  getStoredSidebarMode,
  setStoredSidebarMode,
  subscribeSidebarMode,
} from '@/lib/services/sidebarService';

interface SidebarLink {
  label: string;
  path: string;
  icon: string;
}

const DAILY_SESSION_LINKS: SidebarLink[] = [
  { label: 'Daily Session', path: '/daily-session?tab=session', icon: 'AcademicCapIcon' },
  { label: 'Practice Mode', path: '/daily-session?tab=practice', icon: 'SparklesIcon' },
  { label: 'Quick Practice', path: '/daily-session?tab=quick-practice', icon: 'BoltIcon' },
  { label: 'Progress Dashboard', path: '/daily-session?tab=progress', icon: 'ChartBarIcon' },
  { label: 'Question Bank', path: '/daily-session?tab=question-bank', icon: 'BookOpenIcon' },
];

const LAB_LINKS: SidebarLink[] = [
  { label: 'CV Lab', path: '/cv-lab', icon: 'EyeIcon' },
  { label: 'DSA Lab', path: '/dsa-lab', icon: 'CpuChipIcon' },
  { label: 'System Design', path: '/system-design-lab', icon: 'ServerStackIcon' },
  { label: 'Labs Project', path: '/labs-project', icon: 'FolderOpenIcon' },
];

const CAREER_LINKS: SidebarLink[] = [
  { label: 'Profiles', path: '/career?tab=profiles', icon: 'IdentificationIcon' },
  { label: 'Resumes', path: '/career?tab=resumes', icon: 'DocumentTextIcon' },
  { label: 'Portfolios', path: '/career?tab=portfolios', icon: 'GlobeAltIcon' },
  { label: 'Templates', path: '/career?tab=templates', icon: 'SwatchIcon' },
];

const AI_TODO_LINKS: SidebarLink[] = [
  { label: 'Quick Daily', path: '/ai-todo?tab=quick', icon: 'BoltIcon' },
  { label: 'Smart To-Do', path: '/ai-todo?tab=smart', icon: 'CpuChipIcon' },
  { label: 'Plan & Project', path: '/ai-todo?tab=plan', icon: 'MapIcon' },
  { label: 'Goals', path: '/ai-todo?tab=goals', icon: 'ViewfinderCircleIcon' },
];

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
  const isLabRoute = LAB_LINKS.some((link) => link.path === pathname);
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
      icon: isSwapnilxi ? 'ShieldCheckIcon' : 'SparklesIcon',
    },
  ];

  const [dailySessionOpen, setDailySessionOpen] = useState(true);
  const [labsOpen, setLabsOpen] = useState(true);
  const [careerOpen, setCareerOpen] = useState(true);
  const [todoOpen, setTodoOpen] = useState(true);

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

  const navLinkClass = (path: string) =>
    `app-nav-link w-full ${isActivePath(path) ? 'app-nav-link-active' : ''}`;

  const railItemClass = (active: boolean) =>
    `relative group flex items-center justify-center w-9 h-9 rounded-lg transition-smooth ${
      active
        ? 'mix-bg-primary/15 text-primary border mix-border-primary/25 shadow-sm'
        : 'text-muted-foreground hover:bg-muted hover:text-foreground'
    }`;


  /** A rail group: main icon (navigates + expands) with a chevron toggle; sub-icons sit directly below and push the rest down. */
  const renderRailGroup = (
    id: keyof typeof railOpen,
    href: string,
    icon: string,
    label: string,
    links: SidebarLink[],
    groupActive: boolean,
    isLinkActive: (path: string) => boolean
  ) => {
    const open = railOpen[id];
    return (
      <div className="relative flex w-full flex-col items-center gap-1">
        <div className="relative h-9 w-9">
          <Link
            href={href}
            onClick={() => setRailGroup(id, true)}
            className={`${railItemClass(groupActive)} !h-9 !w-9`}
            aria-label={label}
            {...tip(label)}
          >
            <Icon name={icon as any} size={19} variant={groupActive ? 'solid' : 'outline'} />
            {groupActive && <span className="absolute -left-1 top-1/2 h-5 w-1 -translate-y-1/2 rounded-r-full bg-primary" />}
          </Link>
          <button
            type="button"
            onClick={() => setRailGroup(id, !open)}
            aria-expanded={open}
            aria-label={`${open ? 'Collapse' : 'Expand'} ${label} sub-menu`}
            className="absolute -bottom-0.5 -right-0.5 flex h-[0.9rem] w-[0.9rem] items-center justify-center rounded-full border border-border bg-card text-muted-foreground hover:text-foreground"
          >
            <Icon name="ChevronDownIcon" size={9} variant="solid" className={`transition-transform ${open ? 'rotate-180' : ''}`} />
          </button>
        </div>
        {open && (
          <div
            className="flex w-[44px] flex-col items-center gap-1 rounded-xl py-1"
            style={{ background: 'color-mix(in srgb, var(--color-foreground) 5%, transparent)' }}
          >
            {links.map((link) => (
              <Link
                key={link.path}
                href={link.path}
                aria-label={link.label}
                className={railItemClass(isLinkActive(link.path))}
                {...tip(link.label)}
              >
                <Icon name={link.icon as any} size={17} variant="outline" />
              </Link>
            ))}
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
          className="fixed top-0 left-0 bottom-0 z-[110] w-[60px] border-r border-border backdrop-blur-md hidden md:flex flex-col justify-between items-center shadow-sm transition-transform duration-200"
        >
          {/* Top header: 60px height to perfectly match app-header height end-to-end */}
          <div className="flex items-center justify-center w-full h-[60px] border-b border-border flex-shrink-0">
            <button
              type="button"
              onClick={onOpenDrawer ?? onClose}
              className="relative group flex items-center justify-center w-9 h-9 rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground transition-smooth"
              aria-label="Expand full sidebar"
            
              {...tip('Expand sidebar')}>
              <Icon name="ChevronRightIcon" size={19} variant="outline" />
            </button>
          </div>

          {/* Middle navigation items */}
          <nav className="flex-1 w-full overflow-y-auto overscroll-contain scrollbar-none flex flex-col items-center gap-1 pt-1.5 pb-[4rem] min-h-0">
            {/* Daily Session Group */}
            {renderRailGroup('daily', '/daily-session', 'AcademicCapIcon', 'Daily Session', dailySessionLinks, isDailySessionRoute, isDailySessionTabActive)}

            {/* SwipeLearn */}
            <Link
              href="/swipe-learn"
              className={railItemClass(isActivePath('/swipe-learn'))}
              aria-label="SwipeLearn"
              {...tip('SwipeLearn · Feed')}
            >
              <Icon name="Square3Stack3DIcon" size={19} variant="outline" />
              <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-primary" />
            </Link>

            {/* Swipe PDF Reader */}
            <Link
              href="/swipe-pdf-reader"
              className={railItemClass(isActivePath('/swipe-pdf-reader'))}
              aria-label="Swipe PDF Reader"
              {...tip('Swipe PDF Reader · New')}
            >
              <Icon name="DocumentTextIcon" size={19} variant="outline" />
              <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-emerald-500" />
            </Link>

            {/* Labs Popover Group */}
            {renderRailGroup('labs', '/cv-lab', 'RectangleGroupIcon', 'Specialized Labs', LAB_LINKS, isLabRoute, (path) => pathname === path)}

            <div className="w-[1.5rem] h-[1px] bg-border my-1" />

            {/* Personalised To-do Popover Group */}
            {renderRailGroup('todo', '/ai-todo', 'ClipboardDocumentCheckIcon', 'Personalised To-Do', AI_TODO_LINKS, isAiTodoRoute, isAiTodoTabActive)}

            {/* AI LMS */}
            <Link
              href="/ai-lms"
              className={railItemClass(pathname === '/ai-lms' || pathname.startsWith('/ai-lms/'))}
              aria-label="AI LMS"
              {...tip('AI LMS')}
            >
              <Icon name="SparklesIcon" size={19} variant="outline" />
            </Link>

            {/* LinkedIn Post Generator */}
            <Link
              href="/linkedin-post-generator"
              className={railItemClass(isActivePath('/linkedin-post-generator'))}
              aria-label="LinkedIn Post Generator"
              {...tip('LinkedIn Post Generator')}
            >
              <Icon name="PencilSquareIcon" size={19} variant="outline" />
            </Link>

            {/* Career Studio Popover Group */}
            {renderRailGroup('career', '/career', 'BriefcaseIcon', 'Career Studio', CAREER_LINKS, isCareerRoute, isCareerLinkActive)}

            {/* Admin Portal */}
            {isAdmin && (
              <Link
                href="/admin"
                className={railItemClass(isActivePath('/admin'))}
                aria-label="Admin Portal"
                {...tip('Admin Portal')}
              >
                <Icon name="ShieldCheckIcon" size={19} variant="outline" />
              </Link>
            )}
          </nav>

          {/* Bottom actions */}
          <div className="flex flex-col items-center gap-1 w-full py-1.5 border-t border-border flex-shrink-0">
            {/* Settings */}
            <Link
              href="/config"
              className="relative group flex items-center justify-center w-9 h-9 rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground transition-smooth"
              aria-label="Settings"
            
              {...tip('Settings')}>
              <Icon name="Cog6ToothIcon" size={18} variant="outline" />
            </Link>

            {/* Theme Toggle */}
            <button
              type="button"
              onClick={onToggleTheme}
              className="relative group flex items-center justify-center w-9 h-9 rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground transition-smooth"
              aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} theme`}
            
              {...tip(theme === 'dark' ? 'Light Theme' : 'Dark Theme')}>
              <ThemeToggleIcon theme={theme} size={18} variant="outline" />
            </button>

            {/* Auth */}
            {isGuest ? (
              <button type="button" onClick={() => openLoginModal()}
                className="relative group flex items-center justify-center w-9 h-9 rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground transition-smooth"
                aria-label="Log in"
              
              {...tip('Log in')}>
                <Icon name="UserCircleIcon" size={18} variant="outline" />
              </button>
            ) : (
              <button
                type="button"
                onClick={logout}
                className="relative group flex items-center justify-center w-9 h-9 rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground transition-smooth"
                aria-label="Log out"
              {...tip(`Log out (${user?.email})`)}>
                <Icon name="ArrowRightOnRectangleIcon" size={18} variant="outline" />
              </button>
            )}

            {/* Quick Switch to Hide Mode */}
            <button
              type="button"
              onClick={() => setMode('hidden')}
              className="relative group flex items-center justify-center w-9 h-9 rounded-lg text-muted-foreground hover:bg-rose-500/10 hover:text-rose-600 dark:hover:text-rose-400 transition-smooth"
              aria-label="Hide sidebar menu completely"
            
              {...tip('Hide sidebar menu')}>
              <Icon name="EyeSlashIcon" size={18} variant="outline" />
            </button>
          </div>
        </aside>
      )}

      {/* Rail Tooltip - Rendered outside aside */}
      {mode === 'icon-only' && railTip && (
        <div
          role="tooltip"
          style={{ top: railTip.top }}
          className="pointer-events-none fixed left-[68px] z-[360] -translate-y-1/2 whitespace-nowrap rounded-md border border-border bg-popover px-2.5 py-1 text-xs font-medium text-popover-foreground shadow-md animate-in fade-in-0 duration-100"
        >
          {railTip.label}
        </div>
      )}

      {/* ─────────────────────────────────────────────────────────────
          2. FULL SLIDE-OUT DRAWER OVERLAY (TRIGGERED WHEN isOpen === true)
          ───────────────────────────────────────────────────────────── */}
      <div
        className={`fixed inset-0 z-[200] bg-black/40 backdrop-blur-sm transition-opacity duration-250 ${
          isOpen ? 'opacity-100' : 'pointer-events-none opacity-0'
        }`}
        onClick={onClose}
        aria-hidden="true"
      />

      <aside
        className={`fixed top-0 left-0 z-[210] flex h-full w-[290px] max-w-[85vw] flex-col border-r border-border bg-card shadow-2xl transition-transform duration-250 ease-smooth ${
          isOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
        aria-hidden={!isOpen}
      >
        {/* Top Header */}
        <div className="flex h-[60px] flex-shrink-0 items-center justify-between border-b border-border px-4">
          <div className="flex items-center gap-2.5">
            <svg
              width="26"
              height="26"
              viewBox="0 0 40 40"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
              className="transition-smooth flex-shrink-0"
            >
              <rect width="40" height="40" rx="8" fill="url(#drawer-logo-grad)" />
              <polygon
                points="20,6.4 23.39,16.61 33.6,20 23.39,23.39 20,33.6 16.61,23.39 6.4,20 16.61,16.61"
                fill="white"
              />
              <circle cx="20" cy="20" r="1.8" fill="#2563EB" />
              <defs>
                <linearGradient id="drawer-logo-grad" x1="0" y1="0" x2="40" y2="40" gradientUnits="userSpaceOnUse">
                  <stop stopColor="#2563EB" />
                  <stop offset="1" stopColor="#7C3AED" />
                </linearGradient>
              </defs>
            </svg>
            <span className="font-heading text-base font-semibold text-foreground">Lab-Ninja</span>
          </div>
          <div className="flex items-center gap-1.5">
            {/* Collapse to icon rail icon */}
            <button
              type="button"
              onClick={() => {
                setMode('icon-only');
                onClose();
              }}
              className="theme-toggle"
              aria-label="Collapse to icon rail"
              title="Collapse to icon rail"
            >
              <Icon name="ChevronLeftIcon" size={18} variant="outline" />
            </button>
            {/* Close & Hide sidebar menu button */}
            <button
              type="button"
              onClick={() => {
                setMode('hidden');
                onClose();
              }}
              className="theme-toggle hover:bg-rose-500/15 hover:text-rose-600 dark:hover:text-rose-400"
              aria-label="Hide sidebar"
              title="Hide sidebar completely"
            >
              <Icon name="XMarkIcon" size={18} variant="outline" />
            </button>
          </div>
        </div>

        {/* Drawer Links Navigation */}
        <nav className="flex-1 overflow-y-auto scrollbar-clean px-3 py-3">
          <div className="flex flex-col gap-1">
            <button
              type="button"
              onClick={() => setDailySessionOpen((prev) => !prev)}
              className={`app-nav-link w-full justify-between ${isDailySessionRoute ? 'app-nav-link-active' : ''}`}
              aria-expanded={dailySessionOpen}
            >
              <span className="flex items-center gap-1.5">
                <Icon name="AcademicCapIcon" size={18} variant="outline" />
                <span>Daily Session</span>
              </span>
              <Icon
                name="ChevronDownIcon"
                size={16}
                variant="outline"
                className={`transition-smooth ${dailySessionOpen ? 'rotate-180' : ''}`}
              />
            </button>

            {dailySessionOpen && (
              <div className="ml-4 flex flex-col gap-1 border-l border-border pl-3">
                {dailySessionLinks.map((link) => (
                  <Link
                    key={link.path}
                    href={link.path}
                    onClick={onClose}
                    className={`app-nav-link w-full justify-between ${
                      isDailySessionTabActive(link.path) ? 'app-nav-link-active' : ''
                    }`}
                  >
                    <span className="flex items-center gap-2">
                      <Icon name={link.icon as any} size={17} variant="outline" />
                      <span>{link.label}</span>
                    </span>
                    {(link.label === 'swapnilxi space' || link.label === 'MySpace') && (
                      <span className={`text-[11px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded ${
                        link.label === 'swapnilxi space'
                          ? 'bg-amber-500/20 text-amber-500'
                          : 'mix-bg-primary/15 lab-ink'
                      }`}>
                        {link.label === 'swapnilxi space' ? 'VIP' : 'Private'}
                      </span>
                    )}
                  </Link>
                ))}
              </div>
            )}

            <Link href="/swipe-learn" onClick={onClose} className={navLinkClass('/swipe-learn')}>
              <Icon name="Square3Stack3DIcon" size={18} variant="outline" />
              <div className="flex items-center justify-between flex-1">
                <span>SwipeLearn</span>
                <span className="text-[11px] uppercase font-bold tracking-wider px-1.5 py-0.5 rounded-full mix-bg-primary/15 lab-ink">
                  Feed
                </span>
              </div>
            </Link>

            <Link href="/swipe-pdf-reader" onClick={onClose} className={navLinkClass('/swipe-pdf-reader')}>
              <Icon name="DocumentTextIcon" size={18} variant="outline" />
              <div className="flex items-center justify-between flex-1">
                <span>Swipe PDF Reader</span>
                <span className="text-[11px] uppercase font-bold tracking-wider px-1.5 py-0.5 rounded-full bg-emerald-500/15 text-emerald-600 dark:text-emerald-400">
                  New
                </span>
              </div>
            </Link>

            <button
              type="button"
              onClick={() => setLabsOpen((prev) => !prev)}
              className={`app-nav-link w-full justify-between ${isLabRoute ? 'app-nav-link-active' : ''}`}
              aria-expanded={labsOpen}
            >
              <span className="flex items-center gap-1.5">
                <Icon name="RectangleGroupIcon" size={18} variant="outline" />
                <span>Labs</span>
              </span>
              <Icon
                name="ChevronDownIcon"
                size={16}
                variant="outline"
                className={`transition-smooth ${labsOpen ? 'rotate-180' : ''}`}
              />
            </button>

            {labsOpen && (
              <div className="ml-4 flex flex-col gap-1 border-l border-border pl-3">
                {LAB_LINKS.map((link) => (
                  <Link
                    key={link.path}
                    href={link.path}
                    onClick={onClose}
                    className={navLinkClass(link.path)}
                  >
                    <Icon name={link.icon as any} size={17} variant="outline" />
                    <span>{link.label}</span>
                  </Link>
                ))}
              </div>
            )}

            <div className="my-2 border-t border-border" role="separator" />

            {/* Personalised To-do Accordion with Subtabs */}
            <button
              type="button"
              onClick={() => setTodoOpen((prev) => !prev)}
              className={`app-nav-link w-full justify-between ${isAiTodoRoute ? 'app-nav-link-active' : ''}`}
              aria-expanded={todoOpen}
            >
              <span className="flex items-center gap-1.5">
                <Icon name="ClipboardDocumentCheckIcon" size={18} variant="outline" />
                <span>Personalised To-do</span>
              </span>
              <Icon
                name="ChevronDownIcon"
                size={16}
                variant="outline"
                className={`transition-smooth ${todoOpen ? 'rotate-180' : ''}`}
              />
            </button>

            {todoOpen && (
              <div className="ml-4 flex flex-col gap-1 border-l border-border pl-3">
                {AI_TODO_LINKS.map((link) => (
                  <Link
                    key={link.path}
                    href={link.path}
                    onClick={onClose}
                    className={`app-nav-link w-full ${isAiTodoTabActive(link.path) ? 'app-nav-link-active' : ''}`}
                  >
                    <Icon name={link.icon as any} size={17} variant="outline" />
                    <span>{link.label}</span>
                  </Link>
                ))}
              </div>
            )}

            <Link href="/ai-lms" onClick={onClose} className={navLinkClass('/ai-lms')}>
              <Icon name="SparklesIcon" size={18} variant="outline" />
              <span>AI LMS</span>
            </Link>

            <Link href="/linkedin-post-generator" onClick={onClose} className={navLinkClass('/linkedin-post-generator')}>
              <Icon name="PencilSquareIcon" size={18} variant="outline" />
              <span>LinkedIn Post Generator</span>
            </Link>

            {/* CAREER STUDIO INTEGRATION */}
            <button
              type="button"
              onClick={() => setCareerOpen((prev) => !prev)}
              className={`app-nav-link w-full justify-between ${isCareerRoute ? 'app-nav-link-active' : ''}`}
              aria-expanded={careerOpen}
            >
              <span className="flex items-center gap-1.5">
                <Icon name="BriefcaseIcon" size={18} variant="outline" />
                <span>Career Studio</span>
              </span>
              <Icon
                name="ChevronDownIcon"
                size={16}
                variant="outline"
                className={`transition-smooth ${careerOpen ? 'rotate-180' : ''}`}
              />
            </button>

            {careerOpen && (
              <div className="ml-4 flex flex-col gap-1 border-l border-border pl-3">
                {CAREER_LINKS.map((link) => (
                  <Link
                    key={link.path}
                    href={link.path}
                    onClick={onClose}
                    className={`app-nav-link w-full ${isCareerLinkActive(link.path) ? 'app-nav-link-active' : ''}`}
                  >
                    <Icon name={link.icon as any} size={17} variant="outline" />
                    <span>{link.label}</span>
                  </Link>
                ))}
              </div>
            )}

            {isAdmin && (
              <>
                <div className="my-2 border-t border-border" role="separator" />
                <Link href="/admin" onClick={onClose} className={navLinkClass('/admin')}>
                  <Icon name="ShieldCheckIcon" size={18} variant="outline" />
                  <span>Admin Portal</span>
                </Link>
              </>
            )}
          </div>
        </nav>

        {/* Drawer Footer */}
        <div className="flex flex-shrink-0 items-center gap-2 border-t border-border px-3 py-3">
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
