'use client';

import React, { useState } from 'react';
import Icon from '@/components/ui/AppIcon';
import { lmsService } from '../services/lmsService';
import type { LmsClass } from '../types';

interface CreateClassModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCreated: (createdClass: LmsClass) => void;
}

const AVAILABLE_ICONS = [
  'BookmarkIcon',
  'SparklesIcon',
  'ServerStackIcon',
  'CpuChipIcon',
  'EyeIcon',
  'CloudIcon',
  'AcademicCapIcon',
  'UserGroupIcon',
  'CommandLineIcon',
  'LightBulbIcon',
  'CodeBracketIcon',
  'FolderIcon',
];

export default function CreateClassModal({ isOpen, onClose, onCreated }: CreateClassModalProps) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [icon, setIcon] = useState('BookmarkIcon');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    setLoading(true);
    setError(null);
    try {
      const created = await lmsService.createClass({
        name: name.trim(),
        description: description.trim(),
        icon,
      });
      setName('');
      setDescription('');
      onCreated(created);
      onClose();
    } catch (err: any) {
      setError(err?.message || 'Failed to create class');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[300] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fadeIn">
      <div className="w-full max-w-lg bg-card border border-border rounded-xl shadow-2xl p-6 transition-smooth">
        <div className="flex items-center justify-between pb-4 border-b border-border">
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-lg bg-primary/10 text-primary">
              <Icon name="AcademicCapIcon" size={20} />
            </div>
            <div>
              <h3 className="font-heading text-lg font-semibold text-foreground">Create New Class</h3>
              <p className="text-xs text-muted-foreground">Top-level domain/category for subjects and lessons</p>
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
              Class Name *
            </label>
            <input
              type="text"
              required
              placeholder="e.g. Distributed Systems & Cloud"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-lg border border-border bg-input text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
              autoFocus
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-foreground uppercase tracking-wider mb-1.5">
              Description
            </label>
            <textarea
              rows={3}
              placeholder="Brief overview of what this class covers..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-lg border border-border bg-input text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/40 resize-none"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-foreground uppercase tracking-wider mb-2">
              Select Icon
            </label>
            <div className="flex flex-wrap gap-2">
              {AVAILABLE_ICONS.map((ic) => (
                <button
                  key={ic}
                  type="button"
                  onClick={() => setIcon(ic)}
                  className={`p-2 rounded-lg border transition-all ${
                    icon === ic
                      ? 'border-primary bg-primary/10 text-primary scale-105 shadow-sm'
                      : 'border-border bg-muted/30 text-muted-foreground hover:bg-muted hover:text-foreground'
                  }`}
                >
                  <Icon name={ic as any} size={18} />
                </button>
              ))}
            </div>
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
              className="px-5 py-2 text-sm font-medium rounded-lg text-white bg-primary hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors shadow-sm"
            >
              {loading ? 'Creating...' : 'Create Class'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
