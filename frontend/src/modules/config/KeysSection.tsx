'use client';

import React, { useState, type ReactNode } from 'react';
import Icon from '@/components/ui/AppIcon';
import {
  DEFAULT_OPENROUTER_URL,
  KEY_FIELDS,
  PROVIDER_BY_KEY,
  hostOf,
  providerOfChoice,
  type ProviderKey,
} from './catalog';
import { useConfig } from './ConfigContext';
import {
  CODE,
  GetKeyLink,
  GroupHeading,
  KeyInput,
  Notice,
  SecretInput,
  SectionHeader,
  SettingField,
  type SecretField,
} from './parts';

const YOUTUBE_FIELD: SecretField = {
  key: 'youtubeApiKey',
  label: 'YouTube Data API key',
  placeholder: 'AIzaSy…',
  getKeyUrl: 'https://console.cloud.google.com/apis/library/youtube.googleapis.com',
};

export default function KeysSection() {
  const { settings, edit, aiDefault, focusTarget } = useConfig();
  const inUse = new Set<ProviderKey | undefined>([
    providerOfChoice(settings.textGenerationModel, settings, aiDefault),
    providerOfChoice(settings.answerModel, settings, aiDefault),
  ]);

  // Open the providers in use (and the one a "fix" link pointed at); the rest stay one tidy line each.
  const [open, setOpen] = useState<Set<string>>(() => {
    const s = new Set<string>();
    KEY_FIELDS.forEach((f) => {
      if (inUse.has(f.provider)) s.add(f.key);
    });
    if (focusTarget?.startsWith('keys-')) s.add(focusTarget.slice('keys-'.length));
    return s;
  });
  const toggle = (key: string) =>
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  return (
    <div>
      <SectionHeader
        title="API keys"
        sub="Add a key for each provider you want to use. You only need the ones for the models you pick."
      />

      <div className="space-y-[2rem]">
        <Notice icon="ShieldCheckIcon">
          <p className="text-[13px] leading-relaxed text-muted-foreground">
            <span className="font-semibold text-foreground">Keys stay in this browser.</span> They
            go along with each AI request and are never saved on the server, so they don&apos;t sync
            to your other devices, and clearing this site&apos;s data removes them.
          </p>
        </Notice>

        <section aria-labelledby="cfg-ai-keys">
          <GroupHeading id="cfg-ai-keys" title="AI providers" />
          <div className="cfg-group">
            {KEY_FIELDS.map((field) => (
              <KeyItem
                key={field.key}
                id={field.key}
                icon={PROVIDER_BY_KEY[field.provider].icon}
                title={
                  field.provider === 'Custom' ? 'Other APIs' : PROVIDER_BY_KEY[field.provider].name
                }
                subtitle={inUse.has(field.provider) ? 'Used by your model' : undefined}
                added={
                  !!settings[field.key].trim() ||
                  (field.provider === 'Custom' &&
                    Object.values(settings.endpointKeys).some((k) => k.trim()))
                }
                open={open.has(field.key)}
                onToggle={() => toggle(field.key)}
              >
                {field.provider !== 'Custom' && (
                  <KeyInput field={field} id={`keys-${field.key}`} hideLabel />
                )}

                {field.provider === 'OpenRouter' && (
                  <SettingField
                    id="keys-openrouterUrl"
                    label="Base URL"
                    field="openrouterUrl"
                    placeholder={DEFAULT_OPENROUTER_URL}
                    hint="Change it only for an OpenRouter proxy or a compatible service."
                    trailing={
                      settings.openrouterUrl !== DEFAULT_OPENROUTER_URL ? (
                        <button
                          type="button"
                          onClick={() => edit({ openrouterUrl: DEFAULT_OPENROUTER_URL })}
                          className="todo-focus rounded-sm text-xs font-semibold lab-ink hover:underline"
                        >
                          Reset
                        </button>
                      ) : undefined
                    }
                  />
                )}

                {field.provider === 'Custom' && <EndpointKeys />}
              </KeyItem>
            ))}
          </div>
        </section>

        <section aria-labelledby="cfg-other-keys">
          <GroupHeading id="cfg-other-keys" title="Optional" />
          <div className="cfg-group">
            <KeyItem
              id="youtubeApiKey"
              icon="PlayCircleIcon"
              title="YouTube"
              subtitle="Adds a video’s title and description to questions made from it"
              added={!!settings.youtubeApiKey.trim()}
              open={open.has('youtubeApiKey') || focusTarget === 'keys-youtubeApiKey'}
              onToggle={() => toggle('youtubeApiKey')}
            >
              <KeyInput field={YOUTUBE_FIELD} id="keys-youtubeApiKey" hideLabel />
              <p className="text-xs leading-relaxed text-muted-foreground">
                The transcript is always fetched without a key, so this is optional. To make one,
                open <GetKeyLink href={YOUTUBE_FIELD.getKeyUrl!}>Google Cloud Console</GetKeyLink>,
                enable YouTube Data API v3, then create an API key under Credentials.
              </p>
            </KeyItem>
          </div>
        </section>
      </div>
    </div>
  );
}

