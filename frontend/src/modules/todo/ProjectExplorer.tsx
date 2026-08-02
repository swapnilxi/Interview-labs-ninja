'use client';

import { useState, useEffect, useRef } from 'react';
import Icon from '@/components/ui/AppIcon';
import { Project, ProjectNode, projectService } from '@/lib/services/projectService';
import ProjectNodeDetailModal from './ProjectNodeDetailModal';
import ParetoModal from '@/components/ui/ParetoModal';

interface ProjectExplorerProps {
  project: Project;
  onClose: () => void;
  model: 'ollama' | 'gemini';
}

function NodeItem({
  node,
  level,
  projectId,
  model,
  onAction,
  onAddSubtask,
  onDeleteNode,
  onOpenDetails,
  onParetoUpdate,
}: {
  node: ProjectNode;
  level: number;
  projectId: number;
  model: 'ollama' | 'gemini';
  onAction: (node: ProjectNode, action: 'dive' | 'chunk' | 'smart' | 'quick') => void;
  onAddSubtask: (parentId: number, title: string, nodeType: string) => Promise<void>;
  onDeleteNode: (nodeId: number) => Promise<void>;
  onOpenDetails: (node: ProjectNode) => void;
  onParetoUpdate: (node: ProjectNode, updates: { pareto_score?: number | null; is_top_20?: boolean }) => void;
}) {
  const [expanded, setExpanded] = useState(true);
  const [showAddSubtask, setShowAddSubtask] = useState(false);
  const [subtaskTitle, setSubtaskTitle] = useState('');
  const [subtaskType, setSubtaskType] = useState<string>('action');
  const [addingSubtask, setAddingSubtask] = useState(false);
  const [showParetoModal, setShowParetoModal] = useState(false);
  const subtaskInputRef = useRef<HTMLInputElement>(null);

  const hasChildren = node.children && node.children.length > 0;

  const depthColors = [
    'border-border',
    'border-blue-500/30',
    'border-purple-500/30',
    'border-pink-500/30',
    'border-amber-500/30',
  ];
  const borderClass = depthColors[Math.min(level, depthColors.length - 1)];

  const handleSubtaskSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!subtaskTitle.trim() || addingSubtask) return;
    setAddingSubtask(true);
    await onAddSubtask(node.id, subtaskTitle.trim(), subtaskType);
    setSubtaskTitle('');
    setAddingSubtask(false);
    setExpanded(true);
    // Keep focus for rapid subtask entry
    setTimeout(() => subtaskInputRef.current?.focus(), 50);
  };

  // 80/20 styling — gold glow for high-but-not-confirmed leverage, grey dim for low leverage
  let paretoClasses = '';
  if (!node.is_top_20 && node.pareto_score !== undefined && node.pareto_score !== null) {
    if (node.pareto_score >= 0.6) paretoClasses = 'shadow-[inset_2px_0_0_0_rgba(251,191,36,0.6)]';
    else if (node.pareto_score < 0.3) paretoClasses = 'opacity-60 grayscale-[30%]';
  }

  return (
    <div className="flex flex-col">
      <div
        className={`group relative flex items-start gap-2 py-2 pr-2 rounded-lg hover:bg-muted/30 transition-smooth ${paretoClasses}`}
        style={{ paddingLeft: `${level * 24}px` }}
      >
        {/* Indent Guide Line */}
        {level > 0 && (
          <div
            className={`absolute left-[11px] top-0 bottom-0 w-px ${borderClass}`}
            style={{ left: `${level * 24 - 13}px` }}
          />
        )}

        {/* Expand/Collapse Toggle */}
        <div className="w-4 flex items-center justify-center shrink-0 mt-0.5 z-10 bg-card">
          {hasChildren ? (
            <button
              onClick={() => setExpanded(!expanded)}
              className="text-muted-foreground hover:text-foreground transition-smooth"
            >
              <Icon name={expanded ? 'ChevronDownIcon' : 'ChevronRightIcon'} size={12} />
            </button>
          ) : (
            <div className="w-1.5 h-1.5 rounded-full bg-border" />
          )}
        </div>

        {/* Node Content */}
        <div className="flex-1 min-w-0 flex flex-col">
          <div className="flex items-center gap-2 flex-wrap">
            <button
              onClick={() => onOpenDetails(node)}
              className={`text-sm font-medium text-left hover:text-primary transition-smooth ${
                node.exported_to_smart_todo || node.exported_to_quick
                  ? 'text-muted-foreground line-through'
                  : 'text-foreground'
              }`}
              title="Click to open details, context & due date"
            >
              {node.title}
            </button>
            {(node.context || node.due_date || node.time_estimate) && (
              <button
                onClick={() => onOpenDetails(node)}
                className="text-muted-foreground hover:text-primary transition-smooth"
                title="Has context / details"
              >
                <Icon name="PaperClipIcon" size={12} />
              </button>
            )}

            <button
              onClick={() => setShowParetoModal(true)}
              className={`text-[9px] font-bold px-1 py-0.5 rounded border transition-smooth ${
                node.is_top_20
                  ? 'border-amber-400/50 bg-amber-400/10 text-amber-600 dark:text-amber-400'
                  : 'border-border/60 text-muted-foreground hover:bg-muted'
              }`}
              title="80/20 Pareto Analysis"
            >
              {node.is_top_20 ? (node.pareto_locked ? '📌' : '⭐') : '⭐'}
            </button>

            {/* Badges */}
            <span className="text-[9px] uppercase tracking-wider font-semibold text-muted-foreground bg-muted px-1 rounded-sm">
              {node.node_type}
            </span>
            {node.generation_type !== 'manual' && (
              <span className="text-[9px] uppercase tracking-wider font-semibold text-blue-500 bg-blue-500/10 px-1 rounded-sm">
                AI {node.generation_type.replace('_', ' ')}
              </span>
            )}

            {/* Exported Badges */}
            {node.exported_to_smart_todo && (
              <span className="text-[9px] font-bold text-emerald-500 flex items-center gap-0.5">
                <Icon name="CheckIcon" size={10} /> Smart To-Do
              </span>
            )}
            {node.exported_to_quick && (
              <span className="text-[9px] font-bold text-amber-500 flex items-center gap-0.5">
                <Icon name="CheckIcon" size={10} /> Quick Daily
              </span>
            )}

            {node.time_estimate && (
              <span className="text-[9px] font-semibold text-muted-foreground flex items-center gap-0.5">
                <Icon name="ClockIcon" size={10} /> {node.time_estimate}
              </span>
            )}
            {node.due_date && (
              <span className="text-[9px] font-semibold text-muted-foreground flex items-center gap-0.5">
                <Icon name="CalendarIcon" size={10} /> {node.due_date}
              </span>
            )}
          </div>

          {/* Action Buttons (visible everytime, not on hover) */}
          <div className="flex items-center gap-1.5 mt-1 transition-opacity flex-wrap">
            <button
              onClick={() => onOpenDetails(node)}
              className="text-[10px] font-semibold px-2 py-0.5 rounded border border-primary/30 text-primary hover:bg-primary/10 transition-smooth flex items-center gap-1"
              title="Open details page for context, due date & more"
            >
              <span>📄</span> Details
            </button>
            <button
              onClick={() => {
                setShowAddSubtask(!showAddSubtask);
                if (!showAddSubtask) setTimeout(() => subtaskInputRef.current?.focus(), 50);
              }}
              className="text-[10px] font-semibold px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/20 transition-smooth flex items-center gap-1"
            >
              <Icon name="PlusIcon" size={10} /> Subtask
            </button>
            <button
              onClick={() => onAction(node, 'dive')}
              className="text-[10px] font-semibold px-2 py-0.5 rounded bg-blue-500/10 text-blue-600 hover:bg-blue-500/20 transition-smooth"
            >
              🔍 Dive Deeper
            </button>
            <button
              onClick={() => onAction(node, 'chunk')}
              className="text-[10px] font-semibold px-2 py-0.5 rounded bg-purple-500/10 text-purple-600 hover:bg-purple-500/20 transition-smooth"
            >
              ⚡ Chunk It
            </button>
            <div className="w-px h-3 bg-border mx-0.5" />
            <button
              onClick={() => onAction(node, 'smart')}
              disabled={node.exported_to_smart_todo}
              className="text-[10px] font-semibold px-2 py-0.5 rounded border border-border hover:bg-muted transition-smooth disabled:opacity-50 flex items-center gap-1"
            >
              <span>🧠</span> → Smart
            </button>
            <button
              onClick={() => onAction(node, 'quick')}
              disabled={node.exported_to_quick}
              className="text-[10px] font-semibold px-2 py-0.5 rounded border border-border hover:bg-muted transition-smooth disabled:opacity-50 flex items-center gap-1"
            >
              <span>⚡</span> → Quick
            </button>

            <button
              onClick={() => onDeleteNode(node.id)}
              className="text-[10px] p-1 rounded text-muted-foreground hover:text-red-500 hover:bg-red-500/10 transition-smooth ml-auto"
              title="Delete node"
            >
              <Icon name="TrashIcon" size={11} />
            </button>
          </div>
        </div>
      </div>

      {/* Inline On-Page Subtask Add Form */}
      {showAddSubtask && (
        <form
          onSubmit={handleSubtaskSubmit}
          className="flex items-center gap-2 py-1.5 my-1 rounded-lg bg-muted/40 border border-emerald-500/30 transition-smooth"
          style={{ marginLeft: `${(level + 1) * 24}px` }}
        >
          <input
            ref={subtaskInputRef}
            type="text"
            value={subtaskTitle}
            onChange={(e) => setSubtaskTitle(e.target.value)}
            placeholder={`Add subtask under "${node.title}"...`}
            className="flex-1 min-w-0 bg-transparent px-2 py-0.5 text-xs text-foreground focus:outline-none placeholder:text-muted-foreground/60"
            onKeyDown={(e) => {
              if (e.key === 'Escape') setShowAddSubtask(false);
            }}
          />
          <select
            value={subtaskType}
            onChange={(e) => setSubtaskType(e.target.value)}
            className="bg-card border border-border/80 rounded px-1.5 py-0.5 text-[10px] font-semibold text-muted-foreground"
          >
            <option value="action">Action</option>
            <option value="topic">Topic</option>
            <option value="idea">Idea</option>
          </select>
          <button
            type="submit"
            disabled={!subtaskTitle.trim() || addingSubtask}
            className="px-2 py-0.5 text-[10px] font-bold rounded bg-emerald-500 text-white hover:bg-emerald-600 transition-smooth disabled:opacity-50 shrink-0 mr-1.5"
          >
            {addingSubtask ? '...' : '+ Add'}
          </button>
          <button
            type="button"
            onClick={() => setShowAddSubtask(false)}
            className="text-[10px] text-muted-foreground hover:text-foreground px-1 mr-1"
          >
            ✕
          </button>
        </form>
      )}

      {expanded && hasChildren && (
        <div className="flex flex-col">
          {node.children!.map((child) => (
            <NodeItem
              key={child.id}
              node={child}
              level={level + 1}
              projectId={projectId}
              model={model}
              onAction={onAction}
              onAddSubtask={onAddSubtask}
              onDeleteNode={onDeleteNode}
              onOpenDetails={onOpenDetails}
              onParetoUpdate={onParetoUpdate}
            />
          ))}
        </div>
      )}

      {/* 80/20 Pareto Modal */}
      <ParetoModal
        isOpen={showParetoModal}
        onClose={() => setShowParetoModal(false)}
        title={node.title}
        table="project_nodes"
        itemId={node.id}
        paretoScore={node.pareto_score}
        isTop20={node.is_top_20}
        paretoLocked={node.pareto_locked}
        reason={node.pareto_reason}
        model={model}
        onUpdate={(updates) => onParetoUpdate(node, updates)}
      />
    </div>
  );
}

