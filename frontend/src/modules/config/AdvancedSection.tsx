'use client';

import React, { useState } from 'react';
import Icon from '@/components/ui/AppIcon';
import { API_BASE_URL } from '@/lib/http/apiClient';
import { USE_ENV_DEFAULT_MODEL, type UserSettings } from '@/lib/services/settingsService';
import { describeEnvDefault, envDefaultText, type AiDefaultState } from './catalog';
import { useConfig } from './ConfigContext';
import { CODE, GroupHeading, Notice, SectionHeader } from './parts';

const IS_FASTAPI_MODE = API_BASE_URL !== '';

interface EnvPrefillEntry {
  setting: string;
  label: string;
  env: string;
  masked?: string;
}

type Message = { tone: 'ok' | 'warn' | 'error'; text: string };

const MODEL_FIELDS = [
  { key: 'textGenerationModel', env: 'TEXT_GENERATION_MODEL', label: 'Main' },
  { key: 'answerModel', env: 'ANSWER_MODEL', label: 'Scoring' },
] as const;
type ModelField = (typeof MODEL_FIELDS)[number];

/** What "Import" will write, so the button count and the message agree. */
function planEnvImport(found: EnvPrefillEntry[]) {
  const patch: Partial<UserSettings> = {};
  let count = 0;
  for (const entry of found) {
    if (entry.masked && entry.setting !== 'aiDefault') {
      (patch as Record<string, string>)[entry.setting] = entry.masked;
      count++;
    }
  }
  // An explicit TEXT_GENERATION_MODEL / ANSWER_MODEL still wins over AI_PROVIDER / AI_MODEL.
  const aiDefaultEnvs = found
    .filter((e) => e.setting === 'aiDefault' && e.masked)
    .map((e) => e.env);
  const followEnv: ModelField[] =
    aiDefaultEnvs.length > 0 ? MODEL_FIELDS.filter((f) => patch[f.key] === undefined) : [];
  for (const f of followEnv) patch[f.key] = USE_ENV_DEFAULT_MODEL;
  if (followEnv.length > 0) count += aiDefaultEnvs.length;
  const provider =
    found
      .find((e) => e.env === 'AI_PROVIDER')
      ?.masked?.trim()
      .toLowerCase() || null;
  const model = found.find((e) => e.env === 'AI_MODEL')?.masked?.trim() || null;
  return { patch, count, aiDefaultEnvs, followEnv, provider, model };
}

function importMessage(
  plan: ReturnType<typeof planEnvImport>,
  aiDefault: AiDefaultState,
  ollamaModel: string
): Message {
  const { count, aiDefaultEnvs, followEnv, provider, model } = plan;
  const parts = [`Imported and saved ${count} value${count !== 1 ? 's' : ''} from .env.`];
  let tone: Message['tone'] = 'ok';
  if (aiDefaultEnvs.length > 0 && followEnv.length === 0) {
    parts.push(
      `${aiDefaultEnvs.join(' and ')} not applied: TEXT_GENERATION_MODEL and ANSWER_MODEL take precedence.`
    );
  } else if (followEnv.length > 0) {
    const fields = followEnv.map((f) => f.label).join(' and ');
    const explicit = MODEL_FIELDS.find((f) => !followEnv.includes(f));
    const kept = explicit
      ? ` (the ${explicit.label.toLowerCase()} model comes from ${explicit.env})`
      : '';
    parts.push(`${fields} model${followEnv.length > 1 ? 's' : ''} set to Server default${kept}.`);
    const backendReads =
      'the FastAPI backend reads AI_PROVIDER and AI_MODEL from backend/.env, not frontend/.env';
    if (aiDefault === undefined) {
      if (IS_FASTAPI_MODE) tone = 'warn';
      parts.push(
        `${IS_FASTAPI_MODE ? `Note: ${backendReads}; its` : 'The server'} default is still loading.`
      );
    } else if (aiDefault === null) {
      tone = 'warn';
      parts.push(
        IS_FASTAPI_MODE
          ? `Note: ${backendReads}, and it couldn't be reached to confirm what it picks.`
          : `Couldn't reach the server to confirm what Server default picks.`
      );
    } else {
      const resolved = envDefaultText(aiDefault, ollamaModel);
      // The backend prefixes ollama/vertex ids and ignores AI_MODEL for custom, so compare those forms.
      const modelMismatch =
        model !== null &&
        provider !== 'custom' &&
        ![model, `ollama::${model}`, `vertex_gemini_${model}`].includes(aiDefault.model);
      const mismatch =
        aiDefault.source === 'builtin' ||
        (provider !== null && provider !== aiDefault.provider) ||
        modelMismatch;
      if (IS_FASTAPI_MODE && mismatch) {
        tone = 'warn';
        parts.push(
          `Heads up: ${backendReads}, and it currently picks ${resolved}. Edit backend/.env and restart the backend to change that.`
        );
      } else {
        parts.push(`Server default now picks ${resolved}.`);
      }
    }
  }
  return { tone, text: parts.join(' ') };
}

