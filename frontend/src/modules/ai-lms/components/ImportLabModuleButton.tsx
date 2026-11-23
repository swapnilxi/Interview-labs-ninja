'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import Icon from '@/components/ui/AppIcon';
import type { LabModuleSource } from '@/modules/labs/common/labModules';
import type { TopicLabTopic } from '@/modules/labs/common/topicLabTypes';
import type { LmsClass, LmsSubject } from '../types';
import {
  fetchLabTopics,
  importableSections,
  isAlreadyInClass,
  loadModuleContent,
  planModuleImport,
  runModuleImport,
  type ImportOptions,
  type ImportProgress,
  type ImportResult,
  type ModuleContent,
} from '../utils/importLabModule';
import { LMS_TOOLBAR_BTN } from './toolbarStyles';

interface ImportLabModuleButtonProps {
  targetClass: LmsClass;
  /** The class's subjects now: a module with the same name is marked as already there. */
  existingSubjects: LmsSubject[];
  /** Called as soon as an import has added something, so the class page can reload. */
  onImported: () => void;
}

type Step = 'lab' | 'modules' | 'options' | 'importing' | 'done';

interface Outcome {
  topic: TopicLabTopic;
  result?: ImportResult;
  error?: string;
}

const STEP_LABELS: { id: Exclude<Step, 'importing' | 'done'>; label: string }[] = [
  { id: 'lab', label: 'Lab' },
  { id: 'modules', label: 'Modules' },
  { id: 'options', label: 'Import' },
];

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** A labelled native checkbox: visible text, 44px-tall hit area on a phone. */
function CheckRow({
  checked,
  disabled,
  onChange,
  title,
  hint,
  tags = [],
}: {
  checked: boolean;
  disabled?: boolean;
  onChange: (next: boolean) => void;
  title: string;
  hint?: string;
  tags?: string[];
}) {
  return (
    <label
      className={`flex items-start gap-3 rounded-lg px-3 py-2.5 ${
        disabled ? 'cursor-not-allowed opacity-60' : 'cursor-pointer hover:bg-muted'
      }`}
    >
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(event) => onChange(event.target.checked)}
        className="mt-0.5 h-4 w-4 flex-shrink-0 accent-[var(--color-primary)]"
      />
      <span className="min-w-0 flex-1">
        <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="text-sm font-medium text-foreground">{title}</span>
          {tags.map((tag) => (
            <span
              key={tag}
              className="rounded-full border border-border bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground"
            >
              {tag}
            </span>
          ))}
        </span>
        {hint && (
          <span className="mt-0.5 block text-xs leading-relaxed text-muted-foreground">{hint}</span>
        )}
      </span>
    </label>
  );
}

