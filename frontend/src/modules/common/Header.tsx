'use client';

import { openLoginModal } from '@/components/auth/LoginModal';
import { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import Icon from '@/components/ui/AppIcon';
import Sidebar from '@/modules/common/Sidebar';
import ThemeToggleIcon from '@/modules/common/ThemeToggleIcon';
import BrandMark from '@/modules/common/BrandMark';
import { initialsFor } from '@/lib/ui/initials';
import NotificationBell from '@/components/ui/NotificationCenter';
import { OPEN_NAV_EVENT } from '@/components/ui/MobileTabBar';
import { isLabsPath } from '@/modules/labs/common/labCatalog';
import { useAuth } from '@/contexts/AuthContext';
import { apiFetch, API_BASE_URL } from '@/lib/http/apiClient';
import { isLoggedIn } from '@/lib/auth/tokenStore';
import { reapplyStoredAccent, withColorTransition } from '@/lib/services/appearanceService';
import {
  SidebarMode,
  getStoredSidebarMode,
  setStoredSidebarMode,
  subscribeSidebarMode,
} from '@/lib/services/sidebarService';

interface NavigationItem {
  label: string;
  path: string;
  icon: string;
}

const navigationItems: NavigationItem[] = [
  {
    label: 'Daily Session',
    path: '/daily-session',
    icon: 'AcademicCapIcon',
  },
  // Every lab is one click from the Labs home (/labs) and the sidebar's Labs menu.
  {
    label: 'Labs',
    path: '/labs',
    icon: 'BeakerIcon',
  },
  {
    label: 'Labs Project',
    path: '/labs-project',
    icon: 'FolderOpenIcon',
  },
  {
    label: 'Config',
    path: '/config',
    icon: 'Cog6ToothIcon',
  },
];

// nextjs-api ("FE-API only") mode: every request goes to the Next.js routes, there is no FastAPI to probe.
const FE_API_ONLY = ['nextjs-api', 'nextjs', 'fe-api'].includes((process.env.NEXT_PUBLIC_BACKEND_MODE || '').toLowerCase());

function SystemStatus() {
  const [apiStatus, setApiStatus] = useState<'checking' | 'online' | 'offline' | 'unused'>(FE_API_ONLY ? 'unused' : 'checking');
  const [feApiStatus, setFeApiStatus] = useState<'checking' | 'online' | 'offline'>('checking');
  const [dbStatus, setDbStatus] = useState<'checking' | 'online' | 'offline'>('checking');

  useEffect(() => {
    const checkStatus = async () => {
      let apiOk = false;
      let feApiOk = false;
      let feDbAvailable = false;

      // 1. Check FastAPI (API) — only probe if an explicit URL is configured or if running locally
      const isLocalHost = typeof window !== 'undefined' && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1');
      const fastapiUrl = process.env.NEXT_PUBLIC_API_URL || (API_BASE_URL !== '' ? API_BASE_URL : (isLocalHost ? 'http://localhost:8082' : ''));

      if (FE_API_ONLY) {
        setApiStatus('unused');
      } else if (fastapiUrl) {
        try {
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 3000);
          const res = await fetch(`${fastapiUrl}/health`, { signal: controller.signal });
          clearTimeout(timeoutId);
          apiOk = res.ok;
          setApiStatus(res.ok ? 'online' : 'offline');
        } catch (err) {
          setApiStatus('offline');
        }
      } else {
        setApiStatus('offline');
      }

      // 2. Check Next.js Frontend API (FE-API)
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 3000);
        const res = await fetch('/api/health', { signal: controller.signal });
        clearTimeout(timeoutId);
        if (res.ok) {
          feApiOk = true;
          const data = await res.json().catch(() => ({}));
          feDbAvailable = !!data?.db_available;
          setFeApiStatus('online');
        } else {
          setFeApiStatus('offline');
        }
      } catch (err) {
        setFeApiStatus('offline');
      }

      // 3. Check DB status (Online if either FastAPI DB or Next.js SQLite DB is available)
      if (apiOk || feDbAvailable) {
        setDbStatus('online');
      } else if (!isLoggedIn()) {
        setDbStatus((apiOk || feApiOk) ? 'online' : 'offline');
      } else {
        try {
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 3000);
          const res = await apiFetch('/todo/stats', { signal: controller.signal });
          clearTimeout(timeoutId);
          setDbStatus(res.ok ? 'online' : 'offline');
        } catch (err) {
          setDbStatus((feDbAvailable || feApiOk) ? 'online' : 'offline');
        }
      }
    };
    
    checkStatus();
    const interval = setInterval(checkStatus, 15000); // Check every 15 seconds
    return () => clearInterval(interval);
  }, []);

  const StatusRow = ({ label, status }: { label: string, status: string }) => (
    <div
      className="flex items-center gap-1 leading-none"
      title={`${label}: ${status === 'checking' ? 'checking…' : status === 'unused' ? 'not used in FE-API mode' : status}`}
    >
      {status === 'checking' ? (
        <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
      ) : status === 'unused' ? (
        <span className="w-1.5 h-1.5 rounded-full bg-slate-400/60" />
      ) : status === 'online' ? (
        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shadow-[0_0_6px_rgba(16,185,129,0.5)]" />
      ) : (
        <span className="w-1.5 h-1.5 rounded-full bg-rose-500 shadow-[0_0_6px_rgba(244,63,94,0.5)]" />
      )}
      <span className="w-9 text-[8px] font-medium text-muted-foreground uppercase tracking-wider">{label}</span>
    </div>
  );

  return (
    <div className="flex flex-col gap-0.5 px-2 py-1 rounded-md border border-border mr-3">
      <StatusRow label="API" status={apiStatus} />
      <StatusRow label="FE-API" status={feApiStatus} />
      <StatusRow label="DB" status={dbStatus} />
    </div>
  );
}

