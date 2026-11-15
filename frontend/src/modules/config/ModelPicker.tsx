'use client';

import React, { useEffect, useRef, useState } from 'react';
import Icon from '@/components/ui/AppIcon';
import { API_BASE_URL } from '@/lib/http/apiClient';
import { userModelValue, type UserModel, type UserSettings } from '@/lib/services/settingsService';
import {
  KEY_FIELD_BY_PROVIDER,
  MODEL_ID_EXAMPLES,
  PROVIDERS,
  PROVIDER_BY_KEY,
  PROVIDER_OF_SLUG,
  SLUG_OF,
  alreadyListed,
  describeEnvDefault,
  envPinnedOllamaModel,
  findUserModel,
  hostOf,
  isOllamaId,
  newUserModelId,
  ollamaModelName,
  routeNote,
  tabOf,
  userModelsFor,
  type ProviderKey,
  type ProviderTab,
  type Tier,
} from './catalog';
import { useConfig } from './ConfigContext';
import {
  CODE,
  FIELD,
  GroupHeading,
  KeyInput,
  Notice,
  SecretInput,
  SettingField,
  TierChip,
} from './parts';

const IS_FASTAPI_MODE = API_BASE_URL !== '';
const MAX_ADDED = 100;
const URL_RE = /^https?:\/\/\S+$/;

interface Row {
  key: string;
  value: string;
  /** Ollama rows: the model name that goes into settings.ollamaModel. */
  ollamaModel?: string;
  name: string;
  note: string;
  tier?: Tier;
  recommended?: boolean;
  tab: ProviderTab;
  /** Rows the user added can be removed. */
  added?: UserModel;
}

interface ModelPickerProps {
  /** Prefix for element ids (two pickers can be on screen). */
  idBase: string;
  value: string;
  onPick: (model: string, ollamaModel?: string) => void;
  tab: ProviderTab;
  onTab: (tab: ProviderTab) => void;
  /** Show the open provider's setup (its key, server address…) under the list. Only the main picker does. */
  withSetup?: boolean;
}

/** Every row a tab lists: the built-in models, then the ones the user added. */
function useRows() {
  const { settings, aiDefault, ollama } = useConfig();
  const envDefault = describeEnvDefault(aiDefault, settings.ollamaModel);
  const serverDefaultRow = (tab: ProviderTab): Row => ({
    key: 'server-default',
    value: '',
    name: 'Server default',
    note:
      aiDefault === undefined
        ? 'Checking the server…'
        : `Right now: ${envDefault?.label ?? 'server not reachable'}`,
    tab,
  });

  return (tab: ProviderTab, value: string): Row[] => {
    if (tab === 'Default') {
      const list = [serverDefaultRow('Default')];
      // A saved id nothing lists any more still shows, so it can be seen and replaced.
      if (value && tabOf(value, settings) === 'Default' && !isOllamaId(value)) {
        list.push({
          key: value,
          value,
          name: value,
          note: 'Saved earlier; no longer in the list',
          tab,
        });
      }
      return list;
    }

    // The server's own pick also heads the list of the provider it resolves to.
    const head = envDefault?.providerKey === tab ? [serverDefaultRow(tab)] : [];

    if (tab === 'Ollama') {
      const addedNames = userModelsFor('Ollama', settings);
      // Pulled models in Ollama's own order (so a pick doesn't reorder the list), then added and typed names.
      const names = Array.from(
        new Set(
          [
            ...ollama.models,
            ...(ollama.status?.models.map((m) => m.name) ?? []),
            ...addedNames.map((m) => m.model),
            settings.ollamaModel,
          ].filter(Boolean)
        )
      );
      if (names.length === 0) {
        return [
          ...head,
          {
            key: 'ollama',
            value: 'ollama',
            ollamaModel: '',
            name: 'Ollama model',
            note: 'Type its name below',
            tier: 'free',
            tab,
          },
        ];
      }
      return [
        ...head,
        ...names.map((name) => {
          const size = ollama.status?.models.find((m) => m.name === name)?.size_gb;
          const added = addedNames.find((m) => m.model === name);
          return {
            key: `ollama:${name}`,
            value: 'ollama',
            ollamaModel: name,
            name: added?.name || name,
            note: size ? `${size} GB on this computer` : 'On this computer',
            tier: 'free' as Tier,
            tab,
            added,
          };
        }),
      ];
    }

    if (tab === 'Custom') {
      const legacy =
        settings.customBaseUrl.trim() || settings.customModel.trim() || value === 'custom'
          ? [
              {
                key: 'custom',
                value: 'custom',
                name: settings.customModel || 'Your endpoint',
                note: settings.customBaseUrl ? hostOf(settings.customBaseUrl) : 'No address yet',
                tab,
              },
            ]
          : [];
      return [
        ...head,
        ...legacy,
        ...userModelsFor('Custom', settings).map((m) => ({
          key: m.id,
          value: userModelValue(m),
          name: m.name || m.model,
          note: `${hostOf(m.baseUrl ?? '')}${m.name ? ` · ${m.model}` : ''}`,
          tab,
          added: m,
        })),
      ];
    }

    return [
      ...head,
      ...PROVIDER_BY_KEY[tab].models.map((m) => ({
        key: m.id,
        value: m.id,
        name: m.name,
        note: m.note,
        tier: m.tier,
        recommended: m.recommended,
        tab,
      })),
      ...userModelsFor(tab, settings).map((m) => ({
        key: m.id,
        value: userModelValue(m),
        name: m.name || m.model,
        note: m.name ? m.model : '',
        tab,
        added: m,
      })),
    ];
  };
}

