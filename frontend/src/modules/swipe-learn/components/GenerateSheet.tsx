'use client';

import React, { useEffect, useState } from 'react';
import Modal from '@/components/ui/Modal';
import Icon from '@/components/ui/AppIcon';
import type { DifficultyLevel, GenerateFormat, GenerateOptions } from '../types';
import type { GeminiKeySource } from '../services/geminiService';

interface GenerateSheetProps {
  isOpen: boolean;
  onClose: () => void;
  /** e.g. "🐍 Python" or "🧠 Interview Prep · DSA". */
  targetLabel: string;
  /** Options to start from (last used, with the deck's natural format). */
  initial: GenerateOptions;
  /** Ready-made focus ideas, e.g. the card on screen. */
  focusIdeas: string[];
  focusPlaceholder: string;
  onGenerate: (options: GenerateOptions) => void;
  keySource: GeminiKeySource;
  model: string;
  onOpenSettings: () => void;
  busy: boolean;
}

const FORMATS: Array<{ id: GenerateFormat; label: string; hint: string; icon: string }> = [
  { id: 'random', label: 'Mix', hint: 'AI picks per idea', icon: 'SparklesIcon' },
  { id: 'quick-concept', label: 'Concept', hint: 'One idea, clearly', icon: 'LightBulbIcon' },
  { id: 'quiz', label: 'Quiz', hint: '4 options + why', icon: 'QuestionMarkCircleIcon' },
  { id: 'code-example', label: 'Code', hint: 'Short runnable snippet', icon: 'CodeBracketIcon' },
  {
    id: 'interview-question',
    label: 'Interview',
    hint: 'Question + answer gist',
    icon: 'ChatBubbleLeftRightIcon',
  },
  { id: 'advanced-concept', label: 'Deep dive', hint: 'Internals and gotchas', icon: 'FireIcon' },
  { id: 'recent-dev', label: "What's new", hint: 'Last two years', icon: 'NewspaperIcon' },
];

const COUNTS = [1, 3, 5, 10];

const LEVELS: Array<{ id: DifficultyLevel | 'any'; label: string }> = [
  { id: 'any', label: 'Any' },
  { id: 'beginner', label: 'Beginner' },
  { id: 'intermediate', label: 'Mid' },
  { id: 'advanced', label: 'Advanced' },
];