function AuthStatus() {
  const { user, isGuest, logout } = useAuth();
  if (isGuest) {
    return (
      <button type="button" onClick={() => openLoginModal()} className="app-nav-link">
        <Icon name="UserCircleIcon" size={18} variant="outline" />
        <span>Log in</span>
      </button>
    );
  }
  return (
    <div className="flex items-center gap-2">
      <span className="hidden text-xs text-muted-foreground max-w-[140px] truncate sm:inline" title={user?.email}>
        {user?.display_name || user?.email}
      </span>
      <button
        type="button"
        onClick={logout}
        className="theme-toggle"
        aria-label="Log out"
        title="Log out"
      >
        <Icon name="ArrowRightOnRectangleIcon" size={18} variant="outline" />
      </button>
    </div>
  );
}

/**
 * Phones: the account lives behind an avatar (it opens the More sheet, which holds the account card, Settings, theme
 * and Log out), not behind a one-tap Log out icon in thumb range of the brand. Guests get a Log in pill instead.
 */
function MobileAccountButton() {
  const { user, isGuest } = useAuth();
  if (isGuest) {
    return (
      <button type="button" onClick={() => openLoginModal()} className="nav-pill-button">
        Log in
      </button>
    );
  }
  const name = (user?.display_name || user?.email || '').trim();
  const initials = initialsFor(name);
  return (
    <button
      type="button"
      onClick={() => window.dispatchEvent(new Event(OPEN_NAV_EVENT))}
      className="nav-avatar"
      aria-label={`Account and settings${name ? ` (${name})` : ''}`}
    >
      {initials}
    </button>
  );
}