export default function AdvancedSection() {
  const { settings, edit, aiDefault } = useConfig();
  const envDefault = describeEnvDefault(aiDefault, settings.ollamaModel);
  const envFile = IS_FASTAPI_MODE ? 'backend/.env' : 'frontend/.env';

  return (
    <div>
      <SectionHeader
        title="Advanced"
        sub="Where the server default comes from, and filling in keys from a .env file."
      />

      <div className="space-y-[2rem]">
        <section aria-labelledby="cfg-server-default">
          <GroupHeading
            id="cfg-server-default"
            title="Server default"
            description="The model used when AI model is set to Server default."
          />
          <div className="cfg-group">
            <div className="cfg-row">
              <span className="flex-1 text-[15px] text-foreground">Model</span>
              <span className="min-w-0 break-words text-right text-[15px] text-muted-foreground">
                {aiDefault === undefined
                  ? 'Checking…'
                  : envDefault
                    ? envDefault.label
                    : 'Server not reachable'}
              </span>
            </div>
            <div className="cfg-row">
              <span className="flex-1 text-[15px] text-foreground">Set by</span>
              <span className="min-w-0 break-words text-right font-code text-[13px] text-muted-foreground">
                {envDefault?.source ?? '—'}
              </span>
            </div>
          </div>
          <p className="mt-2.5 px-1 text-xs leading-relaxed text-muted-foreground">
            Change it with <code className={CODE}>AI_PROVIDER</code> and{' '}
            <code className={CODE}>AI_MODEL</code> in <code className={CODE}>{envFile}</code>, then
            restart the server.
          </p>
          {aiDefault?.warning && (
            <Notice tone="warn" className="mt-3">
              <p className="text-[13px] leading-relaxed text-foreground">{aiDefault.warning}</p>
            </Notice>
          )}
        </section>

        <EnvImport aiDefault={aiDefault} ollamaModel={settings.ollamaModel} onImport={edit} />
      </div>
    </div>
  );
}

