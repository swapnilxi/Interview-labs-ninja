'use client';

import React, { useEffect, useId, useMemo, useState } from 'react';
import Icon from '@/components/ui/AppIcon';
import {
  LAB_GUIDES,
  type LabGuideItem,
  type LabGuideKey,
} from './labGuideData';

interface LabGuideModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialLab?: LabGuideKey;
}

export default function LabGuideModal({
  isOpen,
  onClose,
  initialLab = 'dsa',
}: LabGuideModalProps) {
  const modalTitleId = useId();
  const [activeLabKey, setActiveLabKey] = useState<LabGuideKey>(initialLab);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeTab, setActiveTab] = useState<'steps' | 'sections' | 'tips' | 'faq'>('steps');

  // Update activeLabKey whenever initialLab changes or modal opens
  useEffect(() => {
    if (isOpen) {
      setActiveLabKey(initialLab);
      setSearchQuery('');
    }
  }, [isOpen, initialLab]);

  // Handle ESC key to close modal
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  const currentLab: LabGuideItem = LAB_GUIDES[activeLabKey] || LAB_GUIDES.dsa;

  // Filter items based on search query
  const query = searchQuery.trim().toLowerCase();

  const filteredSteps = useMemo(() => {
    if (!query) return currentLab.quickSteps;
    return currentLab.quickSteps.filter(
      (s) =>
        s.title.toLowerCase().includes(query) ||
        s.summary.toLowerCase().includes(query) ||
        s.details.some((d) => d.toLowerCase().includes(query))
    );
  }, [currentLab, query]);

  const filteredSections = useMemo(() => {
    if (!query) return currentLab.sectionsExplained;
    return currentLab.sectionsExplained.filter(
      (sec) =>
        sec.name.toLowerCase().includes(query) ||
        sec.purpose.toLowerCase().includes(query) ||
        sec.proTip.toLowerCase().includes(query)
    );
  }, [currentLab, query]);

  const filteredFaqs = useMemo(() => {
    if (!query) return currentLab.faqs;
    return currentLab.faqs.filter(
      (f) =>
        f.question.toLowerCase().includes(query) ||
        f.answer.toLowerCase().includes(query)
    );
  }, [currentLab, query]);

  const filteredTips = useMemo(() => {
    if (!query) return currentLab.powerTips;
    return currentLab.powerTips.filter((t) => t.toLowerCase().includes(query));
  }, [currentLab, query]);

  if (!isOpen) return null;

  const labsList: { key: LabGuideKey; label: string; icon: string }[] = [
    { key: 'dsa', label: 'DSA Lab', icon: 'CodeBracketIcon' },
    { key: 'cv', label: 'CV Lab', icon: 'EyeIcon' },
    { key: 'system_design', label: 'System Design', icon: 'ServerStackIcon' },
    { key: 'labs_project', label: 'Labs Project', icon: 'FolderOpenIcon' },
  ];

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby={modalTitleId}
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-black/60 backdrop-blur-sm animate-fade-in"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="relative w-full max-w-4xl max-h-[92vh] flex flex-col rounded-2xl border border-border bg-card text-card-foreground shadow-2xl overflow-hidden animate-scale-in">
        {/* ── Top Bar: Lab Switcher & Close ── */}
        <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-3.5 border-b border-border bg-muted/40">
          {/* Lab Switcher Tabs */}
          <div
            role="tablist"
            aria-label="Select lab guide"
            className="flex items-center gap-1.5 overflow-x-auto py-0.5 scrollbar-clean"
          >
            {labsList.map((l) => {
              const active = l.key === activeLabKey;
              return (
                <button
                  key={l.key}
                  role="tab"
                  type="button"
                  aria-selected={active}
                  onClick={() => {
                    setActiveLabKey(l.key);
                    setSearchQuery('');
                  }}
                  className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer whitespace-nowrap ${
                    active
                      ? 'bg-foreground text-background shadow-xs'
                      : 'text-muted-foreground hover:text-foreground hover:bg-muted/70'
                  }`}
                >
                  <Icon name={l.icon} size={15} />
                  <span>{l.label}</span>
                </button>
              );
            })}
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Close guide"
            title="Close (Esc)"
            className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/80 transition-colors cursor-pointer"
          >
            <Icon name="XMarkIcon" size={18} />
          </button>
        </div>

        {/* ── Lab Hero Identity ── */}
        <div
          className="relative px-6 py-5 border-b border-border flex flex-col sm:flex-row sm:items-center justify-between gap-4"
          style={{
            background: `linear-gradient(135deg, ${currentLab.accentBg} 0%, transparent 60%)`,
          }}
        >
          <div className="flex items-start sm:items-center gap-3.5">
            <span
              className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-xl shadow-xs"
              style={{
                backgroundColor: currentLab.accentBg,
                color: currentLab.accentVar,
                border: `1px solid ${currentLab.accentVar}`,
              }}
            >
              <Icon name={currentLab.icon} size={24} />
            </span>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h2 id={modalTitleId} className="text-xl font-bold tracking-tight text-foreground">
                  {currentLab.name} Guide
                </h2>
                <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium bg-muted text-foreground border border-border">
                  How-To Handbook
                </span>
              </div>
              <p className="mt-1 text-xs sm:text-sm text-muted-foreground leading-snug max-w-2xl">
                {currentLab.tagline}
              </p>
            </div>
          </div>

          {/* Quick Search */}
          <div className="relative min-w-[200px] sm:w-64 flex-shrink-0">
            <Icon
              name="MagnifyingGlassIcon"
              size={15}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none"
            />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={`Search ${currentLab.shortName} guide…`}
              className="w-full pl-9 pr-8 py-1.5 text-xs rounded-lg border border-border bg-card text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                <Icon name="XMarkIcon" size={13} />
              </button>
            )}
          </div>
        </div>

        {/* ── Internal Tab Navigation ── */}
        <div className="flex items-center gap-2 px-6 pt-3 border-b border-border bg-card text-xs font-medium">
          <button
            type="button"
            onClick={() => setActiveTab('steps')}
            className={`pb-2.5 border-b-2 transition-colors cursor-pointer flex items-center gap-1.5 ${
              activeTab === 'steps'
                ? 'border-foreground text-foreground font-semibold'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            <Icon name="ListBulletIcon" size={14} />
            <span>How to Use ({filteredSteps.length})</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('sections')}
            className={`pb-2.5 border-b-2 transition-colors cursor-pointer flex items-center gap-1.5 ${
              activeTab === 'sections'
                ? 'border-foreground text-foreground font-semibold'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            <Icon name="Squares2X2Icon" size={14} />
            <span>Sections Explained ({filteredSections.length})</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('tips')}
            className={`pb-2.5 border-b-2 transition-colors cursor-pointer flex items-center gap-1.5 ${
              activeTab === 'tips'
                ? 'border-foreground text-foreground font-semibold'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            <Icon name="BoltIcon" size={14} />
            <span>Power Tips ({filteredTips.length})</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('faq')}
            className={`pb-2.5 border-b-2 transition-colors cursor-pointer flex items-center gap-1.5 ${
              activeTab === 'faq'
                ? 'border-foreground text-foreground font-semibold'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            <Icon name="QuestionMarkCircleIcon" size={14} />
            <span>FAQs ({filteredFaqs.length})</span>
          </button>
        </div>

        {/* ── Scrollable Body Content ── */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6 scrollbar-clean">
          {/* Overview Callout */}
          {!searchQuery && (
            <div className="p-4 rounded-xl border border-border/80 bg-muted/30 text-xs sm:text-[13px] leading-relaxed text-foreground">
              <span className="font-semibold text-foreground mr-1.5">Overview:</span>
              <span className="text-muted-foreground">{currentLab.overview}</span>
            </div>
          )}

          {/* TAB 1: HOW TO USE (STEPS) */}
          {activeTab === 'steps' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold tracking-tight text-foreground uppercase text-[11px] text-muted-foreground">
                  Step-by-Step Workflow
                </h3>
                <span className="text-xs text-muted-foreground">
                  {filteredSteps.length} {filteredSteps.length === 1 ? 'step' : 'steps'}
                </span>
              </div>

              {filteredSteps.length === 0 ? (
                <div className="py-8 text-center text-xs text-muted-foreground">
                  No steps matched &ldquo;{searchQuery}&rdquo;.
                </div>
              ) : (
                <div className="grid gap-3.5">
                  {filteredSteps.map((step) => (
                    <div
                      key={step.number}
                      className="p-4 rounded-xl border border-border bg-card/80 hover:bg-card transition-colors shadow-2xs space-y-2.5"
                    >
                      <div className="flex items-center gap-3">
                        <span
                          className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-lg text-xs font-bold"
                          style={{
                            backgroundColor: currentLab.accentBg,
                            color: currentLab.accentVar,
                          }}
                        >
                          {step.number}
                        </span>
                        <div className="min-w-0 flex-1">
                          <h4 className="text-sm font-semibold text-foreground leading-snug">
                            {step.title}
                          </h4>
                          <p className="text-xs text-muted-foreground mt-0.5">{step.summary}</p>
                        </div>
                      </div>

                      <ul className="pl-10 space-y-1.5">
                        {step.details.map((detail, idx) => (
                          <li
                            key={idx}
                            className="text-xs text-foreground/80 flex items-start gap-2 leading-relaxed"
                          >
                            <span className="h-1.5 w-1.5 rounded-full bg-primary/60 flex-shrink-0 mt-1.5" />
                            <span>{detail}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* TAB 2: SECTIONS EXPLAINED */}
          {activeTab === 'sections' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold tracking-tight text-foreground uppercase text-[11px] text-muted-foreground">
                  What Each Section Delivers
                </h3>
                <span className="text-xs text-muted-foreground">
                  {filteredSections.length} sections
                </span>
              </div>

              {filteredSections.length === 0 ? (
                <div className="py-8 text-center text-xs text-muted-foreground">
                  No sections matched &ldquo;{searchQuery}&rdquo;.
                </div>
              ) : (
                <div className="grid sm:grid-cols-2 gap-3.5">
                  {filteredSections.map((sec, idx) => (
                    <div
                      key={idx}
                      className="p-4 rounded-xl border border-border bg-card/80 flex flex-col justify-between gap-3 shadow-2xs"
                    >
                      <div className="space-y-1.5">
                        <div className="flex items-center gap-2">
                          <span className="p-1 rounded bg-muted text-foreground">
                            <Icon name={sec.icon} size={15} />
                          </span>
                          <h4 className="text-xs font-semibold text-foreground">{sec.name}</h4>
                        </div>
                        <p className="text-xs text-muted-foreground leading-relaxed">
                          {sec.purpose}
                        </p>
                      </div>

                      <div className="p-2.5 rounded-lg bg-muted/40 border border-border/50 text-[11px] text-foreground/90">
                        <span className="font-semibold text-primary">Pro Tip: </span>
                        <span>{sec.proTip}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* TAB 3: POWER TIPS & SHORTCUTS */}
          {activeTab === 'tips' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold tracking-tight text-foreground uppercase text-[11px] text-muted-foreground">
                  Productivity & Best Practices
                </h3>
              </div>

              {filteredTips.length === 0 ? (
                <div className="py-8 text-center text-xs text-muted-foreground">
                  No tips matched &ldquo;{searchQuery}&rdquo;.
                </div>
              ) : (
                <div className="space-y-2.5">
                  {filteredTips.map((tip, idx) => (
                    <div
                      key={idx}
                      className="p-3.5 rounded-xl border border-border bg-card flex items-start gap-3 shadow-2xs"
                    >
                      <span className="p-1 rounded-md bg-amber-500/10 text-amber-500 flex-shrink-0 mt-0.5">
                        <Icon name="LightBulbIcon" size={16} />
                      </span>
                      <p className="text-xs text-foreground leading-relaxed">{tip}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* TAB 4: FREQUENTLY ASKED QUESTIONS */}
          {activeTab === 'faq' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold tracking-tight text-foreground uppercase text-[11px] text-muted-foreground">
                  Frequently Asked Questions
                </h3>
              </div>

              {filteredFaqs.length === 0 ? (
                <div className="py-8 text-center text-xs text-muted-foreground">
                  No FAQs matched &ldquo;{searchQuery}&rdquo;.
                </div>
              ) : (
                <div className="space-y-3">
                  {filteredFaqs.map((faq, idx) => (
                    <div
                      key={idx}
                      className="p-4 rounded-xl border border-border bg-card shadow-2xs space-y-1.5"
                    >
                      <h4 className="text-xs sm:text-[13px] font-semibold text-foreground flex items-center gap-2">
                        <Icon name="QuestionMarkCircleIcon" size={15} className="text-primary" />
                        <span>{faq.question}</span>
                      </h4>
                      <p className="text-xs text-muted-foreground leading-relaxed pl-5">
                        {faq.answer}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* ── Footer ── */}
        <div className="flex items-center justify-between px-6 py-3.5 border-t border-border bg-muted/30">
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <kbd className="px-1.5 py-0.5 rounded border border-border bg-card text-[10px] font-mono">
              Esc
            </kbd>
            <span>to close</span>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 rounded-lg text-xs font-semibold bg-foreground text-background hover:opacity-90 transition-opacity cursor-pointer"
          >
            Got it, let&apos;s build
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * Reusable inline "Guide" button designed to sit right beside a lab title or in headers.
 */
export function LabGuideTrigger({
  label = 'Guide',
  onClick,
  title = 'Open Guide: How to use this lab',
  className = '',
}: {
  label?: string;
  onClick: () => void;
  title?: string;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={title}
      title={title}
      className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[11px] font-medium bg-muted/80 hover:bg-muted text-muted-foreground hover:text-foreground border border-border/70 transition-colors shadow-2xs cursor-pointer ${className}`}
    >
      <Icon name="BookOpenIcon" size={12} className="text-primary flex-shrink-0" />
      <span>{label}</span>
    </button>
  );
}
