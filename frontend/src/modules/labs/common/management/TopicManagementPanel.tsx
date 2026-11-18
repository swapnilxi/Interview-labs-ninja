'use client';

import { useId, useState } from 'react';
import Link from 'next/link';
import Icon from '@/components/ui/AppIcon';
import AutoSaveStatus from '@/components/ui/AutoSaveStatus';
import { useAutoSave } from '@/lib/ui/useAutoSave';
import type { SectionSettings } from '@/lib/services/labSectionsService';
import { LABS_CONFIG } from '@/modules/labs/common/labSectionDefaults';
import { Field, presetChip, settingsTextarea } from '@/modules/labs/common/settingsUi';
import { topicSettingsId, useLabSettings } from '@/modules/labs/common/useLabSettings';
import type { LabCatalog } from './useLabCatalog';
import { capitalize, manageHref, type LabManagementConfig, type ManagedTopic } from './types';

const CONTEXT_MAX = 2000;
const ADDON_MAX = 2000;

const card = 'lab-edge rounded-2xl border bg-card';
const rowClass = 'flex flex-wrap items-center justify-between gap-x-4 gap-y-2 px-4 py-3';

/**
 * Topic management: one topic. Where it sits (its pattern), who sees it, the context its sections are written with,
 * and removing it. The topic comes from the address (`?topic=`); without one the panel asks which topic.
 */
