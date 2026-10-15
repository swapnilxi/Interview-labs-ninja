'use client';

import { useState } from 'react';
import Icon from '@/components/ui/AppIcon';
import { todoService } from '@/lib/services/todoService';

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
    <div className="flex h-full flex-col">
      <div className="mb-[1.5rem] flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-heading text-base font-semibold leading-tight text-foreground">AI Weekly Plan</h2>
          <p className="mt-1 text-sm text-muted-foreground">
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
        <div className="flex flex-1 flex-col items-center justify-center gap-3 py-10 text-center text-muted-foreground">
          <Icon name="CalendarDaysIcon" size={28} />
          <p className="text-sm">Generate your plan to see your week at a glance.</p>
        </div>
      )}

      {loading && (
        <div className="flex flex-1 flex-col items-center justify-center space-y-4 text-muted-foreground">
          <span className="h-8 w-8 animate-spin rounded-full border-4 mix-border-primary/20 border-t-primary" />
          <p className="animate-pulse text-xs font-medium">AI is planning your week...</p>
        </div>
      )}

      {plan && !loading && (
        <div className="min-h-0 flex-1 overflow-x-auto pb-2 scrollbar-clean">
          <div className="flex h-full min-w-max gap-4">
            {days.map(day => (
              <div key={day} className="flex w-[280px] shrink-0 flex-col overflow-hidden rounded-xl mix-bg-foreground/[0.04]">
                <div className="px-4 py-3">
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-foreground">
                    {day}
                  </h3>
                  <p className="text-xs text-muted-foreground">
                    <span className="font-semibold tabular-nums mix-text-info">{plan[day]?.length || 0}</span> tasks
                  </p>
                </div>

                <div className="flex-1 space-y-2 overflow-y-auto px-3 pb-3 scrollbar-clean">
                  {[...(plan[day] || [])].sort((a: any, b: any) => (b.is_top_20 ? 1 : 0) - (a.is_top_20 ? 1 : 0)).map((task: any) => (
                    <div
                      key={task.task_id}
                      className="rounded-lg p-2.5 mix-bg-foreground/[0.05]"
                    >
                      <div className="flex items-start gap-2">
                        {task.is_top_20 && (
                          <Icon name="StarIcon" size={12} variant="solid" className="mt-0.5 flex-shrink-0 text-warning" aria-label="Top 20% task" />
                        )}
                        <div className="min-w-0 flex-1">
                          <p className="text-xs font-medium text-foreground leading-snug">
                            {task.title}
                          </p>
                          <div className="mt-2 flex items-center gap-2">
                            {task.time_estimate && task.time_estimate !== 'unknown' && (
                              <span className="text-xs font-medium tabular-nums mix-text-info">
                                {task.time_estimate}
                              </span>
                            )}
                            <span className="text-[11px] uppercase text-muted-foreground">
                              {task.priority || 'P3'}
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                  {(!plan[day] || plan[day].length === 0) && (
                    <div className="flex h-full items-center justify-center py-[1.5rem]">
                      <p className="text-xs text-muted-foreground">No tasks scheduled</p>
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
