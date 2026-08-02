'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Icon from '@/components/ui/AppIcon';
import { paretoService, Top20Response, TopTask, ParetoTable } from '@/lib/services/paretoService';
import { useAuth } from '@/contexts/AuthContext';

const TAB_LABELS: Record<'smart' | 'quick' | 'plan', string> = {
  smart: 'Smart',
  quick: 'Quick',
  plan: 'Plan',
};

const TABLE_TO_TAB: Record<ParetoTable, 'smart' | 'quick' | 'plan'> = {
  tasks: 'smart',
  quick_tasks: 'quick',
  project_nodes: 'plan',
  projects: 'plan',
};

interface ParetoSidebarProps {
  model?: 'ollama' | 'gemini';
}

export default function ParetoSidebar({ model = 'gemini' }: ParetoSidebarProps) {
  const router = useRouter();
  const { isGuest } = useAuth();
  const [data, setData] = useState<Top20Response | null>(null);
  const [loading, setLoading] = useState(false);
  const [expanded, setExpanded] = useState(true);
  const [toast, setToast] = useState<string | null>(null);

  const fetchTop20 = async () => {
    setLoading(true);
    const json = await paretoService.getTop20();
    setData(json);
    setLoading(false);
  };

  useEffect(() => {
    // Pareto analysis is an AI feature and requires login — skip the call
    // entirely for guests rather than firing a request that always 401s.
    if (!isGuest) fetchTop20();
  }, [isGuest]);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3500);
  };

  const runAnalysis = async () => {
    if (paretoService.hasAnalyzedToday('all')) {
      if (!confirm('You already ran analysis today. Results may be similar. Continue?')) return;
    }
    setLoading(true);
    try {
      const result = await paretoService.analyze('all', model);
      paretoService.markAnalyzedToday('all');
      await fetchTop20();
      showToast(`⭐ Found ${result.top20_count ?? 0} high-leverage task${result.top20_count === 1 ? '' : 's'} out of ${result.analyzed_count ?? 0} total`);
    } catch (err) {
      showToast(err instanceof Error ? `⚠️ ${err.message}` : '⚠️ Analysis failed.');
    } finally {
      setLoading(false);
    }
  };

  const handleFocus = (task: TopTask) => {
    const tab = task.table ? TABLE_TO_TAB[task.table] : 'smart';
    router.push(`/todo?tab=${tab}`);
  };

  const totalTasks = data ? data.smart.length + data.quick.length + data.plan.length : 0;

  return (
    <div className="border-b border-border bg-surface flex-shrink-0 flex flex-col max-h-[40%] transition-all relative">
      {toast && (
        <div className="absolute top-1 left-1/2 -translate-x-1/2 z-50 px-2.5 py-1 rounded-md bg-foreground text-background text-[9px] font-semibold shadow-lg whitespace-nowrap">
          {toast}
        </div>
      )}
      <div
        className="px-3 py-2 flex items-center justify-between cursor-pointer hover:bg-muted/50 transition-smooth"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex items-center gap-1.5">
          <span className="text-amber-500 text-xs">⭐</span>
          <span className="font-heading text-xs font-semibold text-foreground">Your 20%</span>
          {totalTasks > 0 && (
            <span className="ml-1 bg-amber-500/10 text-amber-600 text-[9px] font-bold px-1.5 py-0.5 rounded-full">
              {totalTasks}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {!isGuest && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                runAnalysis();
              }}
              disabled={loading}
              className="text-[10px] font-bold px-2 py-0.5 rounded bg-amber-500/10 text-amber-600 dark:text-amber-400 hover:bg-amber-500/20 transition-smooth flex items-center gap-1 disabled:opacity-50"
              title="Re-run AI 80/20 analysis across all tabs"
            >
              {loading ? '⏳' : '↺ Re-analyze'}
            </button>
          )}
          <Icon name="ChevronDownIcon" size={12} className={`text-muted-foreground transition-transform ${expanded ? 'rotate-180' : ''}`} />
        </div>
      </div>

      {expanded && (
        <div className="px-3 pb-3 overflow-y-auto scrollbar-clean">
          {isGuest ? (
            <div className="py-3 text-center space-y-2">
              <p className="text-[10px] text-muted-foreground italic">
                Log in to unlock AI-powered 80/20 analysis of your tasks.
              </p>
              <a
                href="/login"
                className="inline-block text-[10px] font-bold px-3 py-1 rounded-lg bg-amber-500 text-white hover:bg-amber-600 transition-smooth shadow-sm"
              >
                Log in
              </a>
            </div>
          ) : totalTasks === 0 && !loading ? (
            <div className="py-3 text-center space-y-2">
              <p className="text-[10px] text-muted-foreground italic">
                Run 80/20 analysis to discover your highest-leverage tasks.
              </p>
              <button
                onClick={runAnalysis}
                disabled={loading}
                className="text-[10px] font-bold px-3 py-1 rounded-lg bg-amber-500 text-white hover:bg-amber-600 transition-smooth shadow-sm"
              >
                ⚡ Run 80/20 AI Analysis
              </button>
            </div>
          ) : (
            <div className="space-y-2.5 mt-1">
              {/* Smart Tasks */}
              {data?.smart && data.smart.length > 0 && (
                <div>
                  <div className="text-[9px] font-bold text-muted-foreground uppercase tracking-wider mb-1 px-1">{TAB_LABELS.smart}</div>
                  <div className="space-y-1">
                    {data.smart.map(t => (
                      <TaskRow key={`smart-${t.id}`} task={t} onFocus={handleFocus} />
                    ))}
                  </div>
                </div>
              )}
              {/* Quick Tasks */}
              {data?.quick && data.quick.length > 0 && (
                <div>
                  <div className="text-[9px] font-bold text-muted-foreground uppercase tracking-wider mb-1 px-1">{TAB_LABELS.quick}</div>
                  <div className="space-y-1">
                    {data.quick.map(t => (
                      <TaskRow key={`quick-${t.id}`} task={t} onFocus={handleFocus} />
                    ))}
                  </div>
                </div>
              )}
              {/* Plan Nodes/Projects */}
              {data?.plan && data.plan.length > 0 && (
                <div>
                  <div className="text-[9px] font-bold text-muted-foreground uppercase tracking-wider mb-1 px-1">{TAB_LABELS.plan}</div>
                  <div className="space-y-1">
                    {data.plan.map(t => (
                      <TaskRow key={`plan-${t.table}-${t.id}`} task={t} onFocus={handleFocus} />
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function TaskRow({ task, onFocus }: { task: TopTask; onFocus: (task: TopTask) => void }) {
  return (
    <div
      className="group relative bg-muted/30 border border-border/50 rounded p-2 hover:bg-muted transition-smooth"
      title={task.reason || undefined}
    >
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-[10px] font-medium text-foreground truncate pr-2 flex items-center gap-1">
          {task.locked && <span title="Manually pinned">📌</span>}
          {task.title}
        </span>
        <button
          onClick={() => onFocus(task)}
          className="opacity-0 group-hover:opacity-100 flex-shrink-0 text-[9px] bg-primary/10 text-primary px-1.5 py-0.5 rounded transition-smooth hover:bg-primary hover:text-primary-foreground"
        >
          → Focus
        </button>
      </div>
      <div className="w-full h-1 bg-muted/60 rounded-full overflow-hidden">
        <div
          className="h-full bg-amber-400"
          style={{ width: `${Math.round((task.pareto_score || 0) * 100)}%` }}
        />
      </div>
    </div>
  );
}
