'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import Icon from '@/components/ui/AppIcon';
import GoalTimelineBoard from './GoalTimelineBoard';
import CreateGoalModal from './CreateGoalModal';
import GoalDetailModal from './GoalDetailModal';
import { GoalNode, GoalLevel, goalService } from '@/lib/services/goalService';

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
    if (!confirm(`Delete "${node.title}" and everything chunked under it?`)) return;
    const ok = await goalService.deleteGoal(node.id);
    if (ok) {
      if (selectedId === node.id) setSelectedId(null);
      await loadTree();
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
      if (dest === 'smart') await goalService.moveToSmart(node.id);
      else if (dest === 'quick') await goalService.moveToQuick(node.id);
      else await goalService.moveToPlan(node.id);
      await loadTree();
    } finally {
      setNodeBusy(node.id, undefined);
    }
  };

  return (
    <div className="flex flex-col h-full gap-3 relative">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-card border border-border/80 rounded-xl p-3 shadow-sm">
        <div>
          <h2 className="font-heading text-sm font-bold text-foreground flex items-center gap-2">
            <span className="text-lg">🎯</span> Goals
          </h2>
          <p className="text-[11px] text-muted-foreground mt-0.5">
            Set a goal at any time horizon and chunk it down — no fixed flow required.
          </p>
        </div>
        <button
          onClick={() => handleAddAtLevel('main')}
          className="px-4 py-1.5 bg-primary text-primary-foreground text-xs font-bold rounded-lg hover:bg-primary/90 transition-smooth flex items-center gap-2 justify-center shrink-0"
        >
          <Icon name="PlusIcon" size={14} variant="solid" /> New Goal
        </button>
      </div>

      {/* AI action error */}
      {aiError && (
        <div className="p-2.5 rounded-md bg-red-500/10 border border-red-500/20 flex items-start gap-2">
          <span className="text-xs shrink-0">⚠️</span>
          <p className="text-[11px] text-red-600 dark:text-red-400 flex-1 leading-relaxed">{aiError}</p>
          <button onClick={() => setAiError(null)} className="text-red-500/70 hover:text-red-500 shrink-0">
            <Icon name="XMarkIcon" size={12} />
          </button>
        </div>
      )}

      {/* Board */}
      <div className="flex-1 min-h-0">
        {loading ? (
          <div className="h-full flex flex-col items-center justify-center text-muted-foreground space-y-3">
            <span className="w-6 h-6 border-2 border-primary/20 border-t-primary rounded-full animate-spin" />
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
