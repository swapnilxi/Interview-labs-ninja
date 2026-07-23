'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import Icon from '@/components/ui/AppIcon';
import { settingsService, UserSettings, OllamaStatus } from '@/lib/services/settingsService';

const PROVIDERS = [
  {
    key: 'Google',
    label: 'Google Gemini',
    icon: 'SparklesIcon',
    color: 'text-blue-500',
    bg: 'bg-blue-500/10',
    models: [
      { id: 'gemini-2.5-flash', name: 'Gemini 2.5 Flash', badge: 'Fast · Recommended' },
      { id: 'gemini-2.5-pro',   name: 'Gemini 2.5 Pro',   badge: 'High Quality' },
    ],
  },
  {
    key: 'DeepSeek',
    label: 'DeepSeek',
    icon: 'BoltIcon',
    color: 'text-teal-500',
    bg: 'bg-teal-500/10',
    models: [
      { id: 'deepseek-chat',     name: 'DeepSeek V3',   badge: 'Very Cheap' },
      { id: 'deepseek-reasoner', name: 'DeepSeek R1',   badge: 'Reasoning · Cheap' },
    ],
  },
  {
    key: 'Groq',
    label: 'Groq (Free Tier)',
    icon: 'RocketLaunchIcon',
    color: 'text-orange-500',
    bg: 'bg-orange-500/10',
    models: [
      { id: 'llama-3.3-70b-versatile', name: 'Llama 3.3 70B',   badge: 'Free · Powerful' },
      { id: 'llama-3.1-8b-instant',    name: 'Llama 3.1 8B',    badge: 'Free · Very Fast' },
      { id: 'gemma2-9b-it',            name: 'Gemma 2 9B',      badge: 'Free' },
      { id: 'mixtral-8x7b-32768',      name: 'Mixtral 8x7B',    badge: 'Free · MoE' },
    ],
  },
  {
    key: 'OpenAI',
    label: 'OpenAI',
    icon: 'CpuChipIcon',
    color: 'text-emerald-500',
    bg: 'bg-emerald-500/10',
    models: [
      { id: 'gpt-4o',      name: 'GPT-4o',      badge: 'Premium' },
      { id: 'gpt-4o-mini', name: 'GPT-4o Mini', badge: 'Cost Effective' },
    ],
  },
  {
    key: 'Anthropic',
    label: 'Anthropic',
    icon: 'AcademicCapIcon',
    color: 'text-violet-500',
    bg: 'bg-violet-500/10',
    models: [
      { id: 'claude-3-5-sonnet-latest', name: 'Claude 3.5 Sonnet', badge: 'State-of-the-Art' },
      { id: 'claude-3-5-haiku-latest',  name: 'Claude 3.5 Haiku',  badge: 'Fast' },
    ],
  },
  {
    key: 'Ollama',
    label: 'Ollama (Local)',
    icon: 'ComputerDesktopIcon',
    color: 'text-slate-400',
    bg: 'bg-slate-500/10',
    models: [
      { id: 'ollama', name: 'Ollama — use configured model', badge: 'Local · Free' },
    ],
  },
];

const ALL_MODELS = PROVIDERS.flatMap(p => p.models.map(m => ({ ...m, provider: p.key })));

const API_KEY_FIELDS = [
  { key: 'geminiKey',     label: 'Google Gemini API Key',    placeholder: 'AIzaSy…',     note: 'Required for Gemini models',   provider: 'Google'    },
  { key: 'deepseekKey',   label: 'DeepSeek API Key',         placeholder: 'sk-…',        note: 'Required for DeepSeek models', provider: 'DeepSeek'  },
  { key: 'groqKey',       label: 'Groq API Key',             placeholder: 'gsk_…',       note: 'Required for Groq models',     provider: 'Groq'      },
  { key: 'openaiKey',     label: 'OpenAI API Key',           placeholder: 'sk-proj-…',   note: 'Required for GPT models',      provider: 'OpenAI'    },
  { key: 'anthropicKey',  label: 'Anthropic Claude API Key', placeholder: 'sk-ant-…',    note: 'Required for Claude models',   provider: 'Anthropic' },
] as const;

