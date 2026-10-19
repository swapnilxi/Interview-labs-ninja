'use client';

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import Icon from '@/components/ui/AppIcon';
import { useIsMobile } from '@/lib/ui/useIsMobile';

/**
 * Width flags beyond the phone breakpoint, built the same way as `useIsMobile`: false on the server and during hydration
 * (desktop markup first, no mismatch), never a `useState` initialiser that reads `matchMedia`. The store objects live at
 * module level so `subscribe` has a stable identity and React does not resubscribe on every render.
 */
function mediaStore(query: string) {
  return {
    subscribe(onChange: () => void): () => void {
      const mql = window.matchMedia(query);
      mql.addEventListener('change', onChange);
      return () => mql.removeEventListener('change', onChange);
    },
    getSnapshot: () => window.matchMedia(query).matches,
  };
}

const NARROW = mediaStore('(max-width: 1279px)');
const TABLET = mediaStore('(max-width: 1023px)');
const getServerSnapshot = () => false;

/** Below 1280px the Copilot defaults to its rail (phones included). */
function useNarrow(): boolean {
  return useSyncExternalStore(NARROW.subscribe, NARROW.getSnapshot, getServerSnapshot);
}

/** Below 1024px both side panes default to their rails and only one opens at a time. */
function useTablet(): boolean {
  return useSyncExternalStore(TABLET.subscribe, TABLET.getSnapshot, getServerSnapshot);
}

/**
 * Phone layout shared by the CV, DSA and System Design labs. On desktop a lab is three panes
 * (topics | content | copilot). Below `md` the content pane takes the whole screen and the other
 * two become slide-over sheets (CSS in tailwind.css, keyed on `data-sheet`), opened from a sticky
 * bar at the top of the content. Choosing a topic closes the topics sheet.
 */
export function useLabSheets(selectionKey: string) {
  const isMobile = useIsMobile();
  const isNarrow = useNarrow();
  const isTablet = useTablet();
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

  return { isMobile, isNarrow, isTablet, sheet, close, openTopics, openCopilot };
}

/**
 * Whether each side pane of a lab is expanded or collapsed to its 48px rail, and how to change that. Replaces the two
 * `useState`s and four derived lines each lab used to carry. Below 1280px the Copilot starts collapsed, below 1024px the
 * sidebar does too; crossing a breakpoint resets that pane (the user can still toggle in between), so a phone that is later
 * rotated or widened ends up open. Below 1024px only one side pane is open at a time, so the centre never drops under
 * about 400px. On a phone both are always "expanded": they are slide-over sheets there, closed with `lab.close()`.
 * Between the breakpoints the user's own toggles stand: a sidebar and a Copilot opened together at 1100px stay open.
 */
export function useLabPanes(lab: ReturnType<typeof useLabSheets>) {
  const { isMobile, isNarrow, isTablet, close } = lab;
  const [left, setLeft] = useState(true);
  const [right, setRight] = useState(true);
  const narrowRef = useRef(isNarrow);

  // Crossing 1280: the Copilot collapses below it and opens above it.
  useEffect(() => {
    narrowRef.current = isNarrow;
    setRight(!isNarrow);
  }, [isNarrow]);
  // Crossing 1024: the sidebar collapses below it and opens above it. Widening past 1024 also puts the Copilot back to the
  // default of that band (a rail below 1280), so a Copilot that was opened on a tablet does not leave a ~400px centre.
  useEffect(() => {
    setLeft(!isTablet);
    if (!isTablet) setRight(!narrowRef.current);
  }, [isTablet]);

  const setLeftOpen = useCallback(
    (open: boolean) => {
      setLeft(open);
      if (open && isTablet) setRight(false);
    },
    [isTablet]
  );
  const setRightOpen = useCallback(
    (open: boolean) => {
      setRight(open);
      if (open && isTablet) setLeft(false);
    },
    [isTablet]
  );
  const collapseLeft = useCallback(() => (isMobile ? close() : setLeft(false)), [isMobile, close]);
  const collapseRight = useCallback(
    () => (isMobile ? close() : setRight(false)),
    [isMobile, close]
  );

  return {
    leftExpanded: left || isMobile,
    rightExpanded: right || isMobile,
    setLeftOpen,
    setRightOpen,
    collapseLeft,
    collapseRight,
  };
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
    <div className="sticky top-0 z-10 flex min-h-[3.5rem] items-center gap-1 border-b border-border mix-bg-background/90 px-2 backdrop-blur">
      <button
        type="button"
        onClick={onTopics}
        className="flex h-11 items-center gap-1.5 rounded-xl px-3 text-[13px] font-semibold text-foreground active:bg-muted"
        aria-label="Browse topics"
      >
        <Icon name="Bars3BottomLeftIcon" size={20} />
        Topics
      </button>
      {/* The topic's name wraps (two lines still fit the 56px bar) instead of being cut with an ellipsis. */}
      <p className="min-w-0 flex-1 break-words py-1 text-center text-sm font-medium leading-snug text-muted-foreground">
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
