'use client';

import React, { useState, useEffect, useCallback, useId, useRef } from 'react';
import Link from 'next/link';
import Icon from '@/components/ui/AppIcon';
import AutoSaveStatus from '@/components/ui/AutoSaveStatus';
import { useAutoSave, type AutoSaveState } from '@/lib/ui/useAutoSave';
import { isLoggedIn } from '@/lib/auth/tokenStore';
import {
  fetchLabSettings,
  saveLabSettings,
  resetLabSettings,
  LAB_WIDE_SECTION,
  type LabName,
  type SectionSettings,
} from '@/lib/services/labSectionsService';
import { LABS_CONFIG, getSectionDefsForLab, type SectionDef } from './labSectionDefaults';
import SectionPromptEditor from './SectionPromptEditor';
import SectionPromptModal from './SectionPromptModal';
import { Field, presetChip, settingsTextarea } from './settingsUi';
import { isTopicSettingsId } from './useLabSettings';

interface LabSettingsManagerProps {
  initialLab?: LabName;
  /** If provided, disables the lab switcher and restricts management to this lab */
  fixedLab?: LabName;
  /** Current page topic info if opened from within an active lab */
  currentTopic?: { name: string; brief?: string; subtopicName?: string };
  onSectionUpdated?: (sectionId: string) => void;
  /** Optional callback to close modal if opened inside a popup */
  onClose?: () => void;
  /**
   * Set by a page with its own save control (Settings): the lab-wide fields report their save state there, and its
   * Save button can flush them, instead of this component showing its own status line.
   */
  onSaveStateChange?: (report: LabSaveReport) => void;
  /**
   * Set by a page that gives every section its own address (lab management): a section row becomes a link to `hrefFor(id)`, and
   * the section named by `activeId` is edited on the page, in place of the list. Without it a section opens in a dialog.
   */
  section?: {
    activeId: string | null;
    hrefFor: (id: string) => string;
    /** The list (and the whole lab's settings). */
    backHref: string;
  };
}

export interface LabSaveReport {
  state: AutoSaveState;
  error: string | null;
  flush: () => Promise<boolean>;
  retry: () => void;
}