export default function TopicManagementPanel<T extends ManagedTopic>({
  config,
  catalog,
  topicId,
  subId,
  onPickTopic,
  onRemoved,
}: {
  config: LabManagementConfig;
  catalog: LabCatalog<T>;
  topicId: string;
  subId: string;
  onPickTopic: (id: string) => void;
  onRemoved: () => void;
}) {
  const settings = useLabSettings(config.lab);
  const { one } = config.groupNoun;
  const topic = catalog.topicById(topicId);
  const [confirming, setConfirming] = useState(false);

  if (!catalog.ready)
    return <p className="py-[2rem] text-center text-sm text-muted-foreground">Loading…</p>;

  const picker = (
    <label className="flex min-w-0 items-center gap-2 text-sm text-muted-foreground">
      <span className="flex-shrink-0">Topic</span>
      <select
        value={topic?.id ?? ''}
        onChange={(e) => onPickTopic(e.target.value)}
        aria-label="Choose the topic to manage"
        className="todo-input todo-input-quiet min-w-0 px-2.5 py-1.5 text-sm text-foreground sm:w-[18rem]"
      >
        {!topic && (
          <option value="" disabled>
            Choose a topic
          </option>
        )}
        {catalog.patterns.map((pattern) => (
          <optgroup key={pattern} label={pattern}>
            {catalog.topics
              .filter((t) => t.category === pattern)
              .map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
          </optgroup>
        ))}
      </select>
    </label>
  );

  if (!topic) {
    return (
      <div className={`${card} p-[1.5rem]`}>
        <h2 className="text-[15px] font-semibold text-foreground">Choose a topic</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Open a topic in the lab, or pick one here, to manage it.
        </p>
        <div className="mt-4">{picker}</div>
      </div>
    );
  }

  const mine = Boolean(topic.isCustom) && !topic.isShared;
  const visibility = !topic.isCustom
    ? topic.isModified
      ? 'Everyone, with your own changes'
      : 'Everyone'
    : topic.isShared
      ? 'Everyone'
      : 'Only you';

  return (
    <div className="space-y-[1.5rem]">
      <header className="flex flex-wrap items-start justify-between gap-x-4 gap-y-3">
        <div className="min-w-0 flex-1">
          <p className="text-[13px] text-muted-foreground">{topic.category}</p>
          <h2 className="mt-0.5 break-words font-heading text-[1.375rem] font-semibold leading-tight tracking-[-0.018em] text-foreground">
            {topic.name}
          </h2>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          {picker}
          <Link
            href={`${config.labPath}?${new URLSearchParams({ topic: topic.id, ...(subId ? { sub: subId } : {}) })}`}
            className="todo-btn todo-btn-secondary"
          >
            Open topic
            <Icon name="ArrowRightIcon" size={14} />
          </Link>
        </div>
      </header>

      {catalog.error && (
        <p role="alert" className="text-sm text-error">
          {catalog.error}
        </p>
      )}

      {/* Where it sits and who sees it */}
      <section aria-label="Placement" className={`${card} divide-y`}>
        <div className={rowClass}>
          <div className="min-w-0">
            <p className="text-[13px] font-medium text-foreground">{capitalize(one)}</p>
            <p className="text-xs text-muted-foreground">
              {topic.isShared && !catalog.isAdmin
                ? `Moving it changes your own view only`
                : `The ${one} this topic is listed under`}
            </p>
          </div>
          {config.can.move ? (
            <select
              value={topic.category}
              onChange={(e) => void catalog.moveTopic(topic, e.target.value)}
              aria-label={`Move this topic to another ${one}`}
              className="todo-input todo-input-quiet w-full px-2.5 py-1.5 text-sm sm:w-[16rem]"
            >
              {catalog.patterns.map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          ) : (
            <span className="text-sm text-foreground">{topic.category}</span>
          )}
        </div>

        <div className={rowClass}>
          <div className="min-w-0">
            <p className="text-[13px] font-medium text-foreground">Who sees it</p>
            <p className="text-xs text-muted-foreground">{visibility}</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {topic.isModified && (
              <button
                type="button"
                onClick={() => void catalog.resetTopic(topic)}
                className="todo-btn todo-btn-secondary"
              >
                Reset to the shared version
              </button>
            )}
            {config.can.share && catalog.isAdmin && mine && (
              <button
                type="button"
                onClick={() => void catalog.shareTopic(topic)}
                className="todo-btn todo-btn-secondary"
              >
                Share with everyone
              </button>
            )}
          </div>
        </div>
      </section>

      {/* The add-on and context its sections are written with */}
      {settings.loaded ? (
        <TopicInstructions
          key={topic.id}
          config={config}
          topic={topic}
          initial={settings.topic(topic.id)}
          labWide={settings.labWide}
        />
      ) : (
        <p className="py-[1rem] text-center text-sm text-muted-foreground">Loading…</p>
      )}

      {/* Removing */}
      {catalog.canRemove(topic) && (
        <section aria-label="Remove topic" className={`${card} ${rowClass}`}>
          <div className="min-w-0">
            <p className="text-[13px] font-medium text-foreground">Remove this topic</p>
            <p className="text-xs text-muted-foreground">
              {topic.isShared ? 'It disappears for everyone.' : 'It disappears from your lab.'}{' '}
              Sections already written for it are not shown any more.
            </p>
          </div>
          {confirming ? (
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={async () => {
                  if (await catalog.removeTopic(topic)) onRemoved();
                  else setConfirming(false);
                }}
                className="todo-btn todo-btn-secondary text-error"
              >
                Remove “{topic.name}”
              </button>
              <button
                type="button"
                onClick={() => setConfirming(false)}
                className="todo-btn todo-btn-quiet"
              >
                Cancel
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setConfirming(true)}
              className="todo-btn todo-btn-secondary text-error"
            >
              Remove topic
            </button>
          )}
        </section>
      )}
    </div>
  );
}

/** How the topic's sections are written: an add-on and context about you, saved together as the person types. */
function TopicInstructions({
  config,
  topic,
  initial,
  labWide,
}: {
  config: LabManagementConfig;
  topic: ManagedTopic;
  initial: SectionSettings;
  labWide: SectionSettings;
}) {
  const settings = useLabSettings(config.lab);
  const ids = { addon: useId(), context: useId() };
  const [addon, setAddon] = useState(initial.addon);
  const [context, setContext] = useState(initial.context);
  const autosave = useAutoSave<{ addon: string; context: string }>(async (v) => {
    await settings.save(topicSettingsId(topic.id), {
      prompt: '',
      addon: v.addon.trim(),
      context: v.context.trim(),
    });
  }, 900);
  const edit = (patch: Partial<{ addon: string; context: string }>) => {
    const next = { addon: patch.addon ?? addon, context: patch.context ?? context };
    setAddon(next.addon);
    setContext(next.context);
    autosave.schedule(next);
  };
  const toggleAddon = (text: string) =>
    edit({
      addon: addon.includes(text)
        ? addon
            .replace(text, '')
            .replace(/\n{2,}/g, '\n')
            .trim()
        : addon.trim()
          ? `${addon.trim()}\n${text}`
          : text,
    });

  return (
    <section
      aria-label="Instructions for this topic"
      className={`${card} p-[1.25rem] sm:p-[1.5rem]`}
    >
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-1">
        <div className="min-w-0">
          <h3 className="text-[15px] font-semibold text-foreground">How this topic is written</h3>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Added to every section written for it, after the lab-wide settings.
          </p>
        </div>
        <AutoSaveStatus state={autosave.state} error={autosave.error} onRetry={autosave.retry} />
      </div>

      <div className="mt-[1.25rem]">
        <p className="text-[13px] font-medium text-foreground">Suggested add-ons</p>
        <div className="mt-2 flex flex-wrap gap-2">
          {LABS_CONFIG[config.lab].defaultPromptAddons.map((item) => {
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

      <div className="mt-[1.25rem] space-y-[1.25rem]">
        <Field
          id={ids.addon}
          label="Add-on for this topic"
          help="Extra instructions added to every section of this topic, such as “always include a worked example”"
          aside={
            <span className="text-xs tabular-nums text-muted-foreground">
              {addon.length.toLocaleString()} / 2,000
            </span>
          }
        >
          <textarea
            id={ids.addon}
            value={addon}
            onChange={(e) => edit({ addon: e.target.value })}
            maxLength={ADDON_MAX}
            rows={4}
            placeholder="Compare it with the classical method, and end each section with one practice question"
            className={settingsTextarea}
          />
        </Field>
        <Field
          id={ids.context}
          label="Context for this topic"
          help="What you already know and what you want from it"
          aside={
            <span className="text-xs tabular-nums text-muted-foreground">
              {context.length.toLocaleString()} / 2,000
            </span>
          }
        >
          <textarea
            id={ids.context}
            value={context}
            onChange={(e) => edit({ context: e.target.value })}
            maxLength={CONTEXT_MAX}
            rows={5}
            placeholder="I know the brute force already. Spend the time on the optimal approach and the follow-ups an interviewer asks."
            className={settingsTextarea}
          />
        </Field>
      </div>

      {(labWide.addon.trim() || labWide.context.trim()) && (
        <p className="mt-3 text-xs text-muted-foreground">
          The whole lab’s settings also apply.{' '}
          <Link href={manageHref(config, { view: 'prompts' })} className="lab-ink hover:underline">
            Edit them
          </Link>
        </p>
      )}
    </section>
  );
}
