'use client';

import React, { useEffect, useRef, useState } from 'react';
import Icon from '@/components/ui/AppIcon';
import {
  TOPIC_OPTIONS,
  COMPANY_OPTIONS,
  cleanTopic,
  isPresetTopic,
  isPresetCompany,
  readCustomTopics,
  writeCustomTopics,
  readCustomCompanies,
  writeCustomCompanies,
} from '../topics';

interface Props {
  /** Selected topics: preset labels and/or custom topics. All presets selected by default. */
  value: string[];
  onChange: (next: string[]) => void;
  /** Selected companies (preset names and/or custom). Empty = no company filter. */
  companies: string[];
  onCompaniesChange: (next: string[]) => void;
}

/** Multi-select topic chips + a Companies multiselect dropdown. */
export default function TopicPicker({ value, onChange, companies, onCompaniesChange }: Props) {
  const [customs, setCustoms] = useState<string[]>([]);
  const [draft, setDraft] = useState('');
  const [adding, setAdding] = useState(false);

  // Companies dropdown state
  const [customCompanies, setCustomCompanies] = useState<string[]>([]);
  const [companyOpen, setCompanyOpen] = useState(false);
  const [companyDraft, setCompanyDraft] = useState('');
  const companyRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setCustoms(readCustomTopics());
    setCustomCompanies(readCustomCompanies());
  }, []);

  // Close company dropdown on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (companyRef.current && !companyRef.current.contains(e.target as Node)) {
        setCompanyOpen(false);
        setCompanyDraft('');
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  // ── Topics ─────────────────────────────────────────────────────────────────

  // A custom topic that arrives through the selection (e.g. saved in My Space) is shown as a chip too.
  const extra = value.filter((t) => !isPresetTopic(t) && !customs.some((c) => c.toLowerCase() === t.toLowerCase()));
  const customChips = [...customs, ...extra];

  const hasT = (t: string) => value.some((v) => v.toLowerCase() === t.toLowerCase());
  const toggle = (t: string) =>
    onChange(hasT(t) ? value.filter((v) => v.toLowerCase() !== t.toLowerCase()) : [...value, t]);

  const addCustom = () => {
    const t = cleanTopic(draft);
    if (!t) return;
    setDraft('');
    if (isPresetTopic(t)) {
      if (!hasT(t)) onChange([...value, TOPIC_OPTIONS.find((o) => o.toLowerCase() === t.toLowerCase()) as string]);
      return;
    }
    if (!customChips.some((c) => c.toLowerCase() === t.toLowerCase())) {
      const next = [...customs, t];
      setCustoms(next);
      writeCustomTopics(next);
    }
    if (!hasT(t)) onChange([...value, t]);
  };

  const removeCustomTopic = (t: string) => {
    const next = customs.filter((c) => c.toLowerCase() !== t.toLowerCase());
    setCustoms(next);
    writeCustomTopics(next);
    if (hasT(t)) onChange(value.filter((v) => v.toLowerCase() !== t.toLowerCase()));
  };

  const chip = (t: string, custom: boolean) => {
    const on = hasT(t);
    return (
      <span key={t} className="inline-flex items-center">
        <button
          type="button"
          aria-pressed={on}
          onClick={() => toggle(t)}
          className={`ds-chip ds-chip-btn ${on ? 'ds-tone-indigo ds-chip-on' : ''} ${custom ? 'ds-chip-custom' : ''}`}
        >
          {on && <Icon name="CheckIcon" size={12} />}
          {t}
        </button>
        {custom && (
          <button type="button" aria-label={`Remove topic ${t}`} onClick={() => removeCustomTopic(t)} className="ds-chip-x">
            <Icon name="XMarkIcon" size={12} />
          </button>
        )}
      </span>
    );
  };

  // ── Companies ──────────────────────────────────────────────────────────────

  const allCompanyOptions = [...COMPANY_OPTIONS, ...customCompanies.filter((c) => !isPresetCompany(c))];

  const filteredCompanyOptions = companyDraft.trim()
    ? allCompanyOptions.filter((c) => c.toLowerCase().includes(companyDraft.toLowerCase().trim()))
    : allCompanyOptions;

  const hasC = (c: string) => companies.some((v) => v.toLowerCase() === c.toLowerCase());
  const toggleCompany = (c: string) =>
    onCompaniesChange(hasC(c) ? companies.filter((v) => v.toLowerCase() !== c.toLowerCase()) : [...companies, c]);

  const addCustomCompany = () => {
    const c = companyDraft.trim().slice(0, 60);
    if (!c) return;
    setCompanyDraft('');
    if (isPresetCompany(c)) {
      const canonical = COMPANY_OPTIONS.find((o) => o.toLowerCase() === c.toLowerCase())!;
      if (!hasC(canonical)) onCompaniesChange([...companies, canonical]);
      return;
    }
    if (!customCompanies.some((x) => x.toLowerCase() === c.toLowerCase())) {
      const next = [...customCompanies, c];
      setCustomCompanies(next);
      writeCustomCompanies(next);
    }
    if (!hasC(c)) onCompaniesChange([...companies, c]);
  };

  const removeCustomCompany = (c: string) => {
    const next = customCompanies.filter((x) => x.toLowerCase() !== c.toLowerCase());
    setCustomCompanies(next);
    writeCustomCompanies(next);
    if (hasC(c)) onCompaniesChange(companies.filter((v) => v.toLowerCase() !== c.toLowerCase()));
  };

  const companyLabel =
    companies.length === 0
      ? 'Any company'
      : companies.length === 1
        ? companies[0]
        : `${companies[0]} +${companies.length - 1}`;

  return (
    <div className="space-y-[1.5rem]">
      {/* ── Topics ── */}
      <div>
        <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
          <p id="ds-topics" className="text-sm font-semibold ds-ink">
            Topics
          </p>
          {value.length > 0 ? (
            <button type="button" onClick={() => onChange([])} className="ds-link text-xs">
              Clear
            </button>
          ) : (
            <span className="text-xs ds-faint">Optional · a balanced mix if none</span>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2" role="group" aria-labelledby="ds-topics">
          {TOPIC_OPTIONS.map((t) => chip(t, false))}
          {customChips.map((t) => chip(t, true))}
          {!adding && (
            <button type="button" onClick={() => setAdding(true)} className="ds-chip ds-chip-btn ds-chip-add">
              <Icon name="PlusIcon" size={13} />
              Add topic
            </button>
          )}
        </div>
        {adding && (
          <div className="mt-2.5 flex gap-2">
            <input
              type="text"
              value={draft}
              maxLength={60}
              autoFocus
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  addCustom();
                }
                if (e.key === 'Escape') {
                  e.preventDefault();
                  setDraft('');
                  setAdding(false);
                }
              }}
              placeholder="e.g. Kafka or Transformers"
              aria-label="Add a custom topic"
              className="ds-field py-2.5"
            />
            <button type="button" onClick={addCustom} disabled={!cleanTopic(draft)} className="ds-btn ds-btn-primary">
              Add
            </button>
            <button
              type="button"
              onClick={() => {
                setDraft('');
                setAdding(false);
              }}
              className="ds-btn ds-btn-ghost ds-btn-icon"
              aria-label="Cancel adding a topic"
            >
              <Icon name="XMarkIcon" size={18} />
            </button>
          </div>
        )}
      </div>

      {/* ── Companies ── */}
      <div ref={companyRef} className="relative">
        <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
          <p id="ds-companies" className="text-sm font-semibold ds-ink">
            Target Companies
          </p>
          {companies.length > 0 ? (
            <button type="button" onClick={() => onCompaniesChange([])} className="ds-link text-xs">
              Clear
            </button>
          ) : (
            <span className="text-xs ds-faint">Optional · tailor questions to a company style</span>
          )}
        </div>

        {/* Selected company pills */}
        {companies.length > 0 && (
          <div className="mb-2 flex flex-wrap gap-1.5">
            {companies.map((c) => (
              <span key={c} className="inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium ds-tone-indigo ds-chip ds-chip-on">
                {c}
                <button
                  type="button"
                  aria-label={`Remove ${c}`}
                  onClick={() =>
                    isPresetCompany(c) ? toggleCompany(c) : removeCustomCompany(c)
                  }
                  className="ds-chip-x ml-0.5"
                >
                  <Icon name="XMarkIcon" size={11} />
                </button>
              </span>
            ))}
          </div>
        )}

        {/* Dropdown trigger */}
        <button
          type="button"
          aria-haspopup="listbox"
          aria-expanded={companyOpen}
          aria-labelledby="ds-companies"
          onClick={() => setCompanyOpen((o) => !o)}
          className="ds-field flex w-full items-center justify-between gap-2 py-2 text-left text-sm"
        >
          <span className={companies.length === 0 ? 'ds-faint' : 'ds-ink'}>{companyLabel}</span>
          <Icon name="ChevronDownIcon" size={16} className={`ds-faint flex-shrink-0 transition-transform ${companyOpen ? 'rotate-180' : ''}`} />
        </button>

        {/* Dropdown panel */}
        {companyOpen && (
          <div
            role="listbox"
            aria-multiselectable="true"
            aria-labelledby="ds-companies"
            className="absolute z-50 mt-1 w-full overflow-hidden rounded-xl border ds-border ds-surface shadow-lg"
          >
            {/* Search / add input */}
            <div className="border-b ds-border p-2">
              <input
                type="text"
                value={companyDraft}
                autoFocus
                placeholder="Search or add company…"
                aria-label="Search or add a company"
                className="ds-field w-full py-1.5 text-sm"
                onChange={(e) => setCompanyDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    if (filteredCompanyOptions.length === 1) {
                      toggleCompany(filteredCompanyOptions[0]);
                      setCompanyDraft('');
                    } else if (companyDraft.trim() && !allCompanyOptions.some((o) => o.toLowerCase() === companyDraft.trim().toLowerCase())) {
                      addCustomCompany();
                    }
                  }
                  if (e.key === 'Escape') {
                    e.preventDefault();
                    setCompanyOpen(false);
                    setCompanyDraft('');
                  }
                }}
              />
            </div>

            {/* Option list */}
            <ul className="max-h-52 overflow-y-auto py-1" role="presentation">
              {filteredCompanyOptions.map((c) => {
                const selected = hasC(c);
                const isCustom = !isPresetCompany(c);
                return (
                  <li key={c} role="option" aria-selected={selected}>
                    <button
                      type="button"
                      onClick={() => (isCustom ? (selected ? removeCustomCompany(c) : (toggleCompany(c))) : toggleCompany(c))}
                      className={`flex w-full items-center gap-2.5 px-3 py-1.5 text-sm transition-colors hover:ds-surface-raised ${selected ? 'ds-ink font-medium' : 'ds-faint'}`}
                    >
                      <span
                        className={`flex h-4 w-4 flex-shrink-0 items-center justify-center rounded border transition-colors ${selected ? 'bg-indigo-500 border-indigo-500' : 'ds-border'}`}
                      >
                        {selected && <Icon name="CheckIcon" size={10} className="text-white" />}
                      </span>
                      {c}
                      {isCustom && <span className="ml-auto text-xs ds-faint">custom</span>}
                    </button>
                  </li>
                );
              })}

              {/* Add custom company option when search doesn't match any existing */}
              {companyDraft.trim() && !allCompanyOptions.some((o) => o.toLowerCase() === companyDraft.trim().toLowerCase()) && (
                <li role="option" aria-selected={false}>
                  <button
                    type="button"
                    onClick={addCustomCompany}
                    className="flex w-full items-center gap-2 px-3 py-1.5 text-sm ds-faint hover:ds-surface-raised"
                  >
                    <Icon name="PlusIcon" size={14} />
                    Add &ldquo;{companyDraft.trim()}&rdquo;
                  </button>
                </li>
              )}

              {filteredCompanyOptions.length === 0 && !companyDraft.trim() && (
                <li className="px-3 py-2 text-xs ds-faint">No companies found</li>
              )}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}
