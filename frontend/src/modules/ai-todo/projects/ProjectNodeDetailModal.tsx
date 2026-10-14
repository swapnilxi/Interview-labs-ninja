'use client';

import { useState, useEffect, useRef } from 'react';
import Icon from '@/components/ui/AppIcon';
import FlatIcon from '@/components/ui/FlatIcon';
import Modal from '@/components/ui/Modal';
import { toast } from '@/lib/ui/toast';
import { SaveIndicator, useSaveStatus } from '../shared/useSaveStatus';
import { fieldsServerKept } from '../shared/patchSemantics';
import { ProjectNode, projectService } from '@/lib/services/projectService';
import { todoService } from '@/lib/services/todoService';

interface ProjectNodeDetailModalProps {
  node: ProjectNode | null;
  isOpen: boolean;
  onClose: () => void;
  onUpdate?: (updated: Partial<ProjectNode>) => void;
}

const NODE_TYPE_LABELS: Record<string, string> = {
  topic: 'Topic',
  phase: 'Phase',
  action: 'Action',
  idea: 'Idea',
};

type TextField = 'title' | 'time_estimate' | 'context' | 'intention' | 'definition_of_done';

export default function ProjectNodeDetailModal({
  node,
  isOpen,
  onClose,
  onUpdate,
}: ProjectNodeDetailModalProps) {
  const [title, setTitle] = useState('');
  const [nodeType, setNodeType] = useState('topic');
  const [dueDate, setDueDate] = useState('');
  const [timeEstimate, setTimeEstimate] = useState('');
  const [context, setContext] = useState('');
  const [intention, setIntention] = useState('');
  const [dod, setDod] = useState('');
  const [uploading, setUploading] = useState(false);

  const saveStatus = useSaveStatus();
  // Values currently on their way to the server, so blur-then-close doesn't send the same edit twice.
  const sentRef = useRef<Record<string, unknown>>({});
  // True while a close is waiting on a save that hasn't answered yet (see handleClose).
  const closingRef = useRef(false);

  // Load the form when the dialog opens for a node. Not on every `node` change: a save updates the
  // node from the parent, and re-running this then would overwrite what you're typing elsewhere.
  useEffect(() => {
    if (isOpen && node) {
      saveStatus.reset();
      sentRef.current = {};
      closingRef.current = false;
      setTitle(node.title);
      setNodeType(node.node_type);
      setDueDate(node.due_date || '');
      setTimeEstimate(node.time_estimate || '');
      setContext(node.context || '');
      setIntention(node.intention || '');
      setDod(node.definition_of_done || '');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, node?.id]);

  if (!isOpen || !node) return null;

  /** Saves fields. `updateProjectNode` already toasts the reason when it fails. */
  const saveField = (key: string, updates: Partial<ProjectNode>, options?: { retryable?: boolean }) => {
    Object.assign(sentRef.current, updates);
    return saveStatus.run(key, async () => {
      const updated = await projectService.updateProjectNode(node.id, updates);
      if (!updated) {
        Object.keys(updates).forEach((field) => delete sentRef.current[field]);
        return false;
      }
      const kept = fieldsServerKept(updates, updated);
      if (kept.length > 0) {
        Object.keys(updates).forEach((field) => delete sentRef.current[field]);
        toast.error(`Couldn't clear the ${kept.join(', ')} — the server keeps the old value when a field is emptied.`);
        return false;
      }
      onUpdate?.(updated);
      return true;
    }, options);
  };

  const unchanged = (field: TextField, next: string) => {
    const saved = ((node[field] as string | null | undefined) ?? '').trim();
    const current = field in sentRef.current ? sentRef.current[field] : saved;
    return next === current;
  };

  const saveText = (field: TextField, value: string) => {
    // '' (not null) clears a text field: the backend ignores null in a PATCH.
    const next = value.trim();
    if (field === 'title' && !next) {
      setTitle(node.title); // never save a blank title
      return;
    }
    if (unchanged(field, next)) return;
    void saveField(field, { [field]: next } as Partial<ProjectNode>);
  };

  const onNodeTypeChange = async (value: string) => {
    setNodeType(value);
    const ok = await saveField('node_type', { node_type: value as ProjectNode['node_type'] }, { retryable: false });
    if (!ok) setNodeType(node.node_type); // put the old value back
  };

  const onDueDateChange = async (value: string) => {
    setDueDate(value);
    const ok = await saveField('due_date', { due_date: value || null }, { retryable: false });
    if (!ok) setDueDate(node.due_date || '');
  };

  // Text fields autosave on blur, but Esc / a backdrop click close the dialog without one — so save
  // anything still unsaved first, and only close once that worked. If a save fails the dialog stays
  // open (toast + "Couldn't save · Retry") so nothing typed is lost; closing again discards it.
  const handleClose = async () => {
    // Closing again — after a failed save, or while a close is still waiting on a slow one — closes
    // for good: the user has been told, and a hanging request mustn't trap them in the dialog.
    if (closingRef.current || saveStatus.hasFailures()) {
      closingRef.current = false;
      onClose();
      return;
    }
    closingRef.current = true;
    saveText('title', title);
    saveText('time_estimate', timeEstimate);
    saveText('context', context);
    saveText('intention', intention);
    saveText('definition_of_done', dod);
    const allSaved = await saveStatus.settled();
    if (!closingRef.current) return; // a second close already closed it
    closingRef.current = false;
    if (allSaved) onClose();
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const input = e.target;
    const file = input.files?.[0];
    if (!file) return;

    const ext = file.name.split('.').pop()?.toLowerCase();
    if (!['txt', 'pdf', 'docx'].includes(ext || '')) {
      toast.error('Only .txt, .pdf, .docx files are supported.');
      input.value = '';
      return;
    }

    setUploading(true);
    const result = await todoService.uploadContext(file); // toasts the reason if it fails
    if (result) {
      const merged = context
        ? `${context}\n\n--- ${result.filename} ---\n${result.extracted_text}`
        : result.extracted_text;
      setContext(merged);
      await saveField('context', { context: merged });
    }
    setUploading(false);
    input.value = '';
  };

  return (
    <Modal
      isOpen
      onClose={handleClose}
      label="Item details"
      overlayClassName="flex items-center justify-center p-3 sm:p-[1.5rem]"
      className="bg-card border border-border rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden text-foreground"
    >
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-4 border-b mix-border-border/80 mix-bg-muted/20 shrink-0">
        <div className="flex items-center gap-3 min-w-0">
          <span className="text-xs tabular-nums px-2 py-0.5 rounded bg-muted text-muted-foreground font-semibold shrink-0">
            Node #{node.id}
          </span>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onBlur={() => saveText('title', title)}
            aria-label="Item title"
            className="text-base font-semibold bg-transparent border-b border-transparent hover:border-border focus:border-primary focus:outline-none transition-smooth truncate w-full"
          />
        </div>
        <div className="ml-3 flex shrink-0 items-center gap-2">
          <SaveIndicator state={saveStatus.state} canRetry={saveStatus.canRetry} onRetry={saveStatus.retry} />
          <button
            type="button"
            onClick={handleClose}
            aria-label="Close details"
            className="todo-focus p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-smooth"
          >
            <Icon name="XMarkIcon" size={18} />
          </button>
        </div>
      </div>

      {/* Content Body */}
      <div className="flex-1 overflow-y-auto p-5 space-y-[1.5rem] scrollbar-clean">
        {/* Type & Due Date & Time Estimate Row */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mix-bg-muted/20 p-3 rounded-xl border mix-border-border/60">
          <div>
            <label htmlFor="node-detail-type" className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground block mb-1">
              Type
            </label>
            <select
              id="node-detail-type"
              value={nodeType}
              onChange={(e) => onNodeTypeChange(e.target.value)}
              className="w-full bg-card border mix-border-border/80 rounded-lg px-2.5 py-1 text-xs font-medium text-foreground focus:outline-none"
            >
              {Object.entries(NODE_TYPE_LABELS).map(([k, label]) => (
                <option key={k} value={k}>{label}</option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="node-detail-due" className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground block mb-1">
              Due Date
            </label>
            <input
              id="node-detail-due"
              type="date"
              value={dueDate}
              onChange={(e) => onDueDateChange(e.target.value)}
              className="w-full bg-card border mix-border-border/80 rounded-lg px-2.5 py-1 text-xs font-medium text-foreground focus:outline-none"
            />
          </div>

          <div>
            <label htmlFor="node-detail-estimate" className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground block mb-1">
              Time Estimate
            </label>
            <input
              id="node-detail-estimate"
              type="text"
              value={timeEstimate}
              onChange={(e) => setTimeEstimate(e.target.value)}
              onBlur={() => saveText('time_estimate', timeEstimate)}
              placeholder="e.g. 30m, 1h"
              className="w-full bg-card border mix-border-border/80 rounded-lg px-2.5 py-1 text-xs font-medium text-foreground focus:outline-none"
            />
          </div>
        </div>

        {/* Context & Description */}
        <div className="space-y-1.5">
          <label htmlFor="node-detail-context" className="text-xs font-bold text-foreground flex items-center gap-1.5">
            <Icon name="DocumentTextIcon" size={14} className="text-primary" />
            Context & Description
          </label>
          <textarea
            id="node-detail-context"
            value={context}
            onChange={(e) => setContext(e.target.value)}
            onBlur={() => saveText('context', context)}
            placeholder="Attach background details, notes, links, or instructions for this task..."
            rows={4}
            className="w-full bg-input border border-border rounded-xl p-3 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary placeholder:mix-text-muted-foreground/60 leading-relaxed"
          />

          {/* PDF / file upload for context */}
          <label className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-dashed border-border cursor-pointer hover:mix-border-primary/40 hover:mix-bg-primary/5 transition-smooth">
            <Icon name="PaperClipIcon" size={14} className="text-muted-foreground" />
            <span className="text-xs text-muted-foreground">
              {uploading ? 'Extracting text...' : 'Add context from a PDF, .docx, or .txt file'}
            </span>
            <input
              type="file"
              accept=".txt,.pdf,.docx"
              onChange={handleFileUpload}
              className="hidden"
              disabled={uploading}
            />
            {uploading && <span className="w-3 h-3 border-2 mix-border-primary/30 border-t-primary rounded-full animate-spin" />}
          </label>
        </div>

        {/* Intention & Definition of Done */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <label htmlFor="node-detail-intention" className="text-xs font-bold text-foreground flex items-center gap-1.5">
              <FlatIcon name="idea" size={16} /><span>Intention</span>
            </label>
            <textarea
              id="node-detail-intention"
              value={intention}
              onChange={(e) => setIntention(e.target.value)}
              onBlur={() => saveText('intention', intention)}
              placeholder="Why are you doing this?..."
              rows={2}
              className="w-full bg-input border border-border rounded-xl p-2.5 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary placeholder:mix-text-muted-foreground/60"
            />
          </div>

          <div className="space-y-1.5">
            <label htmlFor="node-detail-dod" className="text-xs font-bold text-foreground flex items-center gap-1.5">
              <FlatIcon name="done" size={16} /><span>Definition of Done</span>
            </label>
            <textarea
              id="node-detail-dod"
              value={dod}
              onChange={(e) => setDod(e.target.value)}
              onBlur={() => saveText('definition_of_done', dod)}
              placeholder="Clear criteria when this is complete..."
              rows={2}
              className="w-full bg-input border border-border rounded-xl p-2.5 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary placeholder:mix-text-muted-foreground/60"
            />
          </div>
        </div>
      </div>
    </Modal>
  );
}
