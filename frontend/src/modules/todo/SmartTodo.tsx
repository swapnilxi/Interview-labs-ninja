'use client';

import { useState, useEffect } from 'react';
import TaskTree from './TaskTree';
import EisenhowerMatrix, { MatrixItem } from '@/components/ui/EisenhowerMatrix';
import WeeklyPlan from './WeeklyPlan';
import { todoService, Task } from '@/lib/services/todoService';
import TaskNode from './TaskNode';
import Icon from '@/components/ui/AppIcon';

export type SmartSubView = 'tree' | 'matrix' | 'weekly';

interface SmartTodoProps {
  model: 'ollama' | 'gemini';
}

export default function SmartTodo({ model }: SmartTodoProps) {
  const [activeSubView, setActiveSubView] = useState<SmartSubView>('tree');
  
  // Matrix specific state
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(false);
  const [autoSortLoading, setAutoSortLoading] = useState(false);

  // NLP Capture state
  const [nlpInput, setNlpInput] = useState('');
  const [nlpLoading, setNlpLoading] = useState(false);
  const [treeRefreshKey, setTreeRefreshKey] = useState(0);

  const loadMatrixTasks = async () => {
    setLoading(true);
    const flatTasks = await todoService.fetchTasks();
    setTasks(flatTasks.filter(t => t.status !== 'done'));
    setLoading(false);
  };

  useEffect(() => {
    if (activeSubView === 'matrix') {
      loadMatrixTasks();
    }
  }, [activeSubView]);

  const handleNlpSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!nlpInput.trim()) return;
    setNlpLoading(true);
    try {
      const parsed = await todoService.parseTaskWithAI(nlpInput.trim(), model);
      if (parsed && parsed.title) {
        await todoService.createTask({
          title: parsed.title,
          priority: parsed.priority || 'p3',
          due_date: parsed.due_date,
          time_estimate: parsed.time_estimate,
          intention: parsed.intention,
          context: parsed.context,
          status: 'backlog',
        });
      } else {
        await todoService.createTask({ title: nlpInput.trim(), priority: 'p3', status: 'backlog' });
      }
      setNlpInput('');
      setTreeRefreshKey(prev => prev + 1);
      if (activeSubView === 'matrix') loadMatrixTasks();
    } catch (err) {
      console.error(err);
    } finally {
      setNlpLoading(false);
    }
  };

  const handleQuadrantChange = async (itemId: string | number, newQuadrant: any) => {
    const id = typeof itemId === 'string' ? parseInt(itemId) : itemId;
    setTasks(prev => prev.map(t => t.id === id ? { ...t, eisenhower_quadrant: newQuadrant } : t));
    await todoService.updateTask(id, { eisenhower_quadrant: newQuadrant });
  };

  const handleAutoSort = async () => {
    setAutoSortLoading(true);
    await todoService.prioritizeAllWithAI(model);
    await loadMatrixTasks();
    setAutoSortLoading(false);
  };

  const matrixItems = tasks.map(t => ({
    ...t,
    id: t.id.toString(),
    quadrant: t.eisenhower_quadrant || null,
  })) as unknown as (MatrixItem & Task)[];

  return (
    <div className="flex flex-col h-full gap-4">
      {/* AI Fast Task Capture Input Bar */}
      <form onSubmit={handleNlpSubmit} className="relative w-full">
        <div className="flex items-center gap-2 p-1.5 bg-card border border-primary/30 rounded-xl shadow-md focus-within:ring-2 focus-within:ring-primary/40 transition-all">
          <div className="pl-2 text-primary flex items-center gap-1.5 text-xs font-bold shrink-0">
            <Icon name="SparklesIcon" size={16} variant="solid" />
            <span>AI Fast Capture:</span>
          </div>
          <input
            type="text"
            value={nlpInput}
            onChange={(e) => setNlpInput(e.target.value)}
            placeholder='Type natural text like "Review CV system design proposal tomorrow at 2pm #p1"...'
            className="flex-1 bg-transparent px-2 py-1 text-xs text-foreground focus:outline-none placeholder:text-muted-foreground"
          />
          <button
            type="submit"
            disabled={nlpLoading || !nlpInput.trim()}
            className="px-3 py-1.5 rounded-lg bg-gradient-to-r from-primary to-violet-600 text-primary-foreground font-semibold text-xs hover:opacity-90 transition-smooth disabled:opacity-50 flex items-center gap-1 shrink-0"
          >
            {nlpLoading ? (
              <span className="w-3.5 h-3.5 border-2 border-primary-foreground/30 border-t-primary-foreground rounded-full animate-spin" />
            ) : (
              <span>⚡ Parse & Add</span>
            )}
          </button>
        </div>
      </form>

      {/* Sub-view Switcher */}
      <div className="flex items-center justify-center">
        <div className="inline-flex items-center p-1 bg-muted/50 rounded-lg border border-border">
          <button
            onClick={() => setActiveSubView('tree')}
            className={`flex items-center gap-2 px-4 py-1.5 rounded-md text-xs font-semibold transition-smooth ${
              activeSubView === 'tree' ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
            }`}
          >
            <span>🌲</span> Task Tree
          </button>
          <button
            onClick={() => setActiveSubView('matrix')}
            className={`flex items-center gap-2 px-4 py-1.5 rounded-md text-xs font-semibold transition-smooth ${
              activeSubView === 'matrix' ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
            }`}
          >
            <span>🟦</span> Eisenhower Matrix
          </button>
          <button
            onClick={() => setActiveSubView('weekly')}
            className={`flex items-center gap-2 px-4 py-1.5 rounded-md text-xs font-semibold transition-smooth ${
              activeSubView === 'weekly' ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
            }`}
          >
            <span>📅</span> Weekly Plan
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 min-h-0">
        {activeSubView === 'tree' && <TaskTree key={treeRefreshKey} model={model} />}
        
        {activeSubView === 'matrix' && (
          <EisenhowerMatrix
            items={matrixItems}
            onQuadrantChange={handleQuadrantChange}
            showAutoSort={true}
            onAutoSort={handleAutoSort}
            autoSortLoading={autoSortLoading}
            itemRenderer={(item) => (
              <div className="pointer-events-none">
                <TaskNode 
                  task={item} 
                  depth={1}
                  model={model}
                  onUpdate={() => {}} 
                  onDelete={() => {}} 
                  onChildrenGenerated={() => {}}
                  onUndoAvailable={() => {}}
                />
              </div>
            )}
          />
        )}

        {activeSubView === 'weekly' && <WeeklyPlan model={model} />}
      </div>
    </div>
  );
}

