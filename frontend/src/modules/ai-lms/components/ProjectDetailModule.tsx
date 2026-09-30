'use client';

import React, { useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import Icon from '@/components/ui/AppIcon';
import { lmsService } from '../services/lmsService';
import { extractMultipleFiles, mergeSourceNames } from '../utils/contextFiles';
import type { LmsClass, LmsLesson, LmsProjectPlanItem, LmsSubject } from '../types';
import ConfirmDialog from './ConfirmDialog';
import ContextSummaryPanel from './ContextSummaryPanel';
import RagIndexPanel from './RagIndexPanel';

interface ProjectDetailModuleProps {
  project: LmsSubject;
  lmsClass: LmsClass;
  onReload: () => void;
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
    generating: { icon: 'ArrowPathIcon', className: 'text-primary animate-spin', label: 'Generating...' },
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
}: {
  targets: InsertTarget[];
  disabled: boolean;
  indent: boolean;
  onAdd: (target: InsertTarget, title: string, focus: string) => Promise<boolean>;
}) {
  const [active, setActive] = useState<InsertTarget | null>(null);
  const [title, setTitle] = useState('');
  const [focus, setFocus] = useState('');
  const [saving, setSaving] = useState(false);

  const close = () => {
    setActive(null);
    setTitle('');
    setFocus('');
  };

  if (active) {
    return (
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          if (!title.trim()) return;
          setSaving(true);
          const ok = await onAdd(active, title.trim(), focus.trim());
          setSaving(false);
          if (ok) close();
        }}
        className={`rounded-xl border border-dashed border-primary/40 bg-primary/5 p-3 space-y-2 ${indent ? 'ml-6 sm:ml-10' : ''}`}
      >
        <div className="text-[11px] font-semibold text-primary">{active.label}</div>
        <input
          autoFocus
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Step title (e.g. Fix auth token refresh bug)"
          maxLength={200}
          className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
        />
        <input
          value={focus}
          onChange={(e) => setFocus(e.target.value)}
          placeholder="Focus / finding (optional) -- guides lesson generation"
          className="w-full px-3 py-2 rounded-lg border border-border bg-background text-xs focus:outline-none focus:ring-2 focus:ring-primary/40"
        />
        <div className="flex justify-end gap-2">
          <button type="button" onClick={close} className="px-3 py-1.5 rounded-lg text-xs text-muted-foreground hover:bg-muted">
            Cancel
          </button>
          <button
            type="submit"
            disabled={!title.trim() || saving}
            className="px-3 py-1.5 rounded-lg bg-primary text-white text-xs font-medium disabled:opacity-50"
          >
            {saving ? 'Adding...' : 'Add step'}
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

export default function ProjectDetailModule({ project, lmsClass, onReload }: ProjectDetailModuleProps) {
  const [readme, setReadme] = useState(project.project_context || '');
  const [sourceName, setSourceName] = useState(project.context_source_name || '');
  const [readmeDirty, setReadmeDirty] = useState(false);
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
    const targets = flatItems.filter((f) => !f.item.lesson_id && !(f.depth === 0 && (f.item.sublessons || []).length > 0));
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
      setItemStatus((prev) => ({ ...prev, [`m${moduleIndex}`]: plan[moduleIndex]?.lesson_id ? 'done' : 'idle' }));
    }
  };

  // ── Add step ─────────────────────────────────────────────────────────────
  const handleAddStep = async (target: InsertTarget, title: string, focus: string): Promise<boolean> => {
    setError(null);
    try {
      await lmsService.addProjectStep(project.id, {
        title,
        focus,
        module_index: target.moduleIndex,
        position: target.position,
      });
      setItemStatus({}); // indices shift on insert; drop index-keyed transient state
      onReload();
      return true;
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to add step.');
      return false;
    }
  };

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
        : [
            { label: 'Add step', moduleIndex: flat.moduleIndex, position: 0 },
            moduleAfter,
          ];
    }
    const j = flat.subIndex ?? 0;
    const targets: InsertTarget[] = [{ label: 'Add step', moduleIndex: flat.moduleIndex, position: j + 1 }];
    if (j === subCount - 1) targets.push(moduleAfter);
    return targets;
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
        className={`flex flex-col sm:flex-row sm:items-center gap-3 rounded-xl border p-4 transition-colors ${
          flat.depth === 1 ? 'ml-6 sm:ml-10 border-border/60 bg-muted/20' : 'border-border bg-card'
        }`}
      >
        <div className="flex items-center gap-3 flex-1 min-w-0">
          <span className="font-mono text-xs font-bold px-2 py-1 rounded-md bg-muted text-muted-foreground border border-border flex-shrink-0">
            {flat.depth === 0 ? String(flat.moduleIndex + 1).padStart(2, '0') : `${flat.moduleIndex + 1}.${(flat.subIndex ?? 0) + 1}`}
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
              disabled={isGeneratingAll || isPlanning || flatItems.every((f) => f.item.lesson_id || (f.depth === 0 && (f.item.sublessons || []).length > 0))}
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
                <span>{plan.length > 0 ? 'Regenerate Module Outline' : 'Generate Implementation Modules'}</span>
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
          />
          {flatItems.map((flat) => (
            <React.Fragment key={flat.key}>
              {renderItemRow(flat)}
              <InsertGap
                targets={gapTargetsAfter(flat)}
                disabled={isGeneratingAll || isPlanning}
                indent={flat.depth === 1}
                onAdd={handleAddStep}
              />
            </React.Fragment>
          ))}
        </div>
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