export default function LabSettingsManager({
  initialLab = 'dsa',
  fixedLab,
  currentTopic,
  onSectionUpdated,
  onClose,
  onSaveStateChange,
  section,
}: LabSettingsManagerProps) {
  const wideId = useId();
  const sectionsId = useId();
  const [selectedLab, setSelectedLab] = useState<LabName>(fixedLab || initialLab);
  const [settings, setSettings] = useState<Record<string, SectionSettings>>({});
  const [loading, setLoading] = useState<boolean>(true);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedSectionForModal, setSelectedSectionForModal] = useState<SectionDef | null>(null);

  // Lab-wide edit state
  const [labWideAddon, setLabWideAddon] = useState<string>('');
  const [labWideContext, setLabWideContext] = useState<string>('');
  const [toast, setToast] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  const labMeta = LABS_CONFIG[selectedLab];
  const sectionDefs = getSectionDefsForLab(selectedLab);
  const selectedLabRef = useRef(selectedLab);
  selectedLabRef.current = selectedLab;

  /** Keeps the local copy in step with a save, without reloading (a reload would reset fields being typed in). */
  const applySaved = useCallback((lab: LabName, sectionId: string, values: SectionSettings) => {
    if (lab !== selectedLabRef.current) return;
    setSettings((prev) => {
      const next = { ...prev };
      if (values.prompt.trim() || values.addon.trim() || values.context.trim())
        next[sectionId] = values;
      else delete next[sectionId];
      return next;
    });
  }, []);

  // ── Lab-wide add-on / context: saved automatically once typing pauses (no Save button) ──
  const labWideSave = useAutoSave<{ lab: LabName; addon: string; context: string }>(async (v) => {
    if (!isLoggedIn()) throw new Error('sign in to save lab prompts');
    const saved = await saveLabSettings(v.lab, LAB_WIDE_SECTION, {
      prompt: '',
      addon: v.addon.trim(),
      context: v.context.trim(),
    });
    applySaved(v.lab, LAB_WIDE_SECTION, saved);
    if (onSectionUpdated) onSectionUpdated(LAB_WIDE_SECTION);
  }, 900);
  const flushLabWide = labWideSave.flush;

  useEffect(() => {
    onSaveStateChange?.({
      state: labWideSave.state,
      error: labWideSave.error,
      flush: labWideSave.flush,
      retry: labWideSave.retry,
    });
    // The callbacks are stable; only a new state needs reporting.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [labWideSave.state, labWideSave.error]);

  const editLabWide = (patch: { addon?: string; context?: string }) => {
    const addon = patch.addon ?? labWideAddon;
    const context = patch.context ?? labWideContext;
    setLabWideAddon(addon);
    setLabWideContext(context);
    labWideSave.schedule({ lab: selectedLab, addon, context });
  };

  const loadSettings = useCallback(
    async (lab: LabName) => {
      // Never let a reload overwrite an edit that is still waiting to be saved.
      await flushLabWide();
      setLoading(true);
      try {
        const data = await fetchLabSettings(lab);
        setSettings(data);
        const wide = data[LAB_WIDE_SECTION];
        setLabWideAddon(wide?.addon || '');
        setLabWideContext(wide?.context || '');
      } catch (err) {
        console.error('Failed to load lab settings:', err);
      } finally {
        setLoading(false);
      }
    },
    [flushLabWide]
  );

  useEffect(() => {
    loadSettings(selectedLab);
  }, [selectedLab, loadSettings]);

  const showToast = (type: 'success' | 'error', message: string) => {
    setToast({ type, message });
    setTimeout(() => setToast(null), 4000);
  };

  const handleSaveSection = async (
    sectionId: string,
    vals: { prompt: string; addon: string; context: string }
  ) => {
    // Called by the section dialog's auto-save, so no toast per save (the dialog shows its own status).
    if (!isLoggedIn()) throw new Error('sign in to save lab prompts');
    const saved = await saveLabSettings(selectedLab, sectionId, vals);
    applySaved(selectedLab, sectionId, saved);
    if (onSectionUpdated) onSectionUpdated(sectionId);
  };

  const handleResetEntireLab = async () => {
    if (
      !window.confirm(
        `Are you sure you want to reset all custom prompts and settings for ${labMeta.name}? This cannot be undone.`
      )
    ) {
      return;
    }
    try {
      await flushLabWide();
      await resetLabSettings(selectedLab, 'all');
      await loadSettings(selectedLab);
      setLabWideAddon('');
      setLabWideContext('');
      showToast('success', `All sections for ${labMeta.shortName} reset to defaults.`);
      if (onSectionUpdated) onSectionUpdated('all');
    } catch (err) {
      showToast('error', 'Failed to reset lab settings');
    }
  };

  const filteredSections = sectionDefs.filter((s) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return (
      s.label.toLowerCase().includes(q) ||
      s.id.toLowerCase().includes(q) ||
      s.subtitle.toLowerCase().includes(q)
    );
  });

  // A topic's own context rides in the same settings (see topicSettingsId) but is not a customised section.
  const customizedCount = Object.keys(settings).filter(
    (k) => k !== LAB_WIDE_SECTION && !isTopicSettingsId(k)
  ).length;
  const activeSection = section?.activeId
    ? (sectionDefs.find((d) => d.id === section.activeId) ?? null)
    : null;

  return (
    <div className="space-y-[2rem]">
      {toast && (
        <p
          role={toast.type === 'error' ? 'alert' : 'status'}
          className={`text-[13px] ${toast.type === 'error' ? 'text-error' : 'text-muted-foreground'}`}
        >
          {toast.message}
        </p>
      )}

      {/* The lab picker, only where the lab is not already fixed (the Settings page) */}
      {!fixedLab && (
        <div role="group" aria-label="Lab" className="flex flex-wrap gap-2">
          {(
            [
              'dsa',
              'system_design',
              'cv',
              'communication',
              'finance',
              'python',
              'genai',
            ] as LabName[]
          ).map((labKey) => {
            const on = selectedLab === labKey;
            return (
              <button
                key={labKey}
                type="button"
                aria-pressed={on}
                title={LABS_CONFIG[labKey].description}
                onClick={() => {
                  void flushLabWide();
                  setSelectedLab(labKey);
                }}
                className={presetChip(on)}
              >
                {on && <Icon name="CheckIcon" size={12} />}
                {LABS_CONFIG[labKey].shortName}
              </button>
            );
          })}
        </div>
      )}

      {section && activeSection ? (
        /* One section, on its own page */
        <div className="space-y-[1.5rem]">
          <div>
            <Link
              href={section.backHref}
              className="todo-focus -ml-2.5 inline-flex min-h-[2.5rem] items-center gap-1.5 rounded-lg px-2.5 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground sm:min-h-[2rem]"
            >
              <Icon name="ArrowLeftIcon" size={16} />
              Sections and prompts
            </Link>
            <h2 className="mt-2 font-heading text-[1.25rem] font-semibold leading-tight tracking-[-0.018em] text-foreground">
              {activeSection.label}
            </h2>
            {activeSection.subtitle && (
              <p className="mt-1 text-sm text-muted-foreground">{activeSection.subtitle}</p>
            )}
          </div>
          {/* The editor starts from the saved settings, so it waits for them: mounted early it would show (and save) empty fields */}
          {loading ? (
            <p className="py-[2rem] text-center text-sm text-muted-foreground">Loading…</p>
          ) : (
            <SectionPromptEditor
              key={activeSection.id}
              lab={selectedLab}
              section={activeSection}
              currentSettings={settings[activeSection.id]}
              labWideSettings={settings[LAB_WIDE_SECTION]}
              currentTopic={currentTopic}
              variant="page"
              wholeLabHref={section.backHref}
              onSave={(vals) => handleSaveSection(activeSection.id, vals)}
            />
          )}
        </div>
      ) : (
        <>
          {/* ── The whole lab ── */}
          <section
            aria-labelledby={wideId}
            className="lab-edge rounded-2xl border bg-card p-[1.25rem] sm:p-[1.5rem]"
          >
            <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-1">
              <div className="min-w-0">
                <h2 id={wideId} className="text-[15px] font-semibold text-foreground">
                  Whole lab
                </h2>
                <p className="mt-0.5 text-sm text-muted-foreground">
                  Applies to every section of {labMeta.shortName}
                </p>
              </div>
              {!onSaveStateChange && (
                <AutoSaveStatus
                  state={labWideSave.state}
                  error={labWideSave.error}
                  onRetry={labWideSave.retry}
                />
              )}
            </div>

            <div className="mt-[1.25rem] grid grid-cols-1 gap-[1.25rem] md:grid-cols-2">
              <Field
                id={`${wideId}-addon`}
                label="Add-on"
                help="Added to the instructions of every section"
                aside={
                  <span className="text-xs tabular-nums text-muted-foreground">
                    {labWideAddon.length} / 2,000
                  </span>
                }
              >
                <textarea
                  id={`${wideId}-addon`}
                  rows={4}
                  value={labWideAddon}
                  maxLength={2000}
                  onChange={(e) => editLabWide({ addon: e.target.value })}
                  placeholder="Write every solution in clean C++20 with its complexity"
                  className={settingsTextarea}
                />
              </Field>
              <Field
                id={`${wideId}-context`}
                label="Standing context"
                help="Your background, target companies or focus"
                aside={
                  <span className="text-xs tabular-nums text-muted-foreground">
                    {labWideContext.length} / 2,000
                  </span>
                }
              >
                <textarea
                  id={`${wideId}-context`}
                  rows={4}
                  value={labWideContext}
                  maxLength={2000}
                  onChange={(e) => editLabWide({ context: e.target.value })}
                  placeholder="Seven years in backend engineering, preparing for L5 interviews, rusty on dynamic programming"
                  className={settingsTextarea}
                />
              </Field>
            </div>

            <div className="mt-[1.25rem]">
              <p className="text-[13px] font-medium text-foreground">Add-on presets</p>
              <div className="mt-2 flex flex-wrap gap-2">
                {labMeta.defaultPromptAddons.map((item) => {
                  const on = labWideAddon.includes(item.text);
                  return (
                    <button
                      key={item.label}
                      type="button"
                      aria-pressed={on}
                      onClick={() => {
                        if (on) {
                          editLabWide({
                            addon: labWideAddon
                              .replace(item.text, '')
                              .replace(/\n{2,}/g, '\n')
                              .trim(),
                          });
                        } else {
                          editLabWide({
                            addon: labWideAddon.trim()
                              ? `${labWideAddon.trim()}\n${item.text}`
                              : item.text,
                          });
                        }
                      }}
                      className={presetChip(on)}
                    >
                      {on && <Icon name="CheckIcon" size={12} />}
                      {item.label}
                    </button>
                  );
                })}
              </div>
            </div>
          </section>

          {/* ── Section by section ── */}
          <section aria-labelledby={sectionsId}>
            <div className="mb-3 flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
              <h2 id={sectionsId} className="text-[15px] font-semibold text-foreground">
                Sections
                <span className="ml-2 text-[13px] font-normal tabular-nums text-muted-foreground">
                  {sectionDefs.length}
                </span>
              </h2>
              <div className="flex flex-wrap items-center gap-2">
                {customizedCount > 0 && (
                  <button
                    type="button"
                    onClick={handleResetEntireLab}
                    className="todo-btn todo-btn-quiet px-2.5 py-1 text-xs"
                  >
                    Reset {customizedCount} edited
                  </button>
                )}
                <div className="relative w-full sm:w-56">
                  <Icon
                    name="MagnifyingGlassIcon"
                    size={14}
                    className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
                  />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search sections"
                    aria-label="Search sections"
                    className="todo-input todo-input-quiet w-full py-1.5 pl-9 pr-3 text-[13px]"
                  />
                </div>
              </div>
            </div>

            {loading ? (
              <p className="py-[2rem] text-center text-sm text-muted-foreground">Loading…</p>
            ) : filteredSections.length === 0 ? (
              <p className="py-[2rem] text-center text-sm text-muted-foreground">
                No section matches “{searchQuery.trim()}”
              </p>
            ) : (
              <ul className="lab-edge divide-y overflow-hidden rounded-2xl border bg-card">
                {filteredSections.map((sec) => {
                  const saved = settings[sec.id];
                  const parts = [
                    saved?.prompt ? 'Prompt' : null,
                    saved?.addon ? 'Add-on' : null,
                    saved?.context ? 'Context' : null,
                  ].filter(Boolean) as string[];
                  const edited = parts.length > 0;
                  const rowClass =
                    'todo-focus flex min-h-[3.25rem] w-full items-center gap-3 px-4 py-2.5 text-left transition-colors hover:bg-[var(--color-fill)] focus-visible:ring-inset focus-visible:ring-offset-0';
                  const content = (
                    <>
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center gap-2">
                          <span className="break-words text-sm font-medium text-foreground">
                            {sec.label}
                          </span>
                          {edited && (
                            <span
                              aria-hidden="true"
                              className="h-1.5 w-1.5 flex-shrink-0 rounded-full bg-primary"
                            />
                          )}
                        </span>
                        {sec.subtitle && (
                          <span className="mt-0.5 block break-words text-[13px] text-muted-foreground">
                            {sec.subtitle}
                          </span>
                        )}
                      </span>
                      {edited && (
                        <span className="hidden flex-shrink-0 text-xs text-muted-foreground sm:block">
                          <span className="sr-only">Edited: </span>
                          {parts.join(', ')}
                        </span>
                      )}
                      <Icon
                        name="ChevronRightIcon"
                        size={16}
                        className="flex-shrink-0 text-muted-foreground"
                      />
                    </>
                  );
                  return (
                    <li key={sec.id}>
                      {section ? (
                        <Link href={section.hrefFor(sec.id)} className={rowClass}>
                          {content}
                        </Link>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setSelectedSectionForModal(sec)}
                          className={rowClass}
                        >
                          {content}
                        </button>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        </>
      )}

      {/* Without addresses for the sections, one opens in a dialog */}
      {!section && selectedSectionForModal && (
        <SectionPromptModal
          lab={selectedLab}
          section={selectedSectionForModal}
          currentSettings={settings[selectedSectionForModal.id]}
          labWideSettings={settings[LAB_WIDE_SECTION]}
          currentTopic={currentTopic}
          isOpen={true}
          onClose={() => setSelectedSectionForModal(null)}
          onSave={async (vals) => {
            await handleSaveSection(selectedSectionForModal.id, vals);
          }}
        />
      )}
    </div>
  );
}
