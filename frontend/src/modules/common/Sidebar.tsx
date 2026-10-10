'use client';

import { useEffect, useState, useRef } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import Icon from '@/components/ui/AppIcon';
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

const LAB_LINKS: SidebarLink[] = [
  { label: 'CV Lab', path: '/cv-lab', icon: 'EyeIcon' },
  { label: 'DSA Lab', path: '/dsa-lab', icon: 'CpuChipIcon' },
  { label: 'System Design', path: '/system-design-lab', icon: 'ServerStackIcon' },
];

const CAREER_LINKS: SidebarLink[] = [
  { label: 'Profiles', path: '/career?tab=profiles', icon: 'IdentificationIcon' },
  { label: 'Resumes', path: '/career?tab=resumes', icon: 'DocumentTextIcon' },
  { label: 'Portfolios', path: '/career?tab=portfolios', icon: 'GlobeAltIcon' },
  { label: 'Templates', path: '/career?tab=templates', icon: 'SwatchIcon' },
];

interface SidebarProps {
  isOpen: boolean;
  onClose: () => void;
  theme: 'light' | 'dark';
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

  const isLabRoute = LAB_LINKS.some((link) => link.path === pathname);
  const isCareerRoute = pathname === '/career' || pathname.startsWith('/career/');
  const [labsOpen, setLabsOpen] = useState(true);
  const [careerOpen, setCareerOpen] = useState(true);

  // Icon-only rail: a group's sub-icons expand inline under its icon (pushing the rest of
  // the rail down) instead of floating, since the rail's scroll container would clip a popover.
  const [railOpen, setRailOpen] = useState({ labs: false, career: false });
  const toggleRailGroup = (group: 'labs' | 'career') =>
    setRailOpen((cur) => ({ ...cur, [group]: !cur[group] }));

  useEffect(() => {
    if (isLabRoute) setRailOpen((cur) => ({ ...cur, labs: true }));
  }, [isLabRoute]);

  useEffect(() => {
    if (isCareerRoute) setRailOpen((cur) => ({ ...cur, career: true }));
  }, [isCareerRoute]);

  useEffect(() => {
    if (isLabRoute) setLabsOpen(true);
  }, [isLabRoute]);

  useEffect(() => {
    if (isCareerRoute) setCareerOpen(true);
  }, [isCareerRoute]);

