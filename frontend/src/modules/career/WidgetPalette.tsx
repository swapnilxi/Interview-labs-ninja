'use client';

import { useEffect, useRef, useState } from 'react';
import Icon from '@/components/ui/AppIcon';
import { usePortfolioStore } from './store/portfolioStore';
import { WIDGET_LIBRARY } from './types';

export default function WidgetPalette() {
  const addWidget = usePortfolioStore((s) => s.addWidget);
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

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full py-2.5 rounded-lg border border-dashed border-border text-sm font-medium text-muted-foreground hover:border-primary/50 hover:text-primary hover:bg-primary/5 transition-smooth inline-flex items-center justify-center gap-2"
      >
        <Icon name="PlusIcon" size={16} /> Add widget
      </button>
      {open && (
        <div className="absolute z-20 bottom-full mb-2 left-0 right-0 max-h-[320px] overflow-y-auto scrollbar-clean bg-card border border-border rounded-lg shadow-xl p-1.5 grid grid-cols-2 gap-1 animate-fade-in">
          {WIDGET_LIBRARY.map((w) => (
            <button
              key={w.type}
              onClick={() => {
                void addWidget(w.type, w.label);
                setOpen(false);
              }}
              className="flex items-center gap-2 px-3 py-2 rounded-md text-sm text-foreground hover:bg-muted transition-smooth text-left"
            >
              <Icon name={w.icon as any} size={16} className="text-primary flex-shrink-0" />
              <span className="truncate">{w.label}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
