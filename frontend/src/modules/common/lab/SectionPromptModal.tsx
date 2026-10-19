'use client';

import React, { useState, useId } from 'react';
import Icon from '@/components/ui/AppIcon';
import type { LabName, SectionSettings } from '@/lib/services/labSectionsService';
import { LABS_CONFIG, labTileStyle, type SectionDef } from './labSectionDefaults';

interface SectionPromptModalProps {
  lab: LabName;
  section: SectionDef;
  /** Current saved settings for this section (if any) */
  currentSettings?: SectionSettings;
  /** Lab-wide settings (for showing inherited context/addons) */
  labWideSettings?: SectionSettings;
  /** Current page topic info if opened from within a lab */
  currentTopic?: { name: string; brief?: string; subtopicName?: string };
  isOpen: boolean;
  onClose: () => void;
  onSave: (settings: { prompt: string; addon: string; context: string }) => Promise<void>;
  onSaveAndGenerate?: (settings: { prompt: string; addon: string; context: string }) => Promise<void>;
}

export default function SectionPromptModal({
  lab,
  section,
  currentSettings,
  labWideSettings,
  currentTopic,
  isOpen,
  onClose,
  onSave,
  onSaveAndGenerate,
}: SectionPromptModalProps) {
  const modalTitleId = useId();
  const labMeta = LABS_CONFIG[lab];
  const defaultGuidance = section.guidance || '';

  const [activeTab, setActiveTab] = useState<'prompt' | 'addons' | 'preview'>('prompt');
  const [customPrompt, setCustomPrompt] = useState<string>(currentSettings?.prompt || '');
  const [useCustomPrompt, setUseCustomPrompt] = useState<boolean>(Boolean(currentSettings?.prompt));
  const [addon, setAddon] = useState<string>(currentSettings?.addon || '');
  const [context, setContext] = useState<string>(currentSettings?.context || '');
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [statusMessage, setStatusMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  if (!isOpen) return null;

  const effectiveGuidance = useCustomPrompt ? customPrompt : defaultGuidance;
  const isCustomized = Boolean(customPrompt.trim() || addon.trim() || context.trim());

  const handleAddQuickTag = (tagText: string) => {
    if (addon.includes(tagText)) return;
    setAddon((prev) => (prev ? `${prev.trim()}\n${tagText}` : tagText));
  };

  const handleResetSection = () => {
    setCustomPrompt('');
    setUseCustomPrompt(false);
    setAddon('');
    setContext('');
    setStatusMessage({ type: 'success', text: 'Reset to section defaults' });
    setTimeout(() => setStatusMessage(null), 3000);
  };

  const handleSave = async (generateNow = false) => {
    setIsSaving(true);
    setStatusMessage(null);
    try {
      const payload = {
        prompt: useCustomPrompt ? customPrompt.trim() : '',
        addon: addon.trim(),
        context: context.trim(),
      };
      if (generateNow && onSaveAndGenerate) {
        await onSaveAndGenerate(payload);
      } else {
        await onSave(payload);
      }
      setStatusMessage({ type: 'success', text: 'Settings saved successfully' });
      setTimeout(() => {
        onClose();
      }, 500);
    } catch (err) {
      setStatusMessage({
        type: 'error',
        text: err instanceof Error ? err.message : 'Failed to save settings',
      });
    } finally {
      setIsSaving(false);
    }
  };

  // Generate assembled prompt preview
  const previewTopic = currentTopic || {
    name: labMeta.sampleTopic.name,
    brief: labMeta.sampleTopic.brief,
    subtopicName: labMeta.sampleTopic.subtopic,
  };
  const topicTitle = previewTopic.subtopicName
    ? `${previewTopic.name} — ${previewTopic.subtopicName}`
    : previewTopic.name;

  const combinedStanding = [labWideSettings?.context?.trim(), context.trim()]
    .filter(Boolean)
    .join('\n\n');
  const combinedAddons = [labWideSettings?.addon?.trim(), addon.trim()]
    .filter(Boolean)
    .join('\n\n');

  const assembledPrompt = `You are a senior ${labMeta.name} instructor writing one section of a study lab.

Topic: ${topicTitle}${previewTopic.brief ? `\nTopic summary: ${previewTopic.brief}` : ''}
Section: ${section.label}${section.subtitle ? ` (${section.subtitle})` : ''}
${
  combinedStanding
    ? `\nStanding context about the learner (applies to every section of this lab):\n"""\n${combinedStanding}\n"""\n`
    : ''
}${
    effectiveGuidance.trim()
      ? `\nSection requirements (follow these closely):\n${effectiveGuidance.trim()}\n`
      : ''
  }${
    combinedAddons
      ? `\nAdditional instructions (prompt add-on):\n${combinedAddons}\n`
      : ''
  }
Write this section for the learner.

Output rules:
- Respond with the section's Markdown ONLY — no preamble, no closing remarks.
- Begin with a bold title line: **${section.label} — ${topicTitle}**.
- Put code snippets in fenced code blocks (\`\`\`python / \`\`\`cpp).
- Roughly 250-600 words excluding code, concrete and technical.`;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby={modalTitleId}
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in"
    >
      <div className="lab-page relative w-full max-w-3xl bg-card border border-border rounded-xl shadow-lg overflow-hidden flex flex-col max-h-[90vh]">
        {/* ── Modal Header ── */}
        <div className="flex items-center justify-between gap-3 px-[1.5rem] py-4 border-b">
          <div className="flex min-w-0 items-center gap-3">
            <div className="lab-tile h-9 w-9" style={labTileStyle(lab)}>
              <Icon name={section.icon as any} size={20} />
            </div>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h2 id={modalTitleId} className="text-base font-semibold text-foreground">
                  {section.label}
                </h2>
                <span className="text-xs px-2 py-0.5 rounded-full mix-bg-foreground/[0.06] text-muted-foreground font-mono">
                  {section.id}
                </span>
                {isCustomized ? (
                  <span className="inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full lab-tint lab-ink">
                    <Icon name="SparklesIcon" size={12} />
                    Customized
                  </span>
                ) : (
                  <span className="text-xs font-medium px-2 py-0.5 rounded-full mix-bg-foreground/[0.06] text-muted-foreground">
                    Default Prompt
                  </span>
                )}
              </div>
              <p className="text-xs font-medium text-muted-foreground mt-0.5">
                {section.subtitle || `${labMeta.shortName} Section Configuration`}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="todo-focus flex-shrink-0 p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:mix-bg-foreground/[0.06] transition-colors"
          >
            <Icon name="XMarkIcon" size={18} />
          </button>
        </div>

        {/* ── Tabs ── */}
        <div className="flex items-center gap-4 overflow-x-auto px-[1.5rem] border-b scrollbar-none">
          <button
            type="button"
            onClick={() => setActiveTab('prompt')}
            aria-pressed={activeTab === 'prompt'}
            className={`todo-focus flex-shrink-0 whitespace-nowrap py-3 text-xs font-semibold border-b-2 transition-colors flex items-center gap-1.5 ${
              activeTab === 'prompt'
                ? 'border-primary lab-ink'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            <Icon name="DocumentTextIcon" size={15} />
            Section Prompt & Guidance
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('addons')}
            aria-pressed={activeTab === 'addons'}
            className={`todo-focus flex-shrink-0 whitespace-nowrap py-3 text-xs font-semibold border-b-2 transition-colors flex items-center gap-1.5 ${
              activeTab === 'addons'
                ? 'border-primary lab-ink'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            <Icon name="SparklesIcon" size={15} />
            Prompt Add-ons & Context
            {(addon.trim() || context.trim()) && (
              <span className="w-1.5 h-1.5 rounded-full bg-primary inline-block" />
            )}
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('preview')}
            aria-pressed={activeTab === 'preview'}
            className={`todo-focus flex-shrink-0 whitespace-nowrap py-3 text-xs font-semibold border-b-2 transition-colors flex items-center gap-1.5 ${
              activeTab === 'preview'
                ? 'border-primary lab-ink'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            <Icon name="EyeIcon" size={15} />
            Live Prompt Preview
          </button>
        </div>

        {/* ── Modal Content ── */}
        <div className="p-[1.5rem] overflow-y-auto space-y-5 flex-1">
          {activeTab === 'prompt' && (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Section Generation Instructions
                  </h4>
                  <p className="text-xs font-medium text-muted-foreground mt-0.5">
                    Defines the structure, required headings, depth, and output format for this section.
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      if (!useCustomPrompt) {
                        setCustomPrompt(defaultGuidance);
                        setUseCustomPrompt(true);
                      } else {
                        setUseCustomPrompt(false);
                      }
                    }}
                    className={`todo-focus text-xs px-2.5 py-1 rounded-md border font-semibold transition-colors ${
                      useCustomPrompt
                        ? 'lab-tint mix-border-primary/30 lab-ink'
                        : 'mix-bg-foreground/[0.05] border-border text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    {useCustomPrompt ? 'Editing Custom Prompt' : 'Using Built-in Template'}
                  </button>
                </div>
              </div>

              {!useCustomPrompt ? (
                <div className="space-y-2">
                  <div className="p-3.5 rounded-lg mix-bg-foreground/[0.05] text-xs font-mono text-muted-foreground leading-relaxed whitespace-pre-wrap max-h-60 overflow-y-auto select-all">
                    {defaultGuidance || 'No specific instructions set for this section (uses general lab guidelines).'}
                  </div>
                  <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-xs font-medium text-muted-foreground">
                    <span>This built-in prompt is automatically applied during generation.</span>
                    <button
                      type="button"
                      onClick={() => {
                        setCustomPrompt(defaultGuidance);
                        setUseCustomPrompt(true);
                      }}
                      className="todo-focus rounded-md lab-ink hover:underline font-semibold flex items-center gap-1"
                    >
                      <Icon name="PencilIcon" size={12} />
                      Click here to customize this prompt
                    </button>
                  </div>
                </div>
              ) : (
                <div className="space-y-2">
                  <textarea
                    rows={9}
                    value={customPrompt}
                    maxLength={8000}
                    onChange={(e) => setCustomPrompt(e.target.value)}
                    placeholder="Enter customized prompt guidance for this section..."
                    className="todo-input resize-y p-3 font-mono text-xs leading-relaxed"
                  />
                  <div className="flex flex-wrap items-center justify-between gap-2 text-xs font-medium text-muted-foreground">
                    <span>{customPrompt.length} / 8000 characters</span>
                    <button
                      type="button"
                      onClick={() => {
                        setCustomPrompt(defaultGuidance);
                      }}
                      className="todo-focus rounded-md text-xs font-medium text-muted-foreground hover:text-foreground hover:underline"
                    >
                      Reset to original template
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {activeTab === 'addons' && (
            <div className="space-y-5">
              {/* Quick Addons */}
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">
                  Suggested Add-ons for {labMeta.shortName}
                </label>
                <p className="text-xs font-medium text-muted-foreground mb-2.5">
                  Click any pill to quickly append targeted instructions to this section:
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {labMeta.defaultPromptAddons.map((item) => (
                    <button
                      key={item.label}
                      type="button"
                      onClick={() => handleAddQuickTag(item.text)}
                      className={`todo-focus text-xs px-2.5 py-1 rounded-lg border transition-all text-left ${
                        addon.includes(item.text)
                          ? 'lab-tint mix-border-primary/40 lab-ink font-semibold'
                          : 'mix-bg-foreground/[0.04] border-border text-foreground font-medium hover:mix-bg-foreground/[0.08]'
                      }`}
                    >
                      {item.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Custom Addon */}
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1">
                  Custom Prompt Add-on for this Section
                </label>
                <p className="text-xs font-medium text-muted-foreground mb-2">
                  Extra instructions appended to the section prompt (e.g. &quot;Always provide complexity proof&quot; or &quot;Focus on concurrency&quot;):
                </p>
                <textarea
                  rows={3}
                  value={addon}
                  maxLength={4000}
                  onChange={(e) => setAddon(e.target.value)}
                  placeholder="e.g. Include a comparative tradeoff table for memory vs CPU, and highlight thread safety."
                  className="todo-input resize-y p-3 text-[13px] leading-relaxed"
                />
              </div>

              {/* Standing Context */}
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1">
                  Standing Learner Context
                </label>
                <p className="text-xs font-medium text-muted-foreground mb-2">
                  Context about your background or target role automatically included whenever this section is generated:
                </p>
                <textarea
                  rows={2}
                  value={context}
                  maxLength={4000}
                  onChange={(e) => setContext(e.target.value)}
                  placeholder="e.g. Learner has 5 years Python experience, preparing for Staff Engineer rounds at Google."
                  className="todo-input resize-y p-3 text-[13px] leading-relaxed"
                />
              </div>

              {labWideSettings && (labWideSettings.addon || labWideSettings.context) && (
                <div className="p-3 rounded-lg mix-bg-foreground/[0.04] text-xs font-medium text-muted-foreground space-y-1">
                  <span className="font-semibold text-foreground flex items-center gap-1">
                    <Icon name="InformationCircleIcon" size={14} className="text-primary" />
                    Lab-wide settings also active:
                  </span>
                  {labWideSettings.addon && (
                    <p className="line-clamp-2 break-words" title={labWideSettings.addon}>
                      <strong>Global Add-on:</strong> {labWideSettings.addon}
                    </p>
                  )}
                  {labWideSettings.context && (
                    <p className="line-clamp-2 break-words" title={labWideSettings.context}>
                      <strong>Global Context:</strong> {labWideSettings.context}
                    </p>
                  )}
                </div>
              )}
            </div>
          )}

          {activeTab === 'preview' && (
            <div className="space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-xs font-medium text-muted-foreground">
                  Simulated prompt sent to AI for topic:{' '}
                  <strong className="text-foreground">{previewTopic.name}</strong>
                </span>
                <span className="text-xs text-muted-foreground font-mono">
                  {assembledPrompt.length} characters
                </span>
              </div>
              <div className="p-4 rounded-lg mix-bg-foreground/[0.05] font-mono text-xs leading-relaxed text-foreground whitespace-pre-wrap max-h-80 overflow-y-auto select-all">
                {assembledPrompt}
              </div>
            </div>
          )}

          {statusMessage && (
            <div
              role={statusMessage.type === 'error' ? 'alert' : 'status'}
              data-semantic={statusMessage.type === 'success' ? 'done' : undefined}
              className={`p-3 rounded-lg text-xs font-medium text-foreground flex items-center gap-2 animate-fade-in ${
                statusMessage.type === 'success' ? 'mix-bg-success/10' : 'mix-bg-error/10'
              }`}
            >
              <Icon
                name={statusMessage.type === 'success' ? 'CheckCircleIcon' : 'ExclamationCircleIcon'}
                size={16}
                className={statusMessage.type === 'success' ? 'text-success' : 'text-error'}
              />
              <span>{statusMessage.text}</span>
            </div>
          )}
        </div>

        {/* ── Modal Footer ── */}
        <div className="flex flex-wrap items-center justify-between gap-2 px-[1.5rem] py-4 border-t">
          <button
            type="button"
            onClick={handleResetSection}
            disabled={isSaving || !isCustomized}
            className="todo-btn todo-btn-ghost"
          >
            <Icon name="ArrowPathIcon" size={13} />
            Reset to Defaults
          </button>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              disabled={isSaving}
              className="todo-btn todo-btn-ghost"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => handleSave(false)}
              disabled={isSaving}
              className="todo-btn todo-btn-secondary"
            >
              {isSaving ? (
                <>
                  <span className="w-3.5 h-3.5 border-2 border-current border-t-transparent rounded-full animate-spin" />
                  Saving…
                </>
              ) : (
                <>
                  <Icon name="CheckIcon" size={14} />
                  Save Changes
                </>
              )}
            </button>
            {onSaveAndGenerate && (
              <button
                type="button"
                onClick={() => handleSave(true)}
                disabled={isSaving}
                className="todo-btn todo-btn-primary"
              >
                {isSaving ? (
                  <>
                    <span className="w-3.5 h-3.5 border-2 border-current border-t-transparent rounded-full animate-spin" />
                    Applying…
                  </>
                ) : (
                  <>
                    <Icon name="SparklesIcon" size={14} />
                    Save & Generate Now
                  </>
                )}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
