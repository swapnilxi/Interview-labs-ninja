'use client';

import React, { useRef, useState } from 'react';
import Icon from '@/components/ui/AppIcon';
import { lmsService } from '../services/lmsService';
import { extractMultipleFiles, mergeSourceNames } from '../utils/contextFiles';
import type { LmsClass, LmsSubject } from '../types';

interface CreateProjectModalProps {
  isOpen: boolean;
  targetClass: LmsClass | null;
  onClose: () => void;
  onCreated: (createdProject: LmsSubject) => void;
}

export default function CreateProjectModal({
  isOpen,
  targetClass,
  onClose,
  onCreated,
}: CreateProjectModalProps) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [projectContext, setProjectContext] = useState('');
  const [sourceName, setSourceName] = useState('');
  const [isUploading, setIsUploading] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!isOpen || !targetClass) return null;

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;
    setIsUploading(true);
    setError(null);
    try {
      // Extracted text supplements the README -- store the text itself (not just the
      // file reference) so generation works without re-uploading after a page refresh.
      // Multiple documents can be attached one after another; each appends in turn.
      const { combinedText, fileNames, errors } = await extractMultipleFiles(files);
      if (combinedText) {
        setProjectContext((prev) => (prev.trim() ? `${prev.trim()}\n\n${combinedText}` : combinedText));
      }
      if (fileNames.length) {
        setSourceName((prev) => mergeSourceNames(prev, fileNames));
      }
      const errorEntries = Object.entries(errors);
      if (errorEntries.length) {
        setError(errorEntries.map(([name, msg]) => `${name}: ${msg}`).join(' '));
      }
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    setLoading(true);
    setError(null);
    try {
      const created = await lmsService.createProject(targetClass.id, {
        name: name.trim(),
        description: description.trim(),
        project_context: projectContext.trim(),
        context_source_name: sourceName,
      });
      setName('');
      setDescription('');
      setProjectContext('');
      setSourceName('');
      onCreated(created);
      onClose();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to create project');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[300] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fadeIn">
      <div className="w-full max-w-2xl bg-card border border-border rounded-xl shadow-2xl p-6 transition-smooth max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between pb-4 border-b border-border">
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-lg bg-indigo-500/10 text-indigo-500">
              <Icon name="CodeBracketSquareIcon" size={20} />
            </div>
            <div>
              <h3 className="font-heading text-lg font-semibold text-foreground">
                Add Project to {targetClass.name}
              </h3>
              <p className="text-xs text-muted-foreground">
                Describe what you want to build -- the AI turns it into implementation modules
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-muted-foreground hover:text-foreground rounded-lg hover:bg-muted"
          >
            <Icon name="XMarkIcon" size={20} />
          </button>
        </div>

        {error && (
          <div className="mt-4 p-3 rounded-lg bg-rose-500/10 border border-rose-500/20 text-rose-500 text-xs">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="mt-4 space-y-4">
          <div>
            <label className="block text-xs font-semibold text-foreground uppercase tracking-wider mb-1.5">
              Project Name *
            </label>
            <input
              type="text"
              required
              placeholder="e.g. REST API with Auth & Rate Limiting"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-lg border border-border bg-input text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
              autoFocus
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-foreground uppercase tracking-wider mb-1.5">
              Description{' '}
              <span className="text-muted-foreground font-normal lowercase">(optional overview)</span>
            </label>
            <textarea
              rows={2}
              placeholder="One or two lines describing this project..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-lg border border-border bg-input text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/40 resize-none"
            />
          </div>

          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs font-semibold text-foreground uppercase tracking-wider flex items-center gap-1.5">
                <Icon name="DocumentTextIcon" size={13} className="text-indigo-500" />
                <span>README / Project Context</span>
              </label>
              <span className="text-[11px] font-medium text-indigo-500 bg-indigo-500/10 px-2 py-0.5 rounded-full">
                Required to generate modules
              </span>
            </div>
            <textarea
              rows={8}
              placeholder={
                'Describe the project: goals, tech stack, scope, constraints...\n\ne.g. "Build a REST API with auth, rate limiting, and a Postgres database. Node/Express, JWT auth, Postgres + Prisma. Should be deployable to a single VM."'
              }
              value={projectContext}
              onChange={(e) => setProjectContext(e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-lg border border-indigo-500/30 bg-indigo-500/5 text-foreground text-sm font-mono focus:outline-none focus:ring-2 focus:ring-indigo-500/40 resize-y placeholder:text-muted-foreground/60"
            />
            <div className="mt-2 flex flex-wrap items-center gap-2.5">
              <input
                ref={fileInputRef}
                type="file"
                accept=".pdf,.txt,.md,.docx"
                multiple
                onChange={handleFileUpload}
                className="hidden"
                id="create-project-file-input"
              />
              <button
                type="button"
                disabled={isUploading}
                onClick={() => fileInputRef.current?.click()}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border bg-card text-foreground font-medium text-xs hover:bg-muted disabled:opacity-50 transition-colors shadow-sm"
              >
                {isUploading ? (
                  <>
                    <div className="h-3 w-3 animate-spin rounded-full border-2 border-primary border-t-transparent" />
                    <span>Reading Files...</span>
                  </>
                ) : (
                  <>
                    <Icon name="ArrowUpTrayIcon" size={13} className="text-indigo-500" />
                    <span>Upload Documents</span>
                  </>
                )}
              </button>
              {sourceName && (
                <span className="text-[11px] text-muted-foreground truncate">
                  Extracted from <span className="font-semibold text-foreground">{sourceName}</span> and
                  appended above
                </span>
              )}
            </div>
            <p className="text-[11px] text-muted-foreground mt-2">
              Write the README directly, attach one or more documents (PDF / MD / TXT / DOCX), or
              both -- everything combines into one context, which the AI decomposes into an ordered
              sequence of implementation modules once the project is created.
            </p>
          </div>

          <div className="flex items-center justify-end gap-3 pt-4 border-t border-border mt-6">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-foreground hover:bg-muted rounded-lg transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading || !name.trim()}
              className="px-5 py-2 text-sm font-medium rounded-lg text-white bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors shadow-sm"
            >
              {loading ? 'Creating...' : 'Create Project'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
