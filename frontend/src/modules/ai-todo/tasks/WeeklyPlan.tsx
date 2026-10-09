'use client';

import { useState } from 'react';
import Icon from '@/components/ui/AppIcon';
import { todoService, Task } from '@/lib/services/todoService';

interface WeeklyPlanProps {
  model: 'ollama' | 'gemini';
}

export default function WeeklyPlan({ model }: WeeklyPlanProps) {
  const [plan, setPlan] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleGenerate = async () => {
    if (loading) return;
    setLoading(true);
    setError(null);
    try {
      const result = await todoService.aiWeeklyPlan(model);
      if (result && result.weekly_plan) {
        setPlan(result.weekly_plan);
      } else {
        setError("AI didn't return a plan. Try again.");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't generate your week.");
    } finally {
      setLoading(false);
    }
  };

  const days = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday'];

  return (
    <div className="todo-glass flex flex-col h-full p-4">
      <div className="flex flex-wrap items-start justify-between gap-3 mb-5">
        <div>
          <h2 className="font-heading font-semibold text-lg leading-tight flex items-center gap-2">
            <span className="todo-icon-chip h-8 w-8"><Icon name="CalendarDaysIcon" size={16} /></span>
            AI Weekly Plan
          </h2>
          <p className="text-xs text-muted-foreground mt-1">
            Let AI distribute your open tasks across the week, prioritizing high-leverage work.
          </p>
        </div>
        <button
          onClick={handleGenerate}
          disabled={loading}
          className="todo-btn todo-btn-primary px-4 py-2"
        >
          {loading ? (
            <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent" aria-hidden="true" />
          ) : (
            <Icon name="SparklesIcon" size={14} variant="solid" />
          )}
          Generate My Week
        </button>
      </div>

      {error && (
        <div role="alert" className="todo-alert todo-alert-error mb-4">
          <Icon name="ExclamationTriangleIcon" size={14} className="mt-px shrink-0" />
          <p className="flex-1 leading-relaxed">{error}</p>
        </div>
      )}

      {!plan && !loading && (
        <div className="flex-1 flex flex-col items-center justify-center gap-3 py-10 text-center text-muted-foreground">
          <span className="flex h-[3rem] w-[3rem] items-center justify-center rounded-xl bg-muted">
            <Icon name="CalendarDaysIcon" size={24} />
          </span>
          <p className="text-sm font-medium">Generate your plan to see your week at a glance.</p>
        </div>
      )}

      {loading && (
        <div className="flex-1 flex flex-col items-center justify-center text-muted-foreground space-y-4">
          <span className="w-8 h-8 border-4 border-primary/20 border-t-primary rounded-full animate-spin" />
          <p className="text-xs font-bold animate-pulse">AI is planning your week...</p>
        </div>
      )}

      {plan && !loading && (
        <div className="flex-1 min-h-0 overflow-x-auto pb-2 scrollbar-clean">
          <div className="flex gap-4 min-w-max h-full">
            {days.map(day => (
              <div key={day} className="w-[280px] flex flex-col bg-muted/30 border border-border/50 rounded-xl overflow-hidden shrink-0">
                <div className="px-3 py-2 bg-black/5 dark:bg-white/5 border-b border-border/50">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-foreground">
                    {day}
                  </h3>
                  <p className="text-[10px] text-muted-foreground">
                    {plan[day]?.length || 0} tasks
                  </p>
                </div>
                
                <div className="flex-1 overflow-y-auto p-2 scrollbar-clean space-y-2">
                  {[...(plan[day] || [])].sort((a: any, b: any) => (b.is_top_20 ? 1 : 0) - (a.is_top_20 ? 1 : 0)).map((task: any) => (
                    <div 
                      key={task.task_id} 
                      className={`p-2.5 rounded-lg border bg-card shadow-sm ${
                        task.is_top_20 ? 'border-amber-400/50 ring-1 ring-amber-400/20' : 'border-border'
                      }`}
                    >
                      <div className="flex items-start gap-2">
                        <div className="flex-shrink-0 mt-0.5">
                          {task.is_top_20 ? (
                            <Icon name="StarIcon" size={12} variant="solid" className="text-amber-500" aria-label="Top 20% task" />
                          ) : (
                            <div className="w-3 h-3 rounded-full border-2 border-primary/40" />
                          )}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-xs font-medium text-foreground leading-snug">
                            {task.title}
                          </p>
                          <div className="flex items-center gap-2 mt-2">
                            {task.time_estimate && task.time_estimate !== 'unknown' && (
                              <span className="text-[9px] font-semibold text-blue-500 bg-blue-500/10 px-1.5 py-0.5 rounded">
                                {task.time_estimate}
                              </span>
                            )}
                            <span className="text-[9px] text-muted-foreground uppercase">
                              {task.priority || 'P3'}
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                  {(!plan[day] || plan[day].length === 0) && (
                    <div className="h-full flex items-center justify-center opacity-50">
                      <p className="text-[10px] font-medium italic text-muted-foreground">No tasks scheduled</p>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
