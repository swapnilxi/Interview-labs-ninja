'use client';

import React, { useState, useEffect, useCallback } from 'react';
import Icon from '@/components/ui/AppIcon';
import {
  fetchLabSettings,
  saveLabSettings,
  resetLabSettings,
  LAB_WIDE_SECTION,
  type LabName,
  type SectionSettings,
} from '@/lib/services/labSectionsService';
import {
  LABS_CONFIG,
  getSectionDefsForLab,
  labTileStyle,
  type SectionDef,
} from './labSectionDefaults';
import SectionPromptModal from './SectionPromptModal';

interface LabSettingsManagerProps {
  initialLab?: LabName;
  /** If provided, disables the lab switcher and restricts management to this lab */
  fixedLab?: LabName;
  /** Current page topic info if opened from within an active lab */
  currentTopic?: { name: string; brief?: string; subtopicName?: string };
  onSectionUpdated?: (sectionId: string) => void;
  /** Optional callback to close modal if opened inside a popup */
  onClose?: () => void;
}

export default function LabSettingsManager({
  initialLab = 'dsa',
  fixedLab,
  currentTopic,
  onSectionUpdated,
  onClose,
}: LabSettingsManagerProps) {
  const [selectedLab, setSelectedLab] = useState<LabName>(fixedLab || initialLab);
  const [settings, setSettings] = useState<Record<string, SectionSettings>>({});
  const [loading, setLoading] = useState<boolean>(true);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedSectionForModal, setSelectedSectionForModal] = useState<SectionDef | null>(null);

  // Lab-wide edit state
  const [labWideAddon, setLabWideAddon] = useState<string>('');
  const [labWideContext, setLabWideContext] = useState<string>('');
  const [savingLabWide, setSavingLabWide] = useState<boolean>(false);
  const [toast, setToast] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  const labMeta = LABS_CONFIG[selectedLab];
  const sectionDefs = getSectionDefsForLab(selectedLab);

  const loadSettings = useCallback(async (lab: LabName) => {
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
  }, []);

  useEffect(() => {
    loadSettings(selectedLab);
  }, [selectedLab, loadSettings]);

  const showToast = (type: 'success' | 'error', message: string) => {
    setToast({ type, message });
    setTimeout(() => setToast(null), 4000);
  };

  const handleSaveLabWide = async () => {
    setSavingLabWide(true);
    try {
      await saveLabSettings(selectedLab, LAB_WIDE_SECTION, {
        prompt: '',
        addon: labWideAddon.trim(),
        context: labWideContext.trim(),
      });
      await loadSettings(selectedLab);
      showToast('success', `${labMeta.shortName} global settings saved!`);
      if (onSectionUpdated) onSectionUpdated(LAB_WIDE_SECTION);
    } catch (err) {
      showToast('error', err instanceof Error ? err.message : 'Failed to save global settings');
    } finally {
      setSavingLabWide(false);
    }
  };

  const handleSaveSection = async (
    sectionId: string,
    vals: { prompt: string; addon: string; context: string }
  ) => {
    await saveLabSettings(selectedLab, sectionId, vals);
    await loadSettings(selectedLab);
    showToast('success', 'Section configuration updated!');
    if (onSectionUpdated) onSectionUpdated(sectionId);
  };

  const handleResetSection = async (sectionId: string) => {
    try {
      await resetLabSettings(selectedLab, sectionId);
      await loadSettings(selectedLab);
      showToast('success', 'Section reset to built-in defaults');
      if (onSectionUpdated) onSectionUpdated(sectionId);
    } catch (err) {
      showToast('error', 'Failed to reset section');
    }
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

  const customizedCount = Object.keys(settings).filter((k) => k !== LAB_WIDE_SECTION).length;

  return (
    <div className="space-y-[1.5rem]">
      {/* ── Toast Notification ── */}
      {toast && (
        <div
          role={toast.type === 'error' ? 'alert' : 'status'}
          data-semantic={toast.type === 'success' ? 'done' : undefined}
          className={`p-3.5 rounded-lg flex items-center gap-2.5 text-xs font-medium text-foreground animate-fade-in ${
            toast.type === 'success' ? 'mix-bg-success/10' : 'mix-bg-error/10'
          }`}
        >
          <Icon
            name={toast.type === 'success' ? 'CheckCircleIcon' : 'ExclamationCircleIcon'}
            size={16}
            className={toast.type === 'success' ? 'text-success' : 'text-error'}
          />
          <span>{toast.message}</span>
        </div>
      )}

      {/* ── Lab Selector (if not fixed to one lab) ── */}
      {!fixedLab && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {(['dsa', 'system_design', 'cv'] as LabName[]).map((labKey) => {
            const meta = LABS_CONFIG[labKey];
            const isSelected = selectedLab === labKey;
            return (
              <button
                key={labKey}
                type="button"
                onClick={() => setSelectedLab(labKey)}
                aria-pressed={isSelected}
                className={`todo-focus p-4 rounded-xl border text-left transition-all relative overflow-hidden group ${
                  isSelected
                    ? 'lab-tint mix-border-primary/50 ring-1 mix-ring-primary/25'
                    : 'bg-card border-border hover:mix-bg-foreground/[0.04]'
                }`}
              >
                <div className="flex items-center gap-3 mb-2">
                  <div className="lab-tile h-8 w-8" style={labTileStyle(labKey)}>
                    <Icon name={meta.icon as any} size={18} />
                  </div>
                  <div>
                    <h3 className="text-sm font-semibold text-foreground leading-snug">
                      {meta.shortName}
                    </h3>
                    <span className="text-[11px] text-muted-foreground uppercase tracking-wider font-semibold">
                      {labKey.toUpperCase()}
                    </span>
                  </div>
                </div>
                <p className="text-xs font-medium text-muted-foreground leading-relaxed">
                  {meta.description}
                </p>
                {isSelected && (
                  <div className="absolute top-3 right-3">
                    <span className="block h-2 w-2 rounded-full bg-primary" />
                  </div>
                )}
              </button>
            );
          })}
        </div>
      )}

      {/* ── Lab Overview & Global Addons ── */}
      <div className="bg-card border rounded-xl p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b">
          <div className="flex items-center gap-3">
            <div className="lab-tile h-8 w-8" style={labTileStyle(selectedLab)}>
              <Icon name={labMeta.icon as any} size={18} />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-foreground">
                {labMeta.name} — Global Configuration
              </h2>
              <p className="text-xs font-medium text-muted-foreground">
                Instructions and learner context set here automatically apply to every section of {labMeta.shortName}.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs px-2.5 py-1 rounded-full mix-bg-foreground/[0.06] text-muted-foreground font-medium">
              {customizedCount} / {sectionDefs.length} sections customized
            </span>
            {customizedCount > 0 && (
              <button
                type="button"
                onClick={handleResetEntireLab}
                className="todo-btn todo-btn-secondary hover:text-error"
                title="Reset all sections to defaults"
              >
                <Icon name="ArrowPathIcon" size={12} />
                Reset Lab Defaults
              </button>
            )}
          </div>
        </div>

        {/* Global Prompt Add-on */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-1">
          <div className="space-y-1.5">
            <label className="block text-xs font-semibold text-foreground">
              Lab-Wide Prompt Add-on
            </label>
            <p className="text-xs font-medium text-muted-foreground">
              Always appended to the AI instructions for all sections in this lab:
            </p>
            <textarea
              rows={3}
              value={labWideAddon}
              maxLength={2000}
              onChange={(e) => setLabWideAddon(e.target.value)}
              placeholder="e.g. Always write solutions in clean C++20 with complexity analysis, or focus on Staff-level distributed systems questions."
              className="todo-input resize-y px-3 py-2 text-[13px] leading-relaxed"
            />
          </div>

          <div className="space-y-1.5">
            <label className="block text-xs font-semibold text-foreground">
              Standing Learner Context
            </label>
            <p className="text-xs font-medium text-muted-foreground">
              Your background, target companies, or areas of focus:
            </p>
            <textarea
              rows={3}
              value={labWideContext}
              maxLength={2000}
              onChange={(e) => setLabWideContext(e.target.value)}
              placeholder="e.g. 7 years experience in backend engineering, preparing for Google/Meta L5 interviews, strong in systems but rusty on dynamic programming."
              className="todo-input resize-y px-3 py-2 text-[13px] leading-relaxed"
            />
          </div>
        </div>

        {/* Quick Addon Presets */}
        <div>
          <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider block mb-1.5">
            Quick Add-on Presets:
          </span>
          <div className="flex flex-wrap gap-1.5">
            {labMeta.defaultPromptAddons.map((item) => (
              <button
                key={item.label}
                type="button"
                onClick={() => {
                  if (labWideAddon.includes(item.text)) return;
                  setLabWideAddon((p) => (p ? `${p.trim()}\n${item.text}` : item.text));
                }}
                className={`todo-focus text-xs px-2 py-1 rounded-md border transition-colors ${
                  labWideAddon.includes(item.text)
                    ? 'lab-tint mix-border-primary/30 lab-ink font-semibold'
                    : 'mix-bg-foreground/[0.04] border-border text-foreground font-medium hover:mix-bg-foreground/[0.08]'
                }`}
              >
                + {item.label}
              </button>
            ))}
          </div>
        </div>

        <div className="flex justify-end pt-2">
          <button
            type="button"
            onClick={handleSaveLabWide}
            disabled={savingLabWide}
            className="todo-btn todo-btn-primary"
          >
            {savingLabWide ? (
              <>
                <span className="w-3.5 h-3.5 border-2 border-current border-t-transparent rounded-full animate-spin" />
                Saving…
              </>
            ) : (
              <>
                <Icon name="CheckIcon" size={13} />
                Save Global Settings
              </>
            )}
          </button>
        </div>
      </div>

      {/* ── Section-by-Section Customization ── */}
      <div className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold text-foreground">
              {labMeta.shortName} Sections ({sectionDefs.length})
            </h3>
            <p className="text-xs font-medium text-muted-foreground">
              Click any section to inspect, edit its prompt instructions, add prompt add-ons, or test live output.
            </p>
          </div>
          <div className="relative w-full sm:w-64">
            <Icon
              name="MagnifyingGlassIcon"
              size={14}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
            />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Filter sections..."
              className="todo-input pl-9 pr-3 py-1.5 text-xs"
            />
          </div>
        </div>

        {/* Section Cards Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {filteredSections.map((sec) => {
            const secSetting = settings[sec.id];
            const hasCustomPrompt = Boolean(secSetting?.prompt);
            const hasAddon = Boolean(secSetting?.addon);
            const hasContext = Boolean(secSetting?.context);
            const isCustomized = hasCustomPrompt || hasAddon || hasContext;

            return (
              <div
                key={sec.id}
                onClick={() => setSelectedSectionForModal(sec)}
                className={`p-3.5 rounded-xl border text-left transition-all cursor-pointer group hover:mix-border-primary/40 ${
                  isCustomized
                    ? 'mix-bg-primary/[0.06] mix-border-primary/30'
                    : 'bg-card border-border hover:mix-bg-foreground/[0.04]'
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-2.5 min-w-0">
                    <div
                      className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 mt-0.5 ${
                        isCustomized
                          ? 'lab-tint text-primary'
                          : 'mix-bg-foreground/[0.06] text-muted-foreground'
                      }`}
                    >
                      <Icon name={sec.icon as any} size={15} />
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <h4 className="break-words text-[13px] font-semibold leading-snug text-foreground group-hover:lab-ink transition-colors">
                          {sec.label}
                        </h4>
                        {isCustomized ? (
                          <span className="inline-flex items-center gap-1 text-xs font-semibold px-1.5 py-0.5 rounded-full lab-tint lab-ink">
                            <Icon name="SparklesIcon" size={11} />
                            Customized
                          </span>
                        ) : (
                          <span className="text-xs font-medium px-1.5 py-0.5 rounded-full mix-bg-foreground/[0.06] text-muted-foreground">
                            Default
                          </span>
                        )}
                      </div>
                      <p className="mt-0.5 break-words text-xs font-medium leading-snug text-muted-foreground">
                        {sec.subtitle || sec.id}
                      </p>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setSelectedSectionForModal(sec);
                    }}
                    className="todo-focus p-1 rounded-md text-muted-foreground group-hover:text-primary hover:mix-bg-foreground/[0.06] transition-colors shrink-0"
                    title="Edit prompt and addons"
                    aria-label={`Edit prompt and add-ons for ${sec.label}`}
                  >
                    <Icon name="PencilSquareIcon" size={15} />
                  </button>
                </div>

                {/* Badges preview */}
                <div className="mt-2.5 pt-2 border-t flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-xs text-muted-foreground">
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                    {hasCustomPrompt && (
                      <span className="lab-ink font-semibold flex items-center gap-1">
                        <Icon name="DocumentTextIcon" size={12} /> Custom Prompt
                      </span>
                    )}
                    {hasAddon && (
                      <span className="lab-ink font-semibold flex items-center gap-1">
                        <Icon name="SparklesIcon" size={12} /> Add-on Active
                      </span>
                    )}
                    {hasContext && (
                      <span className="lab-ink font-semibold flex items-center gap-1">
                        <Icon name="UserIcon" size={12} /> Standing Context
                      </span>
                    )}
                    {!isCustomized && (
                      <span className="font-medium text-muted-foreground">Using standard template instructions</span>
                    )}
                  </div>
                  {isCustomized && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleResetSection(sec.id);
                      }}
                      className="todo-focus rounded-md px-1 text-xs font-medium text-muted-foreground hover:text-error transition-colors"
                    >
                      Reset
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* ── Section Prompt Modal ── */}
      {selectedSectionForModal && (
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