const TABS: { key: ProviderTab; name: string; icon: string }[] = [
  { key: 'Default', name: 'Server default', icon: 'ServerStackIcon' },
  ...PROVIDERS.map((p) => ({ key: p.key as ProviderTab, name: p.name, icon: p.icon })),
];

const tabName = (tab: ProviderTab) => (tab === 'Default' ? 'Server' : PROVIDER_BY_KEY[tab].name);

/**
 * Search, then two steps on one surface: choose a provider (chips), then a model from its list. Anyone can add a
 * model to a provider's list or an OpenAI-compatible endpoint of their own; those sync to their account. The main
 * picker also shows the provider's setup under the list, so choosing a model and adding its key happen together.
 */
export default function ModelPicker({
  idBase,
  value,
  onPick,
  tab,
  onTab,
  withSetup = false,
}: ModelPickerProps) {
  const { settings, edit } = useConfig();
  const rowsOf = useRows();
  const [query, setQuery] = useState('');
  const currentTab = tabOf(value, settings);

  const q = query.trim().toLowerCase();
  const searching = q.length > 0;
  const results: Row[] = searching
    ? TABS.flatMap((t) => rowsOf(t.key, value))
        .filter((r, i, all) => all.findIndex((o) => o.key === r.key && o.tab === r.tab) === i)
        .filter((r) => r.tab !== 'Default' || r.value !== '' || 'server default'.includes(q))
        .filter((r) =>
          [r.name, r.note, r.value, r.ollamaModel ?? '', tabName(r.tab)].some((t) =>
            t.toLowerCase().includes(q)
          )
        )
        // The server-default row appears in two tabs; keep one.
        .filter((r, i, all) => r.value !== '' || all.findIndex((o) => o.value === '') === i)
    : [];
  const rows = searching ? results : rowsOf(tab, value);

  const isChecked = (row: Row) => {
    if (row.ollamaModel !== undefined) {
      if (!isOllamaId(value)) return false;
      return (ollamaModelName(value, settings.ollamaModel) ?? '') === row.ollamaModel;
    }
    return row.value === value;
  };

  const pick = (row: Row) => {
    onPick(row.value, row.ollamaModel);
    if (searching) {
      onTab(row.tab);
      setQuery('');
    }
  };

  const remove = (m: UserModel) => {
    const label = m.name || m.model;
    if (
      !window.confirm(
        `Remove “${label}”${m.provider === 'custom' ? ' and its key' : ''} from your list?`
      )
    )
      return;
    const removedValue = userModelValue(m);
    const patch: Partial<UserSettings> = {
      customModels: settings.customModels.filter((x) => x.id !== m.id),
    };
    if (m.provider === 'custom') {
      const keys = { ...settings.endpointKeys };
      delete keys[m.id];
      patch.endpointKeys = keys;
    }
    // A removed model can't stay chosen (except an Ollama name, which still runs if it's pulled).
    if (m.provider !== 'ollama') {
      if (settings.textGenerationModel === removedValue) patch.textGenerationModel = '';
      if (settings.answerModel === removedValue) patch.answerModel = '';
    }
    edit(patch);
  };

  // The + row adds to the open provider; while searching it offers the typed text (unless it's already listed).
  const addTab: ProviderKey | null = tab === 'Default' ? null : tab;
  const exactMatch = rows.some((r) =>
    [r.name, r.value, r.ollamaModel ?? '', r.added?.model ?? ''].some((t) => t.toLowerCase() === q)
  );
  const showAdd = !!addTab && (!searching || !exactMatch);
  const added = (m: UserModel) => {
    setQuery('');
    onTab(PROVIDER_OF_SLUG[m.provider]);
    onPick(userModelValue(m), m.provider === 'ollama' ? m.model : undefined);
  };

  const listId = `${idBase}-models`;
  const blurb =
    tab === 'Default'
      ? 'Let the server choose. It uses AI_PROVIDER and AI_MODEL from its .env file.'
      : PROVIDER_BY_KEY[tab].blurb;

  return (
    <div className="space-y-3">
      <div className="relative">
        <Icon
          name="MagnifyingGlassIcon"
          size={17}
          className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground"
        />
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Escape') setQuery('');
          }}
          placeholder="Search models"
          aria-label="Search models"
          aria-controls={listId}
          autoComplete="off"
          spellCheck={false}
          className={`${FIELD} todo-input-quiet pl-[2.5rem]`}
        />
      </div>

      {!searching && (
        <>
          <div role="group" aria-label="Provider" className="flex flex-wrap gap-1.5">
            {TABS.map((t) => (
              <button
                key={t.key}
                type="button"
                aria-pressed={tab === t.key}
                aria-controls={listId}
                onClick={() => onTab(t.key)}
                className="cfg-chip"
              >
                <Icon name={t.icon} size={15} />
                {t.name}
                {currentTab === t.key && (
                  <Icon
                    name="CheckCircleIcon"
                    size={14}
                    variant="solid"
                    className="cfg-chip-current"
                    aria-label="(in use)"
                  />
                )}
              </button>
            ))}
          </div>
          <p className="px-1 text-[13px] leading-snug text-muted-foreground">{blurb}</p>
        </>
      )}

      {searching && (
        <p className="px-1 text-[13px] text-muted-foreground" role="status">
          {results.length === 0
            ? addTab
              ? `No models match “${query.trim()}”. Add it to ${PROVIDER_BY_KEY[addTab].name} below.`
              : `No models match “${query.trim()}”. To add it, clear the search, open its provider and tap +.`
            : `${results.length} ${results.length === 1 ? 'model matches' : 'models match'}.`}
        </p>
      )}

      {(rows.length > 0 || showAdd) && (
        <div
          id={listId}
          role="radiogroup"
          aria-label={searching ? 'Search results' : 'Model'}
          className="cfg-group"
        >
          {rows.map((row) => (
            <div key={`${row.tab}:${row.key}`} className="cfg-row cfg-row-radio cfg-row-split">
              <button
                type="button"
                role="radio"
                aria-checked={isChecked(row)}
                onClick={() => pick(row)}
                className="cfg-row-main"
              >
                <span className="cfg-radio" aria-hidden="true" />
                <span className="min-w-0 flex-1">
                  <span className="block break-words text-[15px] font-medium leading-snug text-foreground">
                    {row.name}
                  </span>
                  <span className="mt-0.5 block break-words text-[13px] leading-snug text-muted-foreground">
                    {searching && (
                      <span className="font-medium text-foreground">{tabName(row.tab)} · </span>
                    )}
                    {row.recommended && (
                      <span className="font-semibold lab-ink">Recommended. </span>
                    )}
                    {row.note}
                  </span>
                </span>
                {row.added ? (
                  <span className="cfg-tier cfg-tag-custom">Custom</span>
                ) : (
                  <TierChip tier={row.tier} />
                )}
              </button>
              {row.added && (
                <button
                  type="button"
                  onClick={() => remove(row.added!)}
                  className="cfg-row-remove"
                  aria-label={`Remove ${row.name}`}
                  title="Remove from your list"
                >
                  <Icon name="TrashIcon" size={16} />
                </button>
              )}
            </div>
          ))}
          {showAdd && addTab && (
            <AddRow
              key={`${addTab}:${searching ? q : ''}`}
              idBase={idBase}
              provider={addTab}
              prefill={searching ? query.trim() : ''}
              onAdded={added}
            />
          )}
        </div>
      )}

      {withSetup && !searching && <ProviderSetup tab={tab} idBase={idBase} value={value} />}
    </div>
  );
}

