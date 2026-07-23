'use client';

import { useState, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import Header from '@/components/common/Header';
import Icon from '@/components/ui/AppIcon';
import TaskTree from '@/modules/todo/TaskTree';
import TodoCopilot from '@/modules/todo/TodoCopilot';

const VALID_TABS: TodoTab[] = ['quick', 'smart', 'plan'];

function TodoPageInner() {
  const searchParams = useSearchParams();
  const router = useRouter();

  const rawTab = searchParams.get('tab') as TodoTab | null;
  const activeTab: TodoTab = rawTab && VALID_TABS.includes(rawTab) ? rawTab : 'smart';

  const setActiveTab = useCallback((tab: TodoTab) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set('tab', tab);
    router.push(`/todo?${params.toString()}`);
  }, [router, searchParams]);

  const [model, setModel] = useState<'ollama' | 'gemini'>('gemini');
  const [copilotOpen, setCopilotOpen] = useState(true);

  return (
    <>
      <Header />
      <div className="h-screen overflow-hidden bg-background pt-[60px] text-foreground">
        <div className="flex h-full">
          {/* Main content area */}
          <div className="flex-1 overflow-y-auto scrollbar-clean">
            <div className="max-w-[900px] mx-auto px-4 sm:px-6 lg:px-8 py-6">
              {/* Page header */}
              <div className="mb-6">
                <div className="flex items-center gap-3 mb-2">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-gradient-to-br from-primary/20 to-secondary/20">
                    <Icon name="ClipboardDocumentCheckIcon" size={22} variant="outline" className="text-primary" />
                  </div>
                  <div>
                    <h1 className="font-heading text-2xl font-bold text-foreground">AI To-Do</h1>
                    <p className="text-xs text-muted-foreground">
                      Break tasks infinitely deep with AI · Track progress · Stay productive
                    </p>
                  </div>
                </div>
              </div>

              {/* Task Tree */}
              <TaskTree model={model} />
              {/* Tab Switcher */}
              <div className="mb-6">
                <TabSwitcher activeTab={activeTab} onTabChange={setActiveTab} />
              </div>

              {/* Tab Content */}
              {activeTab === 'quick' && (
                <QuickDaily model={model} />
              )}

              {activeTab === 'smart' && (
                <SmartTodo key={refreshKey} model={model} />
              )}

              {activeTab === 'plan' && (
                <PlanProject model={model} />
              )}
            </div>
          </div>

          {/* Copilot toggle button (when collapsed) */}
          {!copilotOpen && (
            <button
              onClick={() => setCopilotOpen(true)}
              className="flex-shrink-0 w-12 h-full border-l border-border bg-card flex flex-col items-center pt-4 gap-2 hover:bg-muted/50 transition-smooth"
              title="Open Copilot"
            >
              <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center">
                <Icon name="SparklesIcon" size={14} className="text-primary" variant="solid" />
              </div>
              <span className="text-[9px] font-medium text-muted-foreground writing-mode-vertical" style={{ writingMode: 'vertical-rl' }}>
                Copilot
              </span>
            </button>
          )}

          {/* Copilot sidebar */}
          {copilotOpen && (
            <div className="flex-shrink-0 w-[320px] border-l border-border bg-card hidden lg:block">
              <TodoCopilot
                model={model}
                onModelChange={setModel}
                onCollapse={() => setCopilotOpen(false)}
              />
            </div>
          )}
        </div>
      </div>
    </>
  );
}

export default function TodoPage() {
  return (
    <Suspense fallback={null}>
      <TodoPageInner />
    </Suspense>
  );
}
