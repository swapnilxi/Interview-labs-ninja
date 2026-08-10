'use client';

import { useEffect, useRef, useState } from 'react';
import Icon from '@/components/ui/AppIcon';
import { TEMPLATE_TYPE_META, type LinkedInTemplate } from '@/lib/services/linkedinService';

const inputClass =
  'w-full rounded-md border border-border bg-input px-12 py-9 text-sm text-foreground focus-ring transition-smooth';

export default function TemplateMultiSelect({
  templates,
  selectedIds,
  onChange,
}: {
  templates: LinkedInTemplate[];
  selectedIds: number[];
  onChange: (ids: number[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handleClick = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [open]);

  const selected = templates.filter((t) => selectedIds.includes(t.id));

  const toggle = (id: number) => {
    onChange(selectedIds.includes(id) ? selectedIds.filter((x) => x !== id) : [...selectedIds, id]);
  };

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        className={`${inputClass} flex items-center justify-between text-left`}
      >
        <span className="truncate text-muted-foreground">
          {selected.length === 0 ? 'Select templates…' : `${selected.length} template${selected.length > 1 ? 's' : ''} selected`}
        </span>
        <Icon name="ChevronDownIcon" size={14} variant="outline" className="flex-shrink-0 text-muted-foreground" />
      </button>

      {selected.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {selected.map((tpl) => (
            <span
              key={tpl.id}
              className="inline-flex items-center gap-1.5 rounded-md border border-border bg-muted px-2 py-1 text-xs text-foreground"
            >
              <span className={`rounded-full px-1.5 py-0.5 text-[9px] font-medium ${TEMPLATE_TYPE_META[tpl.type].badgeClass}`}>
                {TEMPLATE_TYPE_META[tpl.type].label}
              </span>
              {tpl.title}
              <button
                type="button"
                onClick={() => toggle(tpl.id)}
                aria-label={`Remove ${tpl.title}`}
                className="text-muted-foreground hover:text-destructive transition-smooth"
              >
                <Icon name="XMarkIcon" size={11} variant="outline" />
              </button>
            </span>
          ))}
        </div>
      )}

      {open && (
        <div className="absolute z-20 mt-1 w-full max-h-64 overflow-y-auto scrollbar-clean rounded-md border border-border bg-card shadow-lg">
          {templates.length === 0 ? (
            <p className="px-3 py-3 text-xs text-muted-foreground">No templates yet — create one in the library.</p>
          ) : (
            templates.map((tpl) => (
              <label
                key={tpl.id}
                className="flex items-center gap-2 px-3 py-2 text-sm text-foreground hover:bg-muted cursor-pointer"
              >
                <input
                  type="checkbox"
                  checked={selectedIds.includes(tpl.id)}
                  onChange={() => toggle(tpl.id)}
                  className="accent-primary"
                />
                <span className={`shrink-0 rounded-full px-1.5 py-0.5 text-[9px] font-medium ${TEMPLATE_TYPE_META[tpl.type].badgeClass}`}>
                  {TEMPLATE_TYPE_META[tpl.type].label}
                </span>
                <span className="truncate">{tpl.title}</span>
              </label>
            ))
          )}
        </div>
      )}
    </div>
  );
}
