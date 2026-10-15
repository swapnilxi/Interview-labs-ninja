'use client';

import { useEffect, useState } from 'react';
import Icon from '@/components/ui/AppIcon';
import { linkedinService, type LinkedInTemplate } from '@/lib/services/linkedinService';
import { useUrlState } from '@/lib/navigation/urlState';
import GeneratorPanel from './generator/GeneratorPanel';
import TemplateLibrary from './templates/TemplateLibrary';

type PageTab = 'generate' | 'templates';

export default function LinkedInPostGeneratorModule() {
  // The tab lives in the URL (?tab=templates) so Back/Forward, a refresh and a shared link keep it.
  // The generator is the default screen, so a missing or unknown value falls back to it.
  const { get, update } = useUrlState();
  const pageTab: PageTab = get('tab') === 'templates' ? 'templates' : 'generate';
  const setPageTab = (tab: PageTab) => {
    if (tab !== pageTab) update({ tab: tab === 'generate' ? null : tab });
  };
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
