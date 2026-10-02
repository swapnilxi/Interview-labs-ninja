'use client';

import React, { useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import Icon from '@/components/ui/AppIcon';
import { lmsService, type PlacementSuggestion } from '../services/lmsService';
import { extractMultipleFiles, mergeSourceNames } from '../utils/contextFiles';
import type { LmsClass, LmsLesson, LmsProjectPlanItem, LmsSubject } from '../types';
import ConfirmDialog from './ConfirmDialog';
import ContextSummaryPanel from './ContextSummaryPanel';
import RagIndexPanel from './RagIndexPanel';

interface ProjectDetailModuleProps {
  project: LmsSubject;
  lmsClass: LmsClass;
  onReload: () => void;
  /** 'modules' = outline + quick-add box; 'edit' = project details + README/context editor. */
  mode: 'modules' | 'edit';
  onDone: () => void;
}

/** A flattened, addressable entry in the module/sublesson tree -- lets the "Generate All"
 * walk and the per-item UI share one shape regardless of nesting depth. */
interface FlatItem {
  key: string; // "m{i}" or "m{i}s{j}"
  moduleIndex: number;
  subIndex: number | null;
  item: LmsProjectPlanItem;
  depth: 0 | 1;
}

type ItemStatus = 'idle' | 'generating' | 'done' | 'error';

function flattenPlan(plan: LmsProjectPlanItem[]): FlatItem[] {
  const flat: FlatItem[] = [];
  plan.forEach((mod, i) => {
    flat.push({ key: `m${i}`, moduleIndex: i, subIndex: null, item: mod, depth: 0 });
    (mod.sublessons || []).forEach((sub, j) => {
      flat.push({ key: `m${i}s${j}`, moduleIndex: i, subIndex: j, item: sub, depth: 1 });
    });
  });
  return flat;
}

function StatusBadge({ status }: { status: ItemStatus }) {
  const config: Record<ItemStatus, { icon: string; className: string; label: string }> = {
    idle: { icon: 'MinusCircleIcon', className: 'text-muted-foreground', label: 'Not generated' },
    generating: {
      icon: 'ArrowPathIcon',
      className: 'text-primary animate-spin',
      label: 'Generating...',
    },
    done: { icon: 'CheckCircleIcon', className: 'text-success', label: 'Generated' },
    error: { icon: 'ExclamationTriangleIcon', className: 'text-destructive', label: 'Failed' },
  };
  const { icon, className, label } = config[status];
  return (
    <span className="inline-flex items-center gap-1 text-[11px] font-medium" title={label}>
      <Icon name={icon} size={14} className={className} />
      <span className={status === 'idle' ? 'text-muted-foreground' : className}>{label}</span>
    </span>
  );
}

interface InsertTarget {
  label: string;
  moduleIndex: number | null;
  position: number;
}

/** A hairline "+" between rows that expands into a small form for adding a step there. */
function InsertGap({
  targets,
  disabled,
  indent,
  onAdd,
  onSuggest,
  autoOpen,
  onClose,
}: {
  targets: InsertTarget[];
  disabled: boolean;
  indent: boolean;
  onAdd: (
    target: InsertTarget,
    title: string,
    focus: string,
    context: string,
    generate: boolean
  ) => Promise<boolean>;
  onSuggest: (context: string, title: string) => Promise<PlacementSuggestion>;
  /** Open the form immediately (used by the header "Add from context" button). */
  autoOpen?: InsertTarget;
  onClose?: () => void;
}) {
  const [active, setActive] = useState<InsertTarget | null>(autoOpen ?? null);
  const [recs, setRecs] = useState<PlacementSuggestion | null>(null);
  const [suggesting, setSuggesting] = useState(false);
  const [suggestError, setSuggestError] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [focus, setFocus] = useState('');
  const [context, setContext] = useState('');
  const [generate, setGenerate] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const close = () => {
    setActive(null);
    setTitle('');
    setFocus('');
    setContext('');
    setGenerate(false);
    setRecs(null);
    setSuggestError(null);
    onClose?.();
  };

  const handleSuggest = async () => {
    setSuggesting(true);
    setSuggestError(null);
    try {
      const r = await onSuggest(context.trim(), title.trim());
      setRecs(r);
      setTitle((t) => t.trim() || r.title);
      setFocus((f) => f.trim() || r.focus);
    } catch (err: unknown) {
      setSuggestError(err instanceof Error ? err.message : 'Could not get a recommendation.');
    } finally {
      setSuggesting(false);
    }
  };

  const addAtRecommendation = async (r: PlacementSuggestion['suggestions'][number]) => {
    if (!recs) return;
    setSaving(true);
    const ok = await onAdd(
      { label: r.label, moduleIndex: r.module_index, position: r.position },
      title.trim() || recs.title || 'New step',
      focus.trim() || recs.focus,
      context.trim(),
      true
    );
    setSaving(false);
    if (ok) close();
  };

  const handleFiles = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;
    setUploading(true);
    try {
      const { combinedText } = await extractMultipleFiles(files);
      if (combinedText)
        setContext((prev) => (prev.trim() ? `${prev.trim()}\n\n${combinedText}` : combinedText));
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  if (active) {
    return (
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          if (!title.trim()) return;
          setSaving(true);
          const ok = await onAdd(active, title.trim(), focus.trim(), context.trim(), generate);
          setSaving(false);
          if (ok) close();
        }}
        className={`rounded-xl border border-dashed border-primary/40 bg-primary/5 p-3 space-y-2 ${indent ? 'ml-6 sm:ml-10' : ''}`}
      >
        <div className="text-[11px] font-semibold text-primary">{active.label}</div>
        <textarea
          rows={6}
          autoFocus
          value={context}
          onChange={(e) => setContext(e.target.value)}
          placeholder="Context -- paste notes, findings, errors or docs here, or upload files. The lesson is generated from this."
          className="w-full px-3 py-2 rounded-lg border border-border bg-background text-xs font-mono focus:outline-none focus:ring-2 focus:ring-primary/40 resize-y"
        />
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-3">
            <input
              ref={fileRef}
              type="file"
              accept=".pdf,.txt,.md,.docx"
              multiple
              onChange={handleFiles}
              className="hidden"
            />
            <button
              type="button"
              disabled={uploading}
              onClick={() => fileRef.current?.click()}
              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border border-border bg-card text-xs hover:bg-muted disabled:opacity-50"
            >
              <Icon name="ArrowUpTrayIcon" size={12} />
              <span>{uploading ? 'Reading...' : 'Upload documents'}</span>
            </button>
            <button
              type="button"
              role="switch"
              aria-checked={generate}
              onClick={() => setGenerate((g) => !g)}
              className="inline-flex items-center gap-2 text-xs text-foreground"
            >
              <span
                className="relative inline-block h-5 w-9 flex-shrink-0 rounded-full border transition-colors"
                style={{
                  backgroundColor: generate ? 'var(--color-primary)' : 'var(--color-muted)',
                  borderColor: generate ? 'var(--color-primary)' : 'var(--color-muted-foreground)',
                }}
              >
                <span
                  className="absolute top-0.5 left-0.5 h-3.5 w-3.5 rounded-full shadow transition-transform"
                  style={{
                    backgroundColor: generate ? '#fff' : 'var(--color-muted-foreground)',
                    transform: generate ? 'translateX(1rem)' : 'none',
                  }}
                />
              </span>
              <span>Generate lesson now</span>
            </button>
          </div>
        </div>
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Step title (optional -- AI suggests one)"
          maxLength={200}
          className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
        />
        <input
          value={focus}
          onChange={(e) => setFocus(e.target.value)}
          placeholder="Focus / finding (optional) -- guides lesson generation"
          className="w-full px-3 py-2 rounded-lg border border-border bg-background text-xs focus:outline-none focus:ring-2 focus:ring-primary/40"
        />
        <div className="rounded-lg border border-primary/30 bg-background/60 p-2.5 space-y-2">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[11px] text-muted-foreground">
              Not sure where this belongs? The AI compares it with your module titles and focus.
            </span>
            <button
              type="button"
              disabled={!context.trim() || suggesting || saving}
              onClick={handleSuggest}
              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border border-primary/40 bg-primary/10 text-primary text-xs font-medium hover:bg-primary/20 disabled:opacity-50 flex-shrink-0"
            >
              <Icon name="SparklesIcon" size={12} />
              <span>{suggesting ? 'Thinking...' : 'Recommend placement'}</span>
            </button>
          </div>
          {suggestError && <div className="text-[11px] text-destructive">{suggestError}</div>}
          {recs && (
            <div className="space-y-1.5">
              <div className="text-[11px] text-muted-foreground">
                Click a position to add{' '}
                <span className="font-semibold text-foreground">
                  “{title.trim() || recs.title}”
                </span>{' '}
                there and generate it:
              </div>
              {recs.suggestions.map((r, i) => (
                <button
                  key={`${r.module_index}-${r.position}`}
                  type="button"
                  disabled={saving}
                  onClick={() => addAtRecommendation(r)}
                  className="w-full text-left flex items-start gap-2 px-2.5 py-1.5 rounded-lg border border-border bg-card hover:border-primary/60 hover:bg-primary/5 disabled:opacity-50 transition-colors"
                >
                  <span className="font-mono text-[11px] font-bold px-1.5 py-0.5 rounded bg-primary/10 text-primary flex-shrink-0">
                    {i === 0 ? 'Best · ' : ''}
                    {r.label}
                  </span>
                  <span className="text-[11px] text-muted-foreground">{r.reason}</span>
                </button>
              ))}
            </div>
          )}
        </div>
        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={close}
            className="px-3 py-1.5 rounded-lg text-xs text-muted-foreground hover:bg-muted"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={!title.trim() || saving}
            className="px-3 py-1.5 rounded-lg bg-primary text-white text-xs font-medium disabled:opacity-50"
          >
            {saving
              ? generate
                ? 'Generating...'
                : 'Adding...'
              : generate
                ? 'Add & generate'
                : 'Add step'}
          </button>
        </div>
      </form>
    );
  }

  return (
    <div className={`group flex items-center gap-2 h-5 ${indent ? 'ml-6 sm:ml-10' : ''}`}>
      <div className="flex-1 h-px bg-transparent group-hover:bg-border transition-colors" />
      <div className="flex items-center gap-1.5 opacity-40 group-hover:opacity-100 focus-within:opacity-100 transition-opacity">
        {targets.map((t) => (
          <button
            key={t.label}
            type="button"
            disabled={disabled}
            onClick={() => setActive(t)}
            className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full border border-border bg-card text-[11px] text-muted-foreground hover:text-primary hover:border-primary/50 disabled:opacity-40"
          >
            <span>+</span>
            <span>{t.label}</span>
          </button>
        ))}
      </div>
      <div className="flex-1 h-px bg-transparent group-hover:bg-border transition-colors" />
    </div>
  );
}

