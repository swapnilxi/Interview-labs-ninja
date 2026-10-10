'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import Icon from '@/components/ui/AppIcon';
import { useAuth } from '@/contexts/AuthContext';
import { useLmsViewMode } from '../context/LmsViewModeContext';
import { lmsService } from '../services/lmsService';
import type { LmsClass, LmsInstructor } from '../types';
import CreateInstructorModal from './CreateInstructorModal';
import EditInstructorModal from './EditInstructorModal';
import ConfirmDialog from './ConfirmDialog';
import InstructorChatModal from './InstructorChatModal';

interface InstructorManagementTabProps {
  classes: LmsClass[];
}

export default function InstructorManagementTab({ classes }: InstructorManagementTabProps) {
  const { canEdit: canEditReal } = useAuth();
  const { isPreviewingAsStudent } = useLmsViewMode();
  const canEdit = canEditReal && !isPreviewingAsStudent;

  const [instructors, setInstructors] = useState<LmsInstructor[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedClassFilter, setSelectedClassFilter] = useState<string>('all');
  const [selectedTypeFilter, setSelectedTypeFilter] = useState<'all' | 'real' | 'ai'>('all');

  // Modals
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [instructorToEdit, setInstructorToEdit] = useState<LmsInstructor | null>(null);
  const [instructorToDelete, setInstructorToDelete] = useState<LmsInstructor | null>(null);
  const [instructorToChat, setInstructorToChat] = useState<LmsInstructor | null>(null);

  // Persona expansion
  const [expandedPersonaId, setExpandedPersonaId] = useState<string | null>(null);

  const loadInstructors = async () => {
    setLoading(true);
    try {
      const data = await lmsService.getInstructors();
      setInstructors(data);
    } catch (err) {
      console.error('Failed to load instructors', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadInstructors();
  }, []);

  const handleDeleteInstructor = async () => {
    if (!instructorToDelete) return;
    try {
      await lmsService.deleteInstructor(instructorToDelete.id);
      setInstructorToDelete(null);
      loadInstructors();
    } catch (err) {
      console.error('Failed to delete instructor', err);
    }
  };

  const filteredInstructors = instructors.filter((inst) => {
    const matchesSearch =
      inst.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (inst.title && inst.title.toLowerCase().includes(searchQuery.toLowerCase())) ||
      (inst.bio && inst.bio.toLowerCase().includes(searchQuery.toLowerCase())) ||
      (inst.expertise && inst.expertise.some((e) => e.toLowerCase().includes(searchQuery.toLowerCase())));

    const matchesClass =
      selectedClassFilter === 'all' ||
      (inst.assigned_class_ids && inst.assigned_class_ids.includes(selectedClassFilter)) ||
      (inst.assigned_classes && inst.assigned_classes.some((c) => c.id === selectedClassFilter));

    const matchesType =
      selectedTypeFilter === 'all' || inst.type === selectedTypeFilter;

    return matchesSearch && matchesClass && matchesType;
  });

  const realCount = instructors.filter((i) => i.type === 'real').length;
  const aiCount = instructors.filter((i) => i.type === 'ai').length;

  const avgRating =
    instructors.length > 0
      ? (instructors.reduce((sum, inst) => sum + (inst.rating || 4.9), 0) / instructors.length).toFixed(2)
      : '4.9';

  return (
    <div className="space-y-8 animate-fadeIn">
      {/* Overview & Action Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 p-6 rounded-2xl bg-card border border-border/80 shadow-sm relative overflow-hidden">
        <div className="absolute -right-12 -top-12 w-48 h-48 bg-primary/5 rounded-full blur-3xl pointer-events-none" />

        <div className="space-y-1.5 relative z-10">
          <div className="inline-flex items-center gap-2 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-primary/10 text-primary border border-primary/20">
            <Icon name="UserGroupIcon" size={14} />
            <span>Real Faculty & AI Instructors</span>
          </div>
          <h2 className="font-heading text-2xl font-bold text-foreground">
            Instructor Management
          </h2>
          <p className="text-xs text-muted-foreground max-w-2xl leading-relaxed">
            Manage real teachers and AI instructors, configure teaching style templates, assign curriculum classes, and set up interactive AI persona chatbots.
          </p>
        </div>

        {canEdit && (
          <button
            type="button"
            onClick={() => setIsCreateOpen(true)}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-primary text-white font-medium text-xs shadow-sm hover:bg-primary/90 transition-all flex-shrink-0"
          >
            <Icon name="UserPlusIcon" size={16} />
            <span>Add Instructor</span>
          </button>
        )}
      </div>

      {/* Metrics Bar */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="p-4 rounded-xl bg-card border border-border flex items-center gap-3 shadow-xs">
          <div className="p-2.5 rounded-lg bg-emerald-500/10 text-emerald-500">
            <Icon name="UserIcon" size={20} />
          </div>
          <div>
            <div className="text-xl font-bold text-foreground">{realCount}</div>
            <div className="text-[11px] text-muted-foreground font-medium uppercase tracking-wider">Real Instructors</div>
          </div>
        </div>

        <div className="p-4 rounded-xl bg-card border border-border flex items-center gap-3 shadow-xs">
          <div className="p-2.5 rounded-lg bg-purple-500/10 text-purple-500">
            <Icon name="SparklesIcon" size={20} />
          </div>
          <div>
            <div className="text-xl font-bold text-foreground">{aiCount}</div>
            <div className="text-[11px] text-muted-foreground font-medium uppercase tracking-wider">AI Digital Instructors</div>
          </div>
        </div>

        <div className="p-4 rounded-xl bg-card border border-border flex items-center gap-3 shadow-xs">
          <div className="p-2.5 rounded-lg bg-blue-500/10 text-blue-500">
            <Icon name="AcademicCapIcon" size={20} />
          </div>
          <div>
            <div className="text-xl font-bold text-foreground">{classes.length}</div>
            <div className="text-[11px] text-muted-foreground font-medium uppercase tracking-wider">Assigned Classes</div>
          </div>
        </div>

        <div className="p-4 rounded-xl bg-card border border-border flex items-center gap-3 shadow-xs">
          <div className="p-2.5 rounded-lg bg-amber-500/10 text-amber-500">
            <Icon name="StarIcon" size={20} />
          </div>
          <div>
            <div className="text-xl font-bold text-foreground">{avgRating} / 5.0</div>
            <div className="text-[11px] text-muted-foreground font-medium uppercase tracking-wider">Avg Student Rating</div>
          </div>
        </div>
      </div>

      {/* Search & Filter Controls */}
      <div className="flex flex-col md:flex-row items-center justify-between gap-3">
        {/* Type Filter Pills: All | Real Teachers | AI Digital Instructors */}
        <div className="flex items-center gap-1.5 p-1 rounded-xl bg-card border border-border shadow-xs w-full md:w-auto">
          <button
            type="button"
            onClick={() => setSelectedTypeFilter('all')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
              selectedTypeFilter === 'all'
                ? 'bg-primary text-white shadow-xs'
                : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
            }`}
          >
            All Instructors ({instructors.length})
          </button>
          <button
            type="button"
            onClick={() => setSelectedTypeFilter('real')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
              selectedTypeFilter === 'real'
                ? 'bg-emerald-600 text-white shadow-xs'
                : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
            }`}
          >
            👤 Real Teachers ({realCount})
          </button>
          <button
            type="button"
            onClick={() => setSelectedTypeFilter('ai')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
              selectedTypeFilter === 'ai'
                ? 'bg-purple-600 text-white shadow-xs'
                : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
            }`}
          >
            🤖 AI Instructors ({aiCount})
          </button>
        </div>

        <div className="flex flex-col sm:flex-row items-center gap-3 w-full md:w-auto">
          {/* Search input */}
          <div className="relative w-full sm:w-64">
            <Icon
              name="MagnifyingGlassIcon"
              size={15}
              className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground"
            />
            <input
              type="text"
              placeholder="Search instructors, skills..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-3.5 py-1.5 rounded-xl border border-border bg-card text-foreground text-xs focus:outline-none focus:ring-2 focus:ring-primary/40 shadow-xs"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                <Icon name="XMarkIcon" size={14} />
              </button>
            )}
          </div>

          {/* Class Filter */}
          <select
            value={selectedClassFilter}
            onChange={(e) => setSelectedClassFilter(e.target.value)}
            className="w-full sm:w-auto px-3 py-1.5 rounded-xl border border-border bg-card text-foreground text-xs focus:outline-none focus:ring-2 focus:ring-primary/40 shadow-xs cursor-pointer"
          >
            <option value="all">All Classes</option>
            {classes.map((cls) => (
              <option key={cls.id} value={cls.id}>
                {cls.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Instructor Cards Grid */}
      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-2 gap-6">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-64 rounded-2xl border border-border bg-card/60 p-6 animate-pulse" />
          ))}
        </div>
      ) : filteredInstructors.length === 0 ? (
        <div className="text-center py-16 px-4 rounded-2xl border border-dashed border-border bg-card/40">
          <div className="w-12 h-12 rounded-full bg-primary/10 text-primary flex items-center justify-center mx-auto mb-3">
            <Icon name="UserGroupIcon" size={24} />
          </div>
          <h3 className="font-heading text-base font-semibold text-foreground">No Instructors Found</h3>
          <p className="text-xs text-muted-foreground mt-1 max-w-sm mx-auto">
            {searchQuery || selectedClassFilter !== 'all' || selectedTypeFilter !== 'all'
              ? 'No instructors match your current filters.'
              : 'Add your first instructor to assign classes and configure AI teaching personas.'}
          </p>
          {canEdit && (
            <button
              type="button"
              onClick={() => setIsCreateOpen(true)}
              className="mt-4 inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-primary text-white text-xs font-medium shadow-sm hover:bg-primary/90 transition-all"
            >
              <Icon name="PlusIcon" size={14} />
              <span>Add Instructor</span>
            </button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-2 gap-6">
          {filteredInstructors.map((inst) => {
            const isPersonaExpanded = expandedPersonaId === inst.id;
            const isReal = inst.type === 'real';

            return (
              <div
                key={inst.id}
                className="group relative flex flex-col justify-between rounded-2xl border border-border bg-card p-6 shadow-sm hover:border-primary/40 hover:shadow-md transition-all duration-200"
              >
                <div>
                  {/* Category Badge & Rating */}
                  <div className="flex items-center justify-between mb-3.5">
                    <span
                      className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-extrabold uppercase tracking-wider ${
                        isReal
                          ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30'
                          : 'bg-purple-500/15 text-purple-600 dark:text-purple-400 border border-purple-500/30'
                      }`}
                    >
                      <Icon name={isReal ? 'UserIcon' : 'SparklesIcon'} size={12} />
                      <span>{isReal ? 'REAL INSTRUCTOR' : 'AI INSTRUCTOR'}</span>
                    </span>

                    <div className="flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-amber-500/10 border border-amber-500/20 text-amber-600 dark:text-amber-400 font-semibold text-xs">
                      <Icon name="StarIcon" size={13} className="fill-amber-500 text-amber-500" />
                      <span>{inst.rating || '4.9'}</span>
                    </div>
                  </div>

                  {/* Instructor Avatar + Name + Title */}
                  <div className="flex items-start gap-3.5">
                    {inst.avatar ? (
                      <img
                        src={inst.avatar}
                        alt={inst.name}
                        className="w-14 h-14 rounded-full object-cover border-2 border-primary/20 shadow-sm flex-shrink-0"
                      />
                    ) : (
                      <div className="w-14 h-14 rounded-full bg-primary/10 text-primary flex items-center justify-center font-bold text-lg flex-shrink-0 border border-primary/20">
                        {inst.name.charAt(0)}
                      </div>
                    )}
                    <div>
                      <h3 className="font-heading text-base font-bold text-foreground group-hover:text-primary transition-colors">
                        {inst.name}
                      </h3>
                      <p className="text-xs text-muted-foreground font-medium">{inst.title || 'Faculty Instructor'}</p>
                      {inst.email && (
                        <p className="text-[11px] text-muted-foreground/80 mt-0.5 truncate">{inst.email}</p>
                      )}
                    </div>
                  </div>

                  {/* Bio */}
                  {inst.bio && (
                    <p className="mt-3.5 text-xs text-muted-foreground line-clamp-2 leading-relaxed">
                      {inst.bio}
                    </p>
                  )}

                  {/* Learning Style Tag */}
                  {inst.learning_style && (
                    <div className="mt-3 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-primary/10 text-primary border border-primary/20 text-[11px] font-semibold">
                      <Icon name="LightBulbIcon" size={13} />
                      <span>Style: {inst.learning_style}</span>
                    </div>
                  )}

                  {/* Expertise Badges */}
                  {inst.expertise && inst.expertise.length > 0 && (
                    <div className="mt-3 flex flex-wrap gap-1.5">
                      {inst.expertise.map((exp, idx) => (
                        <span
                          key={idx}
                          className="px-2 py-0.5 rounded-md text-[10px] font-semibold bg-secondary text-secondary-foreground border border-border/60"
                        >
                          {exp}
                        </span>
                      ))}
                    </div>
                  )}

                  {/* Assigned Classes */}
                  <div className="mt-4 pt-3.5 border-t border-border/60">
                    <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider block mb-2">
                      Teaches Classes ({inst.assigned_classes ? inst.assigned_classes.length : 0})
                    </span>
                    <div className="flex flex-wrap gap-1.5">
                      {inst.assigned_classes && inst.assigned_classes.length > 0 ? (
                        inst.assigned_classes.map((c) => (
                          <Link
                            key={c.id}
                            href={`/ai-lms/classes/${c.slug}`}
                            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium bg-primary/10 text-primary border border-primary/20 hover:bg-primary/20 transition-colors"
                          >
                            <Icon name={(c.icon as any) || 'BookmarkIcon'} size={13} />
                            <span>{c.name}</span>
                          </Link>
                        ))
                      ) : (
                        <span className="text-xs text-muted-foreground italic">No classes assigned yet</span>
                      )}
                    </div>
                  </div>

                  {/* AI Persona Preview Dropdown */}
                  {inst.ai_persona && (
                    <div className="mt-3.5">
                      <button
                        type="button"
                        onClick={() => setExpandedPersonaId(isPersonaExpanded ? null : inst.id)}
                        className="inline-flex items-center gap-1.5 text-xs text-primary font-medium hover:underline"
                      >
                        <Icon name="SparklesIcon" size={13} />
                        <span>{isPersonaExpanded ? 'Hide AI Persona Directives' : 'View AI Persona Directives'}</span>
                        <Icon
                          name="ChevronDownIcon"
                          size={13}
                          className={`transition-transform ${isPersonaExpanded ? 'rotate-180' : ''}`}
                        />
                      </button>

                      {isPersonaExpanded && (
                        <div className="mt-2 p-3 rounded-xl bg-purple-500/5 border border-purple-500/20 text-xs text-foreground/90 font-mono leading-relaxed space-y-1.5 animate-fadeIn">
                          <div className="text-[10px] font-bold text-purple-600 dark:text-purple-400 uppercase tracking-wider font-sans">
                            AI Persona & Chatbot Directives:
                          </div>
                          <p className="whitespace-pre-wrap">{inst.ai_persona}</p>

                          {inst.learning_style_prompt && (
                            <div className="pt-2 border-t border-purple-500/20 mt-2">
                              <span className="text-[10px] font-bold text-purple-600 dark:text-purple-400 uppercase tracking-wider font-sans block mb-1">
                                Learning Style Directives:
                              </span>
                              <p className="whitespace-pre-wrap text-[11px]">{inst.learning_style_prompt}</p>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* Footer Controls: Chat with AI Persona & Edit/Delete */}
                <div className="mt-5 pt-3 border-t border-border/60 flex items-center justify-between gap-2">
                  <button
                    type="button"
                    onClick={() => setInstructorToChat(inst)}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary text-white font-medium text-xs shadow-xs hover:bg-primary/90 transition-colors"
                  >
                    <Icon name="ChatBubbleLeftRightIcon" size={14} />
                    <span>Chat with AI Persona</span>
                  </button>

                  {canEdit && (
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => setInstructorToEdit(inst)}
                        className="p-1.5 rounded-lg border border-border bg-card text-foreground hover:bg-muted transition-colors"
                        title="Edit Instructor"
                      >
                        <Icon name="PencilSquareIcon" size={14} />
                      </button>
                      <button
                        type="button"
                        onClick={() => setInstructorToDelete(inst)}
                        className="p-1.5 rounded-lg border border-rose-500/20 bg-rose-500/10 text-rose-600 dark:text-rose-400 hover:bg-rose-500/20 transition-colors"
                        title="Delete Instructor"
                      >
                        <Icon name="TrashIcon" size={14} />
                      </button>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Modals */}
      <CreateInstructorModal
        isOpen={isCreateOpen}
        onClose={() => setIsCreateOpen(false)}
        onCreated={() => loadInstructors()}
        classes={classes}
      />

      <EditInstructorModal
        isOpen={!!instructorToEdit}
        instructor={instructorToEdit}
        onClose={() => setInstructorToEdit(null)}
        onUpdated={() => loadInstructors()}
        classes={classes}
      />

      <InstructorChatModal
        isOpen={!!instructorToChat}
        instructor={instructorToChat}
        onClose={() => setInstructorToChat(null)}
      />

      <ConfirmDialog
        isOpen={!!instructorToDelete}
        title="Delete Instructor"
        message={`Are you sure you want to delete "${instructorToDelete?.name}"? Class assignments for this instructor will be unlinked.`}
        confirmLabel="Delete Instructor"
        isDestructive={true}
        onConfirm={handleDeleteInstructor}
        onCancel={() => setInstructorToDelete(null)}
      />
    </div>
  );
}
