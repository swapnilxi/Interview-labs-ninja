'use client';

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import Icon from '@/components/ui/AppIcon';
import Popover from '@/components/ui/Popover';
import { Project, ProjectNode, projectService } from '@/lib/services/projectService';
import ProjectNodeDetailModal from './ProjectNodeDetailModal';
import ParetoModal from '@/components/ui/ParetoModal';
import { confirmDialog } from '@/lib/ui/confirm';
import { LAB_CATALOG } from '@/modules/common/lab/labCatalog';
import AddFromLabSheet from '../labs/AddFromLabSheet';
import { labLinkFromContext, linkedLabNodes } from '../labs/labContent';

interface ProjectExplorerProps {
  project: Project;
  model: 'ollama' | 'gemini';
}

type NodeAction = 'dive' | 'chunk' | 'smart' | 'quick';

/** Indent per tree level, in px. */
const INDENT = 22;

function labIconFor(href: string): string {
  return LAB_CATALOG.find((l) => href.startsWith(`${l.path}?`))?.icon ?? 'BeakerIcon';
}

function NodeItem({
  node,
  level,
  model,
  collapsedIds,
  onSetExpanded,
  onAction,
  onAddSubtask,
  onDeleteNode,
  onOpenDetails,
  onParetoUpdate,
  parentLabLabel,
}: {
  node: ProjectNode;
  level: number;
  /** The lab its parent was added from: a lesson under that topic then shows just the lab's icon, not its name again. */
  parentLabLabel?: string;
  model: 'ollama' | 'gemini';
  collapsedIds: Set<number>;
  onSetExpanded: (nodeId: number, expanded: boolean) => void;
  onAction: (node: ProjectNode, action: NodeAction) => void;
  /** Resolves true when the subtask was created (so the input is only cleared on success). */
  onAddSubtask: (parentId: number, title: string, nodeType: string) => Promise<boolean>;
  onDeleteNode: (nodeId: number) => Promise<void>;
  onOpenDetails: (node: ProjectNode) => void;
  onParetoUpdate: (
    node: ProjectNode,
    updates: { pareto_score?: number | null; is_top_20?: boolean }
  ) => void;
}) {
  // Expand/collapse lives in the parent so Expand All / Collapse All can drive it
  const expanded = !collapsedIds.has(node.id);
  const [showAddSubtask, setShowAddSubtask] = useState(false);
  const [subtaskTitle, setSubtaskTitle] = useState('');
  const [subtaskType, setSubtaskType] = useState<string>('action');
  const [addingSubtask, setAddingSubtask] = useState(false);
  const [showParetoModal, setShowParetoModal] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const subtaskInputRef = useRef<HTMLInputElement>(null);
  const menuBtnRef = useRef<HTMLButtonElement>(null);

  const hasChildren = !!node.children && node.children.length > 0;
  const exported = node.exported_to_smart_todo || node.exported_to_quick;
  const labLink = labLinkFromContext(node.context);

  const openSubtask = () => {
    setShowAddSubtask((open) => !open);
    if (!showAddSubtask) setTimeout(() => subtaskInputRef.current?.focus(), 50);
  };

  const handleSubtaskSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!subtaskTitle.trim() || addingSubtask) return;
    setAddingSubtask(true);
    const ok = await onAddSubtask(node.id, subtaskTitle.trim(), subtaskType);
    // On failure the service already toasted why; keep the typed title so it can be retried.
    if (ok) {
      setSubtaskTitle('');
      onSetExpanded(node.id, true);
    }
    setAddingSubtask(false);
    // Keep focus for rapid subtask entry
    setTimeout(() => subtaskInputRef.current?.focus(), 50);
  };

  // 80/20 styling — gold edge for high-but-not-confirmed leverage, dimmed for low leverage
  let paretoClasses = '';
  if (!node.is_top_20 && node.pareto_score !== undefined && node.pareto_score !== null) {
    if (node.pareto_score >= 0.6) paretoClasses = 'shadow-[inset_2px_0_0_0_rgba(251,191,36,0.6)]';
    else if (node.pareto_score < 0.3) paretoClasses = 'opacity-60 grayscale-[30%]';
  }

  const menuItem = (
    label: string,
    icon: string,
    onClick: () => void,
    opts: { disabled?: boolean; danger?: boolean } = {}
  ) => (
    <button
      type="button"
      role="menuitem"
      disabled={opts.disabled}
      onClick={() => {
        setMenuOpen(false);
        onClick();
      }}
      className={`pe-menu-item ${opts.danger ? 'pe-menu-danger' : ''}`}
    >
      <Icon name={icon} size={18} />
      {label}
    </button>
  );

  return (
    <div className="flex flex-col">
      <div
        className={`todo-row flex items-start gap-2 py-2.5 pr-1.5 sm:pr-2 ${paretoClasses}`}
        style={{ paddingLeft: `${level * INDENT + 6}px` }}
      >
        {/* Guide line beside a parent's children */}
        {level > 0 && (
          <span
            className="pe-guide"
            style={{ left: `${level * INDENT - 6}px` }}
            aria-hidden="true"
          />
        )}

        {/* Expand/Collapse */}
        <div className="mt-px flex h-[1.5rem] w-[1.5rem] shrink-0 items-center justify-center">
          {hasChildren ? (
            <button
              type="button"
              onClick={() => onSetExpanded(node.id, !expanded)}
              className="todo-focus flex h-[1.5rem] w-[1.5rem] items-center justify-center rounded-full text-muted-foreground transition-colors hover:text-foreground"
              aria-expanded={expanded}
              aria-label={`${expanded ? 'Collapse' : 'Expand'} ${node.title}`}
            >
              <Icon
                name="ChevronRightIcon"
                size={14}
                className={`transition-transform duration-200 ${expanded ? 'rotate-90' : ''}`}
              />
            </button>
          ) : (
            <span
              className="h-1.5 w-1.5 rounded-full"
              style={{ background: 'var(--color-fill-strong)' }}
              aria-hidden="true"
            />
          )}
        </div>

        <div className="min-w-0 flex-1">
          {/* Title and state */}
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <button
              type="button"
              onClick={() => onOpenDetails(node)}
              className={`todo-focus rounded text-left text-[15px] font-medium leading-snug transition-colors hover:text-primary ${
                exported ? 'text-muted-foreground line-through' : 'text-foreground'
              }`}
              title="Open details, context & due date"
            >
              {node.title}
            </button>

            <button
              type="button"
              onClick={() => setShowParetoModal(true)}
              className={`todo-focus inline-flex h-[1.5rem] w-[1.5rem] items-center justify-center rounded-full transition-colors ${
                node.is_top_20 ? 'text-amber-500' : 'text-muted-foreground hover:text-foreground'
              }`}
              title="80/20 Pareto analysis"
              aria-label={
                node.is_top_20 ? '80/20: top 20%. Open the analysis' : 'Open the 80/20 analysis'
              }
            >
              <Icon
                name={node.is_top_20 && node.pareto_locked ? 'BookmarkIcon' : 'StarIcon'}
                size={15}
                variant={node.is_top_20 ? 'solid' : 'outline'}
              />
            </button>

            <span className="pe-chip">{node.node_type}</span>
            {node.generation_type !== 'manual' && (
              <span className="pe-chip copilot-tint">
                AI {node.generation_type.replace('_', ' ')}
              </span>
            )}
            {node.exported_to_smart_todo && (
              <span className="pe-chip pe-chip-done normal-case">
                <Icon name="CheckIcon" size={11} /> Smart To-Do
              </span>
            )}
            {node.exported_to_quick && (
              <span className="pe-chip pe-chip-done normal-case">
                <Icon name="CheckIcon" size={11} /> Quick Daily
              </span>
            )}
            {labLink && (
              <Link
                href={labLink.href}
                className="pe-chip pe-chip-link"
                title={`Open in ${labLink.label}`}
                aria-label={`Open ${node.title} in ${labLink.label}`}
              >
                <Icon name={labIconFor(labLink.href)} size={12} />
                {labLink.label !== parentLabLabel && labLink.label}
                <Icon name="ArrowUpRightIcon" size={10} />
              </Link>
            )}
          </div>

          {/* Quiet meta line */}
          {((node.context && !labLink) || node.time_estimate || node.due_date) && (
            <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[12px] text-muted-foreground">
              {node.context && !labLink && (
                <button
                  type="button"
                  onClick={() => onOpenDetails(node)}
                  className="todo-focus inline-flex items-center gap-1 rounded hover:text-foreground"
                >
                  <Icon name="PaperClipIcon" size={12} /> Notes
                </button>
              )}
              {node.time_estimate && (
                <span className="inline-flex items-center gap-1">
                  <Icon name="ClockIcon" size={12} /> {node.time_estimate}
                </span>
              )}
              {node.due_date && (
                <span className="inline-flex items-center gap-1">
                  <Icon name="CalendarIcon" size={12} /> {node.due_date}
                </span>
              )}
            </div>
          )}

          {/* Actions: always visible on wider screens (one quiet style for all of them); behind "···" on phones */}
          <div className="-ml-2.5 mt-1 hidden flex-wrap items-center gap-0.5 sm:flex">
            <button
              type="button"
              onClick={() => onOpenDetails(node)}
              className="pe-act"
              title="Open details for context, due date & more"
            >
              <Icon name="DocumentTextIcon" size={13} /> Details
            </button>
            <button
              type="button"
              onClick={openSubtask}
              className="pe-act"
              aria-expanded={showAddSubtask}
            >
              <Icon name="PlusIcon" size={13} /> Subtask
            </button>
            <button
              type="button"
              onClick={() => onAction(node, 'dive')}
              className="pe-act"
              title="Break into strategic subtopics"
            >
              <Icon name="MagnifyingGlassIcon" size={13} /> Dive deeper
            </button>
            <button
              type="button"
              onClick={() => onAction(node, 'chunk')}
              className="pe-act"
              title="Break into actionable steps"
            >
              <Icon name="ScissorsIcon" size={13} /> Chunk it
            </button>
            <span
              className="mx-1 h-3.5 w-px"
              style={{ background: 'var(--color-separator)' }}
              aria-hidden="true"
            />
            <button
              type="button"
              onClick={() => onAction(node, 'smart')}
              disabled={node.exported_to_smart_todo}
              className="pe-act"
              title="Send to Smart To-Do"
            >
              <Icon name="CpuChipIcon" size={13} /> To Smart
            </button>
            <button
              type="button"
              onClick={() => onAction(node, 'quick')}
              disabled={node.exported_to_quick}
              className="pe-act"
              title="Send to Quick Daily"
            >
              <Icon name="BoltIcon" size={13} /> To Quick
            </button>
            <button
              type="button"
              onClick={() => onDeleteNode(node.id)}
              className="pe-act pe-act-danger ml-auto h-7 w-7 justify-center px-0"
              title="Delete"
              aria-label={`Delete ${node.title}`}
            >
              <Icon name="TrashIcon" size={13} />
            </button>
          </div>
        </div>

        {/* Phones: every action in one menu */}
        <button
          ref={menuBtnRef}
          type="button"
          onClick={() => setMenuOpen((open) => !open)}
          className="pe-act h-8 w-8 shrink-0 justify-center px-0 sm:hidden"
          aria-haspopup="menu"
          aria-expanded={menuOpen}
          aria-label={`Actions for ${node.title}`}
        >
          <Icon name="EllipsisHorizontalIcon" size={18} />
        </button>
        <Popover
          open={menuOpen}
          anchorRef={menuBtnRef}
          onClose={() => setMenuOpen(false)}
          role="menu"
          label={`Actions for ${node.title}`}
          className="todo-popover min-w-[14rem] p-1.5"
        >
          {menuItem('Details', 'DocumentTextIcon', () => onOpenDetails(node))}
          {menuItem('Add subtask', 'PlusIcon', openSubtask)}
          {menuItem('Dive deeper', 'MagnifyingGlassIcon', () => onAction(node, 'dive'))}
          {menuItem('Chunk it', 'ScissorsIcon', () => onAction(node, 'chunk'))}
          <div className="pe-menu-sep" role="separator" />
          {menuItem('Send to Smart To-Do', 'CpuChipIcon', () => onAction(node, 'smart'), {
            disabled: node.exported_to_smart_todo,
          })}
          {menuItem('Send to Quick Daily', 'BoltIcon', () => onAction(node, 'quick'), {
            disabled: node.exported_to_quick,
          })}
          <div className="pe-menu-sep" role="separator" />
          {menuItem('Delete', 'TrashIcon', () => void onDeleteNode(node.id), { danger: true })}
        </Popover>
      </div>

      {/* Inline subtask form */}
      {showAddSubtask && (
        <form
          onSubmit={handleSubtaskSubmit}
          className="my-1 mr-1 flex flex-wrap items-center gap-2 rounded-[14px] p-1.5 sm:flex-nowrap sm:rounded-full sm:pl-3.5"
          style={{
            marginLeft: `min(${(level + 1) * INDENT + 6}px, 30%)`,
            background: 'var(--color-fill)',
          }}
        >
          <input
            ref={subtaskInputRef}
            type="text"
            value={subtaskTitle}
            onChange={(e) => setSubtaskTitle(e.target.value)}
            placeholder={`Subtask under “${node.title}”`}
            aria-label={`New subtask under ${node.title}`}
            className="h-8 min-w-0 basis-full bg-transparent px-2 text-[14px] text-foreground placeholder:text-muted-foreground focus:outline-none sm:basis-auto sm:flex-1 sm:px-0"
            onKeyDown={(e) => {
              if (e.key === 'Escape') setShowAddSubtask(false);
            }}
          />
          <select
            value={subtaskType}
            onChange={(e) => setSubtaskType(e.target.value)}
            className="pe-type"
            style={{ backgroundColor: 'var(--color-card)' }}
            aria-label="Subtask type"
          >
            <option value="action">Action</option>
            <option value="topic">Topic</option>
            <option value="idea">Idea</option>
          </select>
          <span className="flex-1 sm:hidden" />
          <button
            type="button"
            onClick={() => setShowAddSubtask(false)}
            className="pe-act h-8 px-3"
            aria-label="Cancel adding a subtask"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={!subtaskTitle.trim() || addingSubtask}
            className="todo-btn todo-btn-primary h-8 px-3.5"
          >
            {addingSubtask ? 'Adding…' : 'Add'}
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
              model={model}
              collapsedIds={collapsedIds}
              onSetExpanded={onSetExpanded}
              onAction={onAction}
              onAddSubtask={onAddSubtask}
              onDeleteNode={onDeleteNode}
              onOpenDetails={onOpenDetails}
              onParetoUpdate={onParetoUpdate}
              parentLabLabel={labLink?.label}
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

// Every node id that has children — i.e. everything Collapse All should close
function collectParentIds(nodes: ProjectNode[], acc: number[] = []): number[] {
  nodes.forEach((node) => {
    if (node.children && node.children.length > 0) {
      acc.push(node.id);
      collectParentIds(node.children, acc);
    }
  });
  return acc;
}

const NODE_TYPES = [
  { value: 'topic', label: 'Topic' },
  { value: 'phase', label: 'Phase' },
  { value: 'action', label: 'Action' },
  { value: 'idea', label: 'Idea' },
];

export default function ProjectExplorer({ project, model }: ProjectExplorerProps) {
  const [nodes, setNodes] = useState<ProjectNode[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [detailNode, setDetailNode] = useState<ProjectNode | null>(null);
  const [labSheetOpen, setLabSheetOpen] = useState(false);
  // Collapsed node ids — empty means everything is expanded (the default)
  const [collapsedIds, setCollapsedIds] = useState<Set<number>>(new Set());

  // Inline root add form
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

  // Reload without the loading state (after an edit), so the tree doesn't flash.
  const refreshTree = async () => {
    const tree = await projectService.fetchProjectTree(project.id);
    setNodes(tree);
  };

  useEffect(() => {
    loadTree();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project.id]);

  const setNodeExpanded = (nodeId: number, expanded: boolean) => {
    setCollapsedIds((prev) => {
      const next = new Set(prev);
      if (expanded) next.delete(nodeId);
      else next.add(nodeId);
      return next;
    });
  };

  const parentIds = collectParentIds(nodes);
  const collapsedCount = parentIds.filter((id) => collapsedIds.has(id)).length;
  const handleExpandAll = () => setCollapsedIds(new Set());
  const handleCollapseAll = () => setCollapsedIds(new Set(parentIds));

  const handleAddRootNode = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!rootTitle.trim() || addingRoot) return;
    setAddingRoot(true);

    const created = await projectService.createNode(project.id, {
      title: rootTitle.trim(),
      node_type: rootType as ProjectNode['node_type'],
    });

    if (created) {
      await refreshTree();
      setRootTitle('');
    }
    setAddingRoot(false);
    setTimeout(() => rootInputRef.current?.focus(), 50);
  };

  const handleAddSubtask = async (
    parentId: number,
    title: string,
    nodeType: string
  ): Promise<boolean> => {
    const created = await projectService.createNode(project.id, {
      title,
      parent_node_id: parentId,
      node_type: nodeType as ProjectNode['node_type'],
    });
    if (!created) return false;
    await refreshTree();
    return true;
  };

  const handleDeleteNode = async (nodeId: number) => {
    const ok = await projectService.deleteNode(nodeId);
    if (ok) {
      await refreshTree();
    }
  };

  const handleParetoUpdate = async (
    node: ProjectNode,
    updates: { pareto_score?: number | null; is_top_20?: boolean }
  ) => {
    const updated = await projectService.updateProjectNode(node.id, updates);
    if (updated) await refreshTree();
  };

  const handleAction = async (node: ProjectNode, action: NodeAction) => {
    setActionLoading(`${action}-${node.id}`);
    setActionError(null);

    try {
      if (action === 'dive' || action === 'chunk') {
        if (node.depth_level >= 4) {
          const confirmed = await confirmDialog({
            title: 'This item is quite deep',
            message: 'AI suggestions can lose context this far down the tree. Generate anyway?',
            confirmLabel: 'Generate anyway',
          });
          if (!confirmed) {
            setActionLoading(null);
            return;
          }
        }

        if (action === 'dive') {
          await projectService.diveDeeper(node.id, model);
        } else {
          await projectService.chunkIt(node.id, model);
        }
        await refreshTree();
      } else if (action === 'smart') {
        await projectService.moveToSmart(node.id);
        await refreshTree();
      } else if (action === 'quick') {
        await projectService.moveToQuick(node.id);
        await refreshTree();
      }
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Action failed.');
    } finally {
      setActionLoading(null);
    }
  };

  const typeSelect = (className: string) => (
    <select
      value={rootType}
      onChange={(e) => setRootType(e.target.value)}
      className={`pe-type ${className}`}
      aria-label="Item type"
    >
      {NODE_TYPES.map((t) => (
        <option key={t.value} value={t.value}>
          {t.label}
        </option>
      ))}
    </select>
  );

  const fromLabButton = (
    <button
      type="button"
      onClick={() => setLabSheetOpen(true)}
      className="todo-btn todo-btn-quiet h-9 shrink-0 px-3.5 sm:h-10"
    >
      <Icon name="BeakerIcon" size={15} /> From lab
    </button>
  );

  return (
    <div className="todo-glass relative flex flex-col overflow-hidden rounded-[1.25rem]">
      <div className="flex flex-col gap-3 p-3 sm:p-4">
        {/* Description, and Expand / Collapse All */}
        {(project.description || parentIds.length > 0) && (
          <div className="flex items-center justify-between gap-3 px-1">
            {project.description ? (
              <p className="min-w-0 flex-1 text-[13px] leading-snug text-muted-foreground">
                {project.description}
              </p>
            ) : (
              <span className="flex-1" />
            )}
            {parentIds.length > 0 && (
              <div className="flex shrink-0 items-center gap-0.5">
                <button
                  type="button"
                  onClick={handleExpandAll}
                  disabled={collapsedCount === 0}
                  className="pe-act h-8 w-8 justify-center px-0"
                  title="Expand all"
                  aria-label="Expand all"
                >
                  <Icon name="ChevronDoubleDownIcon" size={15} />
                </button>
                <button
                  type="button"
                  onClick={handleCollapseAll}
                  disabled={collapsedCount === parentIds.length}
                  className="pe-act h-8 w-8 justify-center px-0"
                  title="Collapse all"
                  aria-label="Collapse all"
                >
                  <Icon name="ChevronDoubleUpIcon" size={15} />
                </button>
              </div>
            )}
          </div>
        )}

        {/* Composer: a capture capsule; From lab beside it (under it on phones, with the type) */}
        <form
          onSubmit={handleAddRootNode}
          className="flex flex-col gap-2 sm:flex-row sm:items-center"
        >
          <div className="todo-capture min-w-0 flex-1 gap-2 py-1 pl-4 pr-1">
            <input
              ref={rootInputRef}
              type="text"
              value={rootTitle}
              onChange={(e) => setRootTitle(e.target.value)}
              placeholder="Add a topic or task"
              aria-label="New topic or task"
              className="h-9 min-w-0 flex-1 bg-transparent text-[15px] text-foreground placeholder:text-muted-foreground focus:outline-none"
            />
            {typeSelect('hidden sm:block')}
            <button
              type="submit"
              disabled={!rootTitle.trim() || addingRoot}
              className="todo-btn todo-btn-primary h-9 shrink-0 px-4"
            >
              {addingRoot ? (
                <span
                  className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent"
                  aria-hidden="true"
                />
              ) : (
                <Icon name="PlusIcon" size={15} />
              )}
              Add
            </button>
          </div>
          <div className="flex items-center justify-between gap-2 sm:contents">
            {typeSelect('h-9 sm:hidden')}
            {fromLabButton}
          </div>
        </form>

        {/* AI action error */}
        {actionError && (
          <div className="todo-alert todo-alert-error" role="alert">
            <Icon name="ExclamationTriangleIcon" size={16} className="mt-px" />
            <p className="flex-1 text-[13px] leading-relaxed text-inherit">{actionError}</p>
            <button
              type="button"
              onClick={() => setActionError(null)}
              className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full opacity-70 hover:opacity-100"
              aria-label="Dismiss"
            >
              <Icon name="XMarkIcon" size={14} />
            </button>
          </div>
        )}
      </div>

      {/* Tree */}
      <div
        className="relative border-t px-1.5 py-2 sm:px-2.5"
        style={{ borderColor: 'var(--color-separator)' }}
      >
        {loading ? (
          <div
            className="flex flex-col items-center justify-center gap-3 py-[3rem] text-muted-foreground"
            role="status"
          >
            <span className="h-[1.5rem] w-[1.5rem] animate-spin rounded-full border-2 mix-border-primary/20 border-t-primary" />
            <span className="text-[13px]">Loading the project…</span>
          </div>
        ) : nodes.length === 0 ? (
          <div className="flex flex-col items-center gap-4 px-4 py-[3rem] text-center">
            <span className="todo-icon-chip h-[3.25rem] w-[3.25rem] rounded-[15px]">
              <Icon name="RectangleStackIcon" size={26} />
            </span>
            <div>
              <p className="text-[15px] font-semibold text-foreground">
                Nothing in this project yet
              </p>
              <p className="mt-1 text-[13px] text-muted-foreground">
                Type a topic above, or bring in lessons and problems from a lab.
              </p>
            </div>
            {fromLabButton}
          </div>
        ) : (
          <div className="flex flex-col">
            {nodes.map((node) => (
              <NodeItem
                key={node.id}
                node={node}
                level={0}
                model={model}
                collapsedIds={collapsedIds}
                onSetExpanded={setNodeExpanded}
                onAction={handleAction}
                onAddSubtask={handleAddSubtask}
                onDeleteNode={handleDeleteNode}
                onOpenDetails={setDetailNode}
                onParetoUpdate={handleParetoUpdate}
              />
            ))}
          </div>
        )}
      </div>

      {/* AI actions in progress */}
      {actionLoading && (
        <div
          className="absolute inset-0 z-40 flex items-center justify-center"
          style={{ background: 'color-mix(in srgb, var(--color-background) 55%, transparent)' }}
          role="status"
        >
          <div className="todo-glass flex items-center gap-3 rounded-full px-4 py-2.5 shadow-lg">
            <span className="h-4 w-4 animate-spin rounded-full border-2 mix-border-primary/20 border-t-primary" />
            <span className="text-[13px] font-semibold text-foreground">
              {actionLoading.startsWith('dive') || actionLoading.startsWith('chunk')
                ? 'AI is breaking it down…'
                : 'Working…'}
            </span>
          </div>
        </div>
      )}

      {/* Node Detail Modal */}
      <ProjectNodeDetailModal
        node={detailNode}
        isOpen={detailNode !== null}
        onClose={() => setDetailNode(null)}
        onUpdate={(updated) => {
          setDetailNode((prev) => (prev ? { ...prev, ...updated } : prev));
          refreshTree();
        }}
      />

      {labSheetOpen && (
        <AddFromLabSheet
          project={project}
          existing={linkedLabNodes(nodes)}
          onClose={() => setLabSheetOpen(false)}
          onAdded={refreshTree}
        />
      )}
    </div>
  );
}
