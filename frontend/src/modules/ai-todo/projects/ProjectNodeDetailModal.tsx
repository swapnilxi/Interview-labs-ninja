'use client';

import { useState, useEffect } from 'react';
import Icon from '@/components/ui/AppIcon';
import { ProjectNode, projectService } from '@/lib/services/projectService';
import { todoService } from '@/lib/services/todoService';

interface ProjectNodeDetailModalProps {
  node: ProjectNode | null;
  isOpen: boolean;
  onClose: () => void;
  onUpdate?: (updated: Partial<ProjectNode>) => void;
}

const NODE_TYPE_LABELS: Record<string, string> = {
  topic: '📁 Topic',
  phase: '🚩 Phase',
  action: '⚡ Action',
  idea: '💡 Idea',
};

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
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    if (isOpen && node) {
      setTitle(node.title);
      setNodeType(node.node_type);
      setDueDate(node.due_date || '');
      setTimeEstimate(node.time_estimate || '');
      setContext(node.context || '');
      setIntention(node.intention || '');
      setDod(node.definition_of_done || '');
    }
  }, [isOpen, node]);

  if (!isOpen || !node) return null;

  const handleSaveField = async (updates: Record<string, any>) => {
    setSaving(true);
    const updated = await projectService.updateProjectNode(node.id, updates);
    if (updated) onUpdate?.(updated);
    setSaving(false);
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const ext = file.name.split('.').pop()?.toLowerCase();
    if (!['txt', 'pdf', 'docx'].includes(ext || '')) {
      alert('Only .txt, .pdf, .docx files are supported');
      return;
    }

    setUploading(true);
    const result = await todoService.uploadContext(file);
    if (result) {
      const merged = context
        ? `${context}\n\n--- ${result.filename} ---\n${result.extracted_text}`
        : result.extracted_text;
      setContext(merged);
      await handleSaveField({ context: merged });
    }
    setUploading(false);
    e.target.value = '';
  };

  return (
    <div className="fixed inset-0 z-[120] bg-black/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-6 overflow-y-auto animate-in fade-in duration-200">
      <div
        className="bg-card border border-border rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden text-foreground animate-in zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border/80 bg-muted/20 shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <span className="text-xs font-mono px-2 py-0.5 rounded bg-muted text-muted-foreground font-semibold shrink-0">
              Node #{node.id}
            </span>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              onBlur={() => handleSaveField({ title })}
              className="text-base font-semibold bg-transparent border-b border-transparent hover:border-border focus:border-primary focus:outline-none transition-smooth truncate w-full"
            />
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/80 transition-smooth shrink-0 ml-3"
          >
            <Icon name="XMarkIcon" size={18} />
          </button>
        </div>

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-6 scrollbar-clean">
          {/* Type & Due Date & Time Estimate Row */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 bg-muted/20 p-3 rounded-xl border border-border/60">
            <div>
              <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground block mb-1">
                Type
              </label>
              <select
                value={nodeType}
                onChange={(e) => {
                  const val = e.target.value;
                  setNodeType(val);
                  handleSaveField({ node_type: val });
                }}
                className="w-full bg-card border border-border/80 rounded-lg px-2.5 py-1 text-xs font-medium text-foreground focus:outline-none"
              >
                {Object.entries(NODE_TYPE_LABELS).map(([k, label]) => (
                  <option key={k} value={k}>{label}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground block mb-1">
                Due Date
              </label>
              <input
                type="date"
                value={dueDate}
                onChange={(e) => {
                  setDueDate(e.target.value);
                  handleSaveField({ due_date: e.target.value });
                }}
                className="w-full bg-card border border-border/80 rounded-lg px-2.5 py-1 text-xs font-medium text-foreground focus:outline-none"
              />
            </div>

            <div>
              <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground block mb-1">
                Time Estimate
              </label>
              <input
                type="text"
                value={timeEstimate}
                onChange={(e) => setTimeEstimate(e.target.value)}
                onBlur={() => handleSaveField({ time_estimate: timeEstimate })}
                placeholder="e.g. 30m, 1h"
                className="w-full bg-card border border-border/80 rounded-lg px-2.5 py-1 text-xs font-medium text-foreground focus:outline-none"
              />
            </div>
          </div>

          {/* Context & Description */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold text-foreground flex items-center gap-1.5">
                <Icon name="DocumentTextIcon" size={14} className="text-primary" />
                Context & Description
              </label>
              {saving && <span className="text-[10px] text-muted-foreground italic">Saving...</span>}
            </div>
            <textarea
              value={context}
              onChange={(e) => setContext(e.target.value)}
              onBlur={() => handleSaveField({ context })}
              placeholder="Attach background details, notes, links, or instructions for this task..."
              rows={4}
              className="w-full bg-input border border-border rounded-xl p-3 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary placeholder:text-muted-foreground/60 leading-relaxed"
            />

            {/* PDF / file upload for context */}
            <label className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-dashed border-border cursor-pointer hover:border-primary/40 hover:bg-primary/5 transition-smooth">
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
              {uploading && <span className="w-3 h-3 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />}
            </label>
          </div>

          {/* Intention & Definition of Done */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-foreground flex items-center gap-1.5">
                <span>💡 Intention</span>
              </label>
              <textarea
                value={intention}
                onChange={(e) => setIntention(e.target.value)}
                onBlur={() => handleSaveField({ intention })}
                placeholder="Why are you doing this?..."
                rows={2}
                className="w-full bg-input border border-border rounded-xl p-2.5 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary placeholder:text-muted-foreground/60"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-bold text-foreground flex items-center gap-1.5">
                <span>🎯 Definition of Done</span>
              </label>
              <textarea
                value={dod}
                onChange={(e) => setDod(e.target.value)}
                onBlur={() => handleSaveField({ definition_of_done: dod })}
                placeholder="Clear criteria when this is complete..."
                rows={2}
                className="w-full bg-input border border-border rounded-xl p-2.5 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary placeholder:text-muted-foreground/60"
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
