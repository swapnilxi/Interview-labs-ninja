'use client';

import React, { useEffect, useRef, useState, type ReactNode } from 'react';
import Icon from '@/components/ui/AppIcon';
import { findEndpoint, parseCompatValue, type UserSettings } from '@/lib/services/settingsService';
import {
  KEY_FIELD_BY_PROVIDER,
  PROVIDER_BY_KEY,
  PROVIDER_OF_SLUG,
  describeChoice,
  describeEnvDefault,
  hostOf,
  tabOf,
  type AiDefaultState,
  type ProviderTab,
} from './catalog';
import { useConfig, type OllamaState } from './ConfigContext';
import ModelPicker from './ModelPicker';
import { CODE, GroupHeading, SectionHeader, TierChip } from './parts';

type Tone = 'ok' | 'warn' | 'info';

interface Readiness {
  tone: Tone;
  text: ReactNode;
  action?: { label: string; run: () => void };
}

/** Focus (and bring into view) an element that the next render creates. */
function focusSoon(id: string) {
  requestAnimationFrame(() =>
    requestAnimationFrame(() => {
      const el = document.getElementById(id);
      if (!el) return;
      const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      el.scrollIntoView({ block: 'center', behavior: reduce ? 'auto' : 'smooth' });
      el.focus({ preventScroll: true });
    })
  );
}

/** Will this choice work as set up? One sentence, and the one step that fixes it. */
function readinessOf(
  id: string,
  settings: UserSettings,
  aiDefault: AiDefaultState,
  ollama: OllamaState,
  fix: (tab: ProviderTab, focusId: string) => void
): Readiness {
  const choice = describeChoice(id, settings, aiDefault);

  if (choice.serverDefault) {
    if (aiDefault === undefined)
      return { tone: 'info', text: 'Checking which model the server picks…' };
    if (aiDefault === null)
      return { tone: 'warn', text: 'Can’t reach the server to see which model it picks.' };
    if (aiDefault.warning) return { tone: 'warn', text: aiDefault.warning };
  }

  // An endpoint the user added: its address is known; a key is optional.
  if (id.startsWith('endpoint::')) {
    const ep = findEndpoint(id, settings);
    if (!ep) {
      return {
        tone: 'warn',
        text: 'This endpoint was removed, so the server default answers instead. Pick another model.',
      };
    }
    const host = hostOf(ep.baseUrl ?? '');
    return settings.endpointKeys[ep.id]?.trim()
      ? { tone: 'ok', text: `Sends requests to ${host} with your key from this browser.` }
      : {
          tone: 'info',
          text: `Sends requests to ${host} without a key. Fine for a local server; add one if it asks.`,
          action: { label: 'Add key', run: () => fix('Custom', 'main-ep-key') },
        };
  }

  // An added model whose name its provider wouldn't recognise goes through the provider's OpenAI-compatible API,
  // which only ever uses the key from this browser.
  const compat = parseCompatValue(id);
  if (compat) {
    const tab = PROVIDER_OF_SLUG[compat.provider];
    const field = KEY_FIELD_BY_PROVIDER[tab];
    const name = PROVIDER_BY_KEY[tab].name;
    if (field && settings[field.key].trim()) {
      return { tone: 'ok', text: `Your ${name} key is saved in this browser.` };
    }
    return {
      tone: 'warn',
      text: `Add your ${name} key: models you add use the key from this browser, not the server’s.`,
      action: field
        ? { label: 'Add key', run: () => fix(tab, `main-key-${field.key}`) }
        : undefined,
    };
  }

  const provider = choice.provider;
  if (!provider) return { tone: 'info', text: 'The server routes this model by its name.' };

  if (provider === 'Vertex') {
    return { tone: 'ok', text: 'Runs on the server’s Google Cloud credentials. No key needed.' };
  }

  if (provider === 'Ollama') {
    const url = settings.ollamaUrl || 'http://localhost:11434';
    if (ollama.detecting) return { tone: 'info', text: `Looking for Ollama at ${url}…` };
    if (ollama.status?.running) return { tone: 'ok', text: `Ollama is running at ${url}.` };
    return {
      tone: 'warn',
      text: (
        <>
          Ollama isn&apos;t answering at {url}. Start it with{' '}
          <code className={CODE}>ollama serve</code>.
        </>
      ),
      action: { label: 'Set up Ollama', run: () => fix('Ollama', 'main-ollamaUrl') },
    };
  }

  if (provider === 'Custom' && !settings.customBaseUrl.trim()) {
    return {
      tone: 'warn',
      text: 'Add the endpoint’s base URL to use it.',
      action: { label: 'Add URL', run: () => fix('Custom', 'main-customBaseUrl') },
    };
  }

  const field = KEY_FIELD_BY_PROVIDER[provider];
  if (!field) return { tone: 'ok', text: 'Ready to use.' };
  const name = PROVIDER_BY_KEY[provider].name;
  if (settings[field.key].trim()) {
    return { tone: 'ok', text: `Your ${name} key is saved in this browser.` };
  }
  if (provider === 'Custom') {
    return {
      tone: 'info',
      text: 'No key set. That is fine for local servers that don’t ask for one.',
    };
  }
  return {
    tone: 'warn',
    text: `No ${name} key in this browser. The server’s own key is used if it has one.`,
    action: { label: 'Add key', run: () => fix(provider, `main-key-${field.key}`) },
  };
}