/**
 * The list's last row: a + that turns into a field right there. Type the model ID, press Enter (or Add) and it joins
 * this provider's list, tagged "Custom" and synced to the account. For "Other API" it also asks for the address and
 * an optional key (the key stays in this browser). While searching, it adds the typed text in one tap.
 */
function AddRow({
  idBase,
  provider,
  prefill,
  onAdded,
}: {
  idBase: string;
  provider: ProviderKey;
  prefill: string;
  onAdded: (m: UserModel) => void;
}) {
  const { settings, edit } = useConfig();
  const isEndpoint = provider === 'Custom';
  const [open, setOpen] = useState(false);
  const [model, setModel] = useState(prefill);
  const [baseUrl, setBaseUrl] = useState('');
  const [key, setKey] = useState('');
  const [error, setError] = useState('');
  const firstField = useRef<HTMLInputElement | null>(null);
  const id = (f: string) => `${idBase}-add-${f}`;
  const providerName = PROVIDER_BY_KEY[provider].name;

  useEffect(() => {
    if (open) firstField.current?.focus();
  }, [open]);

  const close = () => {
    setOpen(false);
    setModel(prefill);
    setBaseUrl('');
    setKey('');
    setError('');
  };

  const add = (rawModel: string) => {
    const m = rawModel.trim();
    const url = baseUrl.trim();
    if (!m) return setError('Type the model ID, exactly as the provider names it.');
    if (m.length > 200) return setError('That model ID is too long (200 characters at most).');
    if (isEndpoint && !URL_RE.test(url))
      return setError('The address must start with http:// or https://.');
    if (isEndpoint && url.length > 500)
      return setError('That address is too long (500 characters at most).');
    if (alreadyListed(provider, m, settings))
      return setError(`${m} is already in the ${providerName} list.`);
    if (settings.customModels.length >= MAX_ADDED)
      return setError(`You can add up to ${MAX_ADDED} models.`);
    const entry: UserModel = {
      id: newUserModelId(),
      provider: SLUG_OF[provider],
      model: m,
      ...(isEndpoint ? { baseUrl: url } : {}),
    };
    const patch: Partial<UserSettings> = { customModels: [...settings.customModels, entry] };
    if (isEndpoint && key.trim())
      patch.endpointKeys = { ...settings.endpointKeys, [entry.id]: key.trim() };
    edit(patch);
    close();
    onAdded(entry);
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.stopPropagation();
      close();
    }
  };

  if (!open) {
    const oneTap = prefill && !isEndpoint;
    return (
      <button
        type="button"
        onClick={() => {
          setError('');
          if (oneTap) add(prefill);
          else setOpen(true);
        }}
        className="cfg-row cfg-row-add"
      >
        <Icon name="PlusCircleIcon" size={22} variant="solid" className="shrink-0" />
        <span className="min-w-0 flex-1 break-words">
          {prefill
            ? `Add “${prefill}” to ${providerName}`
            : isEndpoint
              ? 'Add an API'
              : 'Add model'}
        </span>
        {error && <span className="text-[13px] font-medium text-error">{error}</span>}
      </button>
    );
  }

  const note = routeNote(provider, model);
  return (
    <form
      className="cfg-row cfg-add-form"
      onSubmit={(e) => {
        e.preventDefault();
        add(model);
      }}
      onKeyDown={onKeyDown}
      noValidate
    >
      {isEndpoint && (
        <>
          <label htmlFor={id('url')} className="sr-only">
            API address
          </label>
          <input
            id={id('url')}
            ref={firstField}
            type="url"
            inputMode="url"
            autoComplete="off"
            spellCheck={false}
            value={baseUrl}
            onChange={(e) => {
              setBaseUrl(e.target.value);
              setError('');
            }}
            placeholder="Address, e.g. https://api.together.xyz/v1"
            className="cfg-add-input"
          />
        </>
      )}
      <div className="flex items-center gap-2">
        <Icon name="PlusCircleIcon" size={22} variant="solid" className="cfg-add-icon shrink-0" />
        <label htmlFor={id('model')} className="sr-only">
          Model ID
        </label>
        <input
          id={id('model')}
          ref={isEndpoint ? undefined : firstField}
          type="text"
          autoComplete="off"
          autoCapitalize="off"
          spellCheck={false}
          enterKeyHint="done"
          value={model}
          onChange={(e) => {
            setModel(e.target.value);
            setError('');
          }}
          placeholder={`Model ID, e.g. ${MODEL_ID_EXAMPLES[provider]}`}
          className="cfg-add-input min-w-0 flex-1 font-code"
        />
        <button type="submit" className="todo-btn todo-btn-primary h-9 shrink-0 px-4">
          Add
        </button>
        <button
          type="button"
          onClick={close}
          className="cfg-row-remove mr-0"
          aria-label="Cancel adding a model"
        >
          <Icon name="XMarkIcon" size={18} />
        </button>
      </div>
      {isEndpoint && (
        <>
          <label htmlFor={id('key')} className="sr-only">
            API key (optional)
          </label>
          <SecretInput
            id={id('key')}
            value={key}
            onChange={setKey}
            placeholder="API key (optional, stays in this browser)"
          />
        </>
      )}
      {(error || note) && (
        <p
          role={error ? 'alert' : undefined}
          className={`text-xs leading-snug ${error ? 'font-medium text-error' : 'text-muted-foreground'}`}
        >
          {error || note}
        </p>
      )}
    </form>
  );
}

