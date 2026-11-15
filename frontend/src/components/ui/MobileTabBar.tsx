'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import Icon from '@/components/ui/AppIcon';
import Modal from '@/components/ui/Modal';
import NotificationBell from '@/components/ui/NotificationCenter';
import { LAB_GROUPS, LABS_HOME, LABS_PROJECT_LINK, isLabsPath, labsInGroup } from '@/modules/labs/common/labCatalog';

/**
 * Bottom tab bar for phones (< md): the four places used daily, within thumb reach, plus "More"
 * which opens the full navigation drawer owned by Header. Hidden from `md` up, where the sidebar
 * rail and header links take over. `html.has-mobile-tabs` (set while mounted) reserves its height
 * in tailwind.css so no page content ends up underneath it.
 */

export const OPEN_NAV_EVENT = 'labninja:open-nav';

interface SheetLab {
  label: string;
  path: string;
  icon: string;
  hint: string;
}

// The sheet's lists (labCatalog.ts): the Labs home, one list per group of labs, then Labs Project.
const SHEET_GROUPS: { id: string; title?: string; labs: SheetLab[] }[] = [
  { id: 'home', labs: [{ ...LABS_HOME, hint: 'Every lab at a glance' }] },
  ...LAB_GROUPS.map((g) => ({ id: g.id, title: g.label, labs: labsInGroup(g.id) as SheetLab[] })),
  { id: 'project', labs: [LABS_PROJECT_LINK] },
];

// Pages where a tab bar would be noise (auth, and the published resume/portfolio pages a visitor opens from a link) — everything else gets it.
const HIDDEN_ON = ['/login', '/p', '/r'];

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
      backdropClassName="ios-sheet-backdrop"
      overlayClassName="flex items-end justify-center"
      className="notif-sheet ios-sheet flex w-full flex-col overflow-hidden"
    >
      <div className="ios-sheet-grabber" data-sheet-grabber="" aria-hidden="true">
        <span />
      </div>
      <div className="ios-sheet-head">
        <h2 id="labs-sheet-title" className="ios-sheet-title">
          Practice labs
        </h2>
        <button type="button" onClick={onClose} className="sheet-done">
          Done
        </button>
      </div>
      <div className="flex min-h-0 flex-col overflow-y-auto pb-4">
        {SHEET_GROUPS.map((group) => (
          <section key={group.id} aria-labelledby={group.title ? `labs-sheet-${group.id}` : undefined} className="mx-4 mb-4">
            {group.title && (
              <h3 id={`labs-sheet-${group.id}`} className="mb-1.5 px-3.5 text-[13px] font-medium uppercase tracking-wide text-muted-foreground">
                {group.title}
              </h3>
            )}
            <ul className="drawer-group">
              {group.labs.map((lab) => {
                const active = pathname === lab.path;
                return (
                  <li key={lab.path}>
                    <Link
                      href={lab.path}
                      onClick={onClose}
                      aria-current={active ? 'page' : undefined}
                      className={`drawer-row drawer-row-tall ${active ? 'drawer-row-active' : ''}`}
                    >
                      <span className="drawer-icon drawer-icon-lg" aria-hidden="true">
                        <Icon name={lab.icon} size={20} variant={active ? 'solid' : 'outline'} />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block text-[16px] font-semibold">{lab.label}</span>
                        <span className="block text-[13px] font-normal text-muted-foreground">{lab.hint}</span>
                      </span>
                      <Icon name="ChevronRightIcon" size={16} className="drawer-chevron" />
                    </Link>
                  </li>
                );
              })}
            </ul>
          </section>
        ))}
      </div>
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

  // On-screen keyboard: `html.keyboard-open` while a text field has focus and the visible height has dropped well
  // below the full height. Chrome / iOS shrink the visual viewport; the Android app's WebView (adjustResize) shrinks
  // the window itself — both are measured against the height seen while nothing was being typed.
  React.useEffect(() => {
    if (hidden) return;
    const root = document.documentElement;
    const vv = window.visualViewport;
    let baseline = window.innerHeight;
    const editing = () => {
      const el = document.activeElement as HTMLElement | null;
      if (!el) return false;
      if (el.isContentEditable || el.tagName === 'TEXTAREA') return true;
      return el.tagName === 'INPUT' && !/^(checkbox|radio|button|submit|reset|range|color|file|image)$/i.test((el as HTMLInputElement).type);
    };
    const update = () => {
      const isEditing = editing();
      if (!isEditing) baseline = Math.max(window.innerHeight, vv?.height ?? 0);
      const visible = Math.min(window.innerHeight, vv?.height ?? window.innerHeight);
      root.classList.toggle('keyboard-open', isEditing && baseline - visible > 150);
    };
    const later = () => window.setTimeout(update, 60);
    vv?.addEventListener('resize', update);
    window.addEventListener('resize', update);
    document.addEventListener('focusin', later);
    document.addEventListener('focusout', later);
    return () => {
      vv?.removeEventListener('resize', update);
      window.removeEventListener('resize', update);
      document.removeEventListener('focusin', later);
      document.removeEventListener('focusout', later);
      root.classList.remove('keyboard-open');
    };
  }, [hidden]);

  if (hidden) return null;

  const onLabs = isLabsPath(pathname);
  const tab = (active: boolean) => `mobile-tab ${active ? 'mobile-tab-active' : ''}`;

  const daily = pathname === '/daily-session';
  const todo = pathname.startsWith('/ai-todo');

  return (
    <>
      <nav className="mobile-tabbar md:hidden" aria-label="Primary">
        <Link href="/daily-session" className={tab(daily)} aria-current={daily ? 'page' : undefined}>
          <Icon name="AcademicCapIcon" size={24} variant={daily ? 'solid' : 'outline'} />
          <span>Daily</span>
        </Link>
        <button
          type="button"
          onClick={() => setLabsOpen(true)}
          className={tab(onLabs)}
          aria-haspopup="dialog"
          aria-current={onLabs ? 'page' : undefined}
        >
          <Icon name="BeakerIcon" size={24} variant={onLabs ? 'solid' : 'outline'} />
          <span>Labs</span>
        </button>
        <Link href="/ai-todo" className={tab(todo)} aria-current={todo ? 'page' : undefined}>
          <Icon name="CheckCircleIcon" size={24} variant={todo ? 'solid' : 'outline'} />
          <span>To-Do</span>
        </Link>
        <NotificationBell variant="tab" />
        <button
          type="button"
          onClick={() => window.dispatchEvent(new Event(OPEN_NAV_EVENT))}
          className="mobile-tab"
          aria-label="More navigation"
        >
          <Icon name="Squares2X2Icon" size={24} />
          <span>More</span>
        </button>
      </nav>
      <LabsSheet isOpen={labsOpen} onClose={() => setLabsOpen(false)} pathname={pathname} />
    </>
  );
}
