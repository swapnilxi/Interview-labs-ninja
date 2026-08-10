'use client';

import { useState, useCallback, useEffect, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import Header from '@/components/common/Header';
import Icon from '@/components/ui/AppIcon';
import TaskTree from '@/modules/todo/tasks/TaskTree';
import TodoCopilot from '@/modules/todo/tasks/TodoCopilot';
import TabSwitcher, { TodoTab } from '@/modules/todo/shared/TabSwitcher';
import QuickDaily from '@/modules/todo/quick/QuickDaily';
import SmartTodo from '@/modules/todo/tasks/SmartTodo';
import PlanProject from '@/modules/todo/projects/PlanProject';
import Goals from '@/modules/todo/goals/Goals';
import { todoService } from '@/lib/services/todoService';

const VALID_TABS: TodoTab[] = ['quick', 'smart', 'plan', 'goals'];

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

  // Distraction Inbox states (Feature 6)
  const [captureOpen, setCaptureOpen] = useState(false);
  const [inboxOpen, setInboxOpen] = useState(false);
  const [inboxItems, setInboxItems] = useState<any[]>([]);
  const [captureText, setCaptureText] = useState('');
  const [refreshKey, setRefreshKey] = useState(0);

  const loadInbox = useCallback(async () => {
    const items = await todoService.getInboxItems();
    setInboxItems(items || []);
  }, []);

  useEffect(() => {
    loadInbox();
  }, [loadInbox]);

  // Hotkey listener: Alt/Option + D
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.altKey || e.metaKey) && e.key.toLowerCase() === 'd') {
        e.preventDefault();
        setCaptureOpen(prev => !prev);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

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

              {activeTab === 'goals' && (
                <Goals model={model} />
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

      {/* Floating Distraction Button (bottom-left, Feature 6) */}
      <div className="fixed bottom-6 left-6 z-50 flex flex-col items-start gap-2">
        <button
          onClick={() => setCaptureOpen(prev => !prev)}
          className="w-14 h-14 rounded-full bg-amber-500 text-white shadow-lg hover:shadow-xl hover:scale-105 transition-smooth flex items-center justify-center relative"
          title="Capture distraction (Alt+D)"
        >
          <Icon name="InboxIcon" size={24} variant="solid" />
          {inboxItems.length > 0 && (
            <span className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-red-500 text-[10px] font-bold text-white flex items-center justify-center animate-bounce">
              {inboxItems.length}
            </span>
          )}
        </button>
      </div>

      {/* Instant Capture Popup */}
      {captureOpen && (
        <div className="fixed bottom-22 left-6 z-50 w-80 p-4 rounded-xl bg-card border border-border shadow-2xl animate-slide-up">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-bold text-foreground flex items-center gap-1">
              <span>📥 Capture Distraction</span>
              <span className="text-[10px] text-muted-foreground font-normal">(Alt+D)</span>
            </span>
            <button
              onClick={() => { setInboxOpen(true); setCaptureOpen(false); }}
              className="text-[10px] text-primary hover:underline font-semibold"
            >
              View Inbox ({inboxItems.length})
            </button>
          </div>
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              if (!captureText.trim()) return;
              await todoService.createInboxItem(captureText.trim());
              setCaptureText('');
              setCaptureOpen(false);
              loadInbox();
            }}
          >
            <input
              type="text"
              autoFocus
              value={captureText}
              onChange={e => setCaptureText(e.target.value)}
              placeholder="e.g. read css grid blog post..."
              className="w-full bg-input border border-border rounded-lg px-3 py-2 text-sm text-foreground focus-ring placeholder:text-muted-foreground"
            />
            <div className="flex justify-end gap-2 mt-3">
              <button
                type="button"
                onClick={() => setCaptureOpen(false)}
                className="px-2.5 py-1 rounded text-xs text-muted-foreground hover:bg-muted transition-smooth"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={!captureText.trim()}
                className="px-3 py-1 rounded bg-primary text-primary-foreground font-semibold text-xs hover:bg-primary/95 transition-smooth disabled:opacity-50"
              >
                Capture
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Conversion Drawer (Inbox slide-over) */}
      {inboxOpen && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex justify-end">
          <div className="w-full sm:w-[400px] bg-card border-l border-border h-full flex flex-col shadow-2xl animate-slide-in">
            {/* Header */}
            <div className="p-4 border-b border-border flex items-center justify-between bg-muted/30">
              <div className="flex items-center gap-2">
                <Icon name="InboxIcon" size={18} className="text-amber-500" variant="solid" />
                <span className="font-heading text-sm font-semibold text-foreground">Distraction Inbox</span>
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-600 dark:text-amber-400 font-bold">
                  {inboxItems.length} Unprocessed
                </span>
              </div>
              <button
                onClick={() => setInboxOpen(false)}
                className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground"
              >
                <Icon name="XMarkIcon" size={16} />
              </button>
            </div>

            {/* List */}
            <div className="flex-1 overflow-y-auto p-4 space-y-3 scrollbar-clean">
              {inboxItems.length === 0 ? (
                <div className="text-center py-12 space-y-2 text-muted-foreground">
                  <span className="text-3xl">🏜️</span>
                  <p className="text-xs">Your distraction inbox is empty!</p>
                </div>
              ) : (
                inboxItems.map(item => (
                  <div key={item.id} className="p-3 border border-border rounded-lg bg-muted/20 space-y-2.5">
                    <p className="text-xs text-foreground font-medium leading-relaxed">{item.content}</p>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={async () => {
                          const task = await todoService.createTask({
                            title: item.content,
                            priority: 'p3',
                            status: 'backlog',
                            context: 'Converted from Distraction Inbox'
                          });
                          if (task) {
                            await todoService.deleteInboxItem(item.id);
                            loadInbox();
                            setRefreshKey(prev => prev + 1);
                          }
                        }}
                        className="flex-1 py-1 rounded bg-primary/10 hover:bg-primary/20 text-primary font-semibold text-[10px] transition-smooth flex items-center justify-center gap-0.5"
                      >
                        ⚡ Quick Task
                      </button>
                      <button
                        onClick={async () => {
                          await todoService.deleteInboxItem(item.id);
                          loadInbox();
                        }}
                        className="py-1 px-3 rounded border border-border hover:bg-red-500/10 hover:text-red-500 text-muted-foreground font-semibold text-[10px] transition-smooth"
                      >
                        Dismiss
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>

            {/* Footer */}
            <div className="p-4 border-t border-border bg-muted/20 text-center">
              <p className="text-[10px] text-muted-foreground">
                Convert distractions to tasks to schedule them, or dismiss them to clear your mind.
              </p>
            </div>
          </div>
        </div>
      )}
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
