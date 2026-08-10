'use client';

import { useState } from 'react';
import Icon from '@/components/ui/AppIcon';
import { careerService } from '@/lib/services/careerService';
import { useResumeStore } from './store/resumeStore';
import { SECTION_LABELS, type ResumeSection } from '../shared/types';
import ErrorBanner from '../shared/ErrorBanner';
import { CustomFieldsEditor, ItemsEditor, NoteEditor, PersonalInfoEditor, SkillsEditor, type CustomField } from './sectionEditors';
import StreamingText from '../shared/StreamingText';

const ITEM_PLACEHOLDERS: Record<string, { title: string; subtitle: string }> = {
  experience: { title: 'Role', subtitle: 'Company' },
  education: { title: 'Degree', subtitle: 'School' },
  projects: { title: 'Project', subtitle: 'Tech / Link' },
  certifications: { title: 'Certification', subtitle: 'Issuer' },
  awards: { title: 'Award', subtitle: 'Issuer' },
  achievements: { title: 'Achievement', subtitle: 'Context' },
  research: { title: 'Title', subtitle: 'Venue' },
  languages: { title: 'Language', subtitle: 'Proficiency' },
  volunteer: { title: 'Role', subtitle: 'Organization' },
  publications: { title: 'Title', subtitle: 'Journal / Venue' },
  interests: { title: 'Interest', subtitle: 'Details' },
  patents: { title: 'Patent title', subtitle: 'Patent number / Office' },
  custom: { title: 'Title', subtitle: 'Subtitle' },
};

interface Props {
  section: ResumeSection;
  dragHandleProps?: any;
  isDragging?: boolean;
}

