'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import Modal from '@/components/ui/Modal';
import Icon from '@/components/ui/AppIcon';
import {
  GEMINI_MODEL_OPTIONS,
  clearStoredGeminiKey,
  getConfigGeminiKey,
  getStoredGeminiKey,
  resolveGemini,
  saveStoredGeminiKey,
  saveStoredGeminiModel,
  testGeminiConnection,
} from '../services/geminiService';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  /** Called after a save, so the module re-reads which key/model is in use. */
  onSaved: () => void;
  /** Forget which cards were swiped, so every deck starts over. */
  onResetProgress: () => void;
}

export default function SettingsModal({
  isOpen,
  onClose,
  onSaved,
  onResetProgress,
}: SettingsModalProps) {
  const [apiKey, setApiKey] = useState('');
  const [showKey, setShowKey] = useState(false);
  const [model, setModel] = useState('');
  const [configKey, setConfigKey] = useState('');
  const [testStatus, setTestStatus] = useState<'idle' | 'testing' | 'success' | 'error'>('idle');
  const [errorMessage, setErrorMessage] = useState('');
  const [confirmReset, setConfirmReset] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    setApiKey(getStoredGeminiKey());
    setConfigKey(getConfigGeminiKey());
    setModel(resolveGemini().model);
    setShowKey(false);
    setTestStatus('idle');
    setErrorMessage('');
    setConfirmReset(false);
  }, [isOpen]);

  const effectiveKey = apiKey.trim() || configKey;
  const usingConfigKey = !apiKey.trim() && !!configKey;
  const modelOptions = GEMINI_MODEL_OPTIONS.some((m) => m.id === model)
    ? GEMINI_MODEL_OPTIONS
    : [...GEMINI_MODEL_OPTIONS, { id: model, label: model }];

  const handleTest = async () => {
    if (!effectiveKey) return;
    setTestStatus('testing');
    setErrorMessage('');
    const res = await testGeminiConnection(effectiveKey, model);
    if (res.success) {
      setTestStatus('success');
    } else {
      setTestStatus('error');
      setErrorMessage(res.error || 'Connection failed.');
    }
  };

  const handleSave = () => {
    saveStoredGeminiKey(apiKey);
    saveStoredGeminiModel(model);
    onSaved();
    onClose();
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      labelledBy="swipe-settings-title"
      backdropClassName="bg-black/50 backdrop-blur-[2px]"
      overlayClassName="flex items-end justify-center sm:items-center sm:p-4"
      className="notif-sheet flex w-full flex-col overflow-hidden border border-border bg-card shadow-2xl sm:max-w-[30rem]"
    >
      <span className="swipe-sheet-handle" aria-hidden="true" />
      <div className="flex items-start justify-between gap-3 px-5 pb-3 pt-3 sm:pt-5">
        <div>
          <h2 id="swipe-settings-title" className="font-heading text-lg font-bold text-foreground">
            SwipeLearn settings
          </h2>
          <p className="mt-0.5 text-sm text-muted-foreground">The AI that writes your cards</p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="swipe-icon-btn -mr-2 -mt-1"
          aria-label="Close settings"
        >
          <Icon name="XMarkIcon" size={20} />
        </button>
      </div>

      <div className="min-h-0 flex-1 space-y-5 overflow-y-auto overscroll-contain px-5 pb-4 scrollbar-clean">
        {/* Key */}
        <div>
          <div className="mb-1.5 flex items-center justify-between gap-2">
            <label
              htmlFor="swipe-gemini-key"
              className="text-xs font-bold tracking-wide text-muted-foreground"
            >
              Google Gemini API key
            </label>
            <a
              href="https://aistudio.google.com/app/apikey"
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 text-xs font-semibold text-foreground underline-offset-2 hover:underline"
            >
              Get a free key
              <Icon name="ArrowTopRightOnSquareIcon" size={13} />
            </a>
          </div>
          <div className="relative">
            <input
              id="swipe-gemini-key"
              type={showKey ? 'text' : 'password'}
              value={apiKey}
              onChange={(e) => {
                setApiKey(e.target.value);
                setTestStatus('idle');
              }}
              placeholder={configKey ? 'Using the key from Config' : 'AIza…'}
              autoComplete="off"
              spellCheck={false}
              className="swipe-input swipe-input-pad-end"
            />
            <button
              type="button"
              onClick={() => setShowKey((v) => !v)}
              className="absolute right-1 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-lg text-muted-foreground hover:text-foreground"
              aria-label={showKey ? 'Hide key' : 'Show key'}
            >
              <Icon name={showKey ? 'EyeSlashIcon' : 'EyeIcon'} size={18} />
            </button>
          </div>
          <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
            {usingConfigKey ? (
              <>
                Using the Gemini key saved on the{' '}
                <Link
                  href="/config"
                  className="font-semibold text-foreground underline-offset-2 hover:underline"
                >
                  Config page
                </Link>
                . Enter a key here only to use a different one for SwipeLearn.
              </>
            ) : (
              <>
                Stored only in this browser and sent straight to Google, never to our servers. A key
                saved on the{' '}
                <Link
                  href="/config"
                  className="font-semibold text-foreground underline-offset-2 hover:underline"
                >
                  Config page
                </Link>{' '}
                works here too.
              </>
            )}
          </p>
        </div>

        {/* Model */}
        <div>
          <label htmlFor="swipe-gemini-model" className="swipe-field-label">
            Model
          </label>
          <select
            id="swipe-gemini-model"
            value={model}
            onChange={(e) => {
              setModel(e.target.value);
              setTestStatus('idle');
            }}
            className="swipe-input"
          >
            {modelOptions.map((m) => (
              <option key={m.id} value={m.id}>
                {m.label}
              </option>
            ))}
          </select>
        </div>

        {testStatus === 'success' && (
          <div className="swipe-note swipe-note-ok animate-fadeIn" role="status">
            <Icon name="CheckCircleIcon" size={18} variant="solid" className="mt-px shrink-0" />
            <span>Connected. Ready to generate cards.</span>
          </div>
        )}
        {testStatus === 'error' && (
          <div className="swipe-note swipe-note-error animate-fadeIn" role="alert">
            <Icon
              name="ExclamationCircleIcon"
              size={18}
              variant="solid"
              className="mt-px shrink-0"
            />
            <span className="min-w-0 break-words">
              <span className="font-semibold">Connection failed.</span> {errorMessage}
            </span>
          </div>
        )}

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={handleTest}
            disabled={testStatus === 'testing' || !effectiveKey}
            className="swipe-secondary-btn swipe-btn-sm"
          >
            {testStatus === 'testing' ? (
              <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent" />
            ) : (
              <Icon name="SignalIcon" size={16} />
            )}
            Test connection
          </button>
          {apiKey && (
            <button
              type="button"
              onClick={() => {
                clearStoredGeminiKey();
                setApiKey('');
                setTestStatus('idle');
                onSaved();
              }}
              className="swipe-ghost-btn swipe-ghost-btn-danger"
            >
              Remove this key
            </button>
          )}
        </div>

        {/* Progress */}
        <div className="border-t border-border pt-4">
          <p className="swipe-field-label">Progress</p>
          {confirmReset ? (
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <span className="text-foreground">Start every deck over?</span>
              <button
                type="button"
                onClick={() => {
                  onResetProgress();
                  setConfirmReset(false);
                }}
                className="swipe-ghost-btn swipe-ghost-btn-danger"
              >
                Yes, reset
              </button>
              <button
                type="button"
                onClick={() => setConfirmReset(false)}
                className="swipe-ghost-btn"
              >
                Cancel
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setConfirmReset(true)}
              className="swipe-ghost-btn -ml-2"
            >
              <Icon name="ArrowPathIcon" size={16} />
              Reset swiped cards
            </button>
          )}
          <p className="mt-1 text-xs text-muted-foreground">
            Saved cards and generated cards are kept.
          </p>
        </div>
      </div>

      <div className="flex items-center justify-end gap-2 border-t border-border px-5 pb-4 pt-3">
        <button type="button" onClick={onClose} className="swipe-ghost-btn">
          Cancel
        </button>
        <button type="button" onClick={handleSave} className="swipe-primary-btn swipe-btn-sm px-5">
          Save
        </button>
      </div>
    </Modal>
  );
}
