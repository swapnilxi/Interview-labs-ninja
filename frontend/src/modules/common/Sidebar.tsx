'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import Icon from '@/components/ui/AppIcon';
import { useAuth } from '@/contexts/AuthContext';

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

// CAREER STUDIO INTEGRATION — sub-navigation for the /career feature.
const CAREER_LINKS: SidebarLink[] = [
  { label: 'Dashboard', path: '/career', icon: 'Squares2X2Icon' },
  { label: 'Resume Builder', path: '/career/resume', icon: 'DocumentTextIcon' },
  { label: 'Portfolio Builder', path: '/career/portfolio', icon: 'GlobeAltIcon' },
];

interface SidebarProps {
  isOpen: boolean;
  onClose: () => void;
  theme: 'light' | 'dark';
  onToggleTheme: () => void;
}

export default function Sidebar({ isOpen, onClose, theme, onToggleTheme }: SidebarProps) {
  const pathname = usePathname();
  const { user, isGuest, logout } = useAuth();
  const isLabRoute = LAB_LINKS.some((link) => link.path === pathname);
  const [labsOpen, setLabsOpen] = useState(true);
  // CAREER STUDIO INTEGRATION
  const isCareerRoute = pathname === '/career' || pathname.startsWith('/career/');
  const [careerOpen, setCareerOpen] = useState(true);

  useEffect(() => {
    if (isLabRoute) setLabsOpen(true);
  }, [isLabRoute]);

  useEffect(() => {
    if (isCareerRoute) setCareerOpen(true);
  }, [isCareerRoute]);

  const isCareerLinkActive = (path: string) =>
    path === '/career' ? pathname === '/career' : pathname.startsWith(path);

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

  const isActivePath = (path: string) => pathname === path;

  const navLinkClass = (path: string) =>
    `app-nav-link w-full ${isActivePath(path) ? 'app-nav-link-active' : ''}`;

  return (
    <>
      <div
        className={`fixed inset-0 z-[200] bg-black/40 backdrop-blur-sm transition-opacity duration-250 ${
          isOpen ? 'opacity-100' : 'pointer-events-none opacity-0'
        }`}
        onClick={onClose}
        aria-hidden="true"
      />

      <aside
        className={`fixed top-0 left-0 z-[210] flex h-full w-[280px] max-w-[80vw] flex-col border-r border-border bg-card shadow-xl transition-transform duration-250 ease-smooth ${
          isOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
        aria-hidden={!isOpen}
      >
        <div className="flex h-[60px] flex-shrink-0 items-center justify-between border-b border-border px-4">
          <span className="font-heading text-base font-semibold text-foreground">Menu</span>
          <button
            type="button"
            onClick={onClose}
            className="theme-toggle"
            aria-label="Close menu"
          >
            <Icon name="XMarkIcon" size={20} variant="outline" />
          </button>
        </div>

        <nav className="flex-1 overflow-y-auto scrollbar-clean px-3 py-4">
          <div className="flex flex-col gap-1">
            <Link href="/daily-session" onClick={onClose} className={navLinkClass('/daily-session')}>
              <Icon name="AcademicCapIcon" size={18} variant="outline" />
              <span>Daily Session</span>
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

            <Link href="/todo" onClick={onClose} className={navLinkClass('/todo')}>
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

            {/* CAREER STUDIO INTEGRATION — collapsible menu + submenu */}
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
          </div>
        </nav>

        <div className="flex flex-shrink-0 items-center gap-2 border-t border-border px-3 py-3">
          {isGuest ? (
            <Link href="/login" onClick={onClose} className="app-nav-link flex-1">
              <Icon name="UserCircleIcon" size={18} variant="outline" />
              <span>Log in</span>
            </Link>
          ) : (
            <button
              type="button"
              onClick={() => { logout(); onClose(); }}
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
        </div>
      </aside>
    </>
  );
}