/**
 * Keys for the endpoints the user added (browser only), plus the single endpoint from before endpoints could be
 * added, when it is set up.
 */
function EndpointKeys() {
  const { settings, edit, goTo } = useConfig();
  const endpoints = settings.customModels.filter((m) => m.provider === 'custom');
  const legacy = !!(
    settings.customBaseUrl.trim() ||
    settings.customModel.trim() ||
    settings.customKey.trim()
  );
  const legacyField = KEY_FIELDS.find((f) => f.provider === 'Custom')!;

  if (endpoints.length === 0 && !legacy) {
    return (
      <div className="space-y-2">
        <p className="text-[13px] leading-snug text-muted-foreground">
          None yet. Add one under AI model: open Other API and tap +.
        </p>
        <button
          type="button"
          onClick={() => goTo('model')}
          className="todo-btn todo-btn-quiet h-9 px-4"
        >
          Go to AI model
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {endpoints.map((ep) => (
        <div key={ep.id} className="space-y-1.5">
          <label
            htmlFor={`keys-ep-${ep.id}`}
            className="block text-[13px] font-semibold text-foreground"
          >
            {ep.name || ep.model}{' '}
            <span className="font-normal text-muted-foreground">{hostOf(ep.baseUrl ?? '')}</span>
          </label>
          <SecretInput
            id={`keys-ep-${ep.id}`}
            value={settings.endpointKeys[ep.id] ?? ''}
            onChange={(v) => edit({ endpointKeys: { ...settings.endpointKeys, [ep.id]: v } })}
            placeholder="Optional for local servers"
          />
        </div>
      ))}
      {legacy && (
        <div className="space-y-4 border-t pt-4">
          <p className="text-[13px] font-semibold text-foreground">Earlier endpoint</p>
          <KeyInput field={legacyField} id="keys-customKey" />
          <SettingField
            id="keys-customBaseUrl"
            label="Base URL"
            field="customBaseUrl"
            placeholder="https://api.together.xyz/v1"
            hint={
              <>
                Any server with an OpenAI-style <code className={CODE}>/chat/completions</code>.
              </>
            }
          />
          <SettingField
            id="keys-customModel"
            label="Model ID"
            field="customModel"
            placeholder="meta-llama/Llama-3.3-70B-Instruct-Turbo"
          />
        </div>
      )}
    </div>
  );
}

/** One provider: a single line with its status; tap to add or change the key. */
function KeyItem({
  id,
  icon,
  title,
  subtitle,
  added,
  open,
  onToggle,
  children,
}: {
  id: string;
  icon: string;
  title: string;
  subtitle?: string;
  added: boolean;
  open: boolean;
  onToggle: () => void;
  children: ReactNode;
}) {
  const bodyId = `keys-body-${id}`;
  return (
    <div className="cfg-item">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={bodyId}
        onClick={onToggle}
        className="cfg-row cfg-row-icon"
      >
        <span className="drawer-icon" aria-hidden="true">
          <Icon name={icon} size={17} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-[15px] font-medium leading-snug text-foreground">
            {title}
          </span>
          {subtitle && (
            <span className="mt-0.5 block text-[13px] leading-snug text-muted-foreground">
              {subtitle}
            </span>
          )}
        </span>
        {added ? (
          <span className="inline-flex shrink-0 items-center gap-1 text-[13px] font-medium text-success">
            <Icon name="CheckCircleIcon" size={15} variant="solid" />
            Added
          </span>
        ) : (
          <span className="shrink-0 text-[13px] text-muted-foreground">Not set</span>
        )}
        <Icon
          name="ChevronDownIcon"
          size={16}
          className={`drawer-chevron transition-transform duration-200 ${open ? 'rotate-180' : ''}`}
        />
      </button>
      {open && (
        <div id={bodyId} className="cfg-item-body space-y-4">
          {children}
        </div>
      )}
    </div>
  );
}
