'use client';

import React, {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  useEffect,
} from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'framer-motion';
import Icon from '@/components/ui/AppIcon';
import { EASE_OUT, prefersReducedMotion } from './lib/motion';

/**
 * One toast system for ai-bootcamp's surfaces, ported from
 * AI-Bootcamp-reference's `components/ui/Toast.tsx`. Styled as an
 * `editorial-card` so it picks up the same rim glow as every other surface.
 * Uses the app's existing heroicons wrapper instead of adding `lucide-react`.
 */

type AbToastVariant = 'success' | 'error' | 'info';

interface ToastItem {
  id: number;
  variant: AbToastVariant;
  message: string;
}

interface ToastContextValue {
  toast: (message: string, variant?: AbToastVariant) => void;
  success: (message: string) => void;
  error: (message: string) => void;
  info: (message: string) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

const DURATION_MS = 4200;

const VARIANT_STYLE: Record<AbToastVariant, { iconName: string; accent: string; ring: string }> = {
  success: {
    iconName: 'CheckCircleIcon',
    accent: 'text-emerald-300',
    ring: 'border-emerald-500/30',
  },
  error: { iconName: 'XCircleIcon', accent: 'text-ab-gold', ring: 'border-ab-gold/40' },
  info: { iconName: 'InformationCircleIcon', accent: 'text-ab-cream', ring: 'border-ab-cream/25' },
};

export function AbToastProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const [mounted, setMounted] = useState(false);
  const counter = useRef(0);
  const reduceMotion = useRef(false);

  useEffect(() => {
    setMounted(true);
    reduceMotion.current = prefersReducedMotion();
  }, []);

  const dismiss = useCallback((id: number) => {
    setItems((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const push = useCallback(
    (message: string, variant: AbToastVariant = 'info') => {
      const id = ++counter.current;
      setItems((prev) => [...prev, { id, variant, message }]);
      setTimeout(() => dismiss(id), DURATION_MS);
    },
    [dismiss]
  );

  const value = useMemo<ToastContextValue>(
    () => ({
      toast: push,
      success: (m) => push(m, 'success'),
      error: (m) => push(m, 'error'),
      info: (m) => push(m, 'info'),
    }),
    [push]
  );

  return (
    <ToastContext.Provider value={value}>
      {children}
      {mounted &&
        createPortal(
          <div
            aria-live="polite"
            aria-atomic="true"
            className="fixed bottom-4 left-1/2 z-[200] flex w-[calc(100%-2rem)] max-w-sm -translate-x-1/2 flex-col gap-2.5 sm:bottom-6 sm:left-auto sm:right-6 sm:translate-x-0"
          >
            <AnimatePresence>
              {items.map((item) => {
                const { iconName, accent, ring } = VARIANT_STYLE[item.variant];
                return (
                  <motion.div
                    key={item.id}
                    layout
                    initial={{ opacity: 0, y: reduceMotion.current ? 0 : 16, scale: 0.97 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: reduceMotion.current ? 0 : 8, scale: 0.97 }}
                    transition={{ duration: 0.4, ease: EASE_OUT }}
                    role="status"
                    className={`editorial-card is-lit glow-tl relative flex items-start gap-3 rounded-2xl border ${ring} bg-ab-black-raised/95 p-4 pr-10 shadow-[0_20px_45px_-20px_rgba(0,0,0,0.9)] backdrop-blur-sm`}
                  >
                    <Icon name={iconName} size={20} className={`shrink-0 ${accent}`} />
                    <p className="text-sm leading-snug text-ab-text">{item.message}</p>
                    <button
                      onClick={() => dismiss(item.id)}
                      aria-label="Dismiss notification"
                      className="absolute right-3 top-3.5 text-ab-text-muted transition-colors hover:text-ab-cream"
                    >
                      <Icon name="XMarkIcon" size={14} />
                    </button>
                  </motion.div>
                );
              })}
            </AnimatePresence>
          </div>,
          document.body
        )}
    </ToastContext.Provider>
  );
}

export function useAbToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useAbToast must be used within an AbToastProvider');
  return ctx;
}