const TONE_ICON: Record<Tone, string> = {
  ok: 'CheckCircleIcon',
  warn: 'ExclamationTriangleIcon',
  info: 'InformationCircleIcon',
};

export default function ModelSection() {
  const { settings, edit, aiDefault, ollama, sameModel, setSameModel, goTo } = useConfig();
  const [mainTab, setMainTabState] = useState<ProviderTab>(() =>
    tabOf(settings.textGenerationModel, settings)
  );
  const [scoreTab, setScoreTabState] = useState<ProviderTab>(() =>
    tabOf(settings.answerModel, settings)
  );
  const touched = useRef({ main: false, scoring: false });
  const setMainTab = (tab: ProviderTab) => {
    touched.current.main = true;
    setMainTabState(tab);
  };
  const setScoreTab = (tab: ProviderTab) => {
    touched.current.scoring = true;
    setScoreTabState(tab);
  };

  // "Server default" alone is one row: once the server says which provider it uses, open that provider's list
  // (Server default heads it), so its models are in view. Only until the person picks a tab themselves.
  const envProvider = describeEnvDefault(aiDefault, settings.ollamaModel)?.providerKey;
  useEffect(() => {
    if (!envProvider) return;
    if (!touched.current.main && !settings.textGenerationModel) setMainTabState(envProvider);
    if (!touched.current.scoring && !settings.answerModel) setScoreTabState(envProvider);
    // Only when the server's answer arrives, not on every pick.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [envProvider]);

  const main = describeChoice(settings.textGenerationModel, settings, aiDefault);
  const scoring = describeChoice(settings.answerModel, settings, aiDefault);

  const fixMain = (tab: ProviderTab, focusId: string) => {
    setMainTab(tab);
    focusSoon(focusId);
  };
  const ready = readinessOf(settings.textGenerationModel, settings, aiDefault, ollama, fixMain);
  // The scoring model's own problem, if it uses a different provider: its fix lives on the API keys page.
  const scoringReady = !sameModel
    ? readinessOf(settings.answerModel, settings, aiDefault, ollama, (tab) => {
        const f = tab !== 'Default' ? KEY_FIELD_BY_PROVIDER[tab] : undefined;
        if (f && tab !== 'Custom') goTo('keys', `keys-${f.key}`);
        else {
          setScoreTab(tab);
          focusSoon('scoring-models');
        }
      })
    : null;
  const showScoringWarning =
    scoringReady && scoringReady.tone === 'warn' && scoring.provider !== main.provider;

  const pickMain = (model: string, ollamaModel?: string) => {
    const patch: Partial<UserSettings> = { textGenerationModel: model };
    if (ollamaModel) patch.ollamaModel = ollamaModel;
    if (sameModel) patch.answerModel = model;
    edit(patch);
  };

  const pickScoring = (model: string, ollamaModel?: string) => {
    const patch: Partial<UserSettings> = { answerModel: model };
    if (ollamaModel) patch.ollamaModel = ollamaModel;
    edit(patch);
  };

  const toggleSame = () => {
    if (sameModel) {
      setSameModel(false);
      setScoreTab(tabOf(settings.answerModel, settings));
      return;
    }
    setSameModel(true);
    if (settings.answerModel !== settings.textGenerationModel)
      edit({ answerModel: settings.textGenerationModel });
  };

  const providerIcon = main.provider ? PROVIDER_BY_KEY[main.provider].icon : 'ServerStackIcon';
  const providerName = main.provider ? PROVIDER_BY_KEY[main.provider].name : 'Unknown provider';

  return (
    <div>
      <SectionHeader
        title="AI model"
        sub="Pick the model that writes and scores everything in the app. Changes save as you make them."
      />

      <div className="space-y-[2rem]">
        {/* The one bold element on the page: what is in use right now, and whether it will work. */}
        <section aria-labelledby="cfg-now-using" className="cfg-readout">
          <div className="flex items-start gap-3.5">
            <span className="cfg-readout-icon" aria-hidden="true">
              <Icon name={providerIcon} size={22} />
            </span>
            <div className="min-w-0 flex-1">
              <p id="cfg-now-using" className="text-[13px] font-medium text-muted-foreground">
                Now using
              </p>
              <p className="cfg-readout-name">{main.name}</p>
              <p className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px] leading-snug text-muted-foreground">
                <span>
                  {providerName}
                  {main.serverDefault ? ', picked by the server' : ''}
                </span>
                <TierChip tier={main.tier} />
              </p>
              <p className="mt-1 text-[13px] leading-snug text-muted-foreground">
                {sameModel ? 'Also scores your answers.' : `Answers are scored by ${scoring.name}.`}
              </p>
            </div>
          </div>

          <div className="cfg-readout-status" data-tone={ready.tone} role="status">
            <Icon
              name={TONE_ICON[ready.tone]}
              size={17}
              variant="solid"
              className="cfg-readout-status-icon"
            />
            <p className="min-w-0 flex-1">{ready.text}</p>
            {ready.action && (
              <button
                type="button"
                onClick={ready.action.run}
                className="todo-btn todo-btn-quiet h-8 shrink-0 px-3.5"
              >
                {ready.action.label}
              </button>
            )}
          </div>
          {showScoringWarning && scoringReady && (
            <div className="cfg-readout-status cfg-readout-status-more" data-tone="warn">
              <Icon
                name="ExclamationTriangleIcon"
                size={17}
                variant="solid"
                className="cfg-readout-status-icon"
              />
              <p className="min-w-0 flex-1">Scoring model: {scoringReady.text}</p>
              {scoringReady.action && (
                <button
                  type="button"
                  onClick={scoringReady.action.run}
                  className="todo-btn todo-btn-quiet h-8 shrink-0 px-3.5"
                >
                  {scoringReady.action.label}
                </button>
              )}
            </div>
          )}
        </section>

        <section aria-labelledby="cfg-main-model">
          <GroupHeading
            id="cfg-main-model"
            title="Main model"
            description="Writes daily topics, lab sections, CV details, LinkedIn posts and everything else."
          />
          <ModelPicker
            idBase="main"
            value={settings.textGenerationModel}
            onPick={pickMain}
            tab={mainTab}
            onTab={setMainTab}
            withSetup
          />
        </section>

        <section aria-labelledby="cfg-scoring">
          <GroupHeading
            id="cfg-scoring"
            title="Scoring answers"
            description="Scores your answers, gives STAR tips and points out what to improve."
          />
          <div className="cfg-group">
            <button
              type="button"
              role="switch"
              aria-checked={sameModel}
              onClick={toggleSame}
              className="cfg-row"
            >
              <span className="min-w-0 flex-1 text-[15px] font-medium text-foreground">
                Use the main model
              </span>
              <span className="cfg-switch" data-on={sameModel || undefined} aria-hidden="true" />
            </button>
          </div>
          {!sameModel && (
            <div className="mt-4">
              <ModelPicker
                idBase="scoring"
                value={settings.answerModel}
                onPick={pickScoring}
                tab={scoreTab}
                onTab={setScoreTab}
              />
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
