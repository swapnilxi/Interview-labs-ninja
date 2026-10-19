'use client';

import React, { useState, useEffect } from 'react';
import Icon from '@/components/ui/AppIcon';
import { useAuth } from '@/contexts/AuthContext';
import { questionsService, Question } from '@/lib/services/questionsService';
import { notify } from '@/lib/ui/notifications';
import { openLoginModal } from '@/components/auth/LoginModal';
import { useUrlState } from '@/lib/navigation/urlState';

interface FocusTargets {
  targetRole: string;
  targetCompanies: string;
  dailyGoal: number;
  focusTopics: string[];
}

const DEFAULT_TOPICS = ['DSA', 'System Design', 'Computer Vision', 'ML Infra', 'Behavioral'];

export default function MySpace() {
  const { user } = useAuth();
  const isSwapnilxi = user?.email?.toLowerCase() === 'swapnilgupta.xi@gmail.com';
  const userKey = user ? (user.id || user.email?.toLowerCase() || 'authenticated') : 'guest';

  // One screen, two addresses: ?tab=swapnilxi-space for the creator, ?tab=myspace for everyone else. A hand-edited or
  // shared link to the other one shows this same screen, so the address (and the page header, which follows it) is
  // corrected to the one that belongs to this account. replace: the wrong address does not stay in history.
  const { get: getParam, update: updateUrl } = useUrlState();
  const tabParam = getParam('tab');
  const ownTab = isSwapnilxi ? 'swapnilxi-space' : 'myspace';
  useEffect(() => {
    if (user && (tabParam === 'myspace' || tabParam === 'swapnilxi-space') && tabParam !== ownTab) {
      updateUrl({ tab: ownTab }, 'replace');
    }
  }, [user, tabParam, ownTab, updateUrl]);

  const [dbQuestions, setDbQuestions] = useState<Question[]>([]);
  const [loading, setLoading] = useState(true);

  // Quick Question Creator Form
  const [newQuestionText, setNewQuestionText] = useState('');
  const [newCategory, setNewCategory] = useState<'Interview' | 'CV Skill'>('Interview');
  const [newSubType, setNewSubType] = useState('DSA');
  const [newDifficulty, setNewDifficulty] = useState<'Easy' | 'Medium' | 'Hard'>('Medium');
  const [creating, setCreating] = useState(false);

  // Private Developer Scratchpad (Personalized & Private per user)
  const [scratchpad, setScratchpad] = useState('');

  // Career Focus Targets (Personalized & Private per user)
  const [targets, setTargets] = useState<FocusTargets>({
    targetRole: '',
    targetCompanies: '',
    dailyGoal: 5,
    focusTopics: ['DSA', 'System Design'],
  });
  const [targetsSaved, setTargetsSaved] = useState(false);

  useEffect(() => {
    async function loadStats() {
      try {
        const qList = await questionsService.getAll();
        setDbQuestions(qList);
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    }
    loadStats();

    // Load persisted scratchpad scoped to user
    const notesKey = isSwapnilxi
      ? 'swapnilxi_private_notes'
      : `myspace_notes_${userKey}`;
    const savedNotes = localStorage.getItem(notesKey) || (isSwapnilxi ? localStorage.getItem('myspace_notes_swapnilxi') : null);
    if (savedNotes) setScratchpad(savedNotes);

    // Load persisted focus targets scoped to user
    const targetsKey = `myspace_targets_${userKey}`;
    const savedTargets = localStorage.getItem(targetsKey);
    if (savedTargets) {
      try {
        setTargets(JSON.parse(savedTargets));
      } catch (e) {
        // use defaults
      }
    } else if (isSwapnilxi) {
      setTargets({
        targetRole: 'Founding Engineer / AI Architect',
        targetCompanies: 'Lab-Ninja Core, Google DeepMind, OpenAI',
        dailyGoal: 10,
        focusTopics: ['DSA', 'System Design', 'Computer Vision', 'ML Infra'],
      });
    }
  }, [userKey, isSwapnilxi]);

  const handleSaveNotes = (val: string) => {
    setScratchpad(val);
    const notesKey = isSwapnilxi ? 'swapnilxi_private_notes' : `myspace_notes_${userKey}`;
    localStorage.setItem(notesKey, val);
  };

  const handleSaveTargets = (newTargets: FocusTargets) => {
    setTargets(newTargets);
    const targetsKey = `myspace_targets_${userKey}`;
    localStorage.setItem(targetsKey, JSON.stringify(newTargets));
    setTargetsSaved(true);
    setTimeout(() => setTargetsSaved(false), 2500);
  };

  const toggleTopic = (topic: string) => {
    const updated = targets.focusTopics.includes(topic)
      ? targets.focusTopics.filter((t) => t !== topic)
      : [...targets.focusTopics, topic];
    handleSaveTargets({ ...targets, focusTopics: updated });
  };

  const handleCreateQuestion = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newQuestionText.trim()) return;

    setCreating(true);
    try {
      await questionsService.upsertMany([
        {
          questionText: newQuestionText.trim(),
          category: newCategory,
          subType: newSubType,
          difficulty: newDifficulty,
          questionType: newSubType,
          dateEncountered: new Date().toISOString().split('T')[0],
          lastReviewed: null,
        },
      ]);

      notify({
        source: 'daily-session',
        tone: 'success',
        title: 'Question Injected Successfully',
        body: `Added to ${newCategory} (${newSubType})`,
      });

      setNewQuestionText('');
      const updated = await questionsService.getAll();
      setDbQuestions(updated);
    } catch (err: any) {
      notify({
        source: 'daily-session',
        tone: 'error',
        title: 'Failed to inject question',
        body: err?.message || 'Check database connectivity.',
      });
    } finally {
      setCreating(false);
    }
  };

  // Determine user display title
  const displayName = isSwapnilxi
    ? 'swapnilxi space'
    : user?.display_name
    ? `${user.display_name}'s MySpace`
    : user?.email
    ? `${user.email.split('@')[0]}'s MySpace`
    : 'MySpace';

  const userRole = isSwapnilxi
    ? 'Verified Creator'
    : user?.role
    ? user.role.toUpperCase()
    : 'Personal Workspace';

  const userInitial = isSwapnilxi
    ? '⚡'
    : (user?.display_name?.[0] || user?.email?.[0] || 'M').toUpperCase();

  return (
    <div className="space-y-[1.5rem] animate-fade-in">
      {/* Personalized welcome row: flat on the page background (the page header above already carries the title) */}
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div className="flex items-center gap-4">
          <div className={`flex h-14 w-14 flex-shrink-0 items-center justify-center rounded-xl text-xl font-bold ${
            isSwapnilxi
              ? 'bg-gradient-to-tr from-violet-600 to-amber-500 text-white shadow-lg shadow-violet-500/30'
              : 'bg-primary text-primary-foreground'
          }`}>
            {userInitial}
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="font-heading text-lg font-semibold tracking-tight text-foreground">
                {displayName}
              </h2>
              <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wider border ${
                isSwapnilxi
                  ? 'bg-violet-500/20 border-violet-500/40 text-violet-400'
                  : 'lab-tint mix-border-primary/30 lab-ink'
              }`}>
                {userRole}
              </span>
              <span className="inline-flex items-center gap-1 rounded-full mix-bg-foreground/[0.06] px-2 py-0.5 text-xs font-medium text-muted-foreground">
                <Icon name="LockClosedIcon" size={12} />
                Private & Scoped
              </span>
            </div>
            <p className="mt-1 text-xs font-medium text-muted-foreground">
              {user ? (
                <>
                  Authenticated as <span className="font-mono font-semibold lab-ink">{user.email}</span> · Your private command deck & scratchpad
                </>
              ) : (
                <>
                  Viewing guest space · <button type="button" onClick={() => openLoginModal({ feature: 'MySpace' })} className="todo-focus lab-ink underline font-medium">Sign in</button> to sync across all your devices
                </>
              )}
            </p>
          </div>
        </div>

        <dl className="flex flex-wrap items-end gap-x-[1.5rem] gap-y-3">
          <div>
            <dt className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Question Bank</dt>
            <dd className="mt-0.5 text-lg font-semibold tabular-nums text-foreground">{dbQuestions.length}</dd>
          </div>
          <div>
            <dt className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Daily Target</dt>
            <dd className="mt-0.5 text-lg font-semibold tabular-nums lab-ink">{targets.dailyGoal} Qs</dd>
          </div>
          <div>
            <dt className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Status</dt>
            <dd className="mt-0.5 text-lg font-semibold text-emerald-700 dark:text-emerald-300">{isSwapnilxi ? 'SuperAdmin' : 'Active'}</dd>
          </div>
        </dl>
      </div>

      {/* Guest Notice if not authenticated */}
      {!user && (
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-3">
            <Icon name="InformationCircleIcon" size={20} className="text-amber-500 shrink-0" />
            <div>
              <span className="font-semibold text-foreground">Personalize your MySpace: </span>
              <span className="text-muted-foreground">Log in to keep your private notes, focus targets, and injected questions securely tied to your unique user profile.</span>
            </div>
          </div>
          <button
            type="button"
            onClick={() => openLoginModal({ feature: 'MySpace' })}
            className="todo-btn todo-btn-primary shrink-0 px-4 py-2"
          >
            Sign In Now
          </button>
        </div>
      )}

      {/* Career Targets & Focus Planner */}
      <div className="rounded-xl border border-border bg-card p-[1.25rem] space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Icon name="FlagIcon" size={18} className="text-primary" />
            <h3 className="font-heading text-base font-semibold text-foreground">
              Personal Targets & Focus Deck
            </h3>
          </div>
          {targetsSaved && (
            <span className="text-xs font-semibold text-emerald-700 dark:text-emerald-300 animate-in fade-in-0 duration-200">
              ✓ Targets saved
            </span>
          )}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="block text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-1">
              Target Dream Role
            </label>
            <input
              type="text"
              placeholder="e.g. Senior ML Engineer, L5 SWE"
              value={targets.targetRole}
              onChange={(e) => handleSaveTargets({ ...targets, targetRole: e.target.value })}
              className="todo-input px-3 py-2 text-xs"
            />
          </div>

          <div>
            <label className="block text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-1">
              Target Companies
            </label>
            <input
              type="text"
              placeholder="e.g. Google, Meta, Anthropic, Stripe"
              value={targets.targetCompanies}
              onChange={(e) => handleSaveTargets({ ...targets, targetCompanies: e.target.value })}
              className="todo-input px-3 py-2 text-xs"
            />
          </div>

          <div>
            <label className="block text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-1">
              Daily Question Goal ({targets.dailyGoal} questions / day)
            </label>
            <input
              type="range"
              min={1}
              max={20}
              value={targets.dailyGoal}
              onChange={(e) => handleSaveTargets({ ...targets, dailyGoal: Number(e.target.value) })}
              className="w-full accent-primary h-2 mt-2 bg-muted rounded-lg cursor-pointer"
            />
          </div>
        </div>

        <div>
          <label className="block text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">
            Key Focus Areas
          </label>
          <div className="flex flex-wrap gap-2">
            {DEFAULT_TOPICS.map((topic) => {
              const active = targets.focusTopics.includes(topic);
              return (
                <button
                  key={topic}
                  type="button"
                  onClick={() => toggleTopic(topic)}
                  aria-pressed={active}
                  className={`todo-focus px-3 py-1.5 rounded-lg text-xs font-semibold transition-smooth border ${
                    active
                      ? 'lab-tint mix-border-primary/30 lab-ink'
                      : 'mix-bg-foreground/[0.04] border-border text-muted-foreground hover:text-foreground'
                  }`}
                >
                  {active ? '✓ ' : '+ '}
                  {topic}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-[1.5rem]">
        {/* Rapid Question Injector */}
        <div className="rounded-xl border border-border bg-card p-[1.25rem] space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Icon name="PlusCircleIcon" size={18} className="text-primary" />
              <h3 className="font-heading text-base font-semibold text-foreground">
                Rapid Question Injector
              </h3>
            </div>
            <span className="text-xs text-muted-foreground">Direct Database Commit</span>
          </div>

          <form onSubmit={handleCreateQuestion} className="space-y-4">
            <div>
              <label className="block text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-1">
                Question Text
              </label>
              <textarea
                rows={3}
                required
                placeholder="Enter technical interview or CV question..."
                value={newQuestionText}
                onChange={(e) => setNewQuestionText(e.target.value)}
                className="todo-input px-3.5 py-2.5 text-xs resize-none"
              />
            </div>

            <div className="grid grid-cols-3 gap-2">
              <div>
                <label className="block text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-1">
                  Category
                </label>
                <select
                  value={newCategory}
                  onChange={(e) => setNewCategory(e.target.value as any)}
                  className="todo-input px-2.5 py-2 text-xs font-semibold"
                >
                  <option value="Interview">Interview</option>
                  <option value="CV Skill">CV Skill</option>
                </select>
              </div>

              <div>
                <label className="block text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-1">
                  Sub-Type
                </label>
                <input
                  type="text"
                  value={newSubType}
                  onChange={(e) => setNewSubType(e.target.value)}
                  className="todo-input px-2.5 py-2 text-xs"
                />
              </div>

              <div>
                <label className="block text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-1">
                  Difficulty
                </label>
                <select
                  value={newDifficulty}
                  onChange={(e) => setNewDifficulty(e.target.value as any)}
                  className="todo-input px-2.5 py-2 text-xs font-semibold"
                >
                  <option value="Easy">Easy</option>
                  <option value="Medium">Medium</option>
                  <option value="Hard">Hard</option>
                </select>
              </div>
            </div>

            <button
              type="submit"
              disabled={creating}
              className="todo-btn todo-btn-primary w-full gap-2 py-2.5"
            >
              {creating ? (
                <div className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent" />
              ) : (
                <Icon name="BoltIcon" size={15} />
              )}
              Inject into Repository
            </button>
          </form>
        </div>

        {/* Private Personal Notes & Scratchpad */}
        <div className="rounded-xl border border-border bg-card p-[1.25rem] space-y-4 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <Icon name="DocumentTextIcon" size={18} className="text-primary" />
                <h3 className="font-heading text-base font-semibold text-foreground">
                  {isSwapnilxi ? 'Swapnilxi Scratchpad & Roadmap' : 'Private Scratchpad & Notes'}
                </h3>
              </div>
              <span className="text-xs text-emerald-700 dark:text-emerald-300 font-semibold">Auto-persisted</span>
            </div>

            <textarea
              rows={8}
              value={scratchpad}
              onChange={(e) => handleSaveNotes(e.target.value)}
              placeholder="Your private thoughts, interview tips to remember, tricky edge-cases, algorithms to revise, or questions to practice..."
              className="todo-input px-3.5 py-2.5 text-xs font-mono resize-none leading-relaxed"
            />
          </div>

          <div className="flex items-center justify-between text-xs text-muted-foreground pt-2">
            <span>{scratchpad.length} characters · Private to your profile</span>
            <button
              type="button"
              onClick={() => handleSaveNotes('')}
              className="todo-focus text-rose-600 dark:text-rose-400 hover:underline"
            >
              Clear notes
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export { MySpace as SwapnilxiSpace };
