'use client';

import React, { useState, useEffect } from 'react';
import Icon from '@/components/ui/AppIcon';
import { useAuth } from '@/contexts/AuthContext';
import { questionsService, Question } from '@/lib/services/questionsService';
import { notify } from '@/lib/ui/notifications';
import { openLoginModal } from '@/components/auth/LoginModal';
import { useUrlState } from '@/lib/navigation/urlState';
import { TOPIC_OPTIONS, cleanTopic } from '../topics';
import { difficultyTone, toneClass } from './ds';

interface FocusTargets {
  targetRole: string;
  targetCompanies: string;
  dailyGoal: number;
  focusTopics: string[];
}

export default function MySpace() {
  const { user } = useAuth();
  const isSwapnilxi = user?.email?.toLowerCase() === 'swapnilgupta.xi@gmail.com';
  const userKey = user ? user.id || user.email?.toLowerCase() || 'authenticated' : 'guest';

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
  const [customTopicDraft, setCustomTopicDraft] = useState('');

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
    const notesKey = isSwapnilxi ? 'swapnilxi_private_notes' : `myspace_notes_${userKey}`;
    const savedNotes =
      localStorage.getItem(notesKey) ||
      (isSwapnilxi ? localStorage.getItem('myspace_notes_swapnilxi') : null);
    if (savedNotes) setScratchpad(savedNotes);

    // Load persisted focus targets scoped to user
    const targetsKey = `myspace_targets_${userKey}`;
    const savedTargets = localStorage.getItem(targetsKey);
    if (savedTargets) {
      try {
        setTargets(JSON.parse(savedTargets));
      } catch {
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

  const addFocusTopic = () => {
    const t = cleanTopic(customTopicDraft);
    if (!t) return;
    setCustomTopicDraft('');
    if (!targets.focusTopics.some((x) => x.toLowerCase() === t.toLowerCase())) {
      handleSaveTargets({ ...targets, focusTopics: [...targets.focusTopics, t] });
    }
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
    } catch (err: unknown) {
      notify({
        source: 'daily-session',
        tone: 'error',
        title: 'Failed to inject question',
        body: (err as { message?: string } | null)?.message || 'Check database connectivity.',
      });
    } finally {
      setCreating(false);
    }
  };

  // Determine user display title
  const displayName = isSwapnilxi
    ? 'swapnilxi space'
    : user?.display_name
      ? `${user.display_name}'s space`
      : user?.email
        ? `${user.email.split('@')[0]}'s space`
        : 'My Space';

  const roleLabel: Record<string, string> = {
    user: 'Member',
    editor: 'Editor',
    admin: 'Admin',
    superadmin: 'Super admin',
  };
  const userRole = isSwapnilxi
    ? 'Verified creator'
    : user?.role
      ? (roleLabel[user.role] ?? user.role.charAt(0).toUpperCase() + user.role.slice(1))
      : 'Personal workspace';

  const userInitial = (user?.display_name?.[0] || user?.email?.[0] || 'M').toUpperCase();
  const goalShare = `${((targets.dailyGoal - 1) / 19) * 100}%`;
  const focusChoices = [
    ...TOPIC_OPTIONS,
    ...targets.focusTopics.filter(
      (t) => !TOPIC_OPTIONS.some((o) => o.toLowerCase() === t.toLowerCase())
    ),
  ];

  return (
    <div className="space-y-[1.75rem] sm:space-y-[2rem]">
      {/* Who this space belongs to, and three numbers */}
      <section
        className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between"
        aria-label="Profile"
      >
        <div className="flex min-w-0 items-center gap-4">
          <span className="bs-avatar ds-tone-indigo" aria-hidden="true">
            {isSwapnilxi ? <Icon name="BoltIcon" variant="solid" size={26} /> : userInitial}
          </span>
          <div className="min-w-0">
            <h2 className="ds-h2 break-words">{displayName}</h2>
            {user ? (
              <p className="mt-0.5 break-all text-sm ds-faint">{user.email}</p>
            ) : (
              <p className="mt-0.5 text-sm ds-faint">
                Guest space.{' '}
                <button
                  type="button"
                  onClick={() => openLoginModal({ feature: 'MySpace' })}
                  className="ds-link"
                >
                  Sign in
                </button>{' '}
                to keep it on every device.
              </p>
            )}
            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              <span className="ds-chip ds-tone-indigo">
                <Icon
                  name={isSwapnilxi ? 'CheckBadgeIcon' : 'UserIcon'}
                  variant="solid"
                  size={13}
                />
                {userRole}
              </span>
              <span className="ds-chip" title="Your notes and targets are scoped to your profile">
                <Icon name="LockClosedIcon" variant="solid" size={12} />
                Private
              </span>
            </div>
          </div>
        </div>

        <dl className="bs-stats lg:w-[25rem] lg:flex-shrink-0">
          <div>
            <dt>Question bank</dt>
            <dd>{loading ? '–' : dbQuestions.length}</dd>
          </div>
          <div>
            <dt>Daily goal</dt>
            <dd>
              {targets.dailyGoal}
              <small>a day</small>
            </dd>
          </div>
          <div>
            <dt>Status</dt>
            <dd className="bs-stat-word ds-tone-jade ds-tone-text">
              {isSwapnilxi ? 'Super admin' : 'Active'}
            </dd>
          </div>
        </dl>
      </section>

      {/* Guest notice */}
      {!user && (
        <div className="ds-banner ds-banner-center bs-tone-p ds-tone-gold flex-col sm:flex-row">
          <div className="flex w-full min-w-0 flex-1 items-start gap-2.5 sm:w-auto">
            <Icon name="InformationCircleIcon" variant="solid" size={18} />
            <p>
              <span className="font-medium">Make this space yours. </span>
              Sign in to keep your notes, targets and added questions tied to your profile.
            </p>
          </div>
          <button
            type="button"
            onClick={() => openLoginModal({ feature: 'MySpace' })}
            className="ds-btn ds-btn-primary ds-btn-sm w-full flex-shrink-0 sm:w-auto"
          >
            Sign in
          </button>
        </div>
      )}

      <div className="grid grid-cols-1 items-start gap-[1.75rem] lg:grid-cols-2 lg:gap-[1.5rem]">
        <div className="min-w-0 space-y-[1.75rem]">
          {/* Targets */}
          <section aria-labelledby="ms-targets-title">
            <div className="ds-section-head">
              <h2 id="ms-targets-title">Your targets</h2>
              {targetsSaved ? (
                <span
                  key="saved"
                  className="bs-saved flex items-center gap-1 ds-tone-jade ds-tone-text"
                >
                  <Icon name="CheckCircleIcon" variant="solid" size={14} />
                  Saved
                </span>
              ) : (
                <span key="auto">Saves as you type</span>
              )}
            </div>
            <div className="ds-list" data-icons="true">
              <label className="ds-list-row bs-form-row">
                <span className="ds-icon-tile ds-icon-tile-sm ds-tone-indigo">
                  <Icon name="FlagIcon" variant="solid" size={15} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="bs-row-label">Dream role</span>
                  <input
                    type="text"
                    placeholder="e.g. Senior ML Engineer, L5 SWE"
                    value={targets.targetRole}
                    onChange={(e) => handleSaveTargets({ ...targets, targetRole: e.target.value })}
                    className="bs-plain"
                  />
                </span>
              </label>
              <label className="ds-list-row bs-form-row">
                <span className="ds-icon-tile ds-icon-tile-sm ds-tone-indigo">
                  <Icon name="BuildingOffice2Icon" variant="solid" size={15} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="bs-row-label">Target companies</span>
                  <input
                    type="text"
                    placeholder="e.g. Google, Meta, Anthropic, Stripe"
                    value={targets.targetCompanies}
                    onChange={(e) =>
                      handleSaveTargets({ ...targets, targetCompanies: e.target.value })
                    }
                    className="bs-plain"
                  />
                </span>
              </label>
              <div className="ds-list-row">
                <span className="ds-icon-tile ds-icon-tile-sm ds-tone-jade">
                  <Icon name="ChartBarIcon" variant="solid" size={15} />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline justify-between gap-3">
                    <label htmlFor="ms-goal" className="bs-row-label">
                      Daily goal
                    </label>
                    <span className="text-sm font-medium ds-ink ds-num">
                      {targets.dailyGoal} question{targets.dailyGoal === 1 ? '' : 's'} a day
                    </span>
                  </div>
                  <input
                    id="ms-goal"
                    type="range"
                    min={1}
                    max={20}
                    value={targets.dailyGoal}
                    onChange={(e) =>
                      handleSaveTargets({ ...targets, dailyGoal: Number(e.target.value) })
                    }
                    className="bs-range mt-1"
                    style={{ '--p': goalShare } as React.CSSProperties}
                  />
                </div>
              </div>
            </div>
          </section>

          {/* Focus areas */}
          <section aria-labelledby="ms-focus-title">
            <div className="ds-section-head">
              <h2 id="ms-focus-title">Focus areas</h2>
              <span className="ds-num">{targets.focusTopics.length} selected</span>
            </div>
            <div className="ds-card p-4">
              <div className="flex flex-wrap gap-2" role="group" aria-labelledby="ms-focus-title">
                {focusChoices.map((topic) => {
                  const active = targets.focusTopics.includes(topic);
                  return (
                    <button
                      key={topic}
                      type="button"
                      onClick={() => toggleTopic(topic)}
                      aria-pressed={active}
                      className="bs-toggle"
                    >
                      <Icon name={active ? 'CheckIcon' : 'PlusIcon'} size={15} />
                      {topic}
                    </button>
                  );
                })}
              </div>
              <div className="mt-4 flex gap-2">
                <input
                  type="text"
                  value={customTopicDraft}
                  maxLength={60}
                  onChange={(e) => setCustomTopicDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      addFocusTopic();
                    }
                  }}
                  placeholder="Add your own, e.g. Kafka"
                  aria-label="Add a custom focus area"
                  className="ds-field min-w-0 flex-1"
                />
                <button
                  type="button"
                  onClick={addFocusTopic}
                  disabled={!cleanTopic(customTopicDraft)}
                  className="ds-btn ds-btn-secondary flex-shrink-0"
                >
                  Add
                </button>
              </div>
            </div>
            <p className="bs-footnote">
              These are the default topics for a new Daily Session. You can change them for one
              session on the setup screen.
            </p>
          </section>
        </div>

        <div className="min-w-0 space-y-[1.75rem]">
          {/* Add a question */}
          <section aria-labelledby="ms-add-title">
            <div className="ds-section-head">
              <h2 id="ms-add-title">Add a question</h2>
              <span>Straight to your question bank</span>
            </div>
            <form onSubmit={handleCreateQuestion} className="ds-card space-y-4 p-4 sm:p-5">
              <div>
                <label htmlFor="ms-question" className="bs-label">
                  Question
                </label>
                <textarea
                  id="ms-question"
                  rows={3}
                  required
                  placeholder="An interview or CV question…"
                  value={newQuestionText}
                  onChange={(e) => setNewQuestionText(e.target.value)}
                  className="ds-field resize-none"
                />
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <span id="ms-category" className="bs-label">
                    Category
                  </span>
                  <div className="ds-seg" role="group" aria-labelledby="ms-category">
                    {(['Interview', 'CV Skill'] as const).map((c) => (
                      <button
                        key={c}
                        type="button"
                        aria-pressed={newCategory === c}
                        onClick={() => setNewCategory(c)}
                      >
                        {c === 'CV Skill' ? 'CV skill' : c}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <label htmlFor="ms-topic" className="bs-label">
                    Topic
                  </label>
                  <input
                    id="ms-topic"
                    type="text"
                    value={newSubType}
                    onChange={(e) => setNewSubType(e.target.value)}
                    placeholder="e.g. DSA"
                    className="ds-field"
                  />
                </div>
              </div>

              <div>
                <span id="ms-difficulty" className="bs-label">
                  Difficulty
                </span>
                <div className="ds-seg" role="group" aria-labelledby="ms-difficulty">
                  {(['Easy', 'Medium', 'Hard'] as const).map((d) => (
                    <button
                      key={d}
                      type="button"
                      aria-pressed={newDifficulty === d}
                      onClick={() => setNewDifficulty(d)}
                    >
                      <span
                        className={`ds-dot ${toneClass(difficultyTone(d))}`}
                        aria-hidden="true"
                      />
                      {d}
                    </button>
                  ))}
                </div>
              </div>

              <button type="submit" disabled={creating} className="ds-btn ds-btn-primary w-full">
                {creating ? (
                  <span
                    className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent"
                    aria-hidden="true"
                  />
                ) : (
                  <Icon name="PlusIcon" size={17} />
                )}
                Add to question bank
              </button>
            </form>
          </section>

          {/* Scratchpad */}
          <section aria-labelledby="ms-notes-title">
            <div className="ds-section-head">
              <h2 id="ms-notes-title">{isSwapnilxi ? 'Scratchpad and roadmap' : 'Scratchpad'}</h2>
              <span>Saves as you type</span>
            </div>
            <div className="ds-card bs-notes-card overflow-hidden">
              <textarea
                rows={8}
                value={scratchpad}
                onChange={(e) => handleSaveNotes(e.target.value)}
                placeholder="Your private thoughts, interview tips to remember, tricky edge cases, algorithms to revise, or questions to practise…"
                aria-labelledby="ms-notes-title"
                className="bs-notes"
              />
              <div className="flex items-center justify-between gap-3 border-t ds-hairline px-4 py-2">
                <span className="flex min-w-0 items-center gap-1.5 text-xs ds-faint">
                  <Icon name="LockClosedIcon" size={13} />
                  <span className="ds-num">{scratchpad.length}</span> characters · only you can see
                  this
                </span>
                <button
                  type="button"
                  onClick={() => handleSaveNotes('')}
                  disabled={!scratchpad}
                  className="ds-btn ds-btn-danger ds-btn-sm flex-shrink-0"
                >
                  Clear
                </button>
              </div>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}

export { MySpace as SwapnilxiSpace };
