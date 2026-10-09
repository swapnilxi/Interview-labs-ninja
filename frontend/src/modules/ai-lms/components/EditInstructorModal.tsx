'use client';

import React, { useState, useEffect } from 'react';
import Icon from '@/components/ui/AppIcon';
import { lmsService } from '../services/lmsService';
import type { LmsClass, LmsInstructor } from '../types';
import { LEARNING_STYLE_TEMPLATES } from './CreateInstructorModal';

interface EditInstructorModalProps {
  isOpen: boolean;
  instructor: LmsInstructor | null;
  onClose: () => void;
  onUpdated: (instructor: LmsInstructor) => void;
  classes: LmsClass[];
}

const DEFAULT_AVATARS = [
  'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&q=80&w=250',
  'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&q=80&w=250',
  'https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?auto=format&fit=crop&q=80&w=250',
  'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&q=80&w=250',
  'https://images.unsplash.com/photo-1580489944761-15a19d654956?auto=format&fit=crop&q=80&w=250',
  'https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?auto=format&fit=crop&q=80&w=250',
];

export default function EditInstructorModal({
  isOpen,
  instructor,
  onClose,
  onUpdated,
  classes,
}: EditInstructorModalProps) {
  const [name, setName] = useState('');
  const [type, setType] = useState<'real' | 'ai'>('real');
  const [title, setTitle] = useState('');
  const [email, setEmail] = useState('');
  const [bio, setBio] = useState('');
  const [expertise, setExpertise] = useState('');
  const [learningStyle, setLearningStyle] = useState('');
  const [learningStylePrompt, setLearningStylePrompt] = useState('');
  const [aiPersona, setAiPersona] = useState('');
  const [aiChatbotEnabled, setAiChatbotEnabled] = useState(true);
  const [avatar, setAvatar] = useState('');
  const [rating, setRating] = useState('4.9');
  const [selectedClassIds, setSelectedClassIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (instructor) {
      setName(instructor.name || '');
      setType(instructor.type || 'real');
      setTitle(instructor.title || '');
      setEmail(instructor.email || '');
      setBio(instructor.bio || '');
      setExpertise(Array.isArray(instructor.expertise) ? instructor.expertise.join(', ') : (instructor.expertise || ''));
      setLearningStyle(instructor.learning_style || 'Socratic Method');
      setLearningStylePrompt(instructor.learning_style_prompt || '');
      setAiPersona(instructor.ai_persona || '');
      setAiChatbotEnabled(instructor.ai_chatbot_enabled !== undefined ? Boolean(instructor.ai_chatbot_enabled) : true);
      setAvatar(instructor.avatar || DEFAULT_AVATARS[0]);
      setRating(instructor.rating ? String(instructor.rating) : '4.9');
      setSelectedClassIds(instructor.assigned_class_ids || (instructor.assigned_classes ? instructor.assigned_classes.map(c => c.id) : []));
    }
  }, [instructor]);

  if (!isOpen || !instructor) return null;

  const toggleClass = (classId: string) => {
    setSelectedClassIds((prev) =>
      prev.includes(classId) ? prev.filter((id) => id !== classId) : [...prev, classId]
    );
  };

  const handleApplyTemplate = (tmpl: (typeof LEARNING_STYLE_TEMPLATES)[0]) => {
    setLearningStyle(tmpl.name);
    setLearningStylePrompt(tmpl.prompt);
    if (!aiPersona.trim()) {
      setAiPersona(`You are ${name || 'an instructor'}. ${tmpl.prompt}`);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    setLoading(true);
    setError(null);
    try {
      const updated = await lmsService.updateInstructor(instructor.id, {
        name: name.trim(),
        type,
        title: title.trim(),
        email: email.trim(),
        bio: bio.trim(),
        expertise: expertise.trim(),
        learning_style: learningStyle,
        learning_style_prompt: learningStylePrompt.trim(),
        ai_persona: aiPersona.trim(),
        ai_chatbot_enabled: aiChatbotEnabled ? 1 : 0,
        avatar: avatar.trim(),
        rating: parseFloat(rating) || 4.9,
        class_ids: selectedClassIds,
      });
      onUpdated(updated);
      onClose();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to update instructor');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[300] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fadeIn">
      <div className="w-full max-w-2xl max-h-[90vh] overflow-y-auto bg-card border border-border rounded-xl shadow-2xl p-6 scrollbar-clean">
        <div className="flex items-center justify-between pb-4 border-b border-border">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-lg bg-primary/10 text-primary">
              <Icon name="PencilSquareIcon" size={22} />
            </div>
            <div>
              <h3 className="font-heading text-lg font-semibold text-foreground">
                Edit Instructor Profile
              </h3>
              <p className="text-xs text-muted-foreground">
                Update instructor type (Real/AI), learning styles, classes, and AI persona chatbot
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

        <form onSubmit={handleSubmit} className="mt-5 space-y-4">
          {/* Instructor Category: Real vs AI */}
          <div>
            <label className="block text-xs font-semibold text-foreground uppercase tracking-wider mb-2">
              Instructor Category *
            </label>
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setType('real')}
                className={`flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl border text-xs font-semibold transition-all ${
                  type === 'real'
                    ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/40 ring-2 ring-emerald-500/20 shadow-sm'
                    : 'bg-card border-border text-muted-foreground hover:bg-muted'
                }`}
              >
                <Icon name="UserIcon" size={16} />
                <span>Real Teacher / Instructor</span>
              </button>

              <button
                type="button"
                onClick={() => setType('ai')}
                className={`flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl border text-xs font-semibold transition-all ${
                  type === 'ai'
                    ? 'bg-purple-500/15 text-purple-600 dark:text-purple-400 border-purple-500/40 ring-2 ring-purple-500/20 shadow-sm'
                    : 'bg-card border-border text-muted-foreground hover:bg-muted'
                }`}
              >
                <Icon name="SparklesIcon" size={16} />
                <span>AI Digital Instructor</span>
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-foreground uppercase tracking-wider mb-1">
                Instructor Name *
              </label>
              <input
                type="text"
                required
                placeholder="e.g. Dr. Alex Xu"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-lg border border-border bg-input text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-foreground uppercase tracking-wider mb-1">
                Title / Designation
              </label>
              <input
                type="text"
                placeholder="e.g. Principal Architect & AI Author"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-lg border border-border bg-input text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-foreground uppercase tracking-wider mb-1">
                Email Address
              </label>
              <input
                type="email"
                placeholder="alex.xu@lms-ninja.ai"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-lg border border-border bg-input text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-foreground uppercase tracking-wider mb-1">
                Rating (1.0 - 5.0)
              </label>
              <input
                type="number"
                step="0.01"
                min="1"
                max="5"
                placeholder="4.9"
                value={rating}
                onChange={(e) => setRating(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-lg border border-border bg-input text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-foreground uppercase tracking-wider mb-1">
              Bio & Profile Overview
            </label>
            <textarea
              rows={2}
              placeholder="Background, experience, publications, and teaching background..."
              value={bio}
              onChange={(e) => setBio(e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-lg border border-border bg-input text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/40 resize-none"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-foreground uppercase tracking-wider mb-1">
              Expertise Tags <span className="text-muted-foreground font-normal lowercase">(comma-separated)</span>
            </label>
            <input
              type="text"
              placeholder="System Design, Distributed Systems, Scalability, PyTorch"
              value={expertise}
              onChange={(e) => setExpertise(e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-lg border border-border bg-input text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
            />
          </div>

          {/* Learning Style Templates */}
          <div className="p-3.5 rounded-xl border border-primary/20 bg-primary/5 space-y-3">
            <div className="flex items-center justify-between">
              <label className="text-xs font-semibold text-foreground uppercase tracking-wider flex items-center gap-1.5">
                <Icon name="LightBulbIcon" size={14} className="text-primary" />
                <span>Teaching & Learning Style Templates</span>
              </label>
              <span className="text-[10px] font-semibold text-primary bg-primary/10 px-2 py-0.5 rounded-full">
                Context Feeder
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              {LEARNING_STYLE_TEMPLATES.map((tmpl) => (
                <button
                  key={tmpl.name}
                  type="button"
                  onClick={() => handleApplyTemplate(tmpl)}
                  className={`p-2 rounded-lg border text-left transition-all ${
                    learningStyle === tmpl.name
                      ? 'border-primary bg-primary/15 text-primary font-semibold shadow-xs'
                      : 'border-border/70 bg-card text-muted-foreground hover:bg-muted hover:text-foreground'
                  }`}
                >
                  <div className="flex items-center gap-1.5 text-xs font-bold truncate">
                    <Icon name={tmpl.icon as any} size={14} />
                    <span className="truncate">{tmpl.label}</span>
                  </div>
                  <p className="text-[10px] text-muted-foreground line-clamp-1 mt-0.5">{tmpl.description}</p>
                </button>
              ))}
            </div>

            <div>
              <label className="block text-[11px] font-semibold text-foreground uppercase tracking-wider mb-1">
                Learning Style Prompt Directives
              </label>
              <textarea
                rows={2}
                placeholder="Directives for how concepts and code explanations should be formatted..."
                value={learningStylePrompt}
                onChange={(e) => setLearningStylePrompt(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-border bg-input text-foreground text-xs focus:outline-none focus:ring-2 focus:ring-primary/40 resize-none"
              />
            </div>
          </div>

          {/* AI Persona / Chatbot Configuration */}
          <div className="p-3.5 rounded-xl border border-purple-500/20 bg-purple-500/5 space-y-3">
            <div className="flex items-center justify-between">
              <label className="text-xs font-semibold text-foreground uppercase tracking-wider flex items-center gap-1.5">
                <Icon name="SparklesIcon" size={14} className="text-purple-500" />
                <span>Instructor AI Chatbot & Personality Prompt</span>
              </label>

              <label className="flex items-center gap-2 cursor-pointer text-xs font-medium text-foreground">
                <input
                  type="checkbox"
                  checked={aiChatbotEnabled}
                  onChange={(e) => setAiChatbotEnabled(e.target.checked)}
                  className="rounded border-border text-purple-600 focus:ring-purple-500"
                />
                <span>Enable AI Chatbot</span>
              </label>
            </div>

            {aiChatbotEnabled && (
              <textarea
                rows={3}
                placeholder="System prompt for this instructor's interactive AI chatbot..."
                value={aiPersona}
                onChange={(e) => setAiPersona(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-purple-500/30 bg-input text-foreground text-xs focus:outline-none focus:ring-2 focus:ring-purple-500/40 resize-none"
              />
            )}
            <p className="text-[11px] text-muted-foreground">
              {type === 'real'
                ? 'Real teachers can have their own AI chatbot set up by themselves or admins to answer student questions.'
                : 'Digital AI instructors use this system prompt persona as their interactive teaching chatbot.'}
            </p>
          </div>

          {/* Avatar Selection */}
          <div>
            <label className="block text-xs font-semibold text-foreground uppercase tracking-wider mb-2">
              Avatar Photo
            </label>
            <div className="flex items-center gap-3 mb-2">
              <img
                src={avatar || DEFAULT_AVATARS[0]}
                alt="Avatar preview"
                className="w-12 h-12 rounded-full object-cover border-2 border-primary/30 shadow-sm"
              />
              <input
                type="text"
                placeholder="Or paste custom image URL..."
                value={avatar}
                onChange={(e) => setAvatar(e.target.value)}
                className="flex-1 px-3.5 py-2 rounded-lg border border-border bg-input text-foreground text-xs focus:outline-none focus:ring-2 focus:ring-primary/40"
              />
            </div>
            <div className="flex items-center gap-2 overflow-x-auto py-1">
              {DEFAULT_AVATARS.map((url, idx) => (
                <button
                  key={idx}
                  type="button"
                  onClick={() => setAvatar(url)}
                  className={`relative rounded-full overflow-hidden w-9 h-9 border-2 transition-all ${
                    avatar === url ? 'border-primary ring-2 ring-primary/40 scale-105' : 'border-transparent opacity-70 hover:opacity-100'
                  }`}
                >
                  <img src={url} alt={`Preset ${idx + 1}`} className="w-full h-full object-cover" />
                </button>
              ))}
            </div>
          </div>

          {/* Assigned Classes */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="block text-xs font-semibold text-foreground uppercase tracking-wider">
                Assign to Curriculum Classes
              </label>
              <span className="text-[10px] font-semibold text-primary bg-primary/10 px-2 py-0.5 rounded-full">
                Multi-Class Support Enabled
              </span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-40 overflow-y-auto p-2 border border-border rounded-lg bg-muted/20 scrollbar-clean">
              {classes.map((cls) => {
                const isSelected = selectedClassIds.includes(cls.id);
                return (
                  <button
                    key={cls.id}
                    type="button"
                    onClick={() => toggleClass(cls.id)}
                    className={`flex items-center justify-between px-3 py-2 rounded-lg text-xs font-medium border transition-all text-left ${
                      isSelected
                        ? 'bg-primary/10 border-primary/40 text-primary shadow-sm'
                        : 'bg-card border-border text-foreground hover:bg-muted'
                    }`}
                  >
                    <span className="flex items-center gap-2 truncate">
                      <Icon name={(cls.icon as any) || 'BookmarkIcon'} size={15} />
                      <span className="truncate">{cls.name}</span>
                    </span>
                    {isSelected && <Icon name="CheckIcon" size={14} className="text-primary flex-shrink-0" />}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Submit Actions */}
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
              {loading ? 'Saving...' : 'Save Changes'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