export default function SectionBlock({ section, dragHandleProps, isDragging }: Props) {
  const resume = useResumeStore((s) => s.resume);
  const editSection = useResumeStore((s) => s.editSection);
  const removeSection = useResumeStore((s) => s.removeSection);
  const duplicateSection = useResumeStore((s) => s.duplicateSection);

  const [collapsed, setCollapsed] = useState(false);
  const [rewrite, setRewrite] = useState<{ open: boolean; streaming: boolean; text: string; instruction: string; jobDescription: string; jdOpen: boolean; error: string | null }>({
    open: false,
    streaming: false,
    text: '',
    instruction: '',
    jobDescription: '',
    jdOpen: false,
    error: null,
  });

  const type = section.section_type;
  const onContent = (content: any) => editSection(section.id, { content });
  const sectionCustomFields: CustomField[] = Array.isArray(section.content?.custom_fields) ? section.content.custom_fields : [];
  const setSectionCustomFields = (next: CustomField[]) => onContent({ ...(section.content || {}), custom_fields: next });

  const runRewrite = async () => {
    if (!resume) return;
    setRewrite((r) => ({ ...r, open: true, streaming: true, text: '', error: null }));
    try {
      // Flush current content first so the server rewrites the latest text.
      await careerService.updateSection(resume.id, section.id, {
        content: section.content,
        title: section.title,
        is_hidden: section.is_hidden,
      });
      await careerService.rewriteSection(section.id, rewrite.instruction || undefined, rewrite.jobDescription || undefined, (chunk) =>
        setRewrite((r) => ({ ...r, text: r.text + chunk })),
      );
      setRewrite((r) => ({ ...r, streaming: false }));
    } catch (e: any) {
      setRewrite((r) => ({ ...r, streaming: false, error: e?.message || 'Rewrite failed' }));
    }
  };

  const applyRewrite = () => {
    onContent({ ...(section.content || {}), text: rewrite.text.trim() });
    setRewrite({ open: false, streaming: false, text: '', instruction: '', jobDescription: '', jdOpen: false, error: null });
  };

  const renderEditor = () => {
    if (type === 'personal_info') return <PersonalInfoEditor content={section.content} onChange={onContent} />;
    if (type === 'summary') return <NoteEditor content={section.content} onChange={onContent} placeholder="A punchy 2–3 sentence professional summary…" />;
    if (type === 'career_goals') return <NoteEditor content={section.content} onChange={onContent} placeholder="Where you're headed — target role, industry, what you want to grow into…" />;
    if (type === 'skills')
      return (
        <div className="space-y-3">
          <SkillsEditor content={section.content} onChange={onContent} />
          <NoteEditor content={section.content} onChange={onContent} label="Notes (optional)" placeholder="Any extra context…" />
        </div>
      );
    const ph = ITEM_PLACEHOLDERS[type] || ITEM_PLACEHOLDERS.custom;
    return (
      <div className="space-y-3">
        <ItemsEditor content={section.content} onChange={onContent} titlePlaceholder={ph.title} subtitlePlaceholder={ph.subtitle} />
        <NoteEditor content={section.content} onChange={onContent} label="Section note (optional)" placeholder="Short blurb shown above the entries…" />
      </div>
    );
  };

  return (
    <div className={`lab-card p-0 overflow-hidden transition-smooth ${isDragging ? 'ring-2 ring-primary/50 shadow-lg' : ''} ${section.is_hidden ? 'opacity-60' : ''}`}>
      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-2.5 border-b border-border bg-muted/40">
        <button
          {...dragHandleProps}
          className="cursor-grab active:cursor-grabbing p-1 rounded text-muted-foreground/70 hover:text-foreground hover:bg-muted touch-none"
          title="Drag to reorder"
          aria-label="Drag to reorder"
        >
          <Icon name="Bars2Icon" size={16} />
        </button>
        <input
          className="flex-1 min-w-0 bg-transparent text-sm font-semibold text-foreground focus:outline-none"
          value={section.title || ''}
          onChange={(e) => editSection(section.id, { title: e.target.value })}
          placeholder={SECTION_LABELS[type] || 'Section'}
        />
        <span className="text-[10px] font-semibold uppercase tracking-wide text-primary bg-primary/10 px-2 py-0.5 rounded-full flex-shrink-0">
          {SECTION_LABELS[type] || type}
        </span>
        <div className="flex items-center gap-0.5 flex-shrink-0 pl-1 ml-0.5 border-l border-border">
          {type !== 'personal_info' && (
            <button onClick={() => setRewrite((r) => ({ ...r, open: !r.open }))} className="p-1.5 rounded-md text-muted-foreground hover:text-primary hover:bg-primary/10" title="AI rewrite">
              <Icon name="SparklesIcon" size={15} />
            </button>
          )}
          <button onClick={() => editSection(section.id, { is_hidden: !section.is_hidden })} className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted" title={section.is_hidden ? 'Show' : 'Hide'}>
            <Icon name={section.is_hidden ? 'EyeSlashIcon' : 'EyeIcon'} size={15} />
          </button>
          <button onClick={() => duplicateSection(section.id)} className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted" title="Duplicate">
            <Icon name="DocumentDuplicateIcon" size={15} />
          </button>
          <button onClick={() => removeSection(section.id)} className="p-1.5 rounded-md text-muted-foreground hover:text-error hover:bg-error/10" title="Delete">
            <Icon name="TrashIcon" size={15} />
          </button>
          <button onClick={() => setCollapsed((v) => !v)} className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted" title={collapsed ? 'Expand' : 'Collapse'}>
            <Icon name="ChevronDownIcon" size={15} className={`transition-smooth ${collapsed ? '-rotate-90' : ''}`} />
          </button>
        </div>
      </div>

      {/* Body */}
      {!collapsed && (
        <div className="p-4 space-y-4">
          {renderEditor()}

          {type !== 'personal_info' && (
            <div className="pt-3 border-t border-border/60">
              <label className="block text-xs font-medium text-muted-foreground mb-1.5">Custom fields</label>
              <CustomFieldsEditor fields={sectionCustomFields} onChange={setSectionCustomFields} addLabel="Add custom field to this section" />
            </div>
          )}

          {rewrite.open && type !== 'personal_info' && (
            <div className="rounded-lg border border-primary/30 bg-primary/5 p-3 space-y-3 animate-fade-in">
              <div className="flex items-center gap-2">
                <input
                  className="flex-1 bg-input border border-border rounded-md px-3 py-1.5 text-xs focus-ring"
                  value={rewrite.instruction}
                  onChange={(e) => setRewrite((r) => ({ ...r, instruction: e.target.value }))}
                  placeholder="Optional instruction (e.g. 'more concise, quantify impact')"
                />
                <button onClick={runRewrite} disabled={rewrite.streaming} className="px-3 py-1.5 rounded-md bg-primary text-primary-foreground text-xs font-semibold hover:bg-primary/90 disabled:opacity-50 inline-flex items-center gap-1">
                  <Icon name="SparklesIcon" size={13} /> {rewrite.streaming ? 'Writing…' : 'Rewrite'}
                </button>
              </div>
              <button
                type="button"
                onClick={() => setRewrite((r) => ({ ...r, jdOpen: !r.jdOpen }))}
                className="text-[11px] text-muted-foreground hover:text-foreground inline-flex items-center gap-1"
              >
                <Icon name="BriefcaseIcon" size={11} />
                {rewrite.jobDescription ? 'Tailoring to a job description' : 'Tailor to a job description'}
                <Icon name="ChevronDownIcon" size={10} className={`transition-smooth ${rewrite.jdOpen ? 'rotate-180' : ''}`} />
              </button>
              {rewrite.jdOpen && (
                <textarea
                  className="w-full bg-input border border-border rounded-md px-3 py-2 text-xs focus-ring resize-y"
                  rows={4}
                  value={rewrite.jobDescription}
                  onChange={(e) => setRewrite((r) => ({ ...r, jobDescription: e.target.value }))}
                  placeholder="Paste a job description to tailor this section toward it (optional)…"
                />
              )}
              <ErrorBanner message={rewrite.error} className="" />
              {rewrite.streaming && (
                <div className="rounded-md bg-card border border-border p-3">
                  <StreamingText text={rewrite.text} streaming={rewrite.streaming} />
                </div>
              )}
              {!rewrite.streaming && rewrite.text && (
                <div>
                  <label className="block text-[11px] font-medium text-muted-foreground mb-1">Suggested rewrite — edit before applying</label>
                  <textarea
                    className="w-full bg-card border border-border rounded-md p-3 text-sm text-foreground focus-ring resize-y min-h-[110px]"
                    value={rewrite.text}
                    onChange={(e) => setRewrite((r) => ({ ...r, text: e.target.value }))}
                  />
                </div>
              )}
              {rewrite.text && !rewrite.streaming && (
                <div className="flex items-center gap-2">
                  <button onClick={applyRewrite} className="px-3 py-1.5 rounded-md bg-success/10 text-success border border-success/30 text-xs font-semibold hover:bg-success/20 inline-flex items-center gap-1">
                    <Icon name="CheckIcon" size={13} /> Apply as section note
                  </button>
                  <button onClick={() => setRewrite({ open: false, streaming: false, text: '', instruction: '', jobDescription: '', jdOpen: false, error: null })} className="px-3 py-1.5 rounded-md border border-border text-xs text-muted-foreground hover:bg-muted">
                    Dismiss
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