export default function GenerateSheet({
  isOpen,
  onClose,
  targetLabel,
  initial,
  focusIdeas,
  focusPlaceholder,
  onGenerate,
  keySource,
  model,
  onOpenSettings,
  busy,
}: GenerateSheetProps) {
  const [format, setFormat] = useState<GenerateFormat>(initial.format);
  const [count, setCount] = useState(initial.count);
  const [difficulty, setDifficulty] = useState<DifficultyLevel | 'any'>(initial.difficulty);
  const [focus, setFocus] = useState(initial.focus);

  // Start from the given options each time the sheet opens.
  useEffect(() => {
    if (!isOpen) return;
    setFormat(initial.format);
    setCount(initial.count);
    setDifficulty(initial.difficulty);
    setFocus(initial.focus);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  const hasKey = keySource !== 'none';
  const levelLocked = format === 'advanced-concept';

  const submit = (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!hasKey || busy) return;
    onGenerate({
      format,
      count,
      difficulty: levelLocked ? 'advanced' : difficulty,
      focus: focus.trim(),
    });
    onClose();
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      labelledBy="swipe-generate-title"
      backdropClassName="bg-black/50 backdrop-blur-[2px]"
      overlayClassName="flex items-end justify-center sm:items-center sm:p-4"
      className="notif-sheet flex w-full flex-col overflow-hidden border border-border bg-card shadow-2xl sm:max-w-[30rem]"
    >
      <form onSubmit={submit} className="flex min-h-0 flex-1 flex-col">
        <span className="swipe-sheet-handle" aria-hidden="true" />
        <div className="flex items-start justify-between gap-3 px-5 pb-3 pt-3 sm:pt-5">
          <div className="min-w-0">
            <h2
              id="swipe-generate-title"
              className="font-heading text-lg font-bold text-foreground"
            >
              Generate cards
            </h2>
            <p className="mt-0.5 truncate text-sm text-muted-foreground">For {targetLabel}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="swipe-icon-btn -mr-2 -mt-1"
            aria-label="Close"
          >
            <Icon name="XMarkIcon" size={20} />
          </button>
        </div>

        <div className="min-h-0 flex-1 space-y-5 overflow-y-auto overscroll-contain px-5 pb-4 scrollbar-clean">
          {/* Focus */}
          <div>
            <label htmlFor="swipe-generate-focus" className="swipe-field-label">
              What should they cover? <span className="font-normal">(optional)</span>
            </label>
            <input
              id="swipe-generate-focus"
              type="text"
              value={focus}
              onChange={(e) => setFocus(e.target.value)}
              placeholder={focusPlaceholder}
              maxLength={200}
              enterKeyHint="go"
              autoComplete="off"
              className="swipe-input"
            />
            {focusIdeas.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {focusIdeas.map((idea) => (
                  <button
                    key={idea}
                    type="button"
                    onClick={() => setFocus(idea)}
                    className="swipe-suggest"
                  >
                    <Icon
                      name="ArrowTurnDownRightIcon"
                      size={14}
                      className="shrink-0 text-muted-foreground"
                    />
                    <span className="truncate">{idea}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Card type */}
          <fieldset>
            <legend className="swipe-field-label">Card type</legend>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {FORMATS.map((f) => (
                <button
                  key={f.id}
                  type="button"
                  onClick={() => setFormat(f.id)}
                  aria-pressed={format === f.id}
                  className={`swipe-choice ${f.id === 'random' ? 'col-span-2 sm:col-span-1' : ''}`}
                >
                  <span className="flex items-center gap-1.5 text-sm font-semibold">
                    <Icon
                      name={f.icon}
                      size={16}
                      className="swipe-choice-icon"
                      variant={format === f.id ? 'solid' : 'outline'}
                    />
                    {f.label}
                  </span>
                  <span className="text-xs leading-snug text-muted-foreground">{f.hint}</span>
                </button>
              ))}
            </div>
          </fieldset>

          {/* How many */}
          <fieldset>
            <legend className="swipe-field-label">How many</legend>
            <div className="swipe-chips">
              {COUNTS.map((n) => (
                <button
                  key={n}
                  type="button"
                  onClick={() => setCount(n)}
                  aria-pressed={count === n}
                  className="swipe-chip tabular-nums"
                >
                  {n}
                </button>
              ))}
            </div>
          </fieldset>

          {/* Level */}
          <fieldset disabled={levelLocked}>
            <legend className="swipe-field-label">
              Level {levelLocked && <span className="font-normal">(deep dives are advanced)</span>}
            </legend>
            <div className={`swipe-chips ${levelLocked ? 'opacity-60' : ''}`}>
              {LEVELS.map((l) => (
                <button
                  key={l.id}
                  type="button"
                  onClick={() => setDifficulty(l.id)}
                  aria-pressed={levelLocked ? l.id === 'advanced' : difficulty === l.id}
                  className="swipe-chip"
                >
                  {l.label}
                </button>
              ))}
            </div>
          </fieldset>
        </div>

        {/* Footer: always visible */}
        <div className="border-t border-border px-5 pb-4 pt-3">
          {hasKey ? (
            <>
              <button type="submit" disabled={busy} className="swipe-primary-btn w-full">
                <Icon name="SparklesIcon" size={18} variant="solid" />
                {busy
                  ? 'Already writing cards…'
                  : `Generate ${count} ${count === 1 ? 'card' : 'cards'}`}
              </button>
              <p className="mt-2 flex items-center justify-center gap-1 text-center text-xs text-muted-foreground">
                <span className="truncate">
                  Gemini · {model}
                  {keySource === 'config' ? ' · key from Config' : ''}
                </span>
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    onOpenSettings();
                  }}
                  className="shrink-0 font-semibold text-foreground underline-offset-2 hover:underline"
                >
                  Change
                </button>
              </p>
            </>
          ) : (
            <div className="space-y-2.5">
              <div className="swipe-note swipe-note-warn">
                <Icon name="KeyIcon" size={18} className="mt-px shrink-0" />
                <span>
                  Cards are written by Google Gemini. Add your own (free) API key to generate.
                </span>
              </div>
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onOpenSettings();
                }}
                className="swipe-primary-btn w-full"
              >
                Add a Gemini key
              </button>
            </div>
          )}
        </div>
      </form>
    </Modal>
  );
}