export default function Header() {
  const pathname = usePathname();
  const { isAdmin } = useAuth();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarMode, setSidebarMode] = useState<SidebarMode>('icon-only');
  const [theme, setTheme] = useState<'light' | 'dark' | null>(null);

  useEffect(() => {
    const storedTheme = (localStorage.getItem('lab-ninja-theme') || localStorage.getItem('interview-ninja-theme')) as 'light' | 'dark' | null;
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    const initialTheme = storedTheme ?? (prefersDark ? 'dark' : 'light');
    setTheme(initialTheme);
    document.documentElement.classList.toggle('dark', initialTheme === 'dark');

    const handleThemeEvent = (e: Event) => {
      const customEvent = e as CustomEvent<'light' | 'dark'>;
      const newTheme = customEvent.detail || ((localStorage.getItem('lab-ninja-theme') || localStorage.getItem('interview-ninja-theme')) as 'light' | 'dark' | null);
      if (newTheme && (newTheme === 'light' || newTheme === 'dark')) {
        setTheme(newTheme);
      }
    };
    window.addEventListener('lab-ninja-theme-change', handleThemeEvent);

    const openNav = () => setSidebarOpen(true);
    window.addEventListener(OPEN_NAV_EVENT, openNav);

    // Initialize and subscribe to sidebar mode
    setSidebarMode(getStoredSidebarMode());
    const unsub = subscribeSidebarMode((m) => setSidebarMode(m));
    return () => {
      unsub();
      window.removeEventListener(OPEN_NAV_EVENT, openNav);
      window.removeEventListener('lab-ninja-theme-change', handleThemeEvent);
    };
  }, []);

  const handleModeChange = (newMode: SidebarMode) => {
    setSidebarMode(newMode);
    setStoredSidebarMode(newMode);
    if (newMode === 'hidden') {
      setSidebarOpen(false);
    }
  };

  // `theme` stays null until the effect above has read the stored theme, so the first client render matches the server
  // (which cannot know it): reading the DOM here instead made the toggle's label and icon differ from the server HTML
  // on a dark first paint (a hydration warning). <ThemeToggleIcon> bridges that gap without showing the wrong icon.
  const resolvedTheme: 'light' | 'dark' = theme ?? 'light';

  const isActivePath = (path: string) => {
    if (path === '/labs') return pathname !== '/labs-project' && isLabsPath(pathname);
    if (path === '/swipe-learn') {
      return pathname === '/swipe-learn' || pathname === '/swipelearn';
    }
    return pathname === path;
  };

  const toggleSidebar = () => {
    if (sidebarMode === 'hidden') {
      handleModeChange('icon-only');
    } else {
      setSidebarOpen((prev) => !prev);
    }
  };

  const closeSidebar = () => {
    setSidebarOpen(false);
  };

  const toggleTheme = () => {
    const nextTheme = resolvedTheme === 'dark' ? 'light' : 'dark';
    setTheme(nextTheme);
    localStorage.setItem('lab-ninja-theme', nextTheme);
    // Cross-fade the switch (colours only). theme-color + Android status-bar icons follow via
    // components/ui/SystemChromeSync, which watches the class.
    withColorTransition(() => {
      document.documentElement.classList.toggle('dark', nextTheme === 'dark');
      reapplyStoredAccent();
    });
    window.dispatchEvent(new CustomEvent('lab-ninja-theme-change', { detail: nextTheme }));
  };

  return (
    <>
      <header className={`app-header transition-[left] duration-200 ${sidebarMode === 'icon-only' ? 'md:left-[calc(60px+var(--safe-left))]' : 'left-0'}`}>
        <nav className="h-[60px] px-4 sm:px-[1.5rem] xl:px-8 flex items-center justify-between gap-2 sm:gap-4">
          <div className="flex items-center gap-3">
            {/* Phones open the menu from the tab bar's More tab; this toggle is for the md+ sidebar. */}
            <button
              type="button"
              onClick={toggleSidebar}
              className={`theme-toggle hidden ${sidebarMode === 'icon-only' ? '' : 'md:inline-flex'}`}
              aria-label="Toggle navigation menu"
              aria-expanded={sidebarOpen}
              title={sidebarMode === 'hidden' ? 'Show sidebar menu' : sidebarOpen ? 'Close menu' : 'Open navigation menu'}
            >
              <Icon
                name={sidebarMode === 'hidden' ? 'Bars3Icon' : sidebarOpen ? 'ChevronLeftIcon' : 'ChevronRightIcon'}
                size={20}
                variant="outline"
              />
            </button>

            <Link
              href="/daily-session"
              className="flex items-center gap-2.5 transition-smooth hover:opacity-85 active:opacity-70"
              aria-label="Lab-Ninja home"
            >
              <BrandMark size={30} className="md:h-[34px] md:w-[34px]" />
              <span className="font-heading whitespace-nowrap text-[17px] font-semibold tracking-[-0.02em] text-foreground md:text-xl">
                Lab-Ninja
              </span>
            </Link>
          </div>

          <div className="hidden lg:flex items-center gap-2">
            <SystemStatus />
            {isAdmin && (
              <Link
                href="/admin"
                className={`app-nav-link ${isActivePath('/admin') ? 'app-nav-link-active' : ''}`}
              >
                <Icon name="ShieldCheckIcon" size={18} variant="outline" />
                <span>Admin</span>
              </Link>
            )}
            {navigationItems.map((item) => (
              <Link
                key={item.path}
                href={item.path}
                className={`app-nav-link ${
                    isActivePath(item.path)
                      ? 'app-nav-link-active'
                      : ''
                  }`}
              >
                <Icon name={item.icon as any} size={18} variant="outline" />
                <span>{item.label}</span>
              </Link>
            ))}
            <span className="ml-2"><NotificationBell /></span>
            <button
              type="button"
              onClick={toggleTheme}
              className="theme-toggle"
              aria-label={`Switch to ${resolvedTheme === 'dark' ? 'light' : 'dark'} theme`}
              title={`Switch to ${resolvedTheme === 'dark' ? 'light' : 'dark'} theme`}
            >
              <ThemeToggleIcon theme={theme} size={18} />
            </button>
            <AuthStatus />
          </div>

          <div className="flex items-center gap-2 lg:hidden">
            <button
              type="button"
              onClick={toggleTheme}
              className="theme-toggle"
              aria-label={`Switch to ${resolvedTheme === 'dark' ? 'light' : 'dark'} theme`}
            >
              <ThemeToggleIcon theme={theme} size={18} />
            </button>
            {/* md–lg (tablet): the existing account control; phones get the avatar. */}
            <span className="hidden md:contents">
              <AuthStatus />
            </span>
            <span className="contents md:hidden">
              <MobileAccountButton />
            </span>
          </div>
        </nav>
      </header>

      <Sidebar
        isOpen={sidebarOpen}
        onClose={closeSidebar}
        theme={theme}
        onToggleTheme={toggleTheme}
        mode={sidebarMode}
        onModeChange={handleModeChange}
        onOpenDrawer={() => setSidebarOpen(true)}
      />
    </>
  );
}