/** What the open provider needs before its models work: a key, a server address, nothing at all. */
function ProviderSetup({
  tab,
  idBase,
  value,
}: {
  tab: ProviderTab;
  idBase: string;
  value: string;
}) {
  const { aiDefault, settings } = useConfig();

  if (tab === 'Default') {
    return (
      <div className="space-y-2">
        <Notice>
          <p className="text-[13px] leading-relaxed text-muted-foreground">
            To change it, edit <code className={CODE}>AI_PROVIDER</code> and{' '}
            <code className={CODE}>AI_MODEL</code> in{' '}
            <code className={CODE}>{IS_FASTAPI_MODE ? 'backend/.env' : 'frontend/.env'}</code> and
            restart the server. A model you pick here always wins over it.
          </p>
        </Notice>
        {aiDefault?.warning && (
          <Notice tone="warn">
            <p className="text-[13px] leading-relaxed text-foreground">{aiDefault.warning}</p>
          </Notice>
        )}
      </div>
    );
  }

  if (tab === 'Vertex') {
    return (
      <Notice>
        <p className="text-[13px] leading-relaxed text-muted-foreground">
          Vertex uses the server&apos;s Google Cloud project (
          <code className={CODE}>VERTEX_PROJECT_ID</code> and its credentials). There is nothing to
          add in this browser.
        </p>
      </Notice>
    );
  }

  if (tab === 'Ollama') return <OllamaSetup idBase={idBase} />;

  if (tab === 'Custom') {
    const endpoint = findUserModel(value, settings);
    if (endpoint?.provider === 'custom') {
      return <EndpointEditor key={endpoint.id} idBase={idBase} endpoint={endpoint} />;
    }
    if (value === 'custom') return <LegacyEndpointSetup idBase={idBase} />;
    return null;
  }

  const keyField = KEY_FIELD_BY_PROVIDER[tab];
  if (!keyField) return null;
  return (
    <section aria-labelledby={`${idBase}-setup`} className="cfg-panel space-y-4">
      <GroupHeading
        id={`${idBase}-setup`}
        title={`${PROVIDER_BY_KEY[tab].name} key`}
        description="Saved in this browser only and sent with each request."
      />
      <KeyInput field={keyField} id={`${idBase}-key-${keyField.key}`} hideLabel />
    </section>
  );
}