export default function ProjectDetailModule({
  project,
  lmsClass,
  onReload,
  mode,
  onDone,
}: ProjectDetailModuleProps) {
  const [readme, setReadme] = useState(project.project_context || '');
  const [sourceName, setSourceName] = useState(project.context_source_name || '');
  const [readmeDirty, setReadmeDirty] = useState(false);
  const [name, setName] = useState(project.name || '');
  const [description, setDescription] = useState(project.description || '');
  const [isSavingDetails, setIsSavingDetails] = useState(false);
  const [quickBoxKey, setQuickBoxKey] = useState(0);
  const [isSavingReadme, setIsSavingReadme] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [isPlanning, setIsPlanning] = useState(false);
  const [isGeneratingAll, setIsGeneratingAll] = useState(false);
  const [confirmReplan, setConfirmReplan] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [itemStatus, setItemStatus] = useState<Record<string, ItemStatus>>({});
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const plan = project.project_plan || [];
  const flatItems = useMemo(() => flattenPlan(plan), [plan]);
  const lessonsById = useMemo(() => {
    const map = new Map<string, LmsLesson>();
    (project.lessons || []).forEach((l) => map.set(l.id, l));
    return map;
  }, [project.lessons]);

  const hasAnyGeneratedLesson = flatItems.some((f) => f.item.lesson_id);
  const generatedCount = flatItems.filter((f) => f.item.lesson_id).length;

  const lessonHref = (lessonId: string) => {
    const lesson = lessonsById.get(lessonId);
    if (!lesson) return null;
    return `/ai-lms/classes/${lmsClass.slug}/${project.slug}/${lesson.slug}`;
  };

  const statusFor = (flat: FlatItem): ItemStatus => {
    if (itemStatus[flat.key]) return itemStatus[flat.key];
    return flat.item.lesson_id ? 'done' : 'idle';
  };

  // ── README / Context ────────────────────────────────────────────────────
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;
    setIsUploading(true);
    setError(null);
    try {
      // Multiple documents can be attached one after another; each appends in turn.
      const { combinedText, fileNames, errors } = await extractMultipleFiles(files);
      if (combinedText) {
        setReadme((prev) => (prev.trim() ? `${prev.trim()}\n\n${combinedText}` : combinedText));
      }
      if (fileNames.length) {
        setSourceName((prev) => mergeSourceNames(prev, fileNames));
      }
      if (combinedText || fileNames.length) setReadmeDirty(true);
      const errorEntries = Object.entries(errors);
      if (errorEntries.length) {
        setError(errorEntries.map(([name, msg]) => `${name}: ${msg}`).join(' '));
      }
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleSaveReadme = async () => {
    setIsSavingReadme(true);
    setError(null);
    try {
      await lmsService.updateSubject(project.id, {
        project_context: readme.trim(),
        context_source_name: sourceName,
      });
      setReadmeDirty(false);
      onReload();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to save README.');
    } finally {
      setIsSavingReadme(false);
    }
  };

  const detailsDirty =
    name.trim() !== (project.name || '') || description.trim() !== (project.description || '');

  const handleSaveDetails = async () => {
    if (!name.trim()) return;
    setIsSavingDetails(true);
    setError(null);
    try {
      await lmsService.updateSubject(project.id, {
        name: name.trim(),
        description: description.trim(),
      });
      onReload();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to save project details.');
    } finally {
      setIsSavingDetails(false);
    }
  };

  // ── Module Planning ─────────────────────────────────────────────────────
  const runPlan = async () => {
    setIsPlanning(true);
    setError(null);
    setItemStatus({});
    try {
      await lmsService.planProjectModules(project.id);
      onReload();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to generate implementation modules.');
    } finally {
      setIsPlanning(false);
    }
  };

  const handleGenerateClick = () => {
    if (readmeDirty) {
      setError('Save your README changes before generating modules.');
      return;
    }
    if (plan.length > 0) {
      setConfirmReplan(true);
      return;
    }
    runPlan();
  };

  // ── Per-item generation ─────────────────────────────────────────────────
  const generateOne = async (flat: FlatItem): Promise<boolean> => {
    setItemStatus((prev) => ({ ...prev, [flat.key]: 'generating' }));
    try {
      if (flat.subIndex === null) {
        await lmsService.generateProjectModule(project.id, flat.moduleIndex);
      } else {
        await lmsService.generateProjectSublesson(project.id, flat.moduleIndex, flat.subIndex);
      }
      setItemStatus((prev) => ({ ...prev, [flat.key]: 'done' }));
      return true;
    } catch (err: unknown) {
      setItemStatus((prev) => ({ ...prev, [flat.key]: 'error' }));
      setError(err instanceof Error ? err.message : `Failed to generate "${flat.item.title}".`);
      return false;
    }
  };

  const handleGenerateOne = async (flat: FlatItem) => {
    setError(null);
    const ok = await generateOne(flat);
    if (ok) onReload();
  };

  // Generate every not-yet-generated module/sublesson in outline order (dependencies flow
  // module-to-module, so this runs sequentially rather than in parallel). Persists each
  // lesson as soon as it's done, keeps whatever succeeded, and marks failures without
  // stopping the rest -- the user can retry a single failed item afterward.
  const handleGenerateAll = async () => {
    // A module that's been broken down is represented by its sublessons, not itself.
    const targets = flatItems.filter(
      (f) => !f.item.lesson_id && !(f.depth === 0 && (f.item.sublessons || []).length > 0)
    );
    if (targets.length === 0) return;

    setIsGeneratingAll(true);
    setError(null);
    setProgress({ done: 0, total: targets.length });
    let completed = 0;
    for (const flat of targets) {
      const ok = await generateOne(flat);
      completed += 1;
      setProgress({ done: completed, total: targets.length });
      if (!ok) {
        // Keep going -- one failed step shouldn't block the rest of the roadmap.
        continue;
      }
    }
    setIsGeneratingAll(false);
    setProgress(null);
    onReload();
  };

  // ── Break Down ───────────────────────────────────────────────────────────
  const handleBreakDown = async (moduleIndex: number) => {
    setError(null);
    setItemStatus((prev) => ({ ...prev, [`m${moduleIndex}`]: 'generating' }));
    try {
      await lmsService.breakDownProjectModule(project.id, moduleIndex);
      onReload();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to break down this module.');
    } finally {
      setItemStatus((prev) => ({
        ...prev,
        [`m${moduleIndex}`]: plan[moduleIndex]?.lesson_id ? 'done' : 'idle',
      }));
    }
  };

  // ── Add step ─────────────────────────────────────────────────────────────
  const handleAddStep = async (
    target: InsertTarget,
    title: string,
    focus: string,
    context: string,
    generate: boolean
  ): Promise<boolean> => {
    setError(null);
    try {
      await lmsService.addProjectStep(project.id, {
        title,
        focus,
        context,
        module_index: target.moduleIndex,
        position: target.position,
      });
      setItemStatus({}); // indices shift on insert; drop index-keyed transient state
      if (generate) {
        // Positions are clamped server-side the same way, so this is the new step's index.
        const len =
          target.moduleIndex === null
            ? plan.length
            : (plan[target.moduleIndex]?.sublessons || []).length;
        const pos = Math.max(0, Math.min(target.position, len));
        try {
          if (target.moduleIndex === null) await lmsService.generateProjectModule(project.id, pos);
          else await lmsService.generateProjectSublesson(project.id, target.moduleIndex, pos);
        } catch (err: unknown) {
          setError(
            `Step added, but generation failed: ${err instanceof Error ? err.message : 'unknown error'}`
          );
        }
      }
      onReload();
      return true;
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to add step.');
      return false;
    }
  };

  const handleSuggest = (context: string, title: string) =>
    lmsService.suggestProjectPlacement(project.id, { context, title });

  // Where a "+" after this row can insert: modules go between modules, steps go between
  // the sublessons of the module they belong to.
  const gapTargetsAfter = (flat: FlatItem): InsertTarget[] => {
    const mod = plan[flat.moduleIndex];
    const subCount = (mod?.sublessons || []).length;
    const moduleAfter: InsertTarget = {
      label: 'Add module',
      moduleIndex: null,
      position: flat.moduleIndex + 1,
    };
    if (flat.depth === 0) {
      return subCount > 0
        ? [{ label: 'Add step', moduleIndex: flat.moduleIndex, position: 0 }]
        : [{ label: 'Add step', moduleIndex: flat.moduleIndex, position: 0 }, moduleAfter];
    }
    const j = flat.subIndex ?? 0;
    const targets: InsertTarget[] = [
      { label: 'Add step', moduleIndex: flat.moduleIndex, position: j + 1 },
    ];
    if (j === subCount - 1) targets.push(moduleAfter);
    return targets;
  };

  // ── Drag & drop reorder (modules among modules, sublessons within their module) ──
  const [dragKey, setDragKey] = useState<string | null>(null);
  const [overKey, setOverKey] = useState<string | null>(null);

  const canDropOn = (from: FlatItem | undefined, to: FlatItem) =>
    Boolean(from) &&
    from!.key !== to.key &&
    from!.depth === to.depth &&
    (from!.depth === 0 || from!.moduleIndex === to.moduleIndex);

  const handleDrop = async (to: FlatItem) => {
    const from = flatItems.find((f) => f.key === dragKey);
    setDragKey(null);
    setOverKey(null);
    if (!from || !canDropOn(from, to)) return;
    setError(null);
    try {
      await lmsService.reorderProjectPlan(project.id, {
        module_index: from.depth === 0 ? null : from.moduleIndex,
        from_index: from.depth === 0 ? from.moduleIndex : (from.subIndex ?? 0),
        to_index: to.depth === 0 ? to.moduleIndex : (to.subIndex ?? 0),
      });
      setItemStatus({});
      onReload();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to reorder.');
    }
  };

  const renderItemRow = (flat: FlatItem) => {
    const status = statusFor(flat);
    const href = flat.item.lesson_id ? lessonHref(flat.item.lesson_id) : null;
    const isBusy = status === 'generating' || isGeneratingAll || isPlanning;
    const canBreakDown =
      flat.depth === 0 && Boolean(flat.item.lesson_id) && (flat.item.sublessons || []).length === 0;

    return (
      <div
        key={flat.key}
        draggable={!isBusy}
        onDragStart={(e) => {
          e.dataTransfer.effectAllowed = 'move';
          setDragKey(flat.key);
        }}
        onDragEnd={() => {
          setDragKey(null);
          setOverKey(null);
        }}
        onDragOver={(e) => {
          if (
            canDropOn(
              flatItems.find((f) => f.key === dragKey),
              flat
            )
          ) {
            e.preventDefault();
            setOverKey(flat.key);
          }
        }}
        onDrop={(e) => {
          e.preventDefault();
          handleDrop(flat);
        }}
        className={`flex flex-col sm:flex-row sm:items-center gap-3 rounded-xl border p-4 transition-colors ${
          flat.depth === 1 ? 'ml-6 sm:ml-10 border-border/60 bg-muted/20' : 'border-border bg-card'
        } ${dragKey === flat.key ? 'opacity-40' : ''} ${overKey === flat.key ? 'ring-2 ring-primary/50' : ''}`}
      >
        <div className="flex items-center gap-3 flex-1 min-w-0">
          <span
            className="cursor-grab active:cursor-grabbing text-muted-foreground/60 hover:text-foreground flex-shrink-0"
            title="Drag to reorder"
          >
            <Icon name="Bars3Icon" size={16} />
          </span>
          <span className="font-mono text-xs font-bold px-2 py-1 rounded-md bg-muted text-muted-foreground border border-border flex-shrink-0">
            {flat.depth === 0
              ? String(flat.moduleIndex + 1).padStart(2, '0')
              : `${flat.moduleIndex + 1}.${(flat.subIndex ?? 0) + 1}`}
          </span>
          <div className="min-w-0">
            <div className="text-sm font-semibold text-foreground truncate">{flat.item.title}</div>
            {flat.item.focus && (
              <div className="text-xs text-muted-foreground line-clamp-1">{flat.item.focus}</div>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2.5 flex-shrink-0 flex-wrap">
          <StatusBadge status={status} />

          {href && (
            <Link
              href={href}
              className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-primary text-white text-xs font-medium hover:bg-primary/90 transition-colors"
            >
              <span>Open</span>
              <Icon name="ArrowRightIcon" size={12} />
            </Link>
          )}

          <button
            type="button"
            disabled={isBusy}
            onClick={() => handleGenerateOne(flat)}
            className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-border bg-card text-foreground text-xs font-medium hover:bg-muted disabled:opacity-50 transition-colors"
          >
            <Icon name="SparklesIcon" size={12} className="text-primary" />
            <span>{flat.item.lesson_id ? 'Regenerate' : 'Generate'}</span>
          </button>

          {canBreakDown && (
            <button
              type="button"
              disabled={isBusy}
              onClick={() => handleBreakDown(flat.moduleIndex)}
              title="Break this module down into smaller, sequential sublessons"
              className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-indigo-500/30 bg-indigo-500/5 text-indigo-500 text-xs font-medium hover:bg-indigo-500/10 disabled:opacity-50 transition-colors"
            >
              <Icon name="Squares2X2Icon" size={12} />
              <span>Break Down</span>
            </button>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-8">
      {error && (
        <div className="rounded-xl border border-destructive/20 bg-destructive/10 p-3.5 text-xs text-destructive flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Icon name="ExclamationTriangleIcon" size={14} />
            <span>{error}</span>
          </div>
          <button
            type="button"
            onClick={() => setError(null)}
            className="text-destructive/70 hover:text-destructive font-bold px-1"
          >
            ×
          </button>
        </div>
      )}

      {mode === 'edit' && (
        <>
          <section className="rounded-2xl border border-border bg-card p-5 space-y-3">
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-xs font-bold uppercase tracking-wider text-foreground flex items-center gap-2">
                <Icon name="PencilSquareIcon" size={14} />
                <span>Project Details</span>
              </h3>
              <button
                type="button"
                onClick={onDone}
                className="text-xs font-medium text-muted-foreground hover:text-foreground"
              >
                Back to modules
              </button>
            </div>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={120}
              placeholder="Project name"
              className="w-full px-3.5 py-2.5 rounded-lg border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
            />
            <textarea
              rows={3}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              maxLength={1000}
              placeholder="Short description"
              className="w-full px-3.5 py-2.5 rounded-lg border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/40 resize-y"
            />
            <div className="flex justify-end">
              <button
                type="button"
                disabled={!detailsDirty || !name.trim() || isSavingDetails}
                onClick={handleSaveDetails}
                className="px-4 py-2 rounded-lg bg-foreground text-background text-xs font-semibold disabled:opacity-40 disabled:cursor-not-allowed hover:opacity-90"
              >
                {isSavingDetails ? 'Saving...' : 'Save details'}
              </button>
            </div>
          </section>

          {/* README / Context editor */}
          <section className="rounded-2xl border border-indigo-500/25 bg-indigo-500/5 p-5 space-y-3">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <h3 className="text-xs font-bold uppercase tracking-wider text-indigo-500 flex items-center gap-2">
                <Icon name="DocumentTextIcon" size={14} />
                <span>README / Project Context</span>
              </h3>
              <div className="flex items-center gap-2">
                <span className="text-[11px] text-muted-foreground">
                  {readme.length.toLocaleString()} chars
                </span>
                {readmeDirty && (
                  <span className="text-[11px] font-medium text-amber-500 bg-amber-500/10 px-2 py-0.5 rounded-full">
                    Unsaved changes
                  </span>
                )}
              </div>
            </div>

            {
              <>
                <textarea
                  rows={8}
                  value={readme}
                  onChange={(e) => {
                    setReadme(e.target.value);
                    setReadmeDirty(true);
                  }}
                  placeholder="Describe the project: goals, tech stack, scope, constraints..."
                  className="w-full px-3.5 py-2.5 rounded-lg border border-indigo-500/30 bg-background text-foreground text-sm font-mono focus:outline-none focus:ring-2 focus:ring-indigo-500/40 resize-y placeholder:text-muted-foreground/60"
                />

                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex flex-wrap items-center gap-2.5">
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept=".pdf,.txt,.md,.docx"
                      multiple
                      onChange={handleFileUpload}
                      className="hidden"
                      id="project-readme-file-input"
                    />
                    <button
                      type="button"
                      disabled={isUploading}
                      onClick={() => fileInputRef.current?.click()}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border bg-card text-foreground font-medium text-xs hover:bg-muted disabled:opacity-50 transition-colors shadow-sm"
                    >
                      {isUploading ? (
                        <>
                          <div className="h-3 w-3 animate-spin rounded-full border-2 border-primary border-t-transparent" />
                          <span>Reading Files...</span>
                        </>
                      ) : (
                        <>
                          <Icon name="ArrowUpTrayIcon" size={13} className="text-indigo-500" />
                          <span>Upload Documents</span>
                        </>
                      )}
                    </button>
                    {sourceName && (
                      <span className="text-[11px] text-muted-foreground">
                        From <span className="font-semibold text-foreground">{sourceName}</span>
                      </span>
                    )}
                  </div>

                  <button
                    type="button"
                    disabled={!readmeDirty || isSavingReadme}
                    onClick={handleSaveReadme}
                    className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-foreground text-background text-xs font-semibold disabled:opacity-40 disabled:cursor-not-allowed hover:opacity-90 transition-opacity"
                  >
                    {isSavingReadme ? 'Saving...' : 'Save README'}
                  </button>
                </div>
              </>
            }

            {!readmeDirty && (
              <>
                <ContextSummaryPanel
                  subjectId={project.id}
                  rawTextLength={readme.length}
                  contextSummary={project.context_summary}
                  fieldLabel="README / project context"
                  onUpdated={() => onReload()}
                />
                <RagIndexPanel subjectId={project.id} fieldLabel="README / project context" />
              </>
            )}
          </section>
        </>
      )}

      {mode === 'modules' && (
        <>
          {plan.length > 0 && (
            <section className="space-y-1.5">
              <h3 className="text-xs font-bold uppercase tracking-wider text-primary flex items-center gap-2">
                <Icon name="SparklesIcon" size={14} />
                <span>Quick add & generate</span>
              </h3>
              <p className="text-xs text-muted-foreground">
                Paste a finding, note or doc. The AI recommends where it fits in the outline, and
                clicking a position adds and generates it.
              </p>
              <InsertGap
                key={quickBoxKey}
                targets={[]}
                autoOpen={{ label: 'New step', moduleIndex: null, position: plan.length }}
                onClose={() => setQuickBoxKey((k) => k + 1)}
                disabled={false}
                indent={false}
                onAdd={handleAddStep}
                onSuggest={handleSuggest}
              />
            </section>
          )}

          {/* Generate Implementation Modules */}
          <section className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h3 className="font-heading text-lg font-bold text-foreground">
                Implementation Modules ({plan.length})
              </h3>
              <p className="text-xs text-muted-foreground mt-0.5">
                {generatedCount} of {flatItems.length || 0} lessons generated
              </p>
            </div>
            <div className="flex items-center gap-2.5 flex-wrap">
              {plan.length > 0 && (
                <button
                  type="button"
                  disabled={
                    isGeneratingAll ||
                    isPlanning ||
                    flatItems.every(
                      (f) =>
                        f.item.lesson_id || (f.depth === 0 && (f.item.sublessons || []).length > 0)
                    )
                  }
                  onClick={handleGenerateAll}
                  className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl border border-border bg-card text-foreground font-medium text-xs hover:bg-muted disabled:opacity-50 transition-colors shadow-sm"
                >
                  <Icon name="BoltIcon" size={14} className="text-primary" />
                  <span>Generate All Remaining</span>
                </button>
              )}
              <button
                type="button"
                disabled={isPlanning || !readme.trim() || readmeDirty}
                onClick={handleGenerateClick}
                title={readmeDirty ? 'Save your README changes first' : undefined}
                className="inline-flex items-center gap-1.5 px-5 py-2.5 rounded-xl bg-indigo-600 text-white font-medium text-xs shadow-md shadow-indigo-500/25 hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
              >
                {isPlanning ? (
                  <>
                    <div className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white border-t-transparent" />
                    <span>Planning...</span>
                  </>
                ) : (
                  <>
                    <Icon name="SparklesIcon" size={14} />
                    <span>
                      {plan.length > 0
                        ? 'Regenerate Module Outline'
                        : 'Generate Implementation Modules'}
                    </span>
                  </>
                )}
              </button>
            </div>
          </section>

          {isGeneratingAll && progress && (
            <div className="rounded-xl border border-primary/20 bg-primary/5 p-3.5 flex items-center gap-3">
              <div className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-primary border-t-transparent flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="text-xs font-semibold text-foreground">
                  Generating implementation roadmap... ({progress.done} / {progress.total})
                </div>
                <div className="mt-1.5 w-full bg-muted/60 h-1.5 rounded-full overflow-hidden">
                  <div
                    className="bg-primary h-full transition-all duration-500 rounded-full"
                    style={{ width: `${(progress.done / progress.total) * 100}%` }}
                  />
                </div>
              </div>
            </div>
          )}

          {plan.length === 0 ? (
            <div className="rounded-xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
              {readme.trim()
                ? 'No implementation modules yet -- click "Generate Implementation Modules" above to have the AI plan them from your README.'
                : 'Add a README / project context above, then generate implementation modules.'}
            </div>
          ) : (
            <div className="space-y-1">
              <InsertGap
                targets={[{ label: 'Add module', moduleIndex: null, position: 0 }]}
                disabled={isGeneratingAll || isPlanning}
                indent={false}
                onAdd={handleAddStep}
                onSuggest={handleSuggest}
              />
              {flatItems.map((flat) => (
                <React.Fragment key={flat.key}>
                  {renderItemRow(flat)}
                  <InsertGap
                    targets={gapTargetsAfter(flat)}
                    disabled={isGeneratingAll || isPlanning}
                    indent={flat.depth === 1}
                    onAdd={handleAddStep}
                    onSuggest={handleSuggest}
                  />
                </React.Fragment>
              ))}
            </div>
          )}
        </>
      )}

      <ConfirmDialog
        isOpen={confirmReplan}
        title="Regenerate Module Outline"
        message="This replaces the current module outline and deletes every module/sublesson lesson already generated from it. This can't be undone."
        confirmLabel="Regenerate Outline"
        isDestructive
        onConfirm={() => {
          setConfirmReplan(false);
          runPlan();
        }}
        onCancel={() => setConfirmReplan(false)}
      />
    </div>
  );
}
