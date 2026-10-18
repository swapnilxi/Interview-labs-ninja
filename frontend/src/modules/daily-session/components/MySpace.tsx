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
    <div className="space-y-6 animate-fade-in">
      {/* Personalized Welcome Banner */}
      <div className={`relative overflow-hidden rounded-3xl border ${
        isSwapnilxi ? 'border-violet-500/30' : 'border-primary/20'
      } bg-gradient-to-br from-card via-card/90 to-primary/5 p-6 sm:p-8 shadow-xl backdrop-blur-xl`}>
        <div className={`absolute top-0 right-0 -mt-8 -mr-8 h-48 w-48 rounded-full ${
          isSwapnilxi ? 'bg-violet-600/15' : 'bg-primary/10'
        } blur-3xl pointer-events-none`} />

        <div className="relative flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className={`flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-tr ${
              isSwapnilxi
                ? 'from-violet-600 to-amber-500 shadow-violet-500/30'
                : 'from-primary to-violet-600 shadow-primary/25'
            } text-white shadow-lg font-black text-xl`}>
              {userInitial}
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="font-heading text-2xl font-black tracking-tight text-foreground">
                  {displayName}
                </h2>
                <span className={`rounded-full px-2.5 py-0.5 text-[10px] font-extrabold uppercase tracking-wider border ${
                  isSwapnilxi
                    ? 'bg-violet-500/20 border-violet-500/40 text-violet-400'
                    : 'bg-primary/15 border-primary/30 text-primary'
                }`}>
                  {userRole}
                </span>
                <span className="rounded-full bg-muted/60 border border-border px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
                  🔒 Private & Scoped
                </span>
              </div>
              <p className="text-xs text-muted-foreground mt-0.5">
                {user ? (
                  <>
                    Authenticated as <span className="font-mono text-primary font-semibold">{user.email}</span> · Your private command deck & scratchpad
                  </>
                ) : (
                  <>
                    Viewing guest space · <button type="button" onClick={() => openLoginModal({ feature: 'MySpace' })} className="text-primary underline font-medium">Sign in</button> to sync across all your devices
                  </>
                )}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <div className="rounded-xl border border-border bg-card/60 px-3.5 py-2 text-center min-w-[70px]">
              <div className="text-[10px] uppercase font-bold text-muted-foreground">Question Bank</div>
              <div className="text-lg font-black text-foreground">{dbQuestions.length}</div>
            </div>
            <div className="rounded-xl border border-border bg-card/60 px-3.5 py-2 text-center min-w-[70px]">
              <div className="text-[10px] uppercase font-bold text-muted-foreground">Daily Target</div>
              <div className="text-lg font-black text-primary">{targets.dailyGoal} Qs</div>
            </div>
            <div className="rounded-xl border border-border bg-card/60 px-3.5 py-2 text-center min-w-[70px]">
              <div className="text-[10px] uppercase font-bold text-muted-foreground">Status</div>
              <div className="text-xs font-bold text-emerald-500 mt-1">{isSwapnilxi ? 'SuperAdmin' : 'Active'}</div>
            </div>
          </div>
        </div>
      </div>

      {/* Guest Notice if not authenticated */}
      {!user && (
        <div className="rounded-2xl border border-amber-500/30 bg-amber-500/10 p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-3">
            <Icon name="InformationCircleIcon" size={20} className="text-amber-500 shrink-0" />
            <div>
              <span className="font-bold text-foreground">Personalize your MySpace: </span>
              <span className="text-muted-foreground">Log in to keep your private notes, focus targets, and injected questions securely tied to your unique user profile.</span>
            </div>
          </div>
          <button
            type="button"
            onClick={() => openLoginModal({ feature: 'MySpace' })}
            className="shrink-0 rounded-xl bg-primary px-4 py-2 font-bold text-primary-foreground hover:opacity-90 transition-opacity"
          >
            Sign In Now
          </button>
        </div>
      )}

      {/* Career Targets & Focus Planner */}
      <div className="rounded-2xl border border-border bg-card p-6 shadow-sm space-y-4">
        <div className="flex items-center justify-between border-b border-border/60 pb-3">
          <div className="flex items-center gap-2">
            <Icon name="FlagIcon" size={18} className="text-primary" />
            <h3 className="font-heading text-base font-bold text-foreground">
              Personal Targets & Focus Deck
            </h3>
          </div>
          {targetsSaved && (
            <span className="text-[11px] font-bold text-emerald-500 animate-in fade-in-0 duration-200">
              ✓ Targets saved
            </span>
          )}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="block text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-1">
              Target Dream Role
            </label>
            <input
              type="text"
              placeholder="e.g. Senior ML Engineer, L5 SWE"
              value={targets.targetRole}
              onChange={(e) => handleSaveTargets({ ...targets, targetRole: e.target.value })}
              className="w-full rounded-xl border border-border bg-input px-3 py-2 text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-primary/20"
            />
          </div>

          <div>
            <label className="block text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-1">
              Target Companies
            </label>
            <input
              type="text"
              placeholder="e.g. Google, Meta, Anthropic, Stripe"
              value={targets.targetCompanies}
              onChange={(e) => handleSaveTargets({ ...targets, targetCompanies: e.target.value })}
              className="w-full rounded-xl border border-border bg-input px-3 py-2 text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-primary/20"
            />
          </div>

          <div>
            <label className="block text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-1">
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
          <label className="block text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-1.5">
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
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all duration-200 border ${
                    active
                      ? 'bg-primary/15 border-primary/30 text-primary font-bold shadow-xs'
                      : 'bg-muted/40 border-border text-muted-foreground hover:text-foreground'
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

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Rapid Question Injector */}
        <div className="rounded-2xl border border-border bg-card p-6 shadow-sm space-y-4">
          <div className="flex items-center justify-between border-b border-border/60 pb-3">
            <div className="flex items-center gap-2">
              <Icon name="PlusCircleIcon" size={18} className="text-primary" />
              <h3 className="font-heading text-base font-bold text-foreground">
                Rapid Question Injector
              </h3>
            </div>
            <span className="text-[11px] text-muted-foreground">Direct Database Commit</span>
          </div>

          <form onSubmit={handleCreateQuestion} className="space-y-4">
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-muted-foreground mb-1">
                Question Text
              </label>
              <textarea
                rows={3}
                required
                placeholder="Enter technical interview or CV question..."
                value={newQuestionText}
                onChange={(e) => setNewQuestionText(e.target.value)}
                className="w-full rounded-xl border border-border bg-input px-3.5 py-2.5 text-xs text-foreground placeholder:text-muted-foreground/50 focus:border-primary/40 focus:outline-none focus:ring-2 focus:ring-primary/20 resize-none"
              />
            </div>

            <div className="grid grid-cols-3 gap-2">
              <div>
                <label className="block text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-1">
                  Category
                </label>
                <select
                  value={newCategory}
                  onChange={(e) => setNewCategory(e.target.value as any)}
                  className="w-full rounded-lg border border-border bg-input px-2.5 py-2 text-xs font-semibold text-foreground focus:outline-none"
                >
                  <option value="Interview">Interview</option>
                  <option value="CV Skill">CV Skill</option>
                </select>
              </div>

              <div>
                <label className="block text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-1">
                  Sub-Type
                </label>
                <input
                  type="text"
                  value={newSubType}
                  onChange={(e) => setNewSubType(e.target.value)}
                  className="w-full rounded-lg border border-border bg-input px-2.5 py-2 text-xs text-foreground focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-1">
                  Difficulty
                </label>
                <select
                  value={newDifficulty}
                  onChange={(e) => setNewDifficulty(e.target.value as any)}
                  className="w-full rounded-lg border border-border bg-input px-2.5 py-2 text-xs font-semibold text-foreground focus:outline-none"
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
              className="w-full flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-primary to-violet-600 py-2.5 text-xs font-bold text-white shadow-md shadow-primary/20 hover:opacity-95 disabled:opacity-50 transition-opacity"
            >
              {creating ? (
                <div className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/30 border-t-white" />
              ) : (
                <Icon name="BoltIcon" size={15} />
              )}
              Inject into Repository
            </button>
          </form>
        </div>

        {/* Private Personal Notes & Scratchpad */}
        <div className="rounded-2xl border border-border bg-card p-6 shadow-sm space-y-4 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between border-b border-border/60 pb-3 mb-4">
              <div className="flex items-center gap-2">
                <Icon name="DocumentTextIcon" size={18} className="text-violet-500" />
                <h3 className="font-heading text-base font-bold text-foreground">
                  {isSwapnilxi ? 'Swapnilxi Scratchpad & Roadmap' : 'Private Scratchpad & Notes'}
                </h3>
              </div>
              <span className="text-[10px] text-emerald-500 font-bold">Auto-persisted</span>
            </div>

            <textarea
              rows={8}
              value={scratchpad}
              onChange={(e) => handleSaveNotes(e.target.value)}
              placeholder="Your private thoughts, interview tips to remember, tricky edge-cases, algorithms to revise, or questions to practice..."
              className="w-full rounded-xl border border-border bg-input px-3.5 py-2.5 text-xs text-foreground placeholder:text-muted-foreground/50 focus:border-primary/40 focus:outline-none focus:ring-2 focus:ring-primary/20 font-mono resize-none leading-relaxed"
            />
          </div>

          <div className="flex items-center justify-between text-[11px] text-muted-foreground pt-2 border-t border-border/60">
            <span>{scratchpad.length} characters · Private to your profile</span>
            <button
              type="button"
              onClick={() => handleSaveNotes('')}
              className="text-rose-500 hover:underline"
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