/** The chosen endpoint: rename it, change its address or model (synced), or its key (this browser). */
function EndpointEditor({ idBase, endpoint }: { idBase: string; endpoint: UserModel }) {
  const { settings, edit } = useConfig();
  const [draft, setDraft] = useState({
    name: endpoint.name ?? '',
    baseUrl: endpoint.baseUrl ?? '',
    model: endpoint.model,
  });
  const urlOk = URL_RE.test(draft.baseUrl.trim());
  const modelOk = draft.model.trim().length > 0;

  // Only a valid draft reaches the saved list: an invalid one would make the account save fail.
  const change = (patch: Partial<typeof draft>) => {
    const next = { ...draft, ...patch };
    setDraft(next);
    if (!URL_RE.test(next.baseUrl.trim()) || !next.model.trim()) return;
    edit({
      customModels: settings.customModels.map((m) =>
        m.id === endpoint.id
          ? {
              ...m,
              model: next.model.trim().slice(0, 200),
              baseUrl: next.baseUrl.trim().slice(0, 500),
              ...(next.name.trim() ? { name: next.name.trim().slice(0, 80) } : { name: undefined }),
            }
          : m
      ),
    });
  };

  const id = (f: string) => `${idBase}-ep-${f}`;
  return (
    <section aria-labelledby={id('title')} className="cfg-panel space-y-4">
      <GroupHeading
        id={id('title')}
        title="This endpoint"
        description="Address and model sync to your account; the key stays in this browser."
      />
      <div className="space-y-1.5">
        <label htmlFor={id('name')} className="text-[13px] font-semibold text-foreground">
          Display name <span className="font-normal text-muted-foreground">(optional)</span>
        </label>
        <input
          id={id('name')}
          type="text"
          autoComplete="off"
          value={draft.name}
          onChange={(e) => change({ name: e.target.value })}
          className={FIELD}
        />
      </div>
      <div className="space-y-1.5">
        <label htmlFor={id('url')} className="text-[13px] font-semibold text-foreground">
          Base URL
        </label>
        <input
          id={id('url')}
          type="url"
          inputMode="url"
          autoComplete="off"
          spellCheck={false}
          value={draft.baseUrl}
          onChange={(e) => change({ baseUrl: e.target.value })}
          aria-invalid={!urlOk}
          className={FIELD}
        />
        {!urlOk && (
          <p className="text-xs font-medium text-error">
            Start it with http:// or https:// to save it.
          </p>
        )}
      </div>
      <div className="space-y-1.5">
        <label htmlFor={id('model')} className="text-[13px] font-semibold text-foreground">
          Model ID
        </label>
        <input
          id={id('model')}
          type="text"
          autoComplete="off"
          spellCheck={false}
          value={draft.model}
          onChange={(e) => change({ model: e.target.value })}
          aria-invalid={!modelOk}
          className={`${FIELD} font-code`}
        />
        {!modelOk && <p className="text-xs font-medium text-error">Type a model ID to save it.</p>}
      </div>
      <div className="space-y-1.5">
        <label htmlFor={id('key')} className="text-[13px] font-semibold text-foreground">
          API key <span className="font-normal text-muted-foreground">(optional)</span>
        </label>
        <SecretInput
          id={id('key')}
          value={settings.endpointKeys[endpoint.id] ?? ''}
          onChange={(v) => edit({ endpointKeys: { ...settings.endpointKeys, [endpoint.id]: v } })}
          placeholder="sk-…"
        />
        <p className="text-xs leading-snug text-muted-foreground">
          Kept in this browser only. Leave it empty for a local server that doesn&apos;t ask for
          one.
        </p>
      </div>
    </section>
  );
}

