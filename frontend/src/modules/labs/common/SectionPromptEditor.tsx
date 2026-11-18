'use client';

import { useEffect, useId, useRef, useState } from 'react';
import Link from 'next/link';
import Icon from '@/components/ui/AppIcon';
import AutoSaveStatus from '@/components/ui/AutoSaveStatus';
import { useAutoSave } from '@/lib/ui/useAutoSave';
import type { LabName, SectionSettings } from '@/lib/services/labSectionsService';
import { LABS_CONFIG, type SectionDef } from './labSectionDefaults';
import { Field, monoBlock, presetChip, settingsTextarea } from './settingsUi';

type Values = { prompt: string; addon: string; context: string };
type EditorTab = 'prompt' | 'addons' | 'preview';

/** The quiz is not a written section: its instructions are an extra block on top of the quiz rules. */
const QUIZ_NOTE =
  'These instructions and your context are added to the requirements for each new batch of quiz questions.';

const TABS: { id: EditorTab; label: string }[] = [
  { id: 'prompt', label: 'Instructions' },
  { id: 'addons', label: 'Add-ons and context' },
  { id: 'preview', label: 'Preview' },
];

/**
 * How one section is written: its instructions (the built-in ones, or your own), an add-on, the context about you, and a preview of
 * what the AI is sent. Every edit is saved once typing pauses.
 *
 * One editor, two homes. `variant="page"` is the lab management page's section screen (its own address); `variant="modal"` is the
 * dialog a lab page opens for a quick edit (SectionPromptModal), which also offers "Generate now".
 */
export default function SectionPromptEditor({
  lab,
  section,
  currentSettings,
  labWideSettings,
  currentTopic,
  topicSettings,
  variant,
  wholeLabHref,
  onSave,
  onSaveAndGenerate,
  onClose,
}: {
  lab: LabName;
  section: SectionDef;
  /** Current saved settings for this section (if any) */
  currentSettings?: SectionSettings;
  /** Lab-wide settings (for showing what also applies) */
  labWideSettings?: SectionSettings;
  /** The open page's topic, when opened from a lab (the preview uses it; a sample topic otherwise) */
  currentTopic?: { name: string; brief?: string; subtopicName?: string };
  /** That topic's own add-on and context (topic management), which the AI is sent with the section's. */
  topicSettings?: SectionSettings;
  variant: 'page' | 'modal';
  /** Where the lab-wide settings are edited (the page variant links to it). */
  wholeLabHref?: string;
  onSave: (settings: Values) => Promise<void>;
  onSaveAndGenerate?: (settings: Values) => Promise<void>;
  onClose?: () => void;
}) {
  const labMeta = LABS_CONFIG[lab];
  const defaultGuidance = section.guidance || '';
  const ids = { prompt: useId(), addon: useId(), context: useId() };

  const [tab, setTab] = useState<EditorTab>('prompt');
  const [customPrompt, setCustomPrompt] = useState<string>(currentSettings?.prompt || '');
  const [useCustomPrompt, setUseCustomPrompt] = useState<boolean>(Boolean(currentSettings?.prompt));
  const [addon, setAddon] = useState<string>(currentSettings?.addon || '');
  const [context, setContext] = useState<string>(currentSettings?.context || '');
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [statusMessage, setStatusMessage] = useState<{
    type: 'success' | 'error';
    text: string;
  } | null>(null);

  // ── Auto-save: every edit is saved once typing pauses; there is no Save button. ──
  const payload = {
    prompt: useCustomPrompt ? customPrompt.trim() : '',
    addon: addon.trim(),
    context: context.trim(),
  };
  const payloadKey = JSON.stringify(payload);
  const autosave = useAutoSave<Values>((vals) => onSave(vals), 900);
  // What was last saved (or loaded): only a real change is written, so opening the editor writes nothing.
  const lastKeyRef = useRef(payloadKey);
  const { schedule } = autosave;
  useEffect(() => {
    if (payloadKey === lastKeyRef.current) return;
    lastKeyRef.current = payloadKey;
    schedule(JSON.parse(payloadKey));
  }, [payloadKey, schedule]);

  const effectiveGuidance = useCustomPrompt ? customPrompt : defaultGuidance;
  const isCustomized = Boolean(customPrompt.trim() || addon.trim() || context.trim());

  const toggleAddon = (text: string) =>
    setAddon((prev) =>
      prev.includes(text)
        ? prev
            .replace(text, '')
            .replace(/\n{2,}/g, '\n')
            .trim()
        : prev.trim()
          ? `${prev.trim()}\n${text}`
          : text
    );

  const useBuiltIn = () => setUseCustomPrompt(false);
  const useOwn = () => {
    if (!customPrompt.trim()) setCustomPrompt(defaultGuidance);
    setUseCustomPrompt(true);
  };

  const handleResetSection = () => {
    setCustomPrompt('');
    setUseCustomPrompt(false);
    setAddon('');
    setContext('');
    setStatusMessage({ type: 'success', text: 'Reset to the built-in instructions' });
    setTimeout(() => setStatusMessage(null), 3000);
  };

  /** "Generate now" (inside a lab): save what is on screen, then rewrite the section with it. */
  const handleGenerate = async () => {
    if (!onSaveAndGenerate) return;
    setIsSaving(true);
    setStatusMessage(null);
    try {
      await autosave.flush();
      await onSaveAndGenerate(payload);
      onClose?.();
    } catch (err) {
      setStatusMessage({
        type: 'error',
        text: err instanceof Error ? err.message : 'Could not generate',
      });
    } finally {
      setIsSaving(false);
    }
  };

  // The prompt the AI is sent, assembled the way the generator does
  const previewTopic = currentTopic || {
    name: labMeta.sampleTopic.name,
    brief: labMeta.sampleTopic.brief,
    subtopicName: labMeta.sampleTopic.subtopic,
  };
  const topicTitle = previewTopic.subtopicName
    ? `${previewTopic.name} — ${previewTopic.subtopicName}`
    : previewTopic.name;
  const combinedStanding = [
    labWideSettings?.context?.trim(),
    topicSettings?.context?.trim(),
    context.trim(),
  ]
    .filter(Boolean)
    .join('\n\n');
  const combinedAddons = [
    labWideSettings?.addon?.trim(),
    topicSettings?.addon?.trim(),
    addon.trim(),
  ]
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
  }${combinedAddons ? `\nAdditional instructions (prompt add-on):\n${combinedAddons}\n` : ''}
