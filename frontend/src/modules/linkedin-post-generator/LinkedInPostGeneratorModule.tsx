'use client';

import { useEffect, useState } from 'react';
import Icon from '@/components/ui/AppIcon';
import { linkedinService, type LinkedInTemplate } from '@/lib/services/linkedinService';
import GeneratorPanel from './generator/GeneratorPanel';
import TemplateLibrary from './templates/TemplateLibrary';

export default function LinkedInPostGeneratorModule() {
  const [pageTab, setPageTab] = useState<'generate' | 'templates'>('generate');
  const [templates, setTemplates] = useState<LinkedInTemplate[]>([]);

  const refreshTemplates = () => {
    linkedinService.getTemplates().then(setTemplates);
  };

  useEffect(() => {
    refreshTemplates();
  }, []);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center gap-1 rounded-lg border border-border bg-muted/30 p-1 self-start">
        <button
          type="button"
          onClick={() => setPageTab('generate')}
          className={`inline-flex items-center gap-1.5 rounded-md px-3.5 py-1.5 text-sm font-medium transition-smooth ${
            pageTab === 'generate'
              ? 'bg-card text-foreground shadow-sm'
              : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          <Icon name="SparklesIcon" size={15} variant="outline" />
          Generate
        </button>
        <button
          type="button"
          onClick={() => setPageTab('templates')}
          className={`inline-flex items-center gap-1.5 rounded-md px-3.5 py-1.5 text-sm font-medium transition-smooth ${
            pageTab === 'templates'
              ? 'bg-card text-foreground shadow-sm'
              : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          <Icon name="ArchiveBoxIcon" size={15} variant="outline" />
          Templates
          {templates.length > 0 && (
            <span className="rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-semibold text-muted-foreground">
              {templates.length}
            </span>
          )}
        </button>
      </div>

      {pageTab === 'templates' ? (
        <TemplateLibrary onTemplatesChanged={refreshTemplates} />
      ) : (
        <GeneratorPanel
          templates={templates}
          onTemplatesChanged={refreshTemplates}
          onManageTemplates={() => setPageTab('templates')}
        />
      )}
    </div>
  );
}