/** The single custom endpoint from before endpoints could be added (customBaseUrl / customModel / customKey). */
function LegacyEndpointSetup({ idBase }: { idBase: string }) {
  const keyField = KEY_FIELD_BY_PROVIDER.Custom;
  return (
    <section aria-labelledby={`${idBase}-setup`} className="cfg-panel space-y-4">
      <GroupHeading
        id={`${idBase}-setup`}
        title="Your endpoint"
        description="Kept in this browser. Endpoints you add with “Add an endpoint” also sync to your account."
      />
      <SettingField
        id={`${idBase}-customBaseUrl`}
        label="Base URL"
        field="customBaseUrl"
        placeholder="https://api.together.xyz/v1"
        hint={
          <>
            It must serve <code className={CODE}>/chat/completions</code> the way OpenAI does.
          </>
        }
      />
      <SettingField
        id={`${idBase}-customModel`}
        label="Model ID"
        field="customModel"
        placeholder="meta-llama/Llama-3.3-70B-Instruct-Turbo"
      />
      {keyField && <KeyInput field={keyField} id={`${idBase}-key-${keyField.key}`} />}
    </section>
  );
}

function OllamaSetup({ idBase }: { idBase: string }) {
  const { settings, aiDefault, ollama } = useConfig();
  const { status, detecting, models, modelsLoading, modelsError, refresh } = ollama;
  const running = !!status?.running;
  const count = status?.models.length ?? models.length;
  const envModel = envPinnedOllamaModel(aiDefault);
  const usesServerDefault = !settings.textGenerationModel || !settings.answerModel;

  return (
    <section aria-labelledby={`${idBase}-ollama`} className="cfg-panel space-y-4">
      <GroupHeading
        id={`${idBase}-ollama`}
        title="Ollama on this computer"
        description={
          detecting ? (
            'Looking for Ollama…'
          ) : running ? (
            <span className="inline-flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-success" aria-hidden="true" />
              Running, {count} model{count === 1 ? '' : 's'} pulled
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-error" aria-hidden="true" />
              Not running at this address
            </span>
          )
        }
        trailing={
          <button
            type="button"
            onClick={refresh}
            disabled={detecting || modelsLoading}
            className="todo-btn todo-btn-quiet h-9 shrink-0 px-3.5"
          >
            <Icon
              name="ArrowPathIcon"
              size={14}
              className={detecting || modelsLoading ? 'animate-spin' : ''}
            />
            Check again
          </button>
        }
      />
      <SettingField
        id={`${idBase}-ollamaUrl`}
        label="Server address"
        field="ollamaUrl"
        placeholder="http://localhost:11434"
        hint={
          !running && !detecting ? (
            <>
              Start it with <code className={CODE}>ollama serve</code>, then check again.
              {status?.error ? ` (${status.error})` : ''}
            </>
          ) : undefined
        }
      />
      {(models.length === 0 || !running) && (
        <SettingField
          id={`${idBase}-ollamaModel`}
          label="Model name"
          field="ollamaModel"
          placeholder="llama3.2"
          hint={
            modelsError ? (
              <span className="text-warning">{modelsError}</span>
            ) : (
              <>
                Any model you pulled with <code className={CODE}>ollama pull &lt;name&gt;</code>.
              </>
            )
          }
        />
      )}
      {envModel && usesServerDefault && (
        <p className="text-xs leading-snug text-muted-foreground">
          The server default pins <span className="font-semibold text-foreground">{envModel}</span>{' '}
          (AI_MODEL). The model chosen here applies wherever plain Ollama is used, such as the To-Do
          local toggle.
        </p>
      )}
    </section>
  );
}
