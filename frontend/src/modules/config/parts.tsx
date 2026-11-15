'use client';

import React, { useState, type ReactNode } from 'react';
import Icon from '@/components/ui/AppIcon';
import type { UserSettings } from '@/lib/services/settingsService';
import { TIERS, type KeyField, type Tier } from './catalog';
import { useConfig } from './ConfigContext';

/* Spacing keys 6/12/18/24/36/48 are PIXELS in this repo, so rem values are written `[1.5rem]`. */
export const FIELD = 'todo-input h-11 px-3.5 text-[15px] sm:h-10 sm:text-sm';
export const CODE = 'rounded bg-muted px-1.5 py-0.5 font-code text-xs';

export function TierChip({ tier }: { tier?: Tier }) {
  if (!tier) return null;
  const t = TIERS[tier];
  return <span className={`cfg-tier ${t.cls}`}>{t.label}</span>;
}

/** The title of the open section: what it is for, in one line. */
export function SectionHeader({ title, sub }: { title: string; sub: ReactNode }) {
  return (
    <header className="mb-[1.25rem]">
      <h2 className="todo-section-title">{title}</h2>
      <p className="todo-section-sub max-w-[36rem]">{sub}</p>
    </header>
  );
}

/** A heading above one group of rows or fields. */
export function GroupHeading({
  title,
  description,
  trailing,
  id,
}: {
  title: string;
  description?: ReactNode;
  trailing?: ReactNode;
  id?: string;
}) {
  return (
    <div className="mb-2.5 flex items-end justify-between gap-3 px-1">
      <div className="min-w-0">
        <h3 id={id} className="text-[15px] font-semibold leading-snug text-foreground">
          {title}
        </h3>
        {description && (
          <p className="mt-0.5 text-[13px] leading-snug text-muted-foreground">{description}</p>
        )}
      </div>
      {trailing}
    </div>
  );
}

