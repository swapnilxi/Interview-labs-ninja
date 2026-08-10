'use client';

import { useState } from 'react';
import Icon from '@/components/ui/AppIcon';
import { usePortfolioStore } from './store/portfolioStore';
import { WIDGET_LABELS, type PortfolioWidget } from '../shared/types';
import { ItemsEditor, NoteEditor, SkillsEditor } from '../resume/sectionEditors';
import { ContactEditor, HeroEditor, StatsEditor } from './widgetEditors';

const ITEM_PH: Record<string, { title: string; subtitle: string }> = {
  projects: { title: 'Project', subtitle: 'Tech / Link' },
  experience: { title: 'Role', subtitle: 'Company' },
  education: { title: 'Degree', subtitle: 'School' },
  gallery: { title: 'Image title', subtitle: 'Image URL' },
  testimonials: { title: 'Quote', subtitle: 'Author' },
};

export default function WidgetBlock({ widget, dragHandleProps, isDragging }: { widget: PortfolioWidget; dragHandleProps?: any; isDragging?: boolean }) {
  const editWidget = usePortfolioStore((s) => s.editWidget);
  const removeWidget = usePortfolioStore((s) => s.removeWidget);
  const duplicateWidget = usePortfolioStore((s) => s.duplicateWidget);
  const [collapsed, setCollapsed] = useState(false);

  const type = widget.widget_type;
  const onContent = (content: any) => editWidget(widget.id, { content });

  const renderEditor = () => {
    if (type === 'hero') return <HeroEditor content={widget.content} onChange={onContent} />;
    if (type === 'about' || type === 'custom') return <NoteEditor content={widget.content} onChange={onContent} placeholder="Write this section…" />;
    if (type === 'contact') return <ContactEditor content={widget.content} onChange={onContent} />;
    if (type === 'skills') return <SkillsEditor content={widget.content} onChange={onContent} />;
    if (type === 'stats') return <StatsEditor content={widget.content} onChange={onContent} />;
    const ph = ITEM_PH[type] || { title: 'Title', subtitle: 'Subtitle' };
    return <ItemsEditor content={widget.content} onChange={onContent} titlePlaceholder={ph.title} subtitlePlaceholder={ph.subtitle} />;
  };

  return (
    <div className={`lab-card p-0 overflow-hidden ${isDragging ? 'ring-2 ring-primary/50 shadow-lg' : ''} ${widget.is_hidden ? 'opacity-60' : ''}`}>
      <div className="flex items-center gap-2 px-3 py-2.5 border-b border-border bg-card">
        <button {...dragHandleProps} className="cursor-grab active:cursor-grabbing p-1 text-muted-foreground hover:text-foreground touch-none" title="Drag to reorder" aria-label="Drag to reorder">
          <Icon name="Bars2Icon" size={16} />
        </button>
        <input
          className="flex-1 min-w-0 bg-transparent text-sm font-semibold text-foreground focus:outline-none"
          value={widget.title || ''}
          onChange={(e) => editWidget(widget.id, { title: e.target.value })}
          placeholder={WIDGET_LABELS[type] || 'Widget'}
        />
        <span className="text-[10px] uppercase tracking-wide text-muted-foreground bg-muted px-1.5 py-0.5 rounded flex-shrink-0">{WIDGET_LABELS[type] || type}</span>
        <div className="flex items-center flex-shrink-0">
          <button onClick={() => editWidget(widget.id, { is_hidden: !widget.is_hidden })} className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted" title={widget.is_hidden ? 'Show' : 'Hide'}>
            <Icon name={widget.is_hidden ? 'EyeSlashIcon' : 'EyeIcon'} size={15} />
          </button>
          <button onClick={() => duplicateWidget(widget.id)} className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted" title="Duplicate"><Icon name="DocumentDuplicateIcon" size={15} /></button>
          <button onClick={() => removeWidget(widget.id)} className="p-1.5 rounded-md text-muted-foreground hover:text-error hover:bg-error/5" title="Delete"><Icon name="TrashIcon" size={15} /></button>
          <button onClick={() => setCollapsed((v) => !v)} className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted" title={collapsed ? 'Expand' : 'Collapse'}>
            <Icon name="ChevronDownIcon" size={15} className={`transition-smooth ${collapsed ? '-rotate-90' : ''}`} />
          </button>
        </div>
      </div>
      {!collapsed && <div className="p-4">{renderEditor()}</div>}
    </div>
  );
}
