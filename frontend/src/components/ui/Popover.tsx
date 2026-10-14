'use client';

import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { isTopLayer, popLayer, pushLayer } from '@/lib/ui/layers';

/**
 * Anchored menu / confirm bubble, rendered through a portal to <body>.
 *
 * Why it exists: menus used to be `absolute` children of the task card that owned them. The
 * card's hover `transform` makes it a stacking context, so the *next* card painted over the
 * menu and its lower items ("Done", "Move to Plan") could not be clicked.
 *
 * Handles: positioning next to the anchor (flips above / clamps when space is short, follows the
 * anchor on scroll), outside-click, Escape, focus into the menu and back to the trigger,
 * arrow-key navigation for `role="menu"`, and closing when focus tabs away.
 *
 * Always render it (`open` toggles it) rather than mounting it conditionally — focus is returned
 * to the trigger when `open` flips to false.
 */

export interface PopoverProps {
  open: boolean;
  /** The trigger. Pointer-downs on it are ignored by outside-click handling, so it can toggle. */
  anchorRef: { current: HTMLElement | null };
  onClose: () => void;
  children: React.ReactNode;
  role?: 'menu' | 'dialog' | 'alertdialog';
  /** aria-label for the popover. */
  label?: string;
  placement?: 'bottom-end' | 'bottom-start';
  className?: string;
}

interface Position {
  top: number;
  left: number;
  maxHeight?: number;
}

const GAP = 6;
const MARGIN = 8;
const MIN_HEIGHT = 96;

