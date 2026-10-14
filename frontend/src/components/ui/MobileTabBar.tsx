'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import Icon from '@/components/ui/AppIcon';
import Modal from '@/components/ui/Modal';
import NotificationBell from '@/components/ui/NotificationCenter';

/**
 * Bottom tab bar for phones (< md): the four places used daily, within thumb reach, plus "More"
 * which opens the full navigation drawer owned by Header. Hidden from `md` up, where the sidebar
 * rail and header links take over. `html.has-mobile-tabs` (set while mounted) reserves its height
 * in tailwind.css so no page content ends up underneath it.
 */

export const OPEN_NAV_EVENT = 'labninja:open-nav';

const LABS = [
  { label: 'CV Lab', path: '/cv-lab', icon: 'EyeIcon', hint: 'Computer vision' },
  { label: 'DSA Lab', path: '/dsa-lab', icon: 'CpuChipIcon', hint: 'Data structures & algorithms' },
  {
    label: 'System Design',
    path: '/system-design-lab',
    icon: 'ServerStackIcon',
    hint: 'Architecture & scale',
  },
];

// Pages where a tab bar would be noise (auth) — everything else gets it.
const HIDDEN_ON = ['/login'];

function LabsSheet({
  isOpen,
  onClose,
  pathname,
}: {
  isOpen: boolean;
  onClose: () => void;
  pathname: string;
}) {
  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      labelledBy="labs-sheet-title"
      backdropClassName="bg-black/40 backdrop-blur-[2px]"
      overlayClassName="flex items-end justify-center"
      className="notif-sheet flex w-full flex-col overflow-hidden border border-border bg-card shadow-2xl"
    >
      <div className="flex justify-center pt-2.5" aria-hidden="true">
        <span className="h-1.5 w-10 rounded-full mix-bg-muted-foreground/30" />
      </div>
      <h2
        id="labs-sheet-title"
        className="font-heading px-5 pb-2 pt-3 text-lg font-semibold text-foreground"
      >
        Practice labs
      </h2>
      <ul className="px-3 pb-4">
        {LABS.map((lab) => {
          const active = pathname === lab.path;
          return (
            <li key={lab.path}>
              <Link
                href={lab.path}
                onClick={onClose}
                aria-current={active ? 'page' : undefined}
                className={`flex min-h-[56px] items-center gap-3 rounded-xl px-3 py-2 transition-colors active:bg-muted ${
                  active ? 'mix-bg-primary/10 text-primary' : 'text-foreground hover:mix-bg-muted/60'
                }`}
              >
                <span className="flex h-10 w-10 items-center justify-center rounded-full bg-muted">
                  <Icon name={lab.icon} size={20} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[15px] font-semibold">{lab.label}</span>
                  <span className="block text-xs text-muted-foreground">{lab.hint}</span>
                </span>
                <Icon name="ChevronRightIcon" size={16} className="text-muted-foreground" />
              </Link>
            </li>
          );
        })}
      </ul>
    </Modal>
  );
}

export default function MobileTabBar() {
  const pathname = usePathname() ?? '';
  const [labsOpen, setLabsOpen] = useState(false);
  const hidden = HIDDEN_ON.some((p) => pathname === p || pathname.startsWith(`${p}/`));

  React.useEffect(() => {
    if (hidden) return;
    document.documentElement.classList.add('has-mobile-tabs');
    return () => document.documentElement.classList.remove('has-mobile-tabs');
  }, [hidden]);

  if (hidden) return null;

  const onLabs = LABS.some((l) => pathname === l.path);
  const tab = (active: boolean) => `mobile-tab ${active ? 'mobile-tab-active' : ''}`;

  return (
    <>
      <nav className="mobile-tabbar md:hidden" aria-label="Primary">
        <Link
          href="/daily-session"
          className={tab(pathname === '/daily-session')}
          aria-current={pathname === '/daily-session' ? 'page' : undefined}
        >
          <Icon name="AcademicCapIcon" size={22} />
          <span>Daily</span>
        </Link>
        <button
          type="button"
          onClick={() => setLabsOpen(true)}
          className={tab(onLabs)}
          aria-haspopup="dialog"
          aria-current={onLabs ? 'page' : undefined}
        >
          <Icon name="BeakerIcon" size={22} />
          <span>Labs</span>
        </button>
        <Link
          href="/ai-todo"
          className={tab(pathname.startsWith('/ai-todo'))}
          aria-current={pathname.startsWith('/ai-todo') ? 'page' : undefined}
        >
          <Icon name="ClipboardDocumentCheckIcon" size={22} />
          <span>To-Do</span>
        </Link>
        <NotificationBell variant="tab" />
        <button
          type="button"
          onClick={() => window.dispatchEvent(new Event(OPEN_NAV_EVENT))}
          className="mobile-tab"
          aria-label="More navigation"
        >
          <Icon name="Bars3Icon" size={22} />
          <span>More</span>
        </button>
      </nav>
      <LabsSheet isOpen={labsOpen} onClose={() => setLabsOpen(false)} pathname={pathname} />
    </>
  );
}