export function Notice({
  tone = 'info',
  icon,
  children,
  className = '',
}: {
  tone?: 'info' | 'warn' | 'ok' | 'error';
  icon?: string;
  children: ReactNode;
  className?: string;
}) {
  const tones = {
    info: { box: 'cfg-notice', icon: 'InformationCircleIcon', iconCls: 'text-muted-foreground' },
    ok: { box: 'cfg-notice cfg-notice-ok', icon: 'CheckCircleIcon', iconCls: 'text-success' },
    warn: {
      box: 'cfg-notice cfg-notice-warn',
      icon: 'ExclamationTriangleIcon',
      iconCls: 'text-warning',
    },
    error: {
      box: 'cfg-notice cfg-notice-error',
      icon: 'ExclamationCircleIcon',
      iconCls: 'text-error',
    },
  }[tone];
  return (
    <div className={`${tones.box} ${className}`}>
      <Icon
        name={icon ?? tones.icon}
        size={17}
        variant="solid"
        className={`mt-px shrink-0 ${tones.iconCls}`}
      />
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}

/** The settings that hold plain text (everything but the added-model list and the endpoint keys). */
export type TextSetting = {
  [K in keyof UserSettings]: UserSettings[K] extends string ? K : never;
}[keyof UserSettings];

/** A labelled text field bound to one setting (URLs, model names). */
export function SettingField({
  id,
  label,
  field,
  placeholder,
  hint,
  trailing,
}: {
  id: string;
  label: string;
  field: TextSetting;
  placeholder?: string;
  hint?: ReactNode;
  trailing?: ReactNode;
}) {
  const { settings, edit } = useConfig();
  return (
    <div className="space-y-1.5">
      <div className="flex items-baseline justify-between gap-3">
        <label htmlFor={id} className="text-[13px] font-semibold text-foreground">
          {label}
        </label>
        {trailing}
      </div>
      <input
        id={id}
        type="text"
        inputMode="url"
        autoComplete="off"
        spellCheck={false}
        value={settings[field]}
        onChange={(e) => edit({ [field]: e.target.value } as Partial<UserSettings>)}
        placeholder={placeholder}
        className={FIELD}
      />
      {hint && <p className="text-xs leading-snug text-muted-foreground">{hint}</p>}
    </div>
  );
}

export interface SecretField {
  key: KeyField | 'youtubeApiKey';
  label: string;
  placeholder: string;
  getKeyUrl?: string;
}

/** A password-style field with a show/hide toggle (API keys). */
export function SecretInput({
  id,
  value,
  onChange,
  placeholder,
}: {
  id: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}) {
  const [visible, setVisible] = useState(false);
  return (
    <div className="relative min-w-0 flex-1">
      <input
        id={id}
        type={visible ? 'text' : 'password'}
        autoComplete="off"
        spellCheck={false}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className={`${FIELD} pr-[2.75rem] font-code`}
      />
      <button
        type="button"
        onClick={() => setVisible((v) => !v)}
        className="todo-focus absolute right-1 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full text-muted-foreground transition-smooth hover:text-foreground"
        aria-label={visible ? 'Hide key' : 'Show key'}
      >
        <Icon name={visible ? 'EyeSlashIcon' : 'EyeIcon'} size={18} />
      </button>
    </div>
  );
}

/**
 * An API key: hidden by default, a real test call, and where to get one. The test covers the providers the
 * backend's /config/test-key knows (not YouTube, not the custom endpoint).
 */
export function KeyInput({
  field,
  id,
  hideLabel = false,
}: {
  field: SecretField;
  id: string;
  hideLabel?: boolean;
}) {
  const { settings, edit, keyTests, testKey } = useConfig();
  const value = settings[field.key];
  const testField = field.key === 'youtubeApiKey' || field.key === 'customKey' ? null : field.key;
  const test = testField ? keyTests[testField] : undefined;

  return (
    <div className="space-y-1.5">
      <div className={`flex items-baseline justify-between gap-3 ${hideLabel ? 'sr-only' : ''}`}>
        <label htmlFor={id} className="text-[13px] font-semibold text-foreground">
          {field.label}
        </label>
        {field.getKeyUrl && !hideLabel && <GetKeyLink href={field.getKeyUrl} />}
      </div>
      <div className="flex items-center gap-2">
        <SecretInput
          id={id}
          value={value}
          onChange={(v) => edit({ [field.key]: v } as Partial<UserSettings>)}
          placeholder={field.placeholder}
        />
        {testField && (
          <button
            type="button"
            onClick={() => testKey(testField)}
            disabled={!value.trim() || test?.loading}
            title="Make one small request with this key"
            className="todo-btn todo-btn-quiet h-10 shrink-0 px-4 text-sm"
          >
            {test?.loading ? (
              <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent" />
            ) : null}
            Test
          </button>
        )}
      </div>
      {test && !test.loading && (
        <p
          role="status"
          className={`flex items-start gap-1.5 break-words text-xs font-medium ${test.ok ? 'text-success' : 'text-error'}`}
        >
          <Icon
            name={test.ok ? 'CheckCircleIcon' : 'XCircleIcon'}
            size={14}
            variant="solid"
            className="mt-px shrink-0"
          />
          <span className="min-w-0">
            {test.ok ? 'Key works' : test.message || 'The key did not work'}
          </span>
        </p>
      )}
      {hideLabel && field.getKeyUrl && (
        <p className="text-xs text-muted-foreground">
          Don&apos;t have one? <GetKeyLink href={field.getKeyUrl} />
        </p>
      )}
    </div>
  );
}

export function GetKeyLink({
  href,
  children = 'Get a key',
}: {
  href: string;
  children?: ReactNode;
}) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="todo-focus inline-flex items-center gap-1 rounded-sm text-xs font-semibold lab-ink hover:underline"
    >
      {children}
      <Icon name="ArrowTopRightOnSquareIcon" size={12} />
    </a>
  );
}
