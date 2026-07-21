'use client';

import { useState, useEffect } from 'react';
import Icon from '@/components/ui/AppIcon';
import EisenhowerMatrix, { QuadrantType, MatrixItem } from '@/components/ui/EisenhowerMatrix';
import QuickTaskCard from './QuickTaskCard';
import { QuickTask, quickTaskService } from '@/lib/services/quickTaskService';
import { todoService } from '@/lib/services/todoService';

interface QuickDailyProps {
  model: 'ollama' | 'gemini';
}

export default function QuickDaily({ model }: QuickDailyProps) {
  const [tasks, setTasks] = useState<QuickTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [inputValue, setInputValue] = useState('');
  const [autoSortLoading, setAutoSortLoading] = useState(false);

  // Panels
  const [showBrainDump, setShowBrainDump] = useState(false);
  const [showAiDayPlan, setShowAiDayPlan] = useState(false);
  const [brainDumpText, setBrainDumpText] = useState('');

  // AI Smart Schedule state
  const [showAiSmartSchedule, setShowAiSmartSchedule] = useState(false);
  const [smartScheduleLoading, setSmartScheduleLoading] = useState(false);
  const [smartScheduleData, setSmartScheduleData] = useState<any>(null);

  const loadTasks = async () => {
    setLoading(true);
    const fetched = await quickTaskService.fetchTodayTasks();
    setTasks(fetched);
    setLoading(false);
  };

  useEffect(() => {
    loadTasks();
  }, []);

  const handleCreateTask = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!inputValue.trim()) return;
    
    const newTask = await quickTaskService.createTask({
      title: inputValue.trim(),
      quadrant: 'do_now', // Default
      source: 'manual'
    });
    
    if (newTask) {
      setTasks(prev => [...prev, newTask]);
      setInputValue('');
    }
  };

  const handleUpdateTask = (id: number, updates: Partial<QuickTask>) => {
    setTasks(prev => prev.map(t => t.id === id ? { ...t, ...updates } : t));
  };

  const handleDeleteTask = (id: number) => {
    setTasks(prev => prev.filter(t => t.id !== id));
  };

  const handleQuadrantChange = async (itemId: string | number, newQuadrant: QuadrantType, newIndex?: number) => {
    const id = typeof itemId === 'string' ? parseInt(itemId) : itemId;
    // Optimistic update
    setTasks(prev => {
      const copy = [...prev];
      const taskIndex = copy.findIndex(t => t.id === id);
      if (taskIndex === -1) return prev;
      
      const task = copy[taskIndex];
      task.quadrant = newQuadrant;
      
      // Handle reordering if newIndex is provided
      if (newIndex !== undefined) {
        // Simple reorder: just assign a dummy order_index for UI (backend needs proper sorting logic)
        // For now, we rely on the backend patch
      }
      
      return copy;
    });

    const updated = await quickTaskService.updateTask(id, { quadrant: newQuadrant, order_index: newIndex });
    if (updated) {
      handleUpdateTask(id, updated);
    } else {
      loadTasks(); // Revert on failure
    }
  };

  const handleAutoSort = async () => {
    setAutoSortLoading(true);
    const result = await quickTaskService.autoSort(model);
    if (result && result.assignments) {
      // Re-fetch to get correct order and quadrants
      await loadTasks();
    }
    setAutoSortLoading(false);
  };

  // Convert to MatrixItem array
  const matrixItems = tasks.map(t => ({
    ...t,
    id: t.id.toString(),
  })) as unknown as (MatrixItem & QuickTask)[];

  const completedCount = tasks.filter(t => t.done).length;
  const totalCount = tasks.length;

  return (
    <div className="flex flex-col h-full gap-6">
      {/* Header & Quick Add Bar */}
      <div className="bg-card border border-border/80 rounded-xl p-3 shadow-sm flex flex-col gap-3">
        <form onSubmit={handleCreateTask} className="relative flex items-center">
          <input
            type="text"
            value={inputValue}
            onChange={e => setInputValue(e.target.value)}
            placeholder="Add a task for today... (hit Enter)"
            className="w-full bg-input border-2 border-border/50 hover:border-border rounded-lg py-3 pl-4 pr-32 text-sm text-foreground focus:border-primary focus:ring-1 focus:ring-primary outline-none transition-smooth placeholder:text-muted-foreground/70"
            autoFocus
          />
          <div className="absolute right-2 flex items-center gap-1">
            <button
              type="button"
              onClick={() => { setShowBrainDump(!showBrainDump); setShowAiDayPlan(false); }}
              className={`p-1.5 rounded-md transition-smooth ${showBrainDump ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:bg-muted hover:text-foreground'}`}
              title="Brain Dump & Handwriting"
            >
              <span className="text-sm">🧠</span>
            </button>
            <button
              type="button"
              onClick={async () => {
                setShowAiSmartSchedule(true);
                setShowBrainDump(false);
                setShowAiDayPlan(false);
                setSmartScheduleLoading(true);
                const sched = await todoService.getSmartDailySchedule(6.0, 'medium', model);
                setSmartScheduleData(sched);
                setSmartScheduleLoading(false);
              }}
              className={`p-1.5 rounded-md transition-smooth ${showAiSmartSchedule ? 'bg-primary/10 text-primary font-bold' : 'text-muted-foreground hover:bg-muted hover:text-foreground'}`}
              title="AI Smart Schedule Planner"
            >
              <span className="text-sm">🤖</span>
            </button>
            <div className="w-px h-5 bg-border mx-1" />
            <button
              type="submit"
              disabled={!inputValue.trim()}
              className="p-1.5 bg-primary text-primary-foreground rounded-md hover:bg-primary/90 transition-smooth disabled:opacity-50"
            >
              <Icon name="ArrowUpIcon" size={14} variant="solid" />
            </button>
          </div>
        </form>

        {/* Brain Dump Panel */}
        {showBrainDump && (
          <div className="p-4 bg-muted/30 border border-border/50 rounded-lg animate-slide-down">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-xs font-bold text-foreground flex items-center gap-2">
                🧠 Brain Dump
              </h3>
              <button onClick={() => setShowBrainDump(false)} className="text-muted-foreground hover:text-foreground">
                <Icon name="XMarkIcon" size={14} />
              </button>
            </div>
            <textarea
              value={brainDumpText}
              onChange={e => setBrainDumpText(e.target.value)}
              placeholder="Dump all your thoughts, tasks, and ideas here..."
              className="w-full h-32 bg-input border border-border rounded-md p-3 text-sm focus-ring resize-none mb-3"
            />
            <div className="flex justify-end">
              <button
                disabled={!brainDumpText.trim()}
                onClick={async () => {
                  // TODO: Implement brain dump organize
                  alert('Brain dump organize coming soon');
                }}
                className="px-4 py-2 bg-purple-500 text-white text-xs font-bold rounded-md hover:bg-purple-600 transition-smooth disabled:opacity-50 shadow-sm flex items-center gap-2"
              >
                Organize for Today ✨
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Main Content Area: Split Eisenhower and List */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6 flex-1 min-h-0">
        
        {/* Left: Eisenhower Matrix */}
        <div className="xl:col-span-2 flex flex-col min-h-[500px]">
          <EisenhowerMatrix
            items={matrixItems}
            onQuadrantChange={handleQuadrantChange}
            showAutoSort={true}
            onAutoSort={handleAutoSort}
            autoSortLoading={autoSortLoading}
            itemRenderer={(item, isDragging) => (
              <QuickTaskCard
                task={item}
                model={model}
                onUpdate={handleUpdateTask}
                onDelete={handleDeleteTask}
                onMoveToSmart={async (id) => {
                  const res = await quickTaskService.moveToSmart(id);
                  if (res) loadTasks();
                }}
                onMoveToPlan={async (id) => {
                  const res = await quickTaskService.moveToPlan(id);
                  if (res) loadTasks();
                }}
                hideDragHandle={false}
              />
            )}
          />
        </div>

        {/* Right: Today's Flat List */}
        <div className="flex flex-col bg-card border border-border/80 rounded-xl overflow-hidden">
          <div className="px-4 py-3 border-b border-border bg-black/5 dark:bg-white/5 flex items-center justify-between">
            <div>
              <h2 className="font-heading font-semibold text-sm text-foreground">Today's List</h2>
              <p className="text-[10px] text-muted-foreground mt-0.5">{completedCount} of {totalCount} completed</p>
            </div>
            <button
              onClick={async () => {
                const res = await quickTaskService.endOfDay();
                if (res) loadTasks();
              }}
              className="px-3 py-1.5 text-[10px] font-bold bg-muted hover:bg-muted/80 text-foreground rounded-md transition-smooth flex items-center gap-1.5"
            >
              🌙 End My Day
            </button>
          </div>
          
          <div className="flex-1 overflow-y-auto p-3 scrollbar-clean space-y-2">
            {tasks.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-muted-foreground space-y-3 opacity-60">
                <span className="text-4xl">🌵</span>
                <p className="text-xs font-medium">Your day is clear.</p>
              </div>
            ) : (
              // Group by quadrant for the flat list
              ['do_now', 'schedule', 'delegate', 'eliminate'].map(quadrant => {
                const quadTasks = tasks.filter(t => t.quadrant === quadrant);
                if (quadTasks.length === 0) return null;
                
                return (
                  <div key={quadrant} className="mb-4 last:mb-0">
                    <h3 className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-2 px-1">
                      {quadrant.replace('_', ' ')}
                    </h3>
                    <div className="space-y-1.5">
                      {quadTasks.map(task => (
                        <QuickTaskCard
                          key={`list-${task.id}`}
                          task={task}
                          model={model}
                          onUpdate={handleUpdateTask}
                          onDelete={handleDeleteTask}
                          hideDragHandle={true}
                        />
                      ))}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

      </div>

      {/* AI Smart Schedule Modal Overlay */}
      {showAiSmartSchedule && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-card border border-border rounded-xl shadow-2xl max-w-xl w-full p-6 space-y-4 animate-scale-up">
            <div className="flex items-center justify-between pb-3 border-b border-border">
              <div className="flex items-center gap-2">
                <span className="text-xl">🤖</span>
                <h3 className="font-heading text-lg font-bold text-foreground">AI Smart Daily Schedule</h3>
              </div>
              <button onClick={() => setShowAiSmartSchedule(false)} className="text-muted-foreground hover:text-foreground">
                <Icon name="XMarkIcon" size={18} />
              </button>
            </div>

            {smartScheduleLoading ? (
              <div className="py-12 flex flex-col items-center justify-center gap-3">
                <div className="w-8 h-8 border-3 border-primary/30 border-t-primary rounded-full animate-spin" />
                <p className="text-xs text-muted-foreground">Analyzing tasks, priority, and energy levels with AI...</p>
              </div>
            ) : smartScheduleData ? (
              <div className="space-y-4 max-h-[60vh] overflow-y-auto pr-1">
                {smartScheduleData.top_advice && (
                  <div className="p-3 rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-600 dark:text-amber-400 text-xs leading-relaxed font-medium">
                    💡 <strong>Coach Advice:</strong> {smartScheduleData.top_advice}
                  </div>
                )}

                <div className="space-y-2">
                  {(smartScheduleData.schedule || []).map((slot: any, idx: number) => (
                    <div key={idx} className="p-3 border border-border rounded-lg bg-muted/20 flex flex-col gap-1">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-primary">{slot.time_slot}</span>
                        <span className="text-[10px] font-semibold px-2 py-0.5 rounded bg-primary/10 text-primary">
                          {slot.focus_type || 'Task'}
                        </span>
                      </div>
                      <p className="text-xs font-semibold text-foreground">{slot.task_title}</p>
                      {slot.rationale && (
                        <p className="text-[11px] text-muted-foreground leading-normal">{slot.rationale}</p>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">Could not generate schedule. Check Config API keys.</p>
            )}

            <div className="pt-2 flex justify-end">
              <button
                onClick={() => setShowAiSmartSchedule(false)}
                className="px-4 py-2 bg-primary text-primary-foreground text-xs font-semibold rounded-lg hover:bg-primary/90 transition-smooth"
              >
                Close Schedule
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
