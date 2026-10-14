'use client';

import { useCallback, useEffect, useState } from 'react';
import Icon from '@/components/ui/AppIcon';
import { useIsMobile } from '@/lib/ui/useIsMobile';

/**
 * Phone layout shared by the CV, DSA and System Design labs. On desktop a lab is three panes
 * (topics | content | copilot). Below `md` the content pane takes the whole screen and the other
 * two become slide-over sheets (CSS in tailwind.css, keyed on `data-sheet`), opened from a sticky
 * bar at the top of the content. Choosing a topic closes the topics sheet.
 */
export function useLabSheets(selectionKey: string) {
  const isMobile = useIsMobile();
  const [sheet, setSheet] = useState<'left' | 'right' | null>(null);

  useEffect(() => {
    setSheet((current) => (current === 'left' ? null : current));
  }, [selectionKey]);

  useEffect(() => {
    if (!isMobile) setSheet(null);
  }, [isMobile]);

  useEffect(() => {
    if (!sheet) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setSheet(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [sheet]);

  const close = useCallback(() => setSheet(null), []);
  const openTopics = useCallback(() => setSheet('left'), []);
  const openCopilot = useCallback(() => setSheet('right'), []);

  return { isMobile, sheet, close, openTopics, openCopilot };
}

export function LabMobileBar({
  title,
  onTopics,
  onCopilot,
}: {
  title: string;
  onTopics: () => void;
  onCopilot: () => void;
}) {
  return (
    <div className="sticky top-0 z-10 flex h-14 items-center gap-1 border-b border-border mix-bg-background/90 px-2 backdrop-blur">
      <button
        type="button"
        onClick={onTopics}
        className="flex h-11 items-center gap-1.5 rounded-xl px-3 text-[13px] font-semibold text-foreground active:bg-muted"
        aria-label="Browse topics"
      >
        <Icon name="Bars3BottomLeftIcon" size={20} />
        Topics
      </button>
      <p className="min-w-0 flex-1 truncate text-center text-sm font-medium text-muted-foreground">
        {title}
      </p>
      <button
        type="button"
        onClick={onCopilot}
        className="flex h-11 w-11 items-center justify-center rounded-xl text-primary active:bg-muted"
        aria-label="Open Copilot"
      >
        <Icon name="SparklesIcon" size={20} variant="solid" />
      </button>
    </div>
  );
}

export function LabSheetBackdrop({ onClose }: { onClose: () => void }) {
  return <div className="lab-sheet-backdrop" onClick={onClose} aria-hidden="true" />;
}
