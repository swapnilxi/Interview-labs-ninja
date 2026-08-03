'use client';

import { useEffect, useRef, useState } from 'react';
import Icon from '@/components/ui/AppIcon';
import { useResumeStore } from './store/resumeStore';
import { SECTION_LIBRARY } from './types';
import SectionManager from './SectionManager';

export default function ResumeEditor() {
  const addSection = useResumeStore((s) => s.addSection);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuOpen) return;
    const onClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, [menuOpen]);

  return (
    <div className="space-y-4">
      <SectionManager />

      <div className="relative" ref={menuRef}>
        <button
          onClick={() => setMenuOpen((v) => !v)}
          className="w-full py-2.5 rounded-lg border border-dashed border-border text-sm font-medium text-muted-foreground hover:border-primary/50 hover:text-primary hover:bg-primary/5 transition-smooth inline-flex items-center justify-center gap-2"
        >
          <Icon name="PlusIcon" size={16} /> Add section
        </button>
        {menuOpen && (
          <div className="absolute z-20 bottom-full mb-2 left-0 right-0 max-h-[320px] overflow-y-auto scrollbar-clean bg-card border border-border rounded-lg shadow-xl p-1.5 grid grid-cols-2 gap-1 animate-fade-in">
            {SECTION_LIBRARY.map((s) => (
              <button
                key={s.type}
                onClick={() => {
                  void addSection(s.type, s.label);
                  setMenuOpen(false);
                }}
                className="flex items-center gap-2 px-3 py-2 rounded-md text-sm text-foreground hover:bg-muted transition-smooth text-left"
              >
                <Icon name={s.icon as any} size={16} className="text-primary flex-shrink-0" />
                <span className="truncate">{s.label}</span>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
