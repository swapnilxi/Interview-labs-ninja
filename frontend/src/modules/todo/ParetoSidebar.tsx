'use client';

import { useState, useEffect } from 'react';
import Icon from '@/components/ui/AppIcon';

interface TopTask {
  id: number;
  title: string;
  pareto_score: number;
}

interface ParetoData {
  smart: TopTask[];
  quick: TopTask[];
  plan: TopTask[];
}

export default function ParetoSidebar() {
  const [data, setData] = useState<ParetoData | null>(null);
  const [loading, setLoading] = useState(false);
  const [expanded, setExpanded] = useState(true);

  const fetchTop20 = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8082'}/pareto/top20`);
      if (res.ok) {
        const json = await res.json();
        setData(json);
      }
    } catch (err) {
      console.error('Failed to fetch top 20', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTop20();
  }, []);

  const runAnalysis = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8082'}/pareto/analyze`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scope: 'all', model: 'gemini' }),
      });
      if (res.ok) {
        await fetchTop20();
      }
    } catch (err) {
      console.error('Failed to run Pareto analysis', err);
    } finally {
      setLoading(false);
    }
  };

  const totalTasks = data ? data.smart.length + data.quick.length + data.plan.length : 0;

  return (
    <div className="border-b border-border bg-surface flex-shrink-0 flex flex-col max-h-[40%] transition-all">
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
          <button
            onClick={(e) => {
              e.stopPropagation();
              runAnalysis();
            }}
            disabled={loading}
            className="text-[10px] font-bold px-2 py-0.5 rounded bg-amber-500/10 text-amber-600 dark:text-amber-400 hover:bg-amber-500/20 transition-smooth flex items-center gap-1 disabled:opacity-50"
            title="Run AI 80/20 Analysis on all tasks"
          >
            {loading ? '⏳' : '⚡ 80/20'}
          </button>
          <button 
            onClick={(e) => { e.stopPropagation(); fetchTop20(); }}
            className={`text-muted-foreground hover:text-foreground transition-smooth ${loading ? 'animate-spin' : ''}`}
            title="Refresh"
          >
            <Icon name="ArrowPathIcon" size={12} />
          </button>
          <Icon name="ChevronDownIcon" size={12} className={`text-muted-foreground transition-transform ${expanded ? 'rotate-180' : ''}`} />
        </div>
      </div>

      {expanded && (
        <div className="px-3 pb-3 overflow-y-auto scrollbar-clean">
          {totalTasks === 0 && !loading ? (
            <div className="py-3 text-center space-y-2">
              <p className="text-[10px] text-muted-foreground italic">
                Discover your highest-leverage tasks with AI.
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
                  <div className="text-[9px] font-bold text-muted-foreground uppercase tracking-wider mb-1 px-1">Smart To-Do</div>
                  <div className="space-y-1">
                    {data.smart.map(t => (
                      <TaskRow key={`smart-${t.id}`} task={t} tab="smart" />
                    ))}
                  </div>
                </div>
              )}
              {/* Quick Tasks */}
              {data?.quick && data.quick.length > 0 && (
                <div>
                  <div className="text-[9px] font-bold text-muted-foreground uppercase tracking-wider mb-1 px-1">Quick Daily</div>
                  <div className="space-y-1">
                    {data.quick.map(t => (
                      <TaskRow key={`quick-${t.id}`} task={t} tab="quick" />
                    ))}
                  </div>
                </div>
              )}
              {/* Plan Nodes */}
              {data?.plan && data.plan.length > 0 && (
                <div>
                  <div className="text-[9px] font-bold text-muted-foreground uppercase tracking-wider mb-1 px-1">Plan & Project</div>
                  <div className="space-y-1">
                    {data.plan.map(t => (
                      <TaskRow key={`plan-${t.id}`} task={t} tab="plan" />
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

function TaskRow({ task, tab }: { task: TopTask; tab: string }) {
  return (
    <div className="group relative bg-muted/30 border border-border/50 rounded p-2 hover:bg-muted transition-smooth">
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-[10px] font-medium text-foreground truncate pr-2">{task.title}</span>
        <button 
          className="opacity-0 group-hover:opacity-100 flex-shrink-0 text-[9px] bg-primary/10 text-primary px-1.5 py-0.5 rounded transition-smooth hover:bg-primary hover:text-primary-foreground"
          title={`Go to ${tab}`}
        >
          → Focus
        </button>
      </div>
      <div className="w-full h-1 bg-muted/60 rounded-full overflow-hidden">
        <div 
          className="h-full bg-amber-400" 
          style={{ width: `${Math.round(task.pareto_score * 100)}%` }}
        />
      </div>
    </div>
  );
}
