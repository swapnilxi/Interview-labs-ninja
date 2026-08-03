'use client';

import { useState } from 'react';
import Icon from '@/components/ui/AppIcon';
import { careerService } from '@/lib/services/careerService';
import { useResumeStore } from './store/resumeStore';
import { SECTION_LABELS, type ResumeSection } from './types';
import { ItemsEditor, NoteEditor, PersonalInfoEditor, SkillsEditor } from './sectionEditors';
import StreamingText from './StreamingText';

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

  const [collapsed, setCollapsed] = useState(section.section_type === 'personal_info' ? false : false);
  const [rewrite, setRewrite] = useState<{ open: boolean; streaming: boolean; text: string; instruction: string; error: string | null }>({
    open: false,
    streaming: false,
    text: '',
    instruction: '',
    error: null,
  });

  const type = section.section_type;
  const onContent = (content: any) => editSection(section.id, { content });

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
      await careerService.rewriteSection(section.id, rewrite.instruction || undefined, (chunk) =>
        setRewrite((r) => ({ ...r, text: r.text + chunk })),
      );
      setRewrite((r) => ({ ...r, streaming: false }));
    } catch (e: any) {
      setRewrite((r) => ({ ...r, streaming: false, error: e?.message || 'Rewrite failed' }));
    }
  };

  const applyRewrite = () => {
    onContent({ ...(section.content || {}), text: rewrite.text.trim() });
    setRewrite({ open: false, streaming: false, text: '', instruction: '', error: null });
  };

  const renderEditor = () => {
    if (type === 'personal_info') return <PersonalInfoEditor content={section.content} onChange={onContent} />;
    if (type === 'summary') return <NoteEditor content={section.content} onChange={onContent} placeholder="A punchy 2–3 sentence professional summary…" />;
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
    <div className={`lab-card p-0 overflow-hidden ${isDragging ? 'ring-2 ring-primary/50 shadow-lg' : ''} ${section.is_hidden ? 'opacity-60' : ''}`}>
      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-2.5 border-b border-border bg-card">
        <button
          {...dragHandleProps}
          className="cursor-grab active:cursor-grabbing p-1 text-muted-foreground hover:text-foreground touch-none"
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
        <span className="text-[10px] uppercase tracking-wide text-muted-foreground bg-muted px-1.5 py-0.5 rounded flex-shrink-0">
          {SECTION_LABELS[type] || type}
        </span>
        <div className="flex items-center flex-shrink-0">
          {type !== 'personal_info' && (
            <button onClick={() => setRewrite((r) => ({ ...r, open: !r.open }))} className="p-1.5 rounded-md text-muted-foreground hover:text-primary hover:bg-primary/5" title="AI rewrite">
              <Icon name="SparklesIcon" size={15} />
            </button>
          )}
          <button onClick={() => editSection(section.id, { is_hidden: !section.is_hidden })} className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted" title={section.is_hidden ? 'Show' : 'Hide'}>
            <Icon name={section.is_hidden ? 'EyeSlashIcon' : 'EyeIcon'} size={15} />
          </button>
          <button onClick={() => duplicateSection(section.id)} className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted" title="Duplicate">
            <Icon name="DocumentDuplicateIcon" size={15} />
          </button>
          <button onClick={() => removeSection(section.id)} className="p-1.5 rounded-md text-muted-foreground hover:text-error hover:bg-error/5" title="Delete">
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
              {rewrite.error && <p className="text-xs text-error">{rewrite.error}</p>}
              {(rewrite.text || rewrite.streaming) && (
                <div className="rounded-md bg-card border border-border p-3">
                  <StreamingText text={rewrite.text} streaming={rewrite.streaming} />
                </div>
              )}
              {rewrite.text && !rewrite.streaming && (
                <div className="flex items-center gap-2">
                  <button onClick={applyRewrite} className="px-3 py-1.5 rounded-md bg-success/10 text-success border border-success/30 text-xs font-semibold hover:bg-success/20 inline-flex items-center gap-1">
                    <Icon name="CheckIcon" size={13} /> Apply as section note
                  </button>
                  <button onClick={() => setRewrite({ open: false, streaming: false, text: '', instruction: '', error: null })} className="px-3 py-1.5 rounded-md border border-border text-xs text-muted-foreground hover:bg-muted">
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