export default function ImportLabModuleButton({
  targetClass,
  existingSubjects,
  onImported,
}: ImportLabModuleButtonProps) {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<Step>('lab');
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  const [sources, setSources] = useState<LabModuleSource[] | null>(null);
  const [sourcesError, setSourcesError] = useState<string | null>(null);
  const [source, setSource] = useState<LabModuleSource | null>(null);

  const [topics, setTopics] = useState<TopicLabTopic[] | null>(null);
  const [topicsError, setTopicsError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const [options, setOptions] = useState<ImportOptions>({
    sectionIds: [],
    useTemplates: true,
    writeMissingWithAi: false,
    includeQuiz: true,
  });
  const contentCache = useRef(new Map<string, ModuleContent>());
  const [contents, setContents] = useState<ModuleContent[] | null>(null);
  const [contentError, setContentError] = useState<string | null>(null);

  const [progress, setProgress] = useState<ImportProgress | null>(null);
  const [outcomes, setOutcomes] = useState<Outcome[]>([]);
  const cancelRef = useRef(false);

  const busy = step === 'importing';

  const close = useCallback(() => {
    if (busy) return;
    setOpen(false);
    triggerRef.current?.focus();
  }, [busy]);

  const reset = () => {
    setStep('lab');
    setSource(null);
    setTopics(null);
    setTopicsError(null);
    setQuery('');
    setSelected(new Set());
    setContents(null);
    setContentError(null);
    setProgress(null);
    setOutcomes([]);
    cancelRef.current = false;
    contentCache.current.clear();
  };

  const openDialog = () => {
    reset();
    setOpen(true);
  };

  // The registry (and the lab configs behind it) is loaded when the dialog opens, not with the class page.
  useEffect(() => {
    if (!open || sources) return;
    let cancelled = false;
    import('@/modules/labs/common/labModules')
      .then((m) => {
        if (!cancelled) setSources(m.getLabModuleSources());
      })
      .catch((err: unknown) => {
        if (!cancelled)
          setSourcesError(err instanceof Error ? err.message : 'Could not load the labs.');
      });
    return () => {
      cancelled = true;
    };
  }, [open, sources]);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') close();
    };
    window.addEventListener('keydown', onKey);
    // Keyboard and screen-reader users start inside the dialog.
    const raf = requestAnimationFrame(() => panelRef.current?.focus());
    return () => {
      window.removeEventListener('keydown', onKey);
      cancelAnimationFrame(raf);
    };
  }, [open, close]);

  const chooseLab = (next: LabModuleSource) => {
    setSource(next);
    setStep('modules');
    setTopics(null);
    setTopicsError(null);
    setQuery('');
    setSelected(new Set());
    setOptions({
      sectionIds: importableSections(next).map((d) => d.id),
      useTemplates: true,
      writeMissingWithAi: false,
      includeQuiz: true,
    });
    fetchLabTopics(next)
      .then(setTopics)
      .catch((err: unknown) =>
        setTopicsError(
          err instanceof Error ? err.message : `Could not load the ${next.config.labName}.`
        )
      );
  };

  const filteredGroups = useMemo(() => {
    if (!topics) return [];
    const q = query.trim().toLowerCase();
    const list = q
      ? topics.filter(
          (t) =>
            t.name.toLowerCase().includes(q) ||
            t.brief.toLowerCase().includes(q) ||
            t.category.toLowerCase().includes(q) ||
            t.subtopics.some((s) => s.name.toLowerCase().includes(q))
        )
      : topics;
    const groups = new Map<string, TopicLabTopic[]>();
    for (const t of list) groups.set(t.category, [...(groups.get(t.category) ?? []), t]);
    return [...groups.entries()].map(([category, items]) => ({ category, items }));
  }, [topics, query]);

  const selectedTopics = useMemo(
    () => (topics ?? []).filter((t) => selected.has(t.id)),
    [topics, selected]
  );

  const toggleTopic = (id: string, on: boolean) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });

  const toggleCategory = (items: TopicLabTopic[], on: boolean) =>
    setSelected((prev) => {
      const next = new Set(prev);
      for (const t of items) {
        if (isAlreadyInClass(existingSubjects, t)) continue;
        if (on) next.add(t.id);
        else next.delete(t.id);
      }
      return next;
    });

  // What the lab holds for the chosen modules is read once; the options then only change how it is put together.
  useEffect(() => {
    if (step !== 'options' || !source) return;
    let cancelled = false;
    setContents(null);
    setContentError(null);
    Promise.all(
      selectedTopics.map(async (topic) => {
        const key = `${source.lab}:${topic.id}`;
        const cached = contentCache.current.get(key);
        if (cached) return cached;
        const loaded = await loadModuleContent(source, topic);
        contentCache.current.set(key, loaded);
        return loaded;
      })
    )
      .then((list) => {
        if (!cancelled) setContents(list);
      })
      .catch((err: unknown) => {
        if (!cancelled)
          setContentError(err instanceof Error ? err.message : 'Could not read the lab pages.');
      });
    return () => {
      cancelled = true;
    };
  }, [step, source, selectedTopics]);

  const plans = useMemo(
    () => (contents && source ? contents.map((c) => planModuleImport(source, c, options)) : null),
    [contents, source, options]
  );

  const totals = useMemo(() => {
    const sum = { lessons: 0, saved: 0, template: 0, ai: 0, quiz: 0 };
    for (const plan of plans ?? []) {
      sum.lessons += plan.counts.lessons;
      sum.saved += plan.counts.saved;
      sum.template += plan.counts.template;
      sum.ai += plan.counts.ai;
      sum.quiz += plan.counts.quiz;
    }
    return sum;
  }, [plans]);

  const hasTemplates = !!source && !!(source.config.defaultContent || source.config.prereqBaseline);

  const startImport = async () => {
    if (!source || !plans) return;
    cancelRef.current = false;
    setStep('importing');
    setOutcomes([]);
    const collected: Outcome[] = [];
    for (const plan of plans) {
      if (cancelRef.current) break;
      try {
        const result = await runModuleImport({
          source,
          plan,
          targetClass,
          onProgress: (p) => setProgress({ ...p, label: `${plan.topic.name}: ${p.label}` }),
          isCancelled: () => cancelRef.current,
        });
        collected.push({ topic: plan.topic, result });
        onImported();
      } catch (err) {
        collected.push({
          topic: plan.topic,
          error: err instanceof Error ? err.message : 'The import failed.',
        });
      }
    }
    setOutcomes(collected);
    setStep('done');
  };

  const stepIndex = STEP_LABELS.findIndex((s) => s.id === step);
  const canGoBack = step === 'modules' || step === 'options';
  const goBack = () => setStep(step === 'options' ? 'modules' : 'lab');

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={openDialog}
        aria-haspopup="dialog"
        className={LMS_TOOLBAR_BTN}
      >
        <Icon name="BeakerIcon" size={14} />
        <span>Import from labs</span>
      </button>

      {open && (
        <div
          className="fixed inset-0 z-[300] flex items-end justify-center bg-black/60 backdrop-blur-sm animate-fadeIn sm:items-center sm:p-4"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) close();
          }}
        >
          <div
            ref={panelRef}
            tabIndex={-1}
            role="dialog"
            aria-modal="true"
            aria-labelledby="import-lab-title"
            className="flex max-h-[92dvh] w-full max-w-2xl flex-col rounded-t-xl border border-border bg-card shadow-2xl sm:max-h-[88dvh] sm:rounded-xl"
          >
            {/* Header */}
            <div className="flex items-start justify-between gap-3 border-b border-border px-[1.25rem] py-4 sm:px-[1.5rem]">
              <div className="flex items-center gap-3">
                <div className="rounded-lg p-2 text-primary mix-bg-primary/10">
                  <Icon name="BeakerIcon" size={20} />
                </div>
                <div>
                  <h3
                    id="import-lab-title"
                    className="font-heading text-lg font-semibold text-foreground"
                  >
                    Import from labs
                  </h3>
                  <p className="text-xs text-muted-foreground">
                    Add a lab module to {targetClass.name} as a subject with lessons
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={close}
                disabled={busy}
                aria-label="Close"
                className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-40"
              >
                <Icon name="XMarkIcon" size={20} />
              </button>
            </div>

            {stepIndex >= 0 && (
              <ol className="flex items-center gap-2 border-b border-border px-[1.25rem] py-2.5 text-xs sm:px-[1.5rem]">
                {STEP_LABELS.map((s, i) => (
                  <li
                    key={s.id}
                    aria-current={i === stepIndex ? 'step' : undefined}
                    className={`flex items-center gap-2 ${
                      i === stepIndex ? 'font-semibold text-foreground' : 'text-muted-foreground'
                    }`}
                  >
                    {i > 0 && <Icon name="ChevronRightIcon" size={12} />}
                    <span>{s.label}</span>
                  </li>
                ))}
              </ol>
            )}

            {/* Body */}
            <div className="min-h-0 flex-1 overflow-y-auto px-[1.25rem] py-4 sm:px-[1.5rem]">
              {step === 'lab' && (
                <div>
                  <p className="mb-3 text-sm text-muted-foreground">
                    Pick the lab to take a module from. A module is one topic with its subtopics.
                  </p>
                  {sourcesError && (
                    <p className="rounded-lg border border-rose-500/20 bg-rose-500/10 p-3 text-xs text-rose-500">
                      {sourcesError}
                    </p>
                  )}
                  {!sources && !sourcesError && (
                    <p className="text-sm text-muted-foreground">Loading labs…</p>
                  )}
                  <div className="grid gap-3 sm:grid-cols-2">
                    {sources?.map((s) => (
                      <button
                        key={s.lab}
                        type="button"
                        onClick={() => chooseLab(s)}
                        className="flex items-start gap-3 rounded-xl border border-border bg-card p-4 text-left transition-colors hover:bg-muted"
                      >
                        <span
                          className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg border"
                          style={{
                            backgroundColor: `color-mix(in srgb, ${s.accent} 14%, transparent)`,
                            borderColor: `color-mix(in srgb, ${s.accent} 30%, transparent)`,
                            color: s.accent,
                          }}
                        >
                          <Icon name={s.catalog.icon} size={18} />
                        </span>
                        <span className="min-w-0">
                          <span className="block text-sm font-semibold text-foreground">
                            {s.catalog.label}
                          </span>
                          <span className="mt-0.5 block text-xs leading-relaxed text-muted-foreground">
                            {s.catalog.description}
                          </span>
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {step === 'modules' && source && (
                <div>
                  <div className="relative mb-3">
                    <Icon
                      name="MagnifyingGlassIcon"
                      size={16}
                      className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
                    />
                    <input
                      type="search"
                      value={query}
                      onChange={(event) => setQuery(event.target.value)}
                      placeholder={`Search ${source.catalog.label} modules`}
                      aria-label="Search modules"
                      className="w-full rounded-lg border border-border bg-input py-2.5 pl-9 pr-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:mix-ring-primary/40"
                    />
                  </div>
                  {topicsError && (
                    <p className="rounded-lg border border-rose-500/20 bg-rose-500/10 p-3 text-xs text-rose-500">
                      {topicsError}
                    </p>
                  )}
                  {!topics && !topicsError && (
                    <p className="text-sm text-muted-foreground">Loading modules…</p>
                  )}
                  {topics && filteredGroups.length === 0 && (
                    <p className="py-6 text-center text-sm text-muted-foreground">
                      No module matches “{query}”. Try a shorter word, or clear the search.
                    </p>
                  )}
                  <div className="space-y-5">
                    {filteredGroups.map((group) => {
                      const selectable = group.items.filter(
                        (t) => !isAlreadyInClass(existingSubjects, t)
                      );
                      const allOn =
                        selectable.length > 0 && selectable.every((t) => selected.has(t.id));
                      return (
                        <fieldset key={group.category}>
                          <legend className="sr-only">{group.category}</legend>
                          <div className="mb-1 flex items-center justify-between gap-3">
                            <h4 className="text-xs font-semibold text-muted-foreground">
                              {group.category}
                              <span className="ml-2 font-normal">
                                {plural(group.items.length, 'module')}
                              </span>
                            </h4>
                            {selectable.length > 1 && (
                              <button
                                type="button"
                                onClick={() => toggleCategory(group.items, !allOn)}
                                className="rounded px-1 text-xs font-medium text-primary hover:underline"
                              >
                                {allOn ? 'Clear category' : 'Select category'}
                              </button>
                            )}
                          </div>
                          <div>
                            {group.items.map((t) => {
                              const already = isAlreadyInClass(existingSubjects, t);
                              return (
                                <CheckRow
                                  key={t.id}
                                  checked={selected.has(t.id)}
                                  disabled={already}
                                  onChange={(on) => toggleTopic(t.id, on)}
                                  title={t.name}
                                  tags={[
                                    ...(already ? ['In this class'] : []),
                                    t.difficulty,
                                    plural(t.subtopics.length, 'subtopic'),
                                  ]}
                                  hint={t.brief}
                                />
                              );
                            })}
                          </div>
                        </fieldset>
                      );
                    })}
                  </div>
                </div>
              )}

              {step === 'options' && source && (
                <div className="space-y-5">
                  <div
                    role="status"
                    aria-live="polite"
                    className="rounded-xl border border-border bg-muted p-4 text-sm"
                  >
                    {contentError && <p className="text-rose-500">{contentError}</p>}
                    {!contentError && !plans && (
                      <p className="text-muted-foreground">Checking what the lab already has…</p>
                    )}
                    {plans && (
                      <div className="space-y-2">
                        {plans.map((plan) => (
                          <p key={plan.topic.id}>
                            <span className="block font-semibold text-foreground">
                              {plan.topic.name}
                            </span>
                            <span className="block text-muted-foreground">
                              {plural(plan.counts.lessons, 'lesson')}
                              {`, ${plural(plan.counts.saved, 'saved section')}`}
                              {plan.counts.template > 0 &&
                                `, ${plural(plan.counts.template, 'template')}`}
                              {plan.counts.ai > 0 &&
                                `, ${plural(plan.counts.ai, 'section')} to write with AI`}
                              {plan.counts.quiz > 0 &&
                                `, ${plural(plan.counts.quiz, 'quiz question')}`}
                            </span>
                          </p>
                        ))}
                        {totals.ai > 0 && (
                          <p className="text-xs text-muted-foreground">
                            This makes {plural(totals.ai, 'AI request')}, two at a time. Keep this
                            window open until it finishes.
                          </p>
                        )}
                        {totals.saved + totals.template + totals.ai + totals.quiz === 0 && (
                          <p className="text-xs text-muted-foreground">
                            Nothing is written for these modules yet, so each would only get an
                            overview lesson. Turn on “Write the empty sections with AI”, or open the
                            lab and generate the pages first.
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                  <fieldset>
                    <legend className="mb-1 text-xs font-semibold text-muted-foreground">
                      How to fill them
                    </legend>
                    <CheckRow
                      checked={options.includeQuiz}
                      onChange={(on) => setOptions((o) => ({ ...o, includeQuiz: on }))}
                      title="Add the quiz questions you generated"
                      hint="Shown as an interactive quiz at the end of each lesson."
                    />
                    {hasTemplates && (
                      <CheckRow
                        checked={options.useTemplates}
                        onChange={(on) => setOptions((o) => ({ ...o, useTemplates: on }))}
                        title="Use the lab’s built-in templates"
                        hint="Where the lab has one (for example Prerequisites), the module’s first lesson gets it."
                      />
                    )}
                    <CheckRow
                      checked={options.writeMissingWithAi}
                      onChange={(on) => setOptions((o) => ({ ...o, writeMissingWithAi: on }))}
                      title="Write the empty sections with AI"
                      hint="Uses your AI settings, takes a while, and saves the text in the lab too. Off: sections nobody has written yet are left out."
                    />
                  </fieldset>
                  <fieldset>
                    <div className="mb-1 flex items-center justify-between gap-3">
                      <legend className="text-xs font-semibold text-muted-foreground">
                        Sections to bring in
                      </legend>
                      <button
                        type="button"
                        onClick={() =>
                          setOptions((o) => ({
                            ...o,
                            sectionIds:
                              o.sectionIds.length === importableSections(source).length
                                ? []
                                : importableSections(source).map((d) => d.id),
                          }))
                        }
                        className="rounded px-1 text-xs font-medium text-primary hover:underline"
                      >
                        {options.sectionIds.length === importableSections(source).length
                          ? 'Clear all'
                          : 'Select all'}
                      </button>
                    </div>
                    <div className="grid sm:grid-cols-2 sm:gap-x-2">
                      {importableSections(source).map((def) => (
                        <CheckRow
                          key={def.id}
                          checked={options.sectionIds.includes(def.id)}
                          onChange={(on) =>
                            setOptions((o) => ({
                              ...o,
                              sectionIds: on
                                ? [...o.sectionIds, def.id]
                                : o.sectionIds.filter((id) => id !== def.id),
                            }))
                          }
                          title={def.label}
                          hint={def.subtitle}
                        />
                      ))}
                    </div>
                  </fieldset>
                </div>
              )}

              {step === 'importing' && (
                <div className="space-y-4 py-4" role="status" aria-live="polite">
                  <p className="text-sm font-medium text-foreground">Importing…</p>
                  <div
                    role="progressbar"
                    aria-valuemin={0}
                    aria-valuemax={progress?.total ?? 1}
                    aria-valuenow={progress?.done ?? 0}
                    className="h-2 w-full overflow-hidden rounded-full bg-muted"
                  >
                    <div
                      className="h-full rounded-full bg-primary transition-all"
                      style={{
                        width: `${progress ? Math.round((progress.done / Math.max(progress.total, 1)) * 100) : 0}%`,
                      }}
                    />
                  </div>
                  <p className="text-xs text-muted-foreground">{progress?.label ?? 'Starting…'}</p>
                </div>
              )}

              {step === 'done' && (
                <div className="space-y-3">
                  {outcomes.length === 0 && (
                    <p className="text-sm text-muted-foreground">
                      The import was cancelled. Nothing was added.
                    </p>
                  )}
                  {outcomes.map((o) => (
                    <div
                      key={o.topic.id}
                      className={`rounded-xl border p-4 ${
                        o.error ? 'border-rose-500/30 bg-rose-500/5' : 'border-border bg-muted'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-foreground">{o.topic.name}</p>
                          {o.result && (
                            <p className="text-xs text-muted-foreground">
                              Added with {plural(o.result.lessons.length, 'lesson')}
                            </p>
                          )}
                          {o.error && <p className="mt-1 text-xs text-rose-500">{o.error}</p>}
                        </div>
                        {o.result && (
                          <Link
                            href={`/ai-lms/classes/${targetClass.slug}/${o.result.subject.slug}`}
                            className="flex-shrink-0 text-xs font-semibold text-primary hover:underline"
                          >
                            Open subject
                          </Link>
                        )}
                      </div>
                      {o.result && o.result.warnings.length > 0 && (
                        <ul className="mt-2 list-disc space-y-0.5 pl-4 text-xs text-muted-foreground">
                          {o.result.warnings.map((w) => (
                            <li key={w}>{w}</li>
                          ))}
                        </ul>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="flex items-center justify-between gap-3 border-t border-border px-[1.25rem] py-3 sm:px-[1.5rem]">
              <div>
                {canGoBack && (
                  <button
                    type="button"
                    onClick={goBack}
                    className="rounded-lg px-3 py-2 text-sm font-medium text-foreground transition-colors hover:bg-muted"
                  >
                    Back
                  </button>
                )}
                {step === 'done' && (
                  <button
                    type="button"
                    onClick={() => {
                      reset();
                    }}
                    className="rounded-lg px-3 py-2 text-sm font-medium text-foreground transition-colors hover:bg-muted"
                  >
                    Import another
                  </button>
                )}
              </div>
              <div className="flex items-center gap-2">
                {step === 'modules' && (
                  <>
                    <span className="text-xs text-muted-foreground">
                      {plural(selected.size, 'module')} selected
                    </span>
                    <button
                      type="button"
                      disabled={selected.size === 0}
                      onClick={() => setStep('options')}
                      className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition-colors hover:mix-bg-primary/90 disabled:opacity-50"
                    >
                      Continue
                    </button>
                  </>
                )}
                {step === 'options' && (
                  <button
                    type="button"
                    disabled={
                      !plans || options.sectionIds.length + (options.includeQuiz ? 1 : 0) === 0
                    }
                    onClick={startImport}
                    className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition-colors hover:mix-bg-primary/90 disabled:opacity-50"
                  >
                    {`Import ${plural(selectedTopics.length, 'module')}`}
                  </button>
                )}
                {step === 'importing' && (
                  <button
                    type="button"
                    onClick={() => {
                      cancelRef.current = true;
                    }}
                    className="rounded-lg px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-muted"
                  >
                    Stop import
                  </button>
                )}
                {step === 'done' && (
                  <button
                    type="button"
                    onClick={close}
                    className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition-colors hover:mix-bg-primary/90"
                  >
                    Done
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