export default function Popover({
  open,
  anchorRef,
  onClose,
  children,
  role = 'menu',
  label,
  placement = 'bottom-end',
  className = '',
}: PopoverProps) {
  const popRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState<Position | null>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const hadFocus = useRef(false);

  const reposition = useCallback(() => {
    const anchor = anchorRef.current;
    const pop = popRef.current;
    if (!anchor || !pop) return;
    const a = anchor.getBoundingClientRect();
    // The trigger was scrolled out of view — nothing sensible to point at.
    if (a.bottom < 0 || a.top > window.innerHeight || a.right < 0 || a.left > window.innerWidth) {
      onCloseRef.current();
      return;
    }
    const width = pop.offsetWidth;
    const height = pop.scrollHeight;
    let left = placement === 'bottom-end' ? a.right - width : a.left;
    left = Math.min(Math.max(left, MARGIN), Math.max(MARGIN, window.innerWidth - width - MARGIN));

    const spaceBelow = window.innerHeight - a.bottom - GAP - MARGIN;
    const spaceAbove = a.top - GAP - MARGIN;
    let top: number;
    let maxHeight: number | undefined;
    if (height <= spaceBelow || spaceBelow >= spaceAbove) {
      top = a.bottom + GAP;
      if (height > spaceBelow) maxHeight = Math.max(spaceBelow, MIN_HEIGHT);
    } else {
      const shown = Math.min(height, Math.max(spaceAbove, MIN_HEIGHT));
      top = a.top - GAP - shown;
      if (height > spaceAbove) maxHeight = Math.max(spaceAbove, MIN_HEIGHT);
    }
    setPosition((prev) =>
      prev && prev.top === top && prev.left === left && prev.maxHeight === maxHeight
        ? prev
        : { top, left, maxHeight }
    );
  }, [anchorRef, placement]);

  // Measure after render (the popover is hidden until positioned, so it never flashes at 0,0).
  // `children` is a new element on every render of the owner, so this also re-measures whenever the
  // content changes (e.g. "Move to…" swapping to the project list). It bails out when nothing moved.
  useLayoutEffect(() => {
    if (!open) {
      setPosition(null);
      return;
    }
    reposition();
  }, [open, reposition, children]);

  // Keep it attached to the trigger when the page scrolls/resizes or its own content changes size.
  useEffect(() => {
    if (!open) return;
    const pop = popRef.current;
    let frame = 0;
    const schedule = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(reposition);
    };
    window.addEventListener('resize', schedule);
    window.addEventListener('scroll', schedule, true); // capture: inner scroll containers too
    const observer =
      typeof ResizeObserver !== 'undefined' && pop ? new ResizeObserver(schedule) : null;
    if (pop) observer?.observe(pop);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('resize', schedule);
      window.removeEventListener('scroll', schedule, true);
      observer?.disconnect();
    };
  }, [open, reposition]);

  const focusInside = useCallback(() => {
    const pop = popRef.current;
    if (!pop) return;
    const target =
      pop.querySelector<HTMLElement>('[data-autofocus]') ??
      pop.querySelector<HTMLElement>('[role="menuitem"]:not([disabled])') ??
      pop;
    target.focus({ preventScroll: true });
  }, []);

  // Dismissal (outside click, Escape) and initial focus.
  useEffect(() => {
    if (!open) return;
    const layerId = pushLayer();
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node | null;
      if (!target) return;
      if (popRef.current?.contains(target) || anchorRef.current?.contains(target)) return;
      onCloseRef.current();
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || event.defaultPrevented || !isTopLayer(layerId)) return;
      // Flag it so a dialog underneath doesn't treat the same keystroke as "close me".
      event.preventDefault();
      onCloseRef.current();
      anchorRef.current?.focus?.({ preventScroll: true });
    };
    document.addEventListener('pointerdown', onPointerDown, true);
    document.addEventListener('keydown', onKeyDown, true);
    const focusFrame = requestAnimationFrame(focusInside);
    return () => {
      cancelAnimationFrame(focusFrame);
      document.removeEventListener('pointerdown', onPointerDown, true);
      document.removeEventListener('keydown', onKeyDown, true);
      popLayer(layerId);
    };
  }, [open, anchorRef, focusInside]);

  // The focused item can disappear when the content swaps (e.g. "Move to…" → project list);
  // keep the keyboard inside the popover instead of dropping it on <body>.
  useEffect(() => {
    if (!open || !hadFocus.current) return;
    const active = document.activeElement;
    if (!active || active === document.body) focusInside();
  });

  // Closed: hand focus back to the trigger if it was inside (not if the user clicked elsewhere).
  useEffect(() => {
    if (open || !hadFocus.current) return;
    hadFocus.current = false;
    const active = document.activeElement;
    if (!active || active === document.body) anchorRef.current?.focus?.({ preventScroll: true });
  }, [open, anchorRef]);

  if (!open || typeof document === 'undefined') return null;

  const onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (role !== 'menu') return;
    const items = Array.from(
      popRef.current?.querySelectorAll<HTMLElement>('[role="menuitem"]:not([disabled])') ?? []
    );
    if (items.length === 0) return;
    const index = items.indexOf(document.activeElement as HTMLElement);
    let next = -1;
    if (event.key === 'ArrowDown') next = (index + 1) % items.length;
    else if (event.key === 'ArrowUp') next = (index - 1 + items.length) % items.length;
    else if (event.key === 'Home') next = 0;
    else if (event.key === 'End') next = items.length - 1;
    if (next >= 0) {
      event.preventDefault();
      items[next].focus();
    }
  };

  const onBlur = (event: React.FocusEvent<HTMLDivElement>) => {
    const next = event.relatedTarget as Node | null;
    // Tabbing away closes it. (A null relatedTarget is a removed/clicked-away element — pointer
    // handling covers that.)
    if (next && !popRef.current?.contains(next) && next !== anchorRef.current) onCloseRef.current();
  };

  return createPortal(
    <div
      ref={popRef}
      role={role}
      aria-label={label}
      tabIndex={-1}
      onKeyDown={onKeyDown}
      onBlur={onBlur}
      onFocusCapture={() => {
        hadFocus.current = true;
      }}
      // Don't let a dnd-kit draggable ancestor (in the React tree) see pointer events from the menu.
      onPointerDown={(event) => event.stopPropagation()}
      className={`fixed z-[210] outline-none ${position?.maxHeight ? 'overflow-y-auto' : ''} ${className}`}
      style={{
        top: position?.top ?? 0,
        left: position?.left ?? 0,
        maxHeight: position?.maxHeight,
        visibility: position ? 'visible' : 'hidden',
      }}
    >
      {children}
    </div>,
    document.body
  );
}