const DEFAULT_SETTINGS: UserSettings = {
  textGenerationModel: 'gemini-2.5-flash',
  answerModel: 'gemini-2.5-pro',
  openaiKey: '',
  geminiKey: '',
  anthropicKey: '',
  deepseekKey: '',
  groqKey: '',
  ollamaUrl: 'http://localhost:11434',
  ollamaModel: 'llama3.2',
};

function ModelSelect({
  id, value, onChange, ollamaModels, currentOllamaModel,
}: {
  id: string;
  value: string;
  onChange: (v: string) => void;
  ollamaModels: string[];
  currentOllamaModel: string;
}) {
  const ollamaOptions = Array.from(new Set([...(currentOllamaModel ? [currentOllamaModel] : []), ...ollamaModels]));

  return (
    <select
      id={id}
      value={value}
      onChange={e => onChange(e.target.value)}
      className="w-full rounded-md border border-border bg-input px-12 py-9 text-sm text-foreground focus-ring transition-smooth"
    >
      {PROVIDERS.filter(p => p.key !== 'Ollama').map(p => (
        <optgroup key={p.key} label={`── ${p.label}`}>
          {p.models.map(m => (
            <option key={m.id} value={m.id}>{m.name} ({m.badge})</option>
          ))}
        </optgroup>
      ))}
      <optgroup label="── Ollama (Local)">
        {ollamaOptions.length === 0 ? (
          <option value="ollama">Ollama — use configured model (Local · Free)</option>
        ) : (
          ollamaOptions.map(name => (
            <option key={name} value={`ollama::${name}`}>{name} (Local · Free)</option>
          ))
        )}
      </optgroup>
    </select>
  );
}

