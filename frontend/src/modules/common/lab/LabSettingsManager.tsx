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
    <div className="space-y-6">
      {/* ── Toast Notification ── */}
      {toast && (
        <div
          className={`p-3.5 rounded-lg border flex items-center gap-2.5 text-xs font-medium animate-fade-in shadow-md ${
            toast.type === 'success'
              ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
              : 'bg-rose-500/10 text-rose-400 border-rose-500/30'
          }`}
        >
          <Icon
            name={toast.type === 'success' ? 'CheckCircleIcon' : 'ExclamationCircleIcon'}
            size={16}
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
                className={`p-4 rounded-xl border text-left transition-all relative overflow-hidden group ${
                  isSelected
                    ? `${meta.bg} ${meta.border} border-2 shadow-sm ring-1 ring-primary/20`
                    : 'bg-card border-border hover:bg-muted/40'
                }`}
              >
                <div className="flex items-center gap-3 mb-2">
                  <div
                    className={`w-8 h-8 rounded-lg flex items-center justify-center ${meta.bg} ${meta.border} border`}
                  >
                    <Icon name={meta.icon as any} size={18} className={meta.color} />
                  </div>
                  <div>
                    <h3 className="text-sm font-semibold text-foreground leading-tight">
                      {meta.shortName}
                    </h3>
                    <span className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold">
                      {labKey.toUpperCase()}
                    </span>
                  </div>
                </div>
                <p className="text-xs text-muted-foreground line-clamp-2 leading-relaxed">
                  {meta.description}
                </p>
                {isSelected && (
                  <div className="absolute top-3 right-3">
                    <span className="flex h-2 w-2">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75" />
                      <span className="relative inline-flex rounded-full h-2 w-2 bg-primary" />
                    </span>
                  </div>
                )}
              </button>
            );
          })}
        </div>
      )}

      {/* ── Lab Overview & Global Addons ── */}
      <div className="bg-card border border-border rounded-xl p-5 shadow-sm space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-border">
          <div className="flex items-center gap-3">
            <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${labMeta.bg}`}>
              <Icon name={labMeta.icon as any} size={18} className={labMeta.color} />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-foreground">
                {labMeta.name} — Global Configuration
              </h2>
              <p className="text-xs text-muted-foreground">
                Instructions and learner context set here automatically apply to every section of {labMeta.shortName}.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs px-2.5 py-1 rounded-full bg-muted text-muted-foreground font-medium">
              {customizedCount} / {sectionDefs.length} sections customized
            </span>
            {customizedCount > 0 && (
              <button
                type="button"
                onClick={handleResetEntireLab}
                className="text-xs px-2.5 py-1 rounded-lg border border-border text-muted-foreground hover:text-rose-400 hover:border-rose-500/30 transition-colors flex items-center gap-1"
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
            <label className="block text-xs font-semibold text-foreground/90">
              Lab-Wide Prompt Add-on
            </label>
            <p className="text-[11px] text-muted-foreground">
              Always appended to the AI instructions for all sections in this lab:
            </p>
            <textarea
              rows={3}
              value={labWideAddon}
              maxLength={2000}
              onChange={(e) => setLabWideAddon(e.target.value)}
              placeholder="e.g. Always write solutions in clean C++20 with complexity analysis, or focus on Staff-level distributed systems questions."
              className="w-full resize-y rounded-lg border border-border bg-surface px-3 py-2 text-xs leading-relaxed text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:border-primary"
            />
          </div>

          <div className="space-y-1.5">
            <label className="block text-xs font-semibold text-foreground/90">
              Standing Learner Context
            </label>
            <p className="text-[11px] text-muted-foreground">
              Your background, target companies, or areas of focus:
            </p>
            <textarea
              rows={3}
              value={labWideContext}
              maxLength={2000}
              onChange={(e) => setLabWideContext(e.target.value)}
              placeholder="e.g. 7 years experience in backend engineering, preparing for Google/Meta L5 interviews, strong in systems but rusty on dynamic programming."
              className="w-full resize-y rounded-lg border border-border bg-surface px-3 py-2 text-xs leading-relaxed text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:border-primary"
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
                className={`text-[11px] px-2 py-1 rounded-md border transition-colors ${
                  labWideAddon.includes(item.text)
                    ? 'bg-primary/10 border-primary/30 text-primary font-medium'
                    : 'bg-muted/40 border-border text-foreground/70 hover:bg-muted'
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
            className="px-4 py-1.5 rounded-lg text-xs font-semibold bg-primary text-primary-foreground hover:bg-primary/90 transition-all flex items-center gap-1.5 shadow-sm disabled:opacity-50"
          >
            {savingLabWide ? (
              <>
                <span className="w-3.5 h-3.5 border-2 border-primary-foreground/30 border-t-primary-foreground rounded-full animate-spin" />
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
            <p className="text-xs text-muted-foreground">
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
              className="w-full pl-9 pr-3 py-1.5 rounded-lg border border-border bg-card text-xs text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:border-primary"
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
                className={`p-3.5 rounded-xl border text-left transition-all cursor-pointer group hover:border-primary/50 hover:shadow-sm ${
                  isCustomized
                    ? 'bg-amber-500/5 border-amber-500/30'
                    : 'bg-card border-border hover:bg-muted/30'
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-2.5 min-w-0">
                    <div
                      className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 mt-0.5 ${
                        isCustomized
                          ? 'bg-amber-500/15 text-amber-500'
                          : 'bg-muted text-muted-foreground'
                      }`}
                    >
                      <Icon name={sec.icon as any} size={15} />
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <h4 className="text-xs font-semibold text-foreground truncate group-hover:text-primary transition-colors">
                          {sec.label}
                        </h4>
                        {isCustomized ? (
                          <span className="text-[9px] font-semibold px-1.5 py-0.5 rounded-full bg-amber-500/15 text-amber-500 border border-amber-500/30">
                            Customized ✨
                          </span>
                        ) : (
                          <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-muted text-muted-foreground/60">
                            Default
                          </span>
                        )}
                      </div>
                      <p className="text-[11px] text-muted-foreground line-clamp-1 mt-0.5">
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
                    className="p-1 rounded-md text-muted-foreground group-hover:text-primary hover:bg-muted transition-colors shrink-0"
                    title="Edit prompt and addons"
                  >
                    <Icon name="PencilSquareIcon" size={15} />
                  </button>
                </div>

                {/* Badges preview */}
                <div className="mt-2.5 pt-2 border-t border-border/50 flex flex-wrap items-center justify-between text-[10px] text-muted-foreground">
                  <div className="flex items-center gap-2">
                    {hasCustomPrompt && (
                      <span className="text-primary font-medium flex items-center gap-1">
                        <Icon name="DocumentTextIcon" size={11} /> Custom Prompt
                      </span>
                    )}
                    {hasAddon && (
                      <span className="text-emerald-400 font-medium flex items-center gap-1">
                        <Icon name="SparklesIcon" size={11} /> Add-on Active
                      </span>
                    )}
                    {hasContext && (
                      <span className="text-violet-400 font-medium flex items-center gap-1">
                        <Icon name="UserIcon" size={11} /> Standing Context
                      </span>
                    )}
                    {!isCustomized && (
                      <span className="text-muted-foreground/60">Using standard template instructions</span>
                    )}
                  </div>
                  {isCustomized && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleResetSection(sec.id);
                      }}
                      className="text-[10px] text-muted-foreground hover:text-rose-400 transition-colors"
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
