'use client';

/**
 * Section-type picker, shared by ResumeEditor's bottom "Add section" button
 * and SectionManager's hover-revealed "+" between two sections — same menu,
 * two trigger styles ('full' = the dashed button, 'inline' = a small "+" dot).
 */

import { useEffect, useRef, useState } from 'react';
import Icon from '@/components/ui/AppIcon';
import { SECTION_LIBRARY } from '../shared/types';

export default function SectionTypeMenu({
  onPick,
  variant = 'full',
  label = 'Add section',
}: {
  onPick: (sectionType: string, label: string) => void;
  variant?: 'full' | 'inline';
  label?: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, [open]);

  const pick = (sectionType: string, sectionLabel: string) => {
    onPick(sectionType, sectionLabel);
    setOpen(false);
  };

  return (
    <div className="relative" ref={ref}>
      {variant === 'full' ? (
        <button
          onClick={() => setOpen((v) => !v)}
          className="w-full py-2.5 rounded-lg border border-dashed border-border text-sm font-medium text-muted-foreground hover:border-primary/50 hover:text-primary hover:bg-primary/5 transition-smooth inline-flex items-center justify-center gap-2"
        >
          <Icon name="PlusIcon" size={16} /> {label}
        </button>
      ) : (
        <button
          onClick={() => setOpen((v) => !v)}
          title="Insert section here"
          aria-label="Insert section here"
          className="w-5 h-5 rounded-full border border-border bg-card text-muted-foreground hover:border-primary hover:text-primary hover:bg-primary/5 transition-smooth inline-flex items-center justify-center"
        >
          <Icon name="PlusIcon" size={11} />
        </button>
      )}
      {open && (
        <div
          className={`absolute z-20 max-h-[320px] overflow-y-auto scrollbar-clean bg-card border border-border rounded-lg shadow-xl p-1.5 grid grid-cols-2 gap-1 animate-fade-in ${
            variant === 'full' ? 'bottom-full mb-2 left-0 right-0' : 'top-full mt-1.5 left-1/2 -translate-x-1/2 w-[260px]'
          }`}
        >
          {SECTION_LIBRARY.map((s) => (
            <button
              key={s.type}
              onClick={() => pick(s.type, s.label)}
              className="flex items-center gap-2 px-3 py-2 rounded-md text-sm text-foreground hover:bg-muted transition-smooth text-left"
            >
              <Icon name={s.icon as any} size={16} className="text-primary flex-shrink-0" />
              <span className="truncate">{s.label}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