export default function ConfigInteractive() {
  const [settings, setSettings] = useState<UserSettings>(DEFAULT_SETTINGS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [visibleKeys, setVisibleKeys] = useState<Record<string, boolean>>({});

  const [ollamaModels, setOllamaModels] = useState<string[]>([]);
  const [ollamaModelsLoading, setOllamaModelsLoading] = useState(false);
  const [ollamaModelsError, setOllamaModelsError] = useState('');
  const [customOllamaModel, setCustomOllamaModel] = useState(false);

  useEffect(() => {
    settingsService.getSettings()
      .then(data => {
        if (data) setSettings({ ...DEFAULT_SETTINGS, ...data });
        // Auto-detect Ollama on page load
        detectOllama(data?.ollamaUrl);
      })
      .catch(err => console.error('Failed to load settings:', err))
      .finally(() => setLoading(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const detectOllama = useCallback(async (url?: string) => {
    setOllamaLoading(true);
    try {
      const status = await settingsService.getOllamaStatus(url);
      setOllamaStatus(status);
      // Auto-select first model if none configured
      if (status.running && status.models.length > 0) {
        setSettings(prev => ({
          ...prev,
          ollamaModel: prev.ollamaModel || status.models[0].name,
        }));
      }
    } catch {
      setOllamaStatus({ running: false, url: url || '', models: [], error: 'Could not reach backend' });
    } finally {
      setOllamaLoading(false);
    }
  }, []);

  const fetchOllamaModels = async (url: string) => {
    setOllamaModelsLoading(true);
    setOllamaModelsError('');
    try {
      const models = await settingsService.getOllamaModels(url);
      setOllamaModels(models);
      if (models.length === 0) setOllamaModelsError('Ollama is reachable but has no models pulled yet.');
    } catch (err) {
      setOllamaModels([]);
      setOllamaModelsError(err instanceof Error ? err.message : 'Could not reach Ollama.');
    } finally {
      setOllamaModelsLoading(false);
    }
  };

  const fetchOllamaModels = async (url: string) => {
    setOllamaModelsLoading(true);
    setOllamaModelsError('');
    try {
      const models = await settingsService.getOllamaModels(url);
      setOllamaModels(models);
      if (models.length === 0) setOllamaModelsError('Ollama is reachable but has no models pulled yet.');
    } catch (err) {
      setOllamaModels([]);
      setOllamaModelsError(err instanceof Error ? err.message : 'Could not reach Ollama.');
    } finally {
      setOllamaModelsLoading(false);
    }
  };

  const handleChange = (key: keyof UserSettings, value: string) => {
    setSettings(prev => ({ ...prev, [key]: value }));
    // Re-probe Ollama with a debounce when URL field changes
    if (key === 'ollamaUrl') {
      if (detectDebounceRef.current) clearTimeout(detectDebounceRef.current);
      detectDebounceRef.current = setTimeout(() => detectOllama(value), 800);
    }
  };

  const handleModelSelectChange = (key: 'textGenerationModel' | 'answerModel') => (value: string) => {
    if (value.startsWith('ollama::')) {
      const model = value.slice('ollama::'.length);
      setSettings(prev => ({ ...prev, [key]: 'ollama', ollamaModel: model }));
      return;
    }
    handleChange(key, value);
  };

  const modelSelectValue = (key: 'textGenerationModel' | 'answerModel') =>
    settings[key] === 'ollama' ? `ollama::${settings.ollamaModel}` : settings[key];

  const handleModelSelectChange = (key: 'textGenerationModel' | 'answerModel') => (value: string) => {
    if (value.startsWith('ollama::')) {
      const model = value.slice('ollama::'.length);
      setSettings(prev => ({ ...prev, [key]: 'ollama', ollamaModel: model }));
      return;
    }
    handleChange(key, value);
  };

  const modelSelectValue = (key: 'textGenerationModel' | 'answerModel') =>
    settings[key] === 'ollama' ? `ollama::${settings.ollamaModel}` : settings[key];

  const toggleKeyVisibility = (key: string) =>
    setVisibleKeys(prev => ({ ...prev, [key]: !prev[key] }));

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setToast(null);
    try {
      await settingsService.saveSettings(settings);
      setToast({ type: 'success', message: 'Configuration saved successfully!' });
      setTimeout(() => setToast(null), 4000);
    } catch (err) {
      console.error(err);
      setToast({ type: 'error', message: 'Failed to save. Check backend connection.' });
    } finally {
      setSaving(false);
    }
  };

  const usesOllama = settings.textGenerationModel === 'ollama' || settings.answerModel === 'ollama';

  const selectedTextModel = ALL_MODELS.find(m => m.id === settings.textGenerationModel);
  const selectedAModel = ALL_MODELS.find(m => m.id === settings.answerModel);

  useEffect(() => {
    if (!loading && settings.ollamaUrl) {
      fetchOllamaModels(settings.ollamaUrl);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, settings.ollamaUrl]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-60">
        <div className="w-48 h-48 border-4 border-primary/30 border-t-primary rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-24">
      {toast && (
        <div className={`p-18 rounded-lg border flex items-center gap-12 animate-fade-in shadow-lg ${
          toast.type === 'success' ? 'bg-success/15 border-success text-success-foreground' : 'bg-error/15 border-error text-error-foreground'
        }`}>
          <Icon name={toast.type === 'success' ? 'CheckCircleIcon' : 'ExclamationTriangleIcon'} size={20} variant="solid"
            className={toast.type === 'success' ? 'text-success' : 'text-error'} />
          <span className="text-sm font-medium">{toast.message}</span>
        </div>
      )}

      <form onSubmit={handleSave} className="space-y-24">

        {/* Model Configuration */}
        <div className="bg-card border border-border rounded-lg p-24 shadow-md space-y-18">
          <div className="flex items-center gap-12 pb-12 border-b border-border">
            <Icon name="CpuChipIcon" size={24} className="text-primary" />
            <div>
              <h3 className="font-heading text-lg font-semibold text-foreground">Model Configuration</h3>
              <p className="text-xs text-muted-foreground">Choose the main LLM used for AI generation across the app, and the model used for answer evaluation</p>
            </div>
          </div>

          {/* Provider pills */}
          <div className="flex flex-wrap gap-2">
            {PROVIDERS.map(p => {
              const active = settings.textGenerationModel && ALL_MODELS.find(m => m.id === settings.textGenerationModel)?.provider === p.key
                          || settings.answerModel && ALL_MODELS.find(m => m.id === settings.answerModel)?.provider === p.key;
              return (
                <span key={p.key}
                  className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-medium border transition-all ${
                    active ? `${p.bg} ${p.color} border-current/30` : 'border-border text-muted-foreground bg-muted/30'
                  }`}>
                  <Icon name={p.icon} size={11} />
                  {p.label}
                </span>
              );
            })}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-18">
            <div className="space-y-6">
              <label htmlFor="textGenerationModel" className="block text-sm font-medium text-foreground">
                Text Generation Model
              </label>
              <ModelSelect
                id="textGenerationModel"
                value={modelSelectValue('textGenerationModel')}
                onChange={handleModelSelectChange('textGenerationModel')}
                ollamaModels={ollamaModels}
                currentOllamaModel={settings.ollamaModel}
              />
              {selectedTextModel && (
                <span className="text-[11px] text-muted-foreground">
                  {selectedTextModel.provider} · {settings.textGenerationModel === 'ollama' ? settings.ollamaModel : selectedTextModel.badge}
                </span>
              )}
              <span className="block text-[11px] text-muted-foreground/60">The main LLM for the app — used for daily topic expansion, parsing CV details, and all other AI generation (e.g. LinkedIn Post Generator).</span>
            </div>

            <div className="space-y-6">
              <label htmlFor="answerModel" className="block text-sm font-medium text-foreground">
                Answer Evaluation Model
              </label>
              <ModelSelect
                id="answerModel"
                value={modelSelectValue('answerModel')}
                onChange={handleModelSelectChange('answerModel')}
                ollamaModels={ollamaModels}
                currentOllamaModel={settings.ollamaModel}
              />
              {selectedAModel && (
                <span className="text-[11px] text-muted-foreground">
                  {selectedAModel.provider} · {settings.answerModel === 'ollama' ? settings.ollamaModel : selectedAModel.badge}
                </span>
              )}
              <span className="block text-[11px] text-muted-foreground/60">Used to score answers, provide STAR guidelines, and highlight improvements.</span>
            </div>
          </div>
        </div>

        {/* Ollama Local Config */}
        {usesOllama && (
          <div className="bg-card border border-border rounded-lg p-24 shadow-md space-y-18">
            <div className="flex items-center justify-between pb-12 border-b border-border">
              <div className="flex items-center gap-12">
                <Icon name="ComputerDesktopIcon" size={24} className="text-slate-400" />
                <div>
                  <h3 className="font-heading text-lg font-semibold text-foreground">Ollama Local Settings</h3>
                  <p className="text-xs text-muted-foreground">Auto-detects pulled models from your running Ollama instance.</p>
                </div>
              </div>

              {/* Live status badge */}
              <div className="flex items-center gap-2">
                {ollamaLoading ? (
                  <span className="flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground">
                    <span className="w-3 h-3 border-2 border-muted-foreground/30 border-t-muted-foreground rounded-full animate-spin" />
                    Detecting...
                  </span>
                ) : ollamaStatus?.running ? (
                  <span className="flex items-center gap-1.5 text-[11px] font-semibold text-emerald-500 bg-emerald-500/10 px-2.5 py-1 rounded-full border border-emerald-500/20">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                    Online · {ollamaStatus.models.length} model{ollamaStatus.models.length !== 1 ? 's' : ''}
                  </span>
                ) : ollamaStatus ? (
                  <span className="flex items-center gap-1.5 text-[11px] font-medium text-red-500 bg-red-500/10 px-2.5 py-1 rounded-full border border-red-500/20">
                    <span className="w-1.5 h-1.5 rounded-full bg-red-500" />
                    Offline
                  </span>
                ) : null}

                <button
                  type="button"
                  onClick={() => detectOllama(settings.ollamaUrl)}
                  disabled={ollamaLoading}
                  className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-smooth disabled:opacity-40"
                  title="Re-detect Ollama"
                >
                  <Icon name="ArrowPathIcon" size={14} className={ollamaLoading ? 'animate-spin' : ''} />
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-18">
              {/* URL field */}
              <div className="space-y-6">
                <label htmlFor="ollamaUrl" className="block text-sm font-medium text-foreground">Ollama Server URL</label>
                <input
                  id="ollamaUrl"
                  type="text"
                  value={settings.ollamaUrl}
                  onChange={e => handleChange('ollamaUrl', e.target.value)}
                  placeholder="http://localhost:11434"
                  className="w-full rounded-md border border-border bg-input px-12 py-9 text-sm text-foreground focus-ring font-code"
                />
                {ollamaStatus && !ollamaStatus.running && ollamaStatus.error && (
                  <p className="text-[11px] text-red-500">{ollamaStatus.error}</p>
                )}
                {!ollamaStatus?.running && (
                  <span className="text-[11px] text-muted-foreground/60">
                    Run <code className="bg-muted px-1 rounded text-[10px]">ollama serve</code> to start the server
                  </span>
                )}
              </div>

              {/* Model — dropdown if detected, text input if offline */}
              <div className="space-y-6">
                <div className="flex items-center justify-between">
                  <label htmlFor="ollamaModel" className="block text-sm font-medium text-foreground">Ollama Model Name</label>
                  <button
                    type="button"
                    onClick={() => fetchOllamaModels(settings.ollamaUrl)}
                    disabled={ollamaModelsLoading}
                    className="flex items-center gap-1 text-[11px] font-medium text-primary hover:opacity-80 transition-smooth disabled:opacity-50"
                  >
                    <Icon name="ArrowPathIcon" size={11} className={ollamaModelsLoading ? 'animate-spin' : ''} />
                    {ollamaModelsLoading ? 'Checking…' : 'Refresh'}
                  </button>
                </div>
                {ollamaModels.length > 0 && !customOllamaModel ? (
                  <select
                    id="ollamaModel"
                    value={settings.ollamaModel || '__custom__'}
                    onChange={e => {
                      if (e.target.value === '__custom__') {
                        setCustomOllamaModel(true);
                        return;
                      }
                      handleChange('ollamaModel', e.target.value);
                    }}
                    className="w-full rounded-md border border-border bg-input px-12 py-9 text-sm text-foreground focus-ring font-code"
                  >
                    {!ollamaModels.includes(settings.ollamaModel) && settings.ollamaModel && (
                      <option value={settings.ollamaModel}>{settings.ollamaModel} (current)</option>
                    )}
                    {ollamaModels.map(name => (
                      <option key={name} value={name}>{name}</option>
                    ))}
                    <option value="__custom__">Type a model name manually…</option>
                  </select>
                ) : (
                  <input
                    id="ollamaModel"
                    type="text"
                    value={settings.ollamaModel}
                    onChange={e => handleChange('ollamaModel', e.target.value)}
                    placeholder="llama3.2"
                    className="w-full rounded-md border border-border bg-input px-12 py-9 text-sm text-foreground focus-ring font-code"
                  />
                )}
                {ollamaModelsError ? (
                  <span className="block text-[11px] text-amber-500">{ollamaModelsError}</span>
                ) : ollamaModels.length > 0 ? (
                  <span className="flex items-center justify-between text-[11px] text-emerald-500">
                    {ollamaModels.length} model{ollamaModels.length > 1 ? 's' : ''} found locally
                    {customOllamaModel && (
                      <button
                        type="button"
                        onClick={() => setCustomOllamaModel(false)}
                        className="font-medium text-primary hover:opacity-80 transition-smooth"
                      >
                        Choose from list
                      </button>
                    )}
                  </span>
                ) : (
                  <span className="block text-[11px] text-muted-foreground/60">Any model pulled via <code className="bg-muted px-1 rounded text-[10px]">ollama pull &lt;name&gt;</code></span>
                )}
              </div>
            </div>

            {/* Detected model cards */}
            {ollamaStatus?.running && ollamaStatus.models.length > 0 && (
              <div className="pt-12 border-t border-border">
                <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-12">Pulled Models</p>
                <div className="flex flex-wrap gap-2">
                  {ollamaStatus.models.map(m => (
                    <button
                      key={m.name}
                      type="button"
                      onClick={() => handleChange('ollamaModel', m.name)}
                      className={`group flex items-center gap-2 px-3 py-1.5 rounded-lg border text-[11px] font-medium transition-smooth ${
                        settings.ollamaModel === m.name
                          ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                          : 'border-border text-muted-foreground hover:border-border hover:bg-muted/50 hover:text-foreground'
                      }`}
                    >
                      <span className="font-code">{m.name}</span>
                      {m.size_gb && (
                        <span className={`text-[9px] font-semibold px-1 rounded ${
                          settings.ollamaModel === m.name ? 'bg-emerald-500/20 text-emerald-500' : 'bg-muted text-muted-foreground'
                        }`}>
                          {m.size_gb} GB
                        </span>
                      )}
                      {settings.ollamaModel === m.name && (
                        <Icon name="CheckIcon" size={10} className="text-emerald-500" variant="solid" />
                      )}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* API Keys */}
        <div className="bg-card border border-border rounded-lg p-24 shadow-md space-y-18">
          <div className="flex items-center gap-12 pb-12 border-b border-border">
            <Icon name="KeyIcon" size={24} className="text-secondary" />
            <div>
              <h3 className="font-heading text-lg font-semibold text-foreground">API Keys</h3>
              <p className="text-xs text-muted-foreground">Stored securely in your local SQLite database. Only enter keys for providers you use.</p>
            </div>
          </div>
          <div className="space-y-18">
            {API_KEY_FIELDS.map(field => (
              <div key={field.key} className="space-y-6">
                <div className="flex justify-between items-center">
                  <label htmlFor={field.key} className="block text-sm font-medium text-foreground">{field.label}</label>
                  <span className="text-xs text-muted-foreground">{field.note}</span>
                </div>
                <div className="relative">
                  <input
                    id={field.key}
                    type={visibleKeys[field.key] ? 'text' : 'password'}
                    value={settings[field.key as keyof UserSettings]}
                    onChange={e => handleChange(field.key as keyof UserSettings, e.target.value)}
                    placeholder={field.placeholder}
                    className="w-full rounded-md border border-border bg-input pl-12 pr-48 py-9 text-sm text-foreground focus-ring font-code"
                  />
                  <button
                    type="button"
                    onClick={() => toggleKeyVisibility(field.key)}
                    className="absolute right-12 top-1/2 -translate-y-1/2 p-6 text-muted-foreground hover:text-foreground transition-smooth"
                    aria-label={visibleKeys[field.key] ? 'Hide key' : 'Show key'}
                  >
                    <Icon name={visibleKeys[field.key] ? 'EyeSlashIcon' : 'EyeIcon'} size={18} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Save */}
        <div className="flex justify-end gap-12">
          <button
            type="submit"
            disabled={saving}
            className="py-12 px-24 rounded-md bg-primary hover:bg-primary/90 text-primary-foreground font-medium transition-smooth flex items-center gap-12 focus-ring disabled:opacity-50"
          >
            {saving ? (
              <span className="w-18 h-18 border-2 border-primary-foreground/30 border-t-primary-foreground rounded-full animate-spin" />
            ) : (
              <Icon name="CheckIcon" size={18} />
            )}
            Save Configuration
          </button>
        </div>
      </form>
    </div>
  );
}
