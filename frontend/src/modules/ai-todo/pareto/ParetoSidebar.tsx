'use client';

import { openLoginModal } from '@/components/auth/LoginModal';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Icon from '@/components/ui/AppIcon';
import { paretoService, Top20Response, TopTask, ParetoTable } from '@/lib/services/paretoService';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from '@/lib/ui/toast';
import { confirmParetoRun } from '../shared/confirmPareto';

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

/**
 * "Your 20%": an optional productivity tool at the top of the Copilot, not a dashboard. One quiet row (name, count,
 * Re-analyze, fold); the list appears only when an analysis has produced one. Real scores only, from `/pareto/top20`.
 */
export default function ParetoSidebar({ model = 'gemini' }: ParetoSidebarProps) {
  const router = useRouter();
  const { isGuest } = useAuth();
  const [data, setData] = useState<Top20Response | null>(null);
  const [loading, setLoading] = useState(false);
  // The list could not be loaded (as opposed to loading, or loaded and empty).
  const [loadFailed, setLoadFailed] = useState(false);
  const [expanded, setExpanded] = useState(true);

  const fetchTop20 = async () => {
    setLoading(true);
    try {
      setData(await paretoService.getTop20());
      setLoadFailed(false);
    } catch (err) {
      console.error('Failed to fetch top 20', err);
      setLoadFailed(true);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    // Pareto analysis is an AI feature and requires login — skip the call
    // entirely for guests rather than firing a request that always 401s.
    if (!isGuest) fetchTop20();
  }, [isGuest]);

  const runAnalysis = async () => {
    if (loading) return;
    if (!(await confirmParetoRun('all', 'all your tasks and projects', { onlyIfRepeat: true }))) return;
    setLoading(true);
    try {
      const result = await paretoService.analyze('all', model);
      paretoService.markAnalyzedToday('all');
      await fetchTop20();
      toast.success(`Found ${result.top20_count ?? 0} high-leverage task${result.top20_count === 1 ? '' : 's'} out of ${result.analyzed_count ?? 0} total.`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Analysis failed.');
    } finally {
      setLoading(false);
    }
  };

  const handleFocus = (task: TopTask) => {
    const tab = task.table ? TABLE_TO_TAB[task.table] : 'smart';
    router.push(`/ai-todo?tab=${tab}`);
  };

  const totalTasks = data ? data.smart.length + data.quick.length + data.plan.length : 0;
  const groups = (['smart', 'quick', 'plan'] as const).filter(key => data && data[key].length > 0);

  return (
    <div className="flex max-h-[40%] flex-shrink-0 flex-col">
      <div className="flex items-center justify-between gap-2 px-4">
        <button
          type="button"
          onClick={() => setExpanded(!expanded)}
          aria-expanded={expanded}
          aria-controls="pareto-sidebar-body"
          className="todo-focus -ml-1.5 flex min-w-0 items-center gap-1.5 rounded-md px-1.5 py-2 text-left transition-colors hover:mix-bg-foreground/[0.05]"
        >
          <Icon name="StarIcon" size={13} variant="solid" className="text-warning" aria-hidden="true" />
          <span className="font-heading text-xs font-semibold text-foreground">Your 20%</span>
          {totalTasks > 0 && <span className="text-xs font-medium tabular-nums text-muted-foreground">{totalTasks}</span>}
          <Icon name="ChevronDownIcon" size={12} className={`text-muted-foreground transition-transform motion-reduce:transition-none ${expanded ? 'rotate-180' : ''}`} aria-hidden="true" />
        </button>
        {!isGuest && totalTasks > 0 && (
          <button
            type="button"
            onClick={runAnalysis}
            disabled={loading}
            className="todo-btn todo-btn-ghost -mr-1.5 px-2 py-1"
            title="Re-run AI 80/20 analysis across all tabs"
          >
            <Icon name="ArrowPathIcon" size={12} className={loading ? 'motion-safe:animate-spin' : ''} />
            {loading ? 'Analyzing' : 'Re-analyze'}
          </button>
        )}
      </div>

      {expanded && (
        <div id="pareto-sidebar-body" className="overflow-y-auto px-4 pb-3 scrollbar-clean">
          {isGuest ? (
            <p className="flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
              Log in to analyse your tasks.
              <button type="button" onClick={() => openLoginModal()} className="todo-focus rounded font-medium text-primary hover:underline">
                Log in
              </button>
            </p>
          ) : loading && totalTasks === 0 ? (
            <p role="status" className="flex items-center gap-2 text-xs text-muted-foreground">
              <span className="h-3 w-3 rounded-full border-2 border-current border-t-transparent motion-safe:animate-spin" aria-hidden="true" />
              Looking at your tasks…
            </p>
          ) : loadFailed && totalTasks === 0 ? (
            <p role="alert" className="flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
              Couldn&apos;t load your 20%.
              <button type="button" onClick={fetchTop20} className="todo-focus rounded font-medium text-primary hover:underline">
                Try again
              </button>
            </p>
          ) : totalTasks === 0 ? (
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
              <span className="text-xs text-muted-foreground">No analysis yet.</span>
              <button type="button" onClick={runAnalysis} disabled={loading} className="todo-btn todo-btn-quiet">
                <Icon name="BoltIcon" size={14} />
                Run 80/20 AI Analysis
              </button>
            </div>
          ) : (
            <div className="space-y-2">
              {groups.map(key => (
                <div key={key}>
                  {/* The tab's name only matters when more than one tab has results */}
                  {groups.length > 1 && (
                    <div className="mb-0.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">{TAB_LABELS[key]}</div>
                  )}
                  <div className="-mx-2 space-y-px">
                    {data![key].map(t => (
                      <TaskRow key={`${key}-${t.table ?? ''}-${t.id}`} task={t} onFocus={handleFocus} />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function TaskRow({ task, onFocus }: { task: TopTask; onFocus: (task: TopTask) => void }) {
  const score = Math.max(0, Math.min(100, Math.round((task.pareto_score || 0) * 100)));
  return (
    <div
      className="group relative rounded-md px-2 py-1.5 transition-colors focus-within:mix-bg-foreground/[0.05] hover:mix-bg-foreground/[0.05]"
      title={task.reason || undefined}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="flex min-w-0 items-center gap-1 text-xs font-medium text-foreground">
          {task.locked && <Icon name="MapPinIcon" size={11} variant="solid" className="shrink-0 text-primary" aria-label="Pinned" />}
          <span className="truncate">{task.title}</span>
        </span>
        {/* Stays focusable (just unseen) until the row is hovered or focused; always shown without hover (touch). */}
        <button
          type="button"
          onClick={() => onFocus(task)}
          className="copilot-tint todo-focus flex-shrink-0 px-2 py-0.5 text-xs font-semibold opacity-0 focus-visible:opacity-100 group-focus-within:opacity-100 group-hover:opacity-100 [@media(hover:none)]:opacity-100"
        >
          Focus
        </button>
      </div>
      <div
        className="mt-1 h-[3px] w-full overflow-hidden rounded-full mix-bg-foreground/10"
        role="meter"
        aria-label="Leverage score"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={score}
      >
        <div className="h-full rounded-full bg-primary" style={{ width: `${score}%` }} />
      </div>
    </div>
  );
}
