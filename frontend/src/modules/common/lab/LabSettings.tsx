'use client';

import { useEffect, useId, useState } from 'react';
import Icon from '@/components/ui/AppIcon';
import Modal from '@/components/ui/Modal';
import { LAB_WIDE_SECTION, type LabName } from '@/lib/services/labSectionsService';
import { composeInstructions, useLabSettings } from '@/modules/common/lab/useLabSettings';

/** One row of the dialog: a section whose generation the learner can shape. */
export interface SettingsSection {
  id: string;
  label: string;
  subtitle?: string;
  /** The section's built-in instructions: what the editable prompt starts as. */
  defaultGuidance: string;
  /** A line shown above the fields, for sections that behave differently (the quiz). */
  note?: string;
}

/** Builds the dialog's rows from a lab's section list and its built-in instructions. */
export function settingsSections(
  defs: readonly { id: string; label: string; subtitle?: string; guidance?: string }[],
  defaults: Record<string, string>,
  opts: { skip?: string[]; notes?: Record<string, string> } = {}
): SettingsSection[] {
  return defs
    .filter((d) => !opts.skip?.includes(d.id))
    .map((d) => ({
      id: d.id,
      label: d.label,
      subtitle: d.subtitle,
      defaultGuidance: d.guidance ?? defaults[d.id] ?? '',
      note: opts.notes?.[d.id],
    }));
}

const LIMITS = { prompt: 4000, addon: 2000, context: 2000 };

const fieldClass =
  'w-full resize-y rounded-lg border border-border bg-card px-3 py-2 text-[13px] leading-relaxed text-foreground ' +
  'placeholder:mix-text-muted-foreground/60 focus:outline-none focus:border-primary disabled:opacity-60';
const smallButton =
  'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed';

function Field({
  id,
  label,
  help,
  children,
  action,
}: {
  id: string;
  label: string;
  help: string;
  children: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <div>
      <div className="flex items-baseline justify-between gap-3 mb-1">
        <label
          htmlFor={id}
          className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider"
        >
          {label}
        </label>
        {action}
      </div>
      {children}
      <p className="mt-1 text-[11px] mix-text-muted-foreground/80">{help}</p>
    </div>
  );
}