export default function ProjectExplorer({ project, onClose, model }: ProjectExplorerProps) {
  const [nodes, setNodes] = useState<ProjectNode[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [detailNode, setDetailNode] = useState<ProjectNode | null>(null);

  // On-Page Root Node Add Form State
  const [rootTitle, setRootTitle] = useState('');
  const [rootType, setRootType] = useState<string>('topic');
  const [addingRoot, setAddingRoot] = useState(false);
  const rootInputRef = useRef<HTMLInputElement>(null);

  const loadTree = async () => {
    setLoading(true);
    const tree = await projectService.fetchProjectTree(project.id);
    setNodes(tree);
    setLoading(false);
  };

  useEffect(() => {
    loadTree();
  }, [project.id]);

  const handleAddRootNode = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!rootTitle.trim() || addingRoot) return;
    setAddingRoot(true);

    const created = await projectService.createNode(project.id, {
      title: rootTitle.trim(),
      node_type: rootType as any,
    });

    if (created) {
      await loadTree();
      setRootTitle('');
    }
    setAddingRoot(false);
    setTimeout(() => rootInputRef.current?.focus(), 50);
  };

  const handleAddSubtask = async (parentId: number, title: string, nodeType: string) => {
    const created = await projectService.createNode(project.id, {
      title,
      parent_node_id: parentId,
      node_type: nodeType as any,
    });
    if (created) {
      await loadTree();
    }
  };

  const handleDeleteNode = async (nodeId: number) => {
    const ok = await projectService.deleteNode(nodeId);
    if (ok) {
      await loadTree();
    }
  };

  const handleParetoUpdate = async (node: ProjectNode, updates: { pareto_score?: number | null; is_top_20?: boolean }) => {
    const updated = await projectService.updateProjectNode(node.id, updates);
    if (updated) await loadTree();
  };

  const handleAction = async (node: ProjectNode, action: 'dive' | 'chunk' | 'smart' | 'quick') => {
    setActionLoading(`${action}-${node.id}`);
    setActionError(null);

    try {
      if (action === 'dive' || action === 'chunk') {
        if (node.depth_level >= 4) {
          if (!confirm('This node is quite deep. AI generation might lose context. Continue?')) {
            setActionLoading(null);
            return;
          }
        }

        if (action === 'dive') {
          await projectService.diveDeeper(node.id, model);
        } else {
          await projectService.chunkIt(node.id, model);
        }
        await loadTree();
      } else if (action === 'smart') {
        await projectService.moveToSmart(node.id);
        await loadTree();
      } else if (action === 'quick') {
        await projectService.moveToQuick(node.id);
        await loadTree();
      }
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Action failed.');
    } finally {
      setActionLoading(null);
    }
  };

  return (
    <div className="flex flex-col h-full bg-card border border-border/80 rounded-xl shadow-sm overflow-hidden animate-in fade-in zoom-in-95 duration-200">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-border/50 bg-muted/20">
        <div className="flex items-center gap-3">
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg border border-border bg-card hover:bg-muted text-muted-foreground transition-smooth"
            title="Back to projects"
          >
            <Icon name="ArrowLeftIcon" size={14} />
          </button>

          <div className="flex items-center gap-2">
            <div
              className="w-8 h-8 rounded-lg flex items-center justify-center text-sm shadow-sm"
              style={{
                backgroundColor: `${project.color || '#3b82f6'}20`,
                border: `1px solid ${project.color || '#3b82f6'}40`,
              }}
            >
              {project.icon || '📁'}
            </div>
            <div>
              <h2 className="font-heading font-semibold text-foreground text-sm flex items-center gap-2">
                {project.title}
                {project.is_top_20 && (
                  <span className="text-[9px] font-bold px-1.5 py-0.5 rounded border border-amber-400/50 bg-amber-400/10 text-amber-600 dark:text-amber-400 shadow-sm">
                    ⭐ Top 20%
                  </span>
                )}
              </h2>
              <p className="text-[10px] text-muted-foreground flex items-center gap-2">
                <span className="uppercase font-bold text-emerald-500">{project.status}</span>
                <span>•</span>
                <span>{project.priority.toUpperCase()}</span>
                {project.due_date && (
                  <>
                    <span>•</span>
                    <span>Due: {project.due_date}</span>
                  </>
                )}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Description if present */}
      {project.description && (
        <div className="px-4 py-2 border-b border-border/50 bg-black/5 dark:bg-white/5">
          <p className="text-xs text-muted-foreground italic">"{project.description}"</p>
        </div>
      )}

      {/* AI action error */}
      {actionError && (
        <div className="mx-4 mt-3 p-2.5 rounded-md bg-red-500/10 border border-red-500/20 flex items-start gap-2">
          <span className="text-xs shrink-0">⚠️</span>
          <p className="text-[11px] text-red-600 dark:text-red-400 flex-1 leading-relaxed">{actionError}</p>
          <button onClick={() => setActionError(null)} className="text-red-500/70 hover:text-red-500 shrink-0">
            <Icon name="XMarkIcon" size={12} />
          </button>
        </div>
      )}

      {/* ── On-Page Inline Root Task Add Form (NO MODAL, NO POPUP) ───────── */}
      <div className="p-3 border-b border-border/60 bg-muted/20">
        <form onSubmit={handleAddRootNode} className="flex items-center gap-2">
          <div className="relative flex-1">
            <input
              ref={rootInputRef}
              type="text"
              value={rootTitle}
              onChange={(e) => setRootTitle(e.target.value)}
              placeholder="Add a topic or task to this project..."
              className="w-full bg-input border border-border/80 rounded-lg px-3 py-1.5 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary placeholder:text-muted-foreground"
            />
          </div>
          <select
            value={rootType}
            onChange={(e) => setRootType(e.target.value)}
            className="bg-card border border-border/80 rounded-lg px-2.5 py-1.5 text-xs font-medium text-foreground focus:outline-none"
          >
            <option value="topic">📁 Topic</option>
            <option value="phase">🚩 Phase</option>
            <option value="action">⚡ Action</option>
            <option value="idea">💡 Idea</option>
          </select>
          <button
            type="submit"
            disabled={!rootTitle.trim() || addingRoot}
            className="px-3.5 py-1.5 bg-primary text-primary-foreground text-xs font-bold rounded-lg hover:bg-primary/90 transition-smooth flex items-center gap-1 disabled:opacity-50 shrink-0"
          >
            {addingRoot ? (
              <span className="w-3 h-3 border border-white border-t-transparent rounded-full animate-spin" />
            ) : (
              <Icon name="PlusIcon" size={13} />
            )}
            Add Task
          </button>
        </form>
      </div>

      {/* Tree Content */}
      <div className="flex-1 overflow-y-auto p-4 scrollbar-clean relative">
        {loading ? (
          <div className="h-full flex flex-col items-center justify-center text-muted-foreground space-y-3">
            <span className="w-6 h-6 border-2 border-primary/20 border-t-primary rounded-full animate-spin" />
            <span className="text-xs font-medium">Loading project structure...</span>
          </div>
        ) : nodes.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-muted-foreground space-y-4 opacity-70">
            <span className="text-4xl">🌱</span>
            <div className="text-center">
              <p className="text-sm font-medium">This project has no tasks yet.</p>
              <p className="text-xs mt-1">Use the input bar above to add your first topic or task.</p>
            </div>
          </div>
        ) : (
          <div className="space-y-1">
            {nodes.map((node) => (
              <NodeItem
                key={node.id}
                node={node}
                level={0}
                projectId={project.id}
                model={model}
                onAction={handleAction}
                onAddSubtask={handleAddSubtask}
                onDeleteNode={handleDeleteNode}
                onOpenDetails={setDetailNode}
                onParetoUpdate={handleParetoUpdate}
              />
            ))}
          </div>
        )}

        {/* Global Loading Overlay for AI Actions */}
        {actionLoading && (
          <div className="absolute inset-0 bg-background/50 backdrop-blur-[1px] flex items-center justify-center z-50">
            <div className="bg-card border border-border shadow-lg rounded-xl px-4 py-3 flex items-center gap-3">
              <span className="w-5 h-5 border-2 border-primary/20 border-t-primary rounded-full animate-spin" />
              <span className="text-xs font-bold text-foreground">AI generating breakdown...</span>
            </div>
          </div>
        )}
      </div>

      {/* Node Detail Modal */}
      <ProjectNodeDetailModal
        node={detailNode}
        isOpen={detailNode !== null}
        onClose={() => setDetailNode(null)}
        onUpdate={(updated) => {
          setDetailNode((prev) => (prev ? { ...prev, ...updated } : prev));
          loadTree();
        }}
      />
    </div>
  );
}
