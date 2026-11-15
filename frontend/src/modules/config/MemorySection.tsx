'use client';

import React, { useCallback, useEffect, useState } from 'react';
import Icon from '@/components/ui/AppIcon';
import { useAuth } from '@/contexts/AuthContext';
import { openLoginModal } from '@/components/auth/LoginModal';
import {
  MEMORY_KIND_LABEL,
  clearMemory,
  forgetMemory,
  listMemory,
  type MemoryFact,
} from '@/lib/services/memoryService';
import { Notice, SectionHeader } from './parts';

/** The module ids modules record under, shown as names. */
const MODULE_LABEL: Record<string, string> = {
  'swipe-learn': 'SwipeLearn',
  'daily-session': 'Daily Session',
};

/**
 * What the AI has learned about you. Every module that writes with AI can record short facts (a card you saved, a
 * question you rated low) and reads the strongest few back into its next prompt, so questions and cards adapt over
 * time. It lives on the server under your account (works on every device), is never shared, and can be edited here:
 * forget one fact, or all of them.
 */
export default function MemorySection() {
  const { isGuest } = useAuth();
  const [facts, setFacts] = useState<MemoryFact[] | null>(null);
  const [error, setError] = useState('');
  const [confirmClear, setConfirmClear] = useState(false);

  const load = useCallback(async () => {
    try {
      setFacts(await listMemory());
      setError('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load your memory.');
      setFacts([]);
    }
  }, []);

  useEffect(() => {
    if (!isGuest) void load();
  }, [isGuest, load]);

  const forget = async (id: number) => {
    setFacts((prev) => prev?.filter((f) => f.id !== id) ?? prev);
    try {
      await forgetMemory(id);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not forget that.');
      void load();
    }
  };

  const clearAll = async () => {
    setConfirmClear(false);
    try {
      await clearMemory();
      setFacts([]);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not clear your memory.');
    }
  };

  const modules = Array.from(new Set((facts ?? []).map((f) => f.module)));

  return (
    <div>
      <SectionHeader
        title="AI memory"
        sub="Short things the AI has noticed about how you learn. They shape your next questions and cards, are kept on your account, and are never shared."
      />

      {isGuest ? (
        <Notice tone="info" icon="KeyIcon">
          Memory belongs to your account so it follows you between devices.{' '}
          <button
            type="button"
            onClick={() => openLoginModal()}
            className="font-semibold text-foreground underline-offset-2 hover:underline"
          >
            Log in
          </button>{' '}
          to start building it.
        </Notice>
      ) : (
        <>
          {error && (
            <Notice tone="error" className="mb-3">
              {error}
            </Notice>
          )}
          {facts === null ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : facts.length === 0 ? (
            <Notice tone="info">
              Nothing yet. Save SwipeLearn cards, miss a quiz, or rate Daily Session questions and
              it starts to fill in.
            </Notice>
          ) : (
            <div className="space-y-5">
              {modules.map((m) => (
                <div key={m}>
                  <h3 className="swipe-field-label mb-1.5">{MODULE_LABEL[m] ?? m}</h3>
                  <ul className="divide-y divide-border rounded-xl border border-border">
                    {facts
                      .filter((f) => f.module === m)
                      .map((f) => (
                        <li key={f.id} className="flex items-start gap-3 px-3.5 py-2.5">
                          <div className="min-w-0 flex-1">
                            <p className="break-words text-sm text-foreground">
                              <span className="font-semibold">{MEMORY_KIND_LABEL[f.kind]}:</span>{' '}
                              {f.fact}
                            </p>
                            <p className="mt-0.5 text-xs text-muted-foreground">
                              {f.topic ? `${f.topic} · ` : ''}seen {f.hits}×
                            </p>
                          </div>
                          <button
                            type="button"
                            onClick={() => void forget(f.id)}
                            className="-mr-1.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-muted-foreground hover:text-foreground"
                            aria-label={`Forget: ${f.fact}`}
                          >
                            <Icon name="XMarkIcon" size={16} />
                          </button>
                        </li>
                      ))}
                  </ul>
                </div>
              ))}

              <div>
                {confirmClear ? (
                  <div className="flex flex-wrap items-center gap-2 text-sm">
                    <span className="text-foreground">Forget everything the AI has learned?</span>
                    <button
                      type="button"
                      onClick={() => void clearAll()}
                      className="font-semibold text-error hover:underline"
                    >
                      Yes, forget all
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirmClear(false)}
                      className="font-semibold text-muted-foreground hover:underline"
                    >
                      Cancel
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => setConfirmClear(true)}
                    className="text-sm font-semibold text-muted-foreground hover:text-foreground"
                  >
                    Forget everything
                  </button>
                )}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