  const isCareerLinkActive = (path: string) => {
    if (typeof window === 'undefined') return pathname === path;
    const search = window.location.search;
    const currentTab = new URLSearchParams(search).get('tab') || 'resumes';
    const targetTab = new URLSearchParams(path.split('?')[1] || '').get('tab');
    if (targetTab) {
      return (pathname === '/career' || pathname.startsWith('/career/')) && currentTab === targetTab;
    }
    return pathname === path;
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
        ? 'bg-primary/15 text-primary border border-primary/25 shadow-sm shadow-primary/10'
        : 'text-muted-foreground hover:bg-muted hover:text-foreground'
    }`;

  return (
    <>
      {/* ─────────────────────────────────────────────────────────────
          1. ICON-ONLY DOCKED SIDEBAR RAIL (VISIBLE WHEN mode === 'icon-only')
          ───────────────────────────────────────────────────────────── */}
      {mode === 'icon-only' && (
        <aside
          aria-label="Icon Sidebar"
          className="fixed top-0 left-0 bottom-0 z-[110] w-[60px] border-r border-border bg-card/95 backdrop-blur-md hidden md:flex flex-col justify-between items-center shadow-sm transition-transform duration-200"
        >
          {/* Top header: 60px height to perfectly match app-header height end-to-end */}
          <div className="flex items-center justify-center w-full h-[60px] border-b border-border/60 flex-shrink-0">
            <button
              type="button"
              onClick={onOpenDrawer ?? onClose}
              className="relative group flex items-center justify-center w-9 h-9 rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground transition-smooth"
              aria-label="Expand full sidebar"
              title="Expand full sidebar"
            >
              <Icon name="ChevronRightIcon" size={19} variant="outline" />
              <span className="pointer-events-none absolute left-[64px] top-1/2 -translate-y-1/2 rounded-md border border-border bg-popover px-2.5 py-1 text-xs font-medium text-popover-foreground shadow-md opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap z-[120]">
                Expand sidebar
              </span>
            </button>
          </div>

          {/* Middle navigation items */}
          <nav className="flex-1 w-full overflow-y-auto overscroll-contain scrollbar-none flex flex-col items-center gap-1 pt-1.5 pb-[4rem] min-h-0">
            {/* Daily Session */}
            <Link
              href="/daily-session"
              className={railItemClass(isActivePath('/daily-session'))}
              aria-label="Daily Session"
            >
              <Icon name="AcademicCapIcon" size={19} variant="outline" />
              <span className="pointer-events-none absolute left-[64px] top-1/2 -translate-y-1/2 rounded-md border border-border bg-popover px-2.5 py-1 text-xs font-medium text-popover-foreground shadow-md opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap z-[120]">
                Daily Session
              </span>
            </Link>

            {/* SwipeLearn */}
            <Link
              href="/swipe-learn"
              className={railItemClass(isActivePath('/swipe-learn'))}
              aria-label="SwipeLearn"
            >
              <Icon name="Square3Stack3DIcon" size={19} variant="outline" />
              <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-blue-500" />
              <span className="pointer-events-none absolute left-[64px] top-1/2 -translate-y-1/2 rounded-md border border-border bg-popover px-2.5 py-1 text-xs font-medium text-popover-foreground shadow-md opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap z-[120]">
                SwipeLearn <span className="text-[10px] text-blue-500 font-semibold ml-1">FEED</span>
              </span>
            </Link>

            {/* Swipe PDF Reader */}
            <Link
              href="/swipe-pdf-reader"
              className={railItemClass(isActivePath('/swipe-pdf-reader'))}
              aria-label="Swipe PDF Reader"
            >
              <Icon name="DocumentTextIcon" size={19} variant="outline" />
              <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-emerald-500" />
              <span className="pointer-events-none absolute left-[64px] top-1/2 -translate-y-1/2 rounded-md border border-border bg-popover px-2.5 py-1 text-xs font-medium text-popover-foreground shadow-md opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap z-[120]">
                Swipe PDF Reader <span className="text-[10px] text-emerald-500 font-semibold ml-1">NEW</span>
              </span>
            </Link>

            {/* Labs Popover Group */}
            <div className="flex w-full flex-col items-center gap-1">
              <button
                type="button"
                onClick={() => toggleRailGroup('labs')}
                className={railItemClass(isLabRoute)}
                aria-label="Labs (CV, DSA, System Design)"
                aria-expanded={railOpen.labs}
              >
                <Icon name="RectangleGroupIcon" size={19} variant="outline" />
                <Icon
                  name="ChevronDownIcon"
                  size={9}
                  variant="solid"
                  className={`absolute bottom-0.5 right-0.5 transition-transform ${railOpen.labs ? 'rotate-180' : ''}`}
                />
              </button>

              {railOpen.labs && (
                <div
                  className="flex w-[44px] flex-col items-center gap-1 rounded-xl py-1"
                  style={{ background: 'color-mix(in srgb, var(--color-foreground) 5%, transparent)' }}
                >
                  {LAB_LINKS.map((link) => (
                    <Link
                      key={link.path}
                      href={link.path}
                      title={link.label}
                      aria-label={link.label}
                      className={railItemClass(pathname === link.path)}
                    >
                      <Icon name={link.icon as any} size={17} variant="outline" />
                    </Link>
                  ))}
                </div>
              )}
            </div>

            {/* Progress */}
            <Link
              href="/progress-dashboard"
              className={railItemClass(isActivePath('/progress-dashboard'))}
              aria-label="Progress Dashboard"
            >
              <Icon name="ChartBarIcon" size={19} variant="outline" />
              <span className="pointer-events-none absolute left-[64px] top-1/2 -translate-y-1/2 rounded-md border border-border bg-popover px-2.5 py-1 text-xs font-medium text-popover-foreground shadow-md opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap z-[120]">
                Progress Dashboard
              </span>
            </Link>

            {/* Question Bank */}
            <Link
              href="/question-bank"
              className={railItemClass(isActivePath('/question-bank'))}
              aria-label="Question Bank"
            >
              <Icon name="BookOpenIcon" size={19} variant="outline" />
              <span className="pointer-events-none absolute left-[64px] top-1/2 -translate-y-1/2 rounded-md border border-border bg-popover px-2.5 py-1 text-xs font-medium text-popover-foreground shadow-md opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap z-[120]">
                Question Bank
              </span>
            </Link>

            <div className="w-6 h-[1px] bg-border my-1" />

            {/* Personalised To-do */}
            <Link
              href="/ai-todo"
              className={railItemClass(isActivePath('/ai-todo'))}
              aria-label="Personalised To-do"
            >
              <Icon name="ClipboardDocumentCheckIcon" size={19} variant="outline" />
              <span className="pointer-events-none absolute left-[64px] top-1/2 -translate-y-1/2 rounded-md border border-border bg-popover px-2.5 py-1 text-xs font-medium text-popover-foreground shadow-md opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap z-[120]">
                Personalised To-do
              </span>
            </Link>

            {/* AI LMS */}
            <Link
              href="/ai-lms"
              className={railItemClass(pathname === '/ai-lms' || pathname.startsWith('/ai-lms/'))}
              aria-label="AI LMS"
            >
              <Icon name="SparklesIcon" size={19} variant="outline" />
              <span className="pointer-events-none absolute left-[64px] top-1/2 -translate-y-1/2 rounded-md border border-border bg-popover px-2.5 py-1 text-xs font-medium text-popover-foreground shadow-md opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap z-[120]">
                AI LMS
              </span>
            </Link>

            {/* LinkedIn Post Generator */}
            <Link
              href="/linkedin-post-generator"
              className={railItemClass(isActivePath('/linkedin-post-generator'))}
              aria-label="LinkedIn Post Generator"
            >
              <Icon name="PencilSquareIcon" size={19} variant="outline" />
              <span className="pointer-events-none absolute left-[64px] top-1/2 -translate-y-1/2 rounded-md border border-border bg-popover px-2.5 py-1 text-xs font-medium text-popover-foreground shadow-md opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap z-[120]">
                LinkedIn Post Generator
              </span>
            </Link>

            {/* Career Studio Popover Group */}
            <div className="flex w-full flex-col items-center gap-1">
              <button
                type="button"
                onClick={() => toggleRailGroup('career')}
                className={railItemClass(isCareerRoute)}
                aria-label="Career Studio"
                aria-expanded={railOpen.career}
              >
                <Icon name="BriefcaseIcon" size={19} variant="outline" />
                <Icon
                  name="ChevronDownIcon"
                  size={9}
                  variant="solid"
                  className={`absolute bottom-0.5 right-0.5 transition-transform ${railOpen.career ? 'rotate-180' : ''}`}
                />
              </button>

              {railOpen.career && (
                <div
                  className="flex w-[44px] flex-col items-center gap-1 rounded-xl py-1"
                  style={{ background: 'color-mix(in srgb, var(--color-foreground) 5%, transparent)' }}
                >
                  {CAREER_LINKS.map((link) => (
                    <Link
                      key={link.path}
                      href={link.path}
                      title={link.label}
                      aria-label={link.label}
                      className={railItemClass(isCareerLinkActive(link.path))}
                    >
                      <Icon name={link.icon as any} size={17} variant="outline" />
                    </Link>
                  ))}
                </div>
              )}
            </div>

            {/* Admin Portal */}
            {isAdmin && (
              <Link
                href="/admin"
                className={railItemClass(isActivePath('/admin'))}
                aria-label="Admin Portal"
              >
                <Icon name="ShieldCheckIcon" size={19} variant="outline" />
                <span className="pointer-events-none absolute left-[64px] top-1/2 -translate-y-1/2 rounded-md border border-border bg-popover px-2.5 py-1 text-xs font-medium text-popover-foreground shadow-md opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap z-[120]">
                  Admin Portal
                </span>
              </Link>
            )}
          </nav>

          {/* Bottom actions */}
          <div className="flex flex-col items-center gap-1 w-full py-1.5 border-t border-border/60 flex-shrink-0">
            {/* Settings */}
            <Link
              href="/config"
              className="relative group flex items-center justify-center w-9 h-9 rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground transition-smooth"
              aria-label="Settings"
            >
              <Icon name="Cog6ToothIcon" size={18} variant="outline" />
              <span className="pointer-events-none absolute left-[64px] top-1/2 -translate-y-1/2 rounded-md border border-border bg-popover px-2.5 py-1 text-xs font-medium text-popover-foreground shadow-md opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap z-[120]">
                Settings
              </span>
            </Link>

            {/* Theme Toggle */}
            <button
              type="button"
              onClick={onToggleTheme}
              className="relative group flex items-center justify-center w-9 h-9 rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground transition-smooth"
              aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} theme`}
            >
              <Icon name={theme === 'dark' ? 'SunIcon' : 'MoonIcon'} size={18} variant="outline" />
              <span className="pointer-events-none absolute left-[64px] top-1/2 -translate-y-1/2 rounded-md border border-border bg-popover px-2.5 py-1 text-xs font-medium text-popover-foreground shadow-md opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap z-[120]">
                {theme === 'dark' ? 'Light Theme' : 'Dark Theme'}
              </span>
            </button>

            {/* Auth */}
            {isGuest ? (
              <Link
                href="/login"
                className="relative group flex items-center justify-center w-9 h-9 rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground transition-smooth"
                aria-label="Log in"
              >
                <Icon name="UserCircleIcon" size={18} variant="outline" />
                <span className="pointer-events-none absolute left-[64px] top-1/2 -translate-y-1/2 rounded-md border border-border bg-popover px-2.5 py-1 text-xs font-medium text-popover-foreground shadow-md opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap z-[120]">
                  Log in
                </span>
              </Link>
            ) : (
              <button
                type="button"
                onClick={logout}
                className="relative group flex items-center justify-center w-9 h-9 rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground transition-smooth"
                aria-label="Log out"
                title={user?.email}
              >
                <Icon name="ArrowRightOnRectangleIcon" size={18} variant="outline" />
                <span className="pointer-events-none absolute left-[64px] top-1/2 -translate-y-1/2 rounded-md border border-border bg-popover px-2.5 py-1 text-xs font-medium text-popover-foreground shadow-md opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap z-[120]">
                  Log out ({user?.email})
                </span>
              </button>
            )}

            {/* Quick Switch to Hide Mode */}
            <button
              type="button"
              onClick={() => setMode('hidden')}
              className="relative group flex items-center justify-center w-9 h-9 rounded-lg text-muted-foreground hover:bg-rose-500/10 hover:text-rose-600 dark:hover:text-rose-400 transition-smooth"
              aria-label="Hide sidebar menu completely"
              title="Hide sidebar menu completely"
            >
              <Icon name="EyeSlashIcon" size={18} variant="outline" />
              <span className="pointer-events-none absolute left-[64px] top-1/2 -translate-y-1/2 rounded-md border border-border bg-popover px-2.5 py-1 text-xs font-medium text-popover-foreground shadow-md opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap z-[120]">
                Hide sidebar menu
              </span>
            </button>
          </div>
        </aside>
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
            <Link href="/daily-session" onClick={onClose} className={navLinkClass('/daily-session')}>
              <Icon name="AcademicCapIcon" size={18} variant="outline" />
              <span>Daily Session</span>
            </Link>

            <Link href="/swipe-learn" onClick={onClose} className={navLinkClass('/swipe-learn')}>
              <Icon name="Square3Stack3DIcon" size={18} variant="outline" />
              <div className="flex items-center justify-between flex-1">
                <span>SwipeLearn</span>
                <span className="text-[10px] uppercase font-bold tracking-wider px-1.5 py-0.5 rounded-full bg-blue-500/15 text-blue-600 dark:text-blue-400">
                  Feed
                </span>
              </div>
            </Link>

            <Link href="/swipe-pdf-reader" onClick={onClose} className={navLinkClass('/swipe-pdf-reader')}>
              <Icon name="DocumentTextIcon" size={18} variant="outline" />
              <div className="flex items-center justify-between flex-1">
                <span>Swipe PDF Reader</span>
                <span className="text-[10px] uppercase font-bold tracking-wider px-1.5 py-0.5 rounded-full bg-emerald-500/15 text-emerald-600 dark:text-emerald-400">
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

            <Link href="/progress-dashboard" onClick={onClose} className={navLinkClass('/progress-dashboard')}>
              <Icon name="ChartBarIcon" size={18} variant="outline" />
              <span>Progress</span>
            </Link>

            <Link href="/question-bank" onClick={onClose} className={navLinkClass('/question-bank')}>
              <Icon name="BookOpenIcon" size={18} variant="outline" />
              <span>Question Bank</span>
            </Link>

            <div className="my-2 border-t border-border" role="separator" />

            <Link href="/ai-todo" onClick={onClose} className={navLinkClass('/ai-todo')}>
              <Icon name="ClipboardDocumentCheckIcon" size={18} variant="outline" />
              <span>Personalised To-do</span>
            </Link>

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
            <Link href="/login" onClick={onClose} className="app-nav-link flex-1">
              <Icon name="UserCircleIcon" size={18} variant="outline" />
              <span>Log in</span>
            </Link>
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
            <Icon name={theme === 'dark' ? 'SunIcon' : 'MoonIcon'} size={18} variant="outline" />
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
