'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import Icon from '@/components/ui/AppIcon';
import Sidebar from '@/modules/common/Sidebar';

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
  {
    label: 'CV Lab',
    path: '/cv-lab',
    icon: 'EyeIcon',
  },
  {
    label: 'DSA Lab',
    path: '/dsa-lab',
    icon: 'CpuChipIcon',
  },
  {
    label: 'System Design',
    path: '/system-design-lab',
    icon: 'ServerStackIcon',
  },
  {
    label: 'Config',
    path: '/config',
    icon: 'Cog6ToothIcon',
  },
];

function SystemStatus() {
  const [apiStatus, setApiStatus] = useState<'checking' | 'online' | 'offline'>('checking');
  const [dbStatus, setDbStatus] = useState<'checking' | 'online' | 'offline'>('checking');

  useEffect(() => {
    const checkStatus = async () => {
      // Check API
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 3000);
        const res = await fetch('http://localhost:8082/health', { signal: controller.signal });
        clearTimeout(timeoutId);
        setApiStatus(res.ok ? 'online' : 'offline');
      } catch (err) {
        setApiStatus('offline');
      }

      // Check DB (a lightweight endpoint that reads from SQLite, no secrets involved)
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 3000);
        const res = await fetch('http://localhost:8082/todo/stats', { signal: controller.signal });
        clearTimeout(timeoutId);
        setDbStatus(res.ok ? 'online' : 'offline');
      } catch (err) {
        setDbStatus('offline');
      }
    };
    
    checkStatus();
    const interval = setInterval(checkStatus, 15000); // Check every 15 seconds
    return () => clearInterval(interval);
  }, []);

  const StatusRow = ({ label, status }: { label: string, status: string }) => (
    <div className="flex items-center gap-1 leading-none" title={`${label}: ${status === 'checking' ? 'checking…' : status}`}>
      {status === 'checking' ? (
        <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
      ) : status === 'online' ? (
        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shadow-[0_0_6px_rgba(16,185,129,0.5)]" />
      ) : (
        <span className="w-1.5 h-1.5 rounded-full bg-rose-500 shadow-[0_0_6px_rgba(244,63,94,0.5)]" />
      )}
      <span className="w-5 text-[8px] font-medium text-muted-foreground uppercase tracking-wider">{label}</span>
    </div>
  );

  return (
    <div className="flex flex-col gap-0.5 px-2 py-1 rounded-md bg-muted/50 border border-border mr-3">
      <StatusRow label="API" status={apiStatus} />
      <StatusRow label="DB" status={dbStatus} />
    </div>
  );
}

export default function Header() {
  const pathname = usePathname();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [theme, setTheme] = useState<'light' | 'dark' | null>(null);

  useEffect(() => {
    const storedTheme = localStorage.getItem('interview-ninja-theme') as 'light' | 'dark' | null;
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    const initialTheme = storedTheme ?? (prefersDark ? 'dark' : 'light');
    setTheme(initialTheme);
    document.documentElement.classList.toggle('dark', initialTheme === 'dark');
  }, []);

  // Derive resolved theme: if state not yet hydrated, read from DOM
  const resolvedTheme: 'light' | 'dark' = theme ?? (
    typeof document !== 'undefined' && document.documentElement.classList.contains('dark') ? 'dark' : 'light'
  );

  const isActivePath = (path: string) => {
    return pathname === path;
  };

  const toggleSidebar = () => {
    setSidebarOpen((prev) => !prev);
  };

  const closeSidebar = () => {
    setSidebarOpen(false);
  };

  const toggleTheme = () => {
    const nextTheme = resolvedTheme === 'dark' ? 'light' : 'dark';
    setTheme(nextTheme);
    localStorage.setItem('interview-ninja-theme', nextTheme);
    document.documentElement.classList.toggle('dark', nextTheme === 'dark');
  };

  return (
    <>
      <header className="app-header">
        <nav className="h-[60px] px-4 sm:px-6 xl:px-8 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={toggleSidebar}
              className="theme-toggle"
              aria-label="Toggle navigation menu"
              aria-expanded={sidebarOpen}
            >
              <Icon name="Bars3Icon" size={20} variant="outline" />
            </button>

            <Link
              href="/daily-session"
              className="flex items-center gap-3 transition-smooth hover:opacity-85"
            >
              <div className="flex items-center gap-3">
                <svg
                  width="36"
                  height="36"
                  viewBox="0 0 40 40"
                  fill="none"
                  xmlns="http://www.w3.org/2000/svg"
                  className="transition-smooth"
                >
                  <rect width="40" height="40" rx="8" fill="url(#gradient)" />
                  <polygon
                    points="20,6.4 23.39,16.61 33.6,20 23.39,23.39 20,33.6 16.61,23.39 6.4,20 16.61,16.61"
                    fill="white"
                  />
                  <circle cx="20" cy="20" r="1.8" fill="#2563EB" />
                  <defs>
                    <linearGradient
                      id="gradient"
                      x1="0"
                      y1="0"
                      x2="40"
                      y2="40"
                      gradientUnits="userSpaceOnUse"
                    >
                      <stop stopColor="#2563EB" />
                      <stop offset="1" stopColor="#7C3AED" />
                    </linearGradient>
                  </defs>
                </svg>
                <span className="font-heading text-xl font-semibold text-foreground">
                  Lab-Ninja
                </span>
              </div>
            </Link>
          </div>

          <div className="hidden lg:flex items-center gap-2">
            <SystemStatus />
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
            <button
              type="button"
              onClick={toggleTheme}
              className="theme-toggle ml-2"
              aria-label={`Switch to ${resolvedTheme === 'dark' ? 'light' : 'dark'} theme`}
              title={`Switch to ${resolvedTheme === 'dark' ? 'light' : 'dark'} theme`}
            >
              <Icon name={resolvedTheme === 'dark' ? 'SunIcon' : 'MoonIcon'} size={18} />
            </button>
          </div>

          <div className="flex items-center gap-2 lg:hidden">
            <button
              type="button"
              onClick={toggleTheme}
              className="theme-toggle"
              aria-label={`Switch to ${resolvedTheme === 'dark' ? 'light' : 'dark'} theme`}
            >
              <Icon name={resolvedTheme === 'dark' ? 'SunIcon' : 'MoonIcon'} size={18} />
            </button>
          </div>
        </nav>
      </header>

      <Sidebar
        isOpen={sidebarOpen}
        onClose={closeSidebar}
        theme={resolvedTheme}
        onToggleTheme={toggleTheme}
      />
    </>
  );
}
