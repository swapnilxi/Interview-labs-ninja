'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import Icon from '@/components/ui/AppIcon';
import GoalTimelineBoard from './GoalTimelineBoard';
import CreateGoalModal from './CreateGoalModal';
import GoalDetailModal from './GoalDetailModal';
import { GoalNode, GoalLevel, goalService } from '@/lib/services/goalService';
import { confirmDialog } from '@/lib/ui/confirm';

interface GoalsProps {
  model: 'ollama' | 'gemini';
}

function flattenTree(nodes: GoalNode[]): GoalNode[] {
  const out: GoalNode[] = [];
  const walk = (list: GoalNode[]) => {
    for (const n of list) {
      out.push(n);
      if (n.children && n.children.length) walk(n.children);
    }
  };
  walk(nodes);
  return out;
}

function getRelatedIds(id: number, byId: Map<number, GoalNode>): Set<number> {
  const related = new Set<number>([id]);

  let cur = byId.get(id);
  while (cur?.parent_id != null) {
    related.add(cur.parent_id);
    cur = byId.get(cur.parent_id);
  }

  const stack = [id];
  while (stack.length) {
    const cid = stack.pop()!;
    for (const n of byId.values()) {
      if (n.parent_id === cid && !related.has(n.id)) {
        related.add(n.id);
        stack.push(n.id);
      }
    }
  }
  return related;
}

export default function Goals({ model }: GoalsProps) {
  const [tree, setTree] = useState<GoalNode[]>([]);
  const [loading, setLoading] = useState(true);
  const [aiError, setAiError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [busy, setBusy] = useState<Record<number, string | undefined>>({});
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [createLevel, setCreateLevel] = useState<GoalLevel>('daily');
  const [editingGoal, setEditingGoal] = useState<GoalNode | null>(null);

  const loadTree = useCallback(async () => {
    setLoading(true);
    const fetched = await goalService.fetchGoalTree();
    setTree(fetched);
    setLoading(false);
  }, []);

  useEffect(() => {
    loadTree();
  }, [loadTree]);

  const allGoals = useMemo(() => flattenTree(tree), [tree]);
  const byId = useMemo(() => new Map(allGoals.map((g) => [g.id, g])), [allGoals]);
  const relatedIds = useMemo(
    () => (selectedId != null ? getRelatedIds(selectedId, byId) : null),
    [selectedId, byId]
  );

  const setNodeBusy = (id: number, action?: string) => {
    setBusy((prev) => ({ ...prev, [id]: action }));
  };

  const handleAddAtLevel = (level: GoalLevel) => {
    setCreateLevel(level);
    setShowCreateModal(true);
  };

  const handleDelete = async (node: GoalNode) => {
    const confirmed = await confirmDialog({
      title: `Delete "${node.title}"?`,
      message: 'This also deletes everything chunked under it. It can\'t be undone.',
      confirmLabel: 'Delete',
      tone: 'danger',
    });
    if (!confirmed) return;
    try {
      await goalService.deleteGoal(node.id);
      if (selectedId === node.id) setSelectedId(null);
      await loadTree();
    } catch (err) {
      setAiError(err instanceof Error ? err.message : 'Failed to delete goal.');
    }
  };

  const handleDiveDeeper = async (node: GoalNode) => {
    setAiError(null);
    setNodeBusy(node.id, 'dive-deeper');
    try {
      await goalService.diveDeeper(node.id, model);
      await loadTree();
    } catch (err) {
      setAiError(err instanceof Error ? err.message : 'AI breakdown failed.');
    } finally {
      setNodeBusy(node.id, undefined);
    }
  };

  const handleChunk = async (node: GoalNode) => {
    setAiError(null);
    setNodeBusy(node.id, 'chunk');
    try {
      await goalService.chunkIt(node.id, model);
      await loadTree();
    } catch (err) {
      setAiError(err instanceof Error ? err.message : 'AI chunking failed.');
    } finally {
      setNodeBusy(node.id, undefined);
    }
  };

  const handleMove = async (node: GoalNode, dest: 'smart' | 'quick' | 'plan') => {
    setNodeBusy(node.id, `move-${dest}`);
    try {
      // These return null on failure (and the service toasts why), so there is nothing to
      // catch for a rejected request — but an unexpected throw shouldn't escape unhandled.
      if (dest === 'smart') await goalService.moveToSmart(node.id);
      else if (dest === 'quick') await goalService.moveToQuick(node.id);
      else await goalService.moveToPlan(node.id);
      await loadTree();
    } catch (err) {
      setAiError(err instanceof Error ? err.message : `Couldn't move "${node.title}".`);
    } finally {
      setNodeBusy(node.id, undefined);
    }
  };

  return (
    <div className="flex flex-col gap-[1.75rem] relative">
      {/* Header */}
      <div className="todo-glass todo-lit flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-[1.5rem]">
        <div className="flex items-center gap-4">
          <span className="todo-icon-chip h-[2.75rem] w-[2.75rem] shrink-0">
            <Icon name="ViewfinderCircleIcon" size={22} />
          </span>
          <div>
          <h2 className="font-heading text-base font-bold text-foreground">Goals</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Set a goal at any time horizon and chunk it down — no fixed flow required.
          </p>
          </div>
        </div>
        <button
          onClick={() => handleAddAtLevel('main')}
          className="todo-btn todo-btn-primary shrink-0 px-4 py-2.5"
        >
          <Icon name="PlusIcon" size={14} variant="solid" /> New Goal
        </button>
      </div>

      {/* AI/action error */}
      {aiError && (
        <div className="p-2.5 rounded-md bg-red-500/10 border border-red-500/20 flex items-start gap-2">
          <Icon name="ExclamationTriangleIcon" size={14} className="text-red-500 shrink-0 mt-0.5" />
          <p className="text-xs text-red-600 dark:text-red-400 flex-1 leading-relaxed">{aiError}</p>
          <button onClick={() => setAiError(null)} className="text-red-500/70 hover:text-red-500 shrink-0">
            <Icon name="XMarkIcon" size={12} />
          </button>
        </div>
      )}

      {/* Board */}
      <div>
        {loading ? (
          <div className="flex flex-col items-center justify-center text-muted-foreground py-16">
            <span className="w-[1.5rem] h-[1.5rem] border-2 mix-border-primary/20 border-t-primary rounded-full animate-spin" />
          </div>
        ) : (
          <GoalTimelineBoard
            allGoals={allGoals}
            byId={byId}
            selectedId={selectedId}
            relatedIds={relatedIds}
            busy={busy}
            onSelect={setSelectedId}
            onEdit={setEditingGoal}
            onDelete={handleDelete}
            onDiveDeeper={handleDiveDeeper}
            onChunk={handleChunk}
            onMove={handleMove}
            onAddAtLevel={handleAddAtLevel}
          />
        )}
      </div>

      {/* Modals */}
      {showCreateModal && (
        <CreateGoalModal
          defaultLevel={createLevel}
          allGoals={allGoals}
          onClose={() => setShowCreateModal(false)}
          onSuccess={async () => {
            setShowCreateModal(false);
            await loadTree();
          }}
        />
      )}

      {editingGoal && (
        <GoalDetailModal
          goal={editingGoal}
          allGoals={allGoals}
          onClose={() => setEditingGoal(null)}
          onSaved={async () => {
            setEditingGoal(null);
            await loadTree();
          }}
        />
      )}
    </div>
  );
}
