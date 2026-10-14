'use client';

import { useState, useCallback, useEffect, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import Header from '@/components/common/Header';
import Icon from '@/components/ui/AppIcon';
import Modal from '@/components/ui/Modal';
import ToastHost from '@/components/ui/ToastHost';
import ConfirmHost from '@/components/ui/ConfirmHost';
import { useDistractionShortcutLabel } from '@/modules/ai-todo/shared/useDistractionShortcutLabel';
import TaskTree from '@/modules/ai-todo/tasks/TaskTree';
import TodoCopilot from '@/modules/ai-todo/tasks/TodoCopilot';
import TabSwitcher, { TodoTab } from '@/modules/ai-todo/shared/TabSwitcher';
import QuickDaily from '@/modules/ai-todo/quick/QuickDaily';
import SmartTodo from '@/modules/ai-todo/tasks/SmartTodo';
import PlanProject from '@/modules/ai-todo/projects/PlanProject';
import Goals from '@/modules/ai-todo/goals/Goals';
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
    router.push(`/ai-todo?${params.toString()}`);
  }, [router, searchParams]);

  const [model, setModel] = useState<'ollama' | 'gemini'>('gemini');
  const [copilotOpen, setCopilotOpen] = useState(true);

  // Distraction Inbox states (Feature 6)
  const [captureOpen, setCaptureOpen] = useState(false);
  const [inboxOpen, setInboxOpen] = useState(false);
  const [inboxItems, setInboxItems] = useState<any[]>([]);
  const [captureText, setCaptureText] = useState('');
  const [captureSaving, setCaptureSaving] = useState(false);
  const [captureError, setCaptureError] = useState<string | null>(null);
  const [convertError, setConvertError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  const loadInbox = useCallback(async () => {
    const items = await todoService.getInboxItems();
    setInboxItems(items || []);
  }, []);

  useEffect(() => {
    loadInbox();
  }, [loadInbox]);

  const shortcutLabel = useDistractionShortcutLabel();

  // Hotkey listener: Alt/Option + D
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!(e.altKey || e.metaKey) || e.ctrlKey || e.shiftKey || e.repeat || e.isComposing) return;
      // Match the physical key: on macOS, Option+D types "∂", so `e.key === 'd'` never matched there.
      const isD = e.code === 'KeyD' || e.key.toLowerCase() === 'd' || e.key === '∂';
      if (!isD) return;
      // Not while a dialog is open — the capture popover would open behind it.
      if (document.querySelector('[data-modal-root]')) return;
      e.preventDefault();
      setCaptureOpen(prev => !prev);
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  return (
    <>
      <Header />
      <ToastHost />
      <ConfirmHost />
      <div className="h-app-screen overflow-hidden bg-background pt-[60px] text-foreground">
        {/* .todo-shell + data-copilot let the floating buttons stay clear of the Copilot panel */}
        <div className="todo-shell flex h-full" data-copilot={copilotOpen ? 'open' : 'collapsed'}>
          {/* Main content area */}
          <div className="flex-1 min-w-0 overflow-y-auto scrollbar-clean">
            <div className="max-w-[1440px] mx-auto px-4 sm:px-[2rem] lg:px-[2.5rem] pt-[2rem] pb-[7rem]">
              {/* Page header */}
              <div className="mb-[1.75rem] flex items-center gap-4">
                <span className="todo-icon-chip h-[2.75rem] w-[2.75rem]">
                  <Icon name="ClipboardDocumentCheckIcon" size={22} />
                </span>
                <div className="min-w-0">
                  <h1 className="font-heading text-xl font-bold leading-tight text-foreground sm:text-2xl">AI To-Do</h1>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Break tasks infinitely deep with AI · Track progress · Stay productive
                  </p>
                </div>
              </div>

              {/* Tab Switcher */}
              <div className="mb-[2rem]">
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

          {/* Copilot toggle button (when collapsed) — the panel itself only exists at lg+ */}
          {!copilotOpen && (
            <button
              onClick={() => setCopilotOpen(true)}
              className="todo-focus hidden lg:flex flex-shrink-0 w-[48px] h-full border-l border-border bg-card flex-col items-center pt-4 gap-2 hover:bg-muted transition-smooth"
              title="Open Copilot"
              aria-label="Open Task Copilot"
            >
              <span className="todo-icon-chip h-8 w-8 rounded-full">
                <Icon name="SparklesIcon" size={14} variant="solid" />
              </span>
              <span className="text-xs font-medium text-muted-foreground writing-mode-vertical" style={{ writingMode: 'vertical-rl' }}>
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

      {/* Floating Distraction Button (bottom-left, Feature 6) — kept inside the main column */}
      <button
        onClick={() => { setCaptureOpen(prev => !prev); setCaptureError(null); }}
        className="todo-fab todo-fab-left bg-accent text-accent-foreground"
        title={`Capture distraction (${shortcutLabel})`}
        aria-label={`Capture a distraction (${shortcutLabel})${inboxItems.length ? `, ${inboxItems.length} in inbox` : ''}`}
        aria-expanded={captureOpen}
      >
        <Icon name="InboxArrowDownIcon" size={22} />
        {inboxItems.length > 0 && (
          <span className="absolute -top-1 -right-1 min-w-5 h-5 px-1 rounded-full bg-error text-xs font-bold text-error-foreground flex items-center justify-center" aria-hidden="true">
            {inboxItems.length}
          </span>
        )}
      </button>

      {/* Instant Capture Popup */}
      {captureOpen && (
        <div className="todo-fab-popover todo-popover p-4 animate-fade-in" role="dialog" aria-label="Capture distraction">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-bold text-foreground flex items-center gap-1.5">
              <Icon name="InboxArrowDownIcon" size={14} className="text-accent" />
              <span>Capture Distraction</span>
              <span className="text-xs text-muted-foreground font-normal">({shortcutLabel})</span>
            </span>
            <button
              onClick={() => { setInboxOpen(true); setCaptureOpen(false); }}
              className="todo-focus rounded text-xs text-primary hover:underline font-semibold"
            >
              View Inbox ({inboxItems.length})
            </button>
          </div>
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              if (!captureText.trim() || captureSaving) return;
              setCaptureSaving(true);
              setCaptureError(null);
              const item = await todoService.createInboxItem(captureText.trim());
              setCaptureSaving(false);
              if (!item) {
                // Keep the text so the thought isn't lost.
                setCaptureError("Couldn't save to your inbox. Please try again.");
                return;
              }
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
              onKeyDown={e => { if (e.key === 'Escape') setCaptureOpen(false); }}
              placeholder="e.g. read css grid blog post..."
              aria-label="Distraction to capture"
              className="todo-input px-3 py-2 text-sm"
            />
            {captureError && (
              <p role="alert" className="mt-2 text-xs text-error">{captureError}</p>
            )}
            <div className="flex justify-end gap-2 mt-3">
              <button
                type="button"
                onClick={() => setCaptureOpen(false)}
                className="todo-btn todo-btn-ghost"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={!captureText.trim() || captureSaving}
                className="todo-btn todo-btn-primary"
              >
                Capture
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Conversion Drawer (Inbox slide-over) */}
      <Modal
        isOpen={inboxOpen}
        onClose={() => setInboxOpen(false)}
        labelledBy="todo-inbox-title"
        backdropClassName="bg-black/40 backdrop-blur-sm"
        overlayClassName="flex justify-end"
        className="w-full sm:w-[400px] bg-card border-l border-border h-full flex flex-col shadow-2xl"
      >
        {/* Header */}
        <div className="p-4 border-b border-border flex items-center justify-between mix-bg-muted/30">
          <div className="flex items-center gap-2">
            <Icon name="InboxIcon" size={18} className="text-accent" variant="solid" />
            <span id="todo-inbox-title" className="font-heading text-sm font-semibold text-foreground">Distraction Inbox</span>
            <span className="text-xs px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-600 dark:text-amber-400 font-bold">
              {inboxItems.length} Unprocessed
            </span>
          </div>
          <button
            onClick={() => setInboxOpen(false)}
            className="todo-btn todo-btn-ghost p-1"
            aria-label="Close inbox"
          >
            <Icon name="XMarkIcon" size={16} />
          </button>
        </div>

        {/* List */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3 scrollbar-clean">
          {convertError && (
            <div role="alert" className="todo-alert todo-alert-error">
              <Icon name="ExclamationTriangleIcon" size={14} className="mt-px shrink-0" />
              <p className="flex-1 leading-relaxed">{convertError}</p>
            </div>
          )}
          {inboxItems.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-10 text-center text-muted-foreground">
              <span className="flex h-10 w-10 items-center justify-center rounded-full bg-muted">
                <Icon name="InboxIcon" size={20} />
              </span>
              <p className="text-xs">Your distraction inbox is empty.</p>
            </div>
          ) : (
            inboxItems.map(item => (
              <div key={item.id} className="p-3 border border-border rounded-lg mix-bg-muted/20 space-y-2.5">
                <p className="text-xs text-foreground font-medium leading-relaxed">{item.content}</p>
                <div className="flex items-center gap-2">
                  <button
                    onClick={async () => {
                      setConvertError(null);
                      try {
                        await todoService.createTaskStrict({
                          title: item.content,
                          priority: 'p3',
                          status: 'backlog',
                          context: 'Converted from Distraction Inbox'
                        });
                      } catch (err) {
                        // Inbox item is kept, so nothing is lost.
                        setConvertError(err instanceof Error ? err.message : "Couldn't convert it to a task.");
                        return;
                      }
                      await todoService.deleteInboxItem(item.id);
                      loadInbox();
                      setRefreshKey(prev => prev + 1);
                    }}
                    className="todo-btn todo-btn-active border flex-1 py-1 text-xs"
                  >
                    <Icon name="BoltIcon" size={12} />
                    Quick Task
                  </button>
                  <button
                    onClick={async () => {
                      await todoService.deleteInboxItem(item.id);
                      loadInbox();
                    }}
                    className="todo-btn todo-btn-secondary py-1 text-xs hover:text-error"
                  >
                    Dismiss
                  </button>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-border mix-bg-muted/20 text-center">
          <p className="text-xs text-muted-foreground">
            Convert distractions to tasks to schedule them, or dismiss them to clear your mind.
          </p>
        </div>
      </Modal>
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