Write this section for the learner.

Output rules:
- Respond with the section's Markdown ONLY — no preamble, no closing remarks.
- Begin with a bold title line: **${section.label} — ${topicTitle}**.
- Put code snippets in fenced code blocks (\`\`\`python / \`\`\`cpp).
- Roughly 250-600 words excluding code, concrete and technical.`;

  const inModal = variant === 'modal';
  const labWideActive = Boolean(
    labWideSettings && (labWideSettings.addon || labWideSettings.context)
  );

  const body = (
    <>
      {tab === 'prompt' && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
            <div className="min-w-0">
              <p className="text-[13px] font-medium text-foreground">Instructions</p>
              <p className="mt-0.5 text-[13px] text-muted-foreground">
                {section.id === 'quiz'
                  ? QUIZ_NOTE
                  : 'Structure, headings, depth and output format for this section'}
              </p>
            </div>
            <div className="todo-segmented" role="group" aria-label="Which instructions to use">
              <button
                type="button"
                aria-pressed={!useCustomPrompt}
                onClick={useBuiltIn}
                className="todo-segment"
              >
                Built-in
              </button>
              <button
                type="button"
                aria-pressed={useCustomPrompt}
                onClick={useOwn}
                className="todo-segment"
              >
                Your own
              </button>
            </div>
          </div>

          {!useCustomPrompt ? (
            <>
              <div
                className={`${monoBlock} max-h-[18rem] overflow-y-auto select-all text-muted-foreground`}
              >
                {defaultGuidance ||
                  'No instructions of its own: this section follows the lab’s general guidelines.'}
              </div>
              <p className="text-[13px] text-muted-foreground">
                Used when this section is written. Choose “Your own” to start from this text and
                change it.
              </p>
            </>
          ) : (
            <>
              <textarea
                id={ids.prompt}
                aria-label="Your instructions for this section"
                rows={12}
                value={customPrompt}
                maxLength={8000}
                onChange={(e) => setCustomPrompt(e.target.value)}
                placeholder="Write the instructions this section should follow"
                className={`${settingsTextarea} font-mono text-xs`}
              />
              <div className="flex flex-wrap items-center justify-between gap-2 text-[13px] text-muted-foreground">
                <span className="tabular-nums">{customPrompt.length.toLocaleString()} / 8,000</span>
                <button
                  type="button"
                  onClick={() => setCustomPrompt(defaultGuidance)}
                  className="todo-focus rounded-md hover:text-foreground hover:underline"
                >
                  Restore the built-in text
                </button>
              </div>
            </>
          )}
        </div>
      )}

      {tab === 'addons' && (
        <div className="space-y-[1.5rem]">
          <div>
            <p className="text-[13px] font-medium text-foreground">Suggested add-ons</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {labMeta.defaultPromptAddons.map((item) => {
                const on = addon.includes(item.text);
                return (
                  <button
                    key={item.label}
                    type="button"
                    aria-pressed={on}
                    onClick={() => toggleAddon(item.text)}
                    className={presetChip(on)}
                  >
                    {on && <Icon name="CheckIcon" size={12} />}
                    {item.label}
                  </button>
                );
              })}
            </div>
          </div>

          <Field
            id={ids.addon}
            label="Add-on for this section"
            help="Extra instructions added after the section’s own, such as “always prove the complexity”"
          >
            <textarea
              id={ids.addon}
              rows={4}
              value={addon}
              maxLength={4000}
              onChange={(e) => setAddon(e.target.value)}
              placeholder="Include a table comparing memory and CPU, and point out thread safety"
              className={settingsTextarea}
            />
          </Field>

          <Field
            id={ids.context}
            label="Context about you"
            help="Your background or target role, included whenever this section is written"
          >
            <textarea
              id={ids.context}
              rows={3}
              value={context}
              maxLength={4000}
              onChange={(e) => setContext(e.target.value)}
              placeholder="Five years of Python, preparing for staff engineer rounds"
              className={settingsTextarea}
            />
          </Field>

          {labWideActive && (
            <div className="rounded-xl bg-[var(--color-fill)] p-4 text-[13px] text-muted-foreground">
              <p className="font-medium text-foreground">The whole lab’s settings also apply</p>
              {labWideSettings?.addon && (
                <p className="mt-2 line-clamp-2 break-words" title={labWideSettings.addon}>
                  Add-on: {labWideSettings.addon}
                </p>
              )}
              {labWideSettings?.context && (
                <p className="mt-1 line-clamp-2 break-words" title={labWideSettings.context}>
                  Context: {labWideSettings.context}
                </p>
              )}
              {wholeLabHref && (
                <Link href={wholeLabHref} className="mt-2 inline-block lab-ink hover:underline">
                  Edit them
                </Link>
              )}
            </div>
          )}
        </div>
      )}

      {tab === 'preview' && (
        <div className="space-y-3">
          <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 text-[13px] text-muted-foreground">
            <span>
              What the AI is sent for{' '}
              <span className="font-medium text-foreground">{previewTopic.name}</span>
            </span>
            <span className="tabular-nums">
              {assembledPrompt.length.toLocaleString()} characters
            </span>
          </div>
          <div className={`${monoBlock} max-h-[28rem] overflow-y-auto select-all`}>
            {assembledPrompt}
          </div>
        </div>
      )}

      {statusMessage && (
        <p
          role={statusMessage.type === 'error' ? 'alert' : 'status'}
          className={`mt-4 text-[13px] ${statusMessage.type === 'error' ? 'text-error' : 'text-muted-foreground'}`}
        >
          {statusMessage.text}
        </p>
      )}
    </>
  );

  const picker = (
    <div className="todo-segmented" role="group" aria-label="Section settings">
      {TABS.map((t) => (
        <button
          key={t.id}
          type="button"
          aria-pressed={tab === t.id}
          onClick={() => setTab(t.id)}
          className="todo-segment"
        >
          {t.label}
          {t.id === 'addons' && (addon.trim() || context.trim()) && (
            <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-primary" />
          )}
        </button>
      ))}
    </div>
  );

  const footer = (
    <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
      <button
        type="button"
        onClick={handleResetSection}
        disabled={isSaving || !isCustomized}
        className="todo-btn todo-btn-ghost disabled:opacity-40"
      >
        Reset to built-in
      </button>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <AutoSaveStatus state={autosave.state} error={autosave.error} onRetry={autosave.retry} />
        {inModal && (
          <button
            type="button"
            onClick={onClose}
            disabled={isSaving}
            className="todo-btn todo-btn-secondary"
          >
            Done
          </button>
        )}
        {inModal && onSaveAndGenerate && (
          <button
            type="button"
            onClick={handleGenerate}
            disabled={isSaving}
            className="todo-btn todo-btn-primary"
          >
            {isSaving ? 'Generating…' : 'Generate now'}
          </button>
        )}
      </div>
    </div>
  );

  if (inModal) {
    return (
      <div className="flex min-h-0 flex-1 flex-col">
        <div className="border-b px-[1.5rem] py-3">{picker}</div>
        <div className="flex-1 overflow-y-auto px-[1.5rem] py-[1.25rem]">{body}</div>
        <div className="border-t px-[1.5rem] py-4">{footer}</div>
      </div>
    );
  }
  return (
    <div className="space-y-[1.25rem]">
      {picker}
      <div className="lab-edge rounded-2xl border bg-card p-[1.25rem] sm:p-[1.5rem]">{body}</div>
      {footer}
    </div>
  );
}
