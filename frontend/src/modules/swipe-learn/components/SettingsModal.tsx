'use client';

import React, { useState, useEffect } from 'react';
import Icon from '@/components/ui/AppIcon';
import {
  getStoredGeminiKey,
  saveStoredGeminiKey,
  clearStoredGeminiKey,
  getStoredGeminiModel,
  saveStoredGeminiModel,
  testGeminiConnection,
} from '../services/geminiService';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function SettingsModal({ isOpen, onClose }: SettingsModalProps) {
  const [apiKey, setApiKey] = useState('');
  const [showKey, setShowKey] = useState(false);
  const [model, setModel] = useState('gemini-2.5-flash');
  const [testStatus, setTestStatus] = useState<'idle' | 'testing' | 'success' | 'error'>('idle');
  const [errorMessage, setErrorMessage] = useState('');
  const [savedSuccess, setSavedSuccess] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setApiKey(getStoredGeminiKey());
      setModel(getStoredGeminiModel());
      setTestStatus('idle');
      setErrorMessage('');
      setSavedSuccess(false);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleTest = async () => {
    if (!apiKey.trim()) {
      setTestStatus('error');
      setErrorMessage('Please enter an API key first.');
      return;
    }

    setTestStatus('testing');
    setErrorMessage('');
    const res = await testGeminiConnection(apiKey.trim());
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
    setSavedSuccess(true);
    setTimeout(() => {
      setSavedSuccess(false);
      onClose();
    }, 800);
  };

  const handleClear = () => {
    clearStoredGeminiKey();
    setApiKey('');
    setTestStatus('idle');
    setErrorMessage('');
  };

  return (
    <div className="fixed inset-0 z-[250] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-fadeIn">
      <div
        className="w-full max-w-[500px] rounded-3xl border border-border bg-card shadow-2xl overflow-hidden animate-scaleUp"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-5 border-b border-border/70">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-2xl bg-primary/10 text-primary flex items-center justify-center">
              <Icon name="Cog6ToothIcon" size={20} />
            </div>
            <div>
              <h3 className="font-heading text-lg font-semibold text-foreground">
                SwipeLearn Settings
              </h3>
              <p className="text-xs text-muted-foreground">
                Configure Gemini API for dynamic card generation
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="theme-toggle"
            aria-label="Close settings"
          >
            <Icon name="XMarkIcon" size={18} />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-5">
          {/* API Key Input */}
          <div className="space-y-2">
            <label className="text-xs font-semibold text-foreground flex items-center justify-between">
              <span>Google Gemini API Key</span>
              <a
                href="https://aistudio.google.com/app/apikey"
                target="_blank"
                rel="noreferrer"
                className="text-primary hover:underline text-[11px] flex items-center gap-1 font-normal"
              >
                Get API Key ↗
              </a>
            </label>
            <div className="relative flex items-center">
              <input
                type={showKey ? 'text' : 'password'}
                value={apiKey}
                onChange={(e) => {
                  setApiKey(e.target.value);
                  setTestStatus('idle');
                }}
                placeholder="AIzaSy..."
                className="w-full pl-3.5 pr-10 py-2.5 rounded-2xl bg-input border border-border text-xs sm:text-sm font-mono text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40 shadow-inner"
              />
              <button
                type="button"
                onClick={() => setShowKey(!showKey)}
                className="absolute right-3 text-muted-foreground hover:text-foreground"
                title={showKey ? 'Hide key' : 'Show key'}
              >
                <Icon name={showKey ? 'EyeSlashIcon' : 'EyeIcon'} size={18} />
              </button>
            </div>
            <p className="text-[11px] text-muted-foreground leading-relaxed">
              Your API key is stored securely in your browser&apos;s local storage and is never sent to our servers.
            </p>
          </div>

          {/* Model Selector */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-foreground">Gemini Model</label>
            <select
              value={model}
              onChange={(e) => setModel(e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-2xl bg-input border border-border text-xs sm:text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40"
            >
              <option value="gemini-2.5-flash">Gemini 2.5 Flash (Fastest & recommended)</option>
              <option value="gemini-1.5-flash">Gemini 1.5 Flash</option>
              <option value="gemini-2.0-flash">Gemini 2.0 Flash</option>
            </select>
          </div>

          {/* Test Status Banner */}
          {testStatus === 'success' && (
            <div className="p-3 rounded-2xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-700 dark:text-emerald-300 text-xs flex items-center gap-2 animate-fadeIn">
              <Icon name="CheckCircleIcon" size={18} variant="solid" />
              <span>Connection verified successfully! Ready to generate cards.</span>
            </div>
          )}

          {testStatus === 'error' && (
            <div className="p-3 rounded-2xl bg-rose-500/15 border border-rose-500/30 text-rose-700 dark:text-rose-300 text-xs flex items-start gap-2 animate-fadeIn">
              <Icon name="ExclamationCircleIcon" size={18} variant="solid" className="shrink-0 mt-0.5" />
              <div>
                <span className="font-semibold block">Connection test failed:</span>
                <span className="text-[11px] opacity-90">{errorMessage}</span>
              </div>
            </div>
          )}

          {savedSuccess && (
            <div className="p-3 rounded-2xl bg-primary/15 border border-primary/30 text-primary text-xs flex items-center gap-2 animate-fadeIn">
              <Icon name="CheckCircleIcon" size={18} variant="solid" />
              <span>Settings saved successfully!</span>
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-border/60">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleTest}
                disabled={testStatus === 'testing' || !apiKey.trim()}
                className="px-3.5 py-2 rounded-xl border border-border bg-card hover:bg-muted text-xs font-semibold text-foreground transition-all disabled:opacity-50"
              >
                {testStatus === 'testing' ? 'Testing...' : 'Test Connection'}
              </button>

              {apiKey && (
                <button
                  type="button"
                  onClick={handleClear}
                  className="px-3 py-2 text-xs font-semibold text-rose-500 hover:underline"
                >
                  Clear Key
                </button>
              )}
            </div>

            <button
              type="button"
              onClick={handleSave}
              className="px-5 py-2 rounded-xl bg-primary text-primary-foreground font-semibold text-xs shadow-md shadow-primary/20 hover:bg-primary/90 transition-all"
            >
              Save Settings
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
