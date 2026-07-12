'use client';

import { useState, useEffect } from 'react';
import TaskTree from './TaskTree';
import EisenhowerMatrix, { MatrixItem } from '@/components/ui/EisenhowerMatrix';
import WeeklyPlan from './WeeklyPlan';
import { todoService, Task } from '@/lib/services/todoService';
import TaskNode from './TaskNode';

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

  const loadMatrixTasks = async () => {
    setLoading(true);
    const flatTasks = await todoService.fetchTasks();
    // Only non-done tasks for matrix
    setTasks(flatTasks.filter(t => t.status !== 'done'));
    setLoading(false);
  };

  useEffect(() => {
    if (activeSubView === 'matrix') {
      loadMatrixTasks();
    }
  }, [activeSubView]);

  const handleQuadrantChange = async (itemId: string | number, newQuadrant: any) => {
    const id = typeof itemId === 'string' ? parseInt(itemId) : itemId;
    // Optimistic update
    setTasks(prev => prev.map(t => t.id === id ? { ...t, eisenhower_quadrant: newQuadrant } : t));
    await todoService.updateTask(id, { eisenhower_quadrant: newQuadrant });
  };

  const handleAutoSort = async () => {
    setAutoSortLoading(true);
    await todoService.eisenhowerAuto(model);
    await loadMatrixTasks();
    setAutoSortLoading(false);
  };

  const matrixItems = tasks.map(t => ({
    ...t,
    id: t.id.toString(),
    quadrant: t.eisenhower_quadrant || null,
  })) as (MatrixItem & Task)[];

  return (
    <div className="flex flex-col h-full gap-4">
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
        {activeSubView === 'tree' && <TaskTree model={model} />}
        
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
                  level={0}
                  model={model}
                  onUpdate={() => {}} 
                  onDelete={() => {}} 
                  onAddChild={() => {}}
                  onGenerateChildren={() => {}}
                  onAddNote={() => {}}
                  onGenerateRoadmap={() => {}}
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