function EnvImport({
  aiDefault,
  ollamaModel,
  onImport,
}: {
  aiDefault: AiDefaultState;
  ollamaModel: string;
  onImport: (patch: Partial<UserSettings>) => void;
}) {
  const [state, setState] = useState<{
    checked: boolean;
    loading: boolean;
    found: EnvPrefillEntry[];
    missing: EnvPrefillEntry[];
    imported: boolean;
  }>({ checked: false, loading: false, found: [], missing: [], imported: false });
  const [message, setMessage] = useState<Message | null>(null);
  const plan = planEnvImport(state.found);

  const check = async () => {
    setMessage(null);
    setState((s) => ({ ...s, loading: true, imported: false }));
    try {
      const res = await fetch('/api/config/env-prefill');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setState((s) => ({
        ...s,
        checked: true,
        loading: false,
        found: data.found ?? [],
        missing: data.missing ?? [],
      }));
    } catch {
      setState((s) => ({ ...s, checked: true, loading: false, found: [], missing: [] }));
      setMessage({
        tone: 'error',
        text: 'Couldn’t read the environment. Is the app server running?',
      });
    }
  };

  const apply = () => {
    onImport(plan.patch);
    setState((s) => ({ ...s, imported: true }));
    setMessage(importMessage(plan, aiDefault, plan.patch.ollamaModel ?? ollamaModel));
  };

  return (
    <section aria-labelledby="cfg-env-import">
      <GroupHeading
        id="cfg-env-import"
        title="Fill in from .env"
        description="Copies keys and settings set in this app server’s environment into the fields here."
        trailing={
          <button
            type="button"
            onClick={() => void check()}
            disabled={state.loading}
            className="todo-btn todo-btn-quiet h-9 shrink-0 px-4"
          >
            {state.loading ? (
              <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent" />
            ) : (
              <Icon name="MagnifyingGlassIcon" size={14} />
            )}
            {state.checked ? 'Check again' : 'Check .env'}
          </button>
        }
      />

      {message && (
        <Notice tone={message.tone} className="mb-3">
          <p className="text-[13px] leading-relaxed text-foreground">{message.text}</p>
        </Notice>
      )}

      {state.checked && !state.loading && (
        <div className="space-y-3">
          {state.found.length > 0 ? (
            <>
              <div className="cfg-group">
                {state.found.map((e) => (
                  <div key={e.env} className="cfg-row">
                    <Icon
                      name="CheckCircleIcon"
                      size={17}
                      variant="solid"
                      className="shrink-0 text-success"
                    />
                    <span className="min-w-0 flex-1 break-words text-[15px] text-foreground">
                      {e.label}
                    </span>
                    <code className="shrink-0 font-code text-xs text-muted-foreground">
                      {e.env}
                    </code>
                  </div>
                ))}
              </div>
              <div className="flex flex-wrap items-center gap-3 px-1">
                <button
                  type="button"
                  onClick={apply}
                  disabled={state.imported || plan.count === 0}
                  className="todo-btn todo-btn-primary h-10 px-[1.125rem] text-sm"
                >
                  {state.imported ? (
                    <>
                      <Icon name="CheckIcon" size={15} variant="solid" />
                      Imported
                    </>
                  ) : (
                    <>
                      <Icon name="ArrowDownTrayIcon" size={15} />
                      Import {plan.count} value{plan.count !== 1 ? 's' : ''}
                    </>
                  )}
                </button>
                <span className="text-xs text-muted-foreground">
                  They are saved like any other change.
                </span>
              </div>
            </>
          ) : (
            <p className="px-1 text-[13px] text-muted-foreground">
              Nothing found. Add the names below to{' '}
              <code className={CODE}>frontend/.env.local</code> (or your hosting dashboard) and
              restart the server.
            </p>
          )}

          {state.missing.length > 0 && (
            <details className="cfg-details">
              <summary className="todo-focus">
                {state.missing.length} name{state.missing.length !== 1 ? 's' : ''} not set
              </summary>
              <div className="space-y-3 pt-3">
                <div className="cfg-group">
                  {state.missing.map((e) => (
                    <div key={e.env} className="cfg-row">
                      <span className="min-w-0 flex-1 break-words text-[15px] text-muted-foreground">
                        {e.label}
                      </span>
                      <code className="shrink-0 font-code text-xs text-foreground">{e.env}=</code>
                    </div>
                  ))}
                </div>
                <p className="px-1 text-xs leading-relaxed text-muted-foreground">
                  Put them in <code className={CODE}>frontend/.env.local</code>, for example{' '}
                  <code className={CODE}>GEMINI_API_KEY=AIzaSy…</code>, then restart: the server
                  reads them only when it starts.
                  {IS_FASTAPI_MODE && (
                    <>
                      {' '}
                      <code className={CODE}>AI_PROVIDER</code> and{' '}
                      <code className={CODE}>AI_MODEL</code> are read by the FastAPI backend from{' '}
                      <code className={CODE}>backend/.env</code>.
                    </>
                  )}
                </p>
              </div>
            </details>
          )}
        </div>
      )}
    </section>
  );
}