function SectionEditor({
  lab,
  row,
  isLabWide,
}: {
  lab: LabName;
  row: SettingsSection;
  isLabWide: boolean;
}) {
  const settings = useLabSettings(lab);
  const saved = settings.get(row.id);
  const uid = useId();

  const [prompt, setPrompt] = useState(saved.prompt || row.defaultGuidance);
  const [addon, setAddon] = useState(saved.addon);
  const [context, setContext] = useState(saved.context);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [justSaved, setJustSaved] = useState(false);

  // Follow the store when it changes underneath us (the saved values arrive after the dialog opened).
  useEffect(() => {
    setPrompt(saved.prompt || row.defaultGuidance);
    setAddon(saved.addon);
    setContext(saved.context);
  }, [saved.prompt, saved.addon, saved.context, row.defaultGuidance]);

  // Text identical to the built-in prompt is "not customised": nothing is stored for it.
  const promptToSave =
    isLabWide || prompt.trim() === row.defaultGuidance.trim() ? '' : prompt.trim();
  const draft = { prompt: promptToSave, addon: addon.trim(), context: context.trim() };
  const dirty =
    draft.prompt !== saved.prompt || draft.addon !== saved.addon || draft.context !== saved.context;
  const hasSaved = !!(saved.prompt || saved.addon || saved.context);
  const preview = composeInstructions(row.defaultGuidance, draft, settings.labWide);

  async function persist(values: { prompt: string; addon: string; context: string }) {
    setBusy(true);
    setError(null);
    setJustSaved(false);
    try {
      await settings.save(row.id, values);
      setJustSaved(true);
      setTimeout(() => setJustSaved(false), 2500);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save these settings.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="px-4 pb-4 pt-1 space-y-3">
      {row.note && <p className="text-[12px] text-muted-foreground">{row.note}</p>}

      {!isLabWide && (
        <Field
          id={`${uid}-prompt`}
          label="Prompt"
          help="The instructions the AI follows for this section. Edit them freely; sections you change are written by the AI when you press Generate."
          action={
            prompt.trim() !== row.defaultGuidance.trim() && (
              <button
                type="button"
                onClick={() => setPrompt(row.defaultGuidance)}
                className="text-[11px] font-semibold text-primary hover:underline"
              >
                Restore default prompt
              </button>
            )
          }
        >
          <textarea
            id={`${uid}-prompt`}
            rows={7}
            maxLength={LIMITS.prompt}
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            disabled={busy}
            className={fieldClass}
          />
        </Field>
      )}

      <Field
        id={`${uid}-addon`}
        label={isLabWide ? 'Add-on for every section' : 'Add-on'}
        help={
          isLabWide
            ? 'Extra instructions added to every section of this lab.'
            : 'Extra instructions added after the prompt, without replacing it.'
        }
      >
        <textarea
          id={`${uid}-addon`}
          rows={3}
          maxLength={LIMITS.addon}
          value={addon}
          onChange={(e) => setAddon(e.target.value)}
          disabled={busy}
          placeholder="e.g. Always include a Java version of the code. Keep each explanation under 300 words."
          className={fieldClass}
        />
      </Field>

      <Field
        id={`${uid}-context`}
        label={isLabWide ? 'Context for every section' : 'Context'}
        help="What the AI should know about you when it writes this. It stays in force for every generation."
      >
        <textarea
          id={`${uid}-context`}
          rows={3}
          maxLength={LIMITS.context}
          value={context}
          onChange={(e) => setContext(e.target.value)}
          disabled={busy}
          placeholder="e.g. Backend engineer with a FAANG loop in three weeks. I know BFS/DFS but not dynamic programming."
          className={fieldClass}
        />
      </Field>

      <details className="rounded-lg border border-border mix-bg-muted/30">
        <summary className="cursor-pointer select-none px-3 py-2 text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
          What the AI receives
        </summary>
        <div className="px-3 pb-3 space-y-2 text-[12px] text-foreground">
          {isLabWide ? (
            <p className="text-muted-foreground">
              The add-on and context above are combined with each section&apos;s own prompt, add-on
              and context.
            </p>
          ) : (
            <>
              <div>
                <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-1">
                  Instructions
                </p>
                <pre className="whitespace-pre-wrap font-body leading-relaxed">
                  {preview.guidance || '(none)'}
                </pre>
              </div>
              {preview.standingContext && (
                <div>
                  <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-1">
                    Context about you
                  </p>
                  <pre className="whitespace-pre-wrap font-body leading-relaxed">
                    {preview.standingContext}
                  </pre>
                </div>
              )}
            </>
          )}
        </div>
      </details>

      {error && (
        <p role="alert" className="text-[12px] text-error">
          {error}
        </p>
      )}

      <div className="flex flex-wrap items-center justify-end gap-2">
        {justSaved && (
          <span
            role="status"
            className="mr-auto text-[12px] font-medium text-emerald-600 dark:text-emerald-400"
          >
            Saved
          </span>
        )}
        {(hasSaved || dirty) && (
          <button
            type="button"
            disabled={busy}
            onClick={() => {
              setPrompt(row.defaultGuidance);
              setAddon('');
              setContext('');
              persist({ prompt: '', addon: '', context: '' });
            }}
            className={`${smallButton} border border-border text-foreground hover:bg-muted`}
          >
            Reset to defaults
          </button>
        )}
        <button
          type="button"
          disabled={busy || !dirty}
          onClick={() => persist(draft)}
          className={`${smallButton} border mix-border-primary/25 mix-bg-primary/10 text-primary hover:mix-bg-primary/20`}
        >
          {busy ? 'Saving…' : 'Save'}
        </button>
      </div>
    </div>
  );
}

/** The gear for a lab's sidebar: opens the dialog where the learner shapes how each section is written. */
export function LabSettingsButton({
  lab,
  labName,
  sections,
}: {
  lab: LabName;
  labName: string;
  sections: SettingsSection[];
}) {
  const [open, setOpen] = useState(false);
  const [openId, setOpenId] = useState<string>(LAB_WIDE_SECTION);
  const settings = useLabSettings(lab);
  const titleId = useId();
  const [confirmReset, setConfirmReset] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [resetError, setResetError] = useState<string | null>(null);

  async function resetAll() {
    setResetting(true);
    setResetError(null);
    try {
      await settings.resetAll();
      setConfirmReset(false);
    } catch (e) {
      setResetError(e instanceof Error ? e.message : 'Could not reset the settings.');
    } finally {
      setResetting(false);
    }
  }

  const rows: SettingsSection[] = [
    {
      id: LAB_WIDE_SECTION,
      label: 'Whole lab',
      subtitle: 'An add-on and context for every section',
      defaultGuidance: '',
    },
    ...sections,
  ];

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        title="Lab settings"
        aria-label="Lab settings"
        aria-haspopup="dialog"
        className="relative flex-shrink-0 p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-all"
      >
        <Icon name="Cog6ToothIcon" size={14} />
        {settings.hasAny && (
          <span className="absolute top-0.5 right-0.5 w-1.5 h-1.5 rounded-full bg-primary" />
        )}
      </button>

      <Modal
        isOpen={open}
        onClose={() => setOpen(false)}
        labelledBy={titleId}
        closeOnBackdrop={false}
        className="w-full max-w-[780px] max-h-[90vh] flex flex-col rounded-2xl bg-card border border-border shadow-2xl overflow-hidden"
      >
        <div className="flex items-start gap-3 px-5 py-4 border-b border-border flex-shrink-0">
          <div className="min-w-0 flex-1">
            <h2 id={titleId} className="text-base font-bold text-foreground">
              Lab settings · {labName}
            </h2>
            <p className="mt-1 text-[12px] text-muted-foreground leading-relaxed">
              Shape how each section is written: edit its prompt, add to it, or tell the AI about
              yourself. A section you customise is written by the AI when you press Generate (this
              needs an AI key in Config); sections you leave alone keep their built-in text. Changes
              apply to the next generation and don&apos;t rewrite pages you&apos;ve already
              generated.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setOpen(false)}
            aria-label="Close lab settings"
            className="flex-shrink-0 p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
          >
            <Icon name="XMarkIcon" size={16} />
          </button>
        </div>

        <div className="overflow-y-auto">
          {rows.map((row) => {
            const wide = row.id === LAB_WIDE_SECTION;
            const expanded = openId === row.id;
            const custom = wide
              ? !!(settings.labWide.addon || settings.labWide.context)
              : settings.isCustomised(row.id);
            return (
              <section
                key={row.id}
                aria-label={row.label}
                className="border-b border-border last:border-b-0"
              >
                <button
                  type="button"
                  onClick={() => setOpenId(expanded ? '' : row.id)}
                  aria-expanded={expanded}
                  className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-muted transition-colors"
                >
                  <Icon
                    name={expanded ? 'ChevronDownIcon' : 'ChevronRightIcon'}
                    size={13}
                    className="text-muted-foreground flex-shrink-0"
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block text-[13px] font-semibold text-foreground truncate">
                      {row.label}
                    </span>
                    {row.subtitle && (
                      <span className="block text-[11px] text-muted-foreground truncate">
                        {row.subtitle}
                      </span>
                    )}
                  </span>
                  {custom && (
                    <span className="flex-shrink-0 text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-md border bg-violet-500/10 text-violet-600 dark:text-violet-400 border-violet-500/30">
                      {wide ? 'Active' : 'Custom'}
                    </span>
                  )}
                </button>
                {expanded && <SectionEditor lab={lab} row={row} isLabWide={wide} />}
              </section>
            );
          })}
        </div>

        {settings.hasAny && (
          <div className="flex flex-wrap items-center justify-end gap-3 px-5 py-3 border-t border-border flex-shrink-0">
            {resetError && (
              <p role="alert" className="mr-auto text-[12px] text-error">
                {resetError}
              </p>
            )}
            {confirmReset ? (
              <>
                <span className="text-[12px] text-foreground">
                  Remove every customisation in this lab?
                </span>
                <button
                  type="button"
                  disabled={resetting}
                  onClick={resetAll}
                  className={`${smallButton} border border-error text-error hover:mix-bg-error/10`}
                >
                  {resetting ? 'Resetting…' : 'Yes, reset all'}
                </button>
                <button
                  type="button"
                  disabled={resetting}
                  onClick={() => setConfirmReset(false)}
                  className={`${smallButton} border border-border text-foreground hover:bg-muted`}
                >
                  Cancel
                </button>
              </>
            ) : (
              <button
                type="button"
                onClick={() => setConfirmReset(true)}
                className={`${smallButton} border border-border text-foreground hover:bg-muted`}
              >
                Reset all settings
              </button>
            )}
          </div>
        )}
      </Modal>
    </>
  );
}
