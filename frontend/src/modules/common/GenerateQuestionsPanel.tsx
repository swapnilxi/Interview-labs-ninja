'use client';

import { useState } from 'react';
import Icon from '@/components/ui/AppIcon';
import MarkdownLite from '@/modules/common/lab/MarkdownLite';
import { DifficultyTag } from '@/modules/common/lab/LabTags';
import { LAB_REVEAL } from '@/modules/common/lab/LabSidebarParts';
import { notify } from '@/lib/ui/notifications';
import { questionsService } from '@/lib/services/questionsService';
import { defaultAIRequestFields, settingsService } from '@/lib/services/settingsService';
import { apiFetch } from '@/lib/http/apiClient';

export interface GeneratedSubtopic {
  id: string;
  name: string;
  brief: string;
  content?: string;
  sourceUrl?: string;
}

interface Props {
  topicName: string;
  subtopicName?: string;
  labName: string;
  /** The colour token the panel is drawn in; the labs pass '--lab-accent' (the Settings accent), which is the default. */
  accentVar?: string;
  /** Called when the learner confirms adding an AI-generated (e.g. from YouTube) subtopic to the current topic. */
  onAddSubtopic?: (subtopic: GeneratedSubtopic) => void;
}

type GenQ = { id: string; text: string; difficulty: string; subType: string; deleted: boolean };
type Mode = 'questions' | 'youtube';

function questionListToGenQ(questions: { text: string; difficulty: string; sub_type: string }[]): GenQ[] {
  return questions.map((q, i) => ({
    id: String(i),
    text: q.text,
    difficulty: q.difficulty,
    subType: q.sub_type,
    deleted: false,
  }));
}

export default function GenerateQuestionsPanel({ topicName, subtopicName, labName, accentVar = '--lab-accent', onAddSubtopic }: Props) {
  const [open,       setOpen]       = useState(false);
  const [mode,       setMode]       = useState<Mode>('questions');
  const [showCtx,    setShowCtx]    = useState(false);
  const [context,    setContext]    = useState('');
  const [error,      setError]      = useState<string | null>(null);

  // ── "Generate Questions" mode state ──
  const [generating, setGenerating] = useState(false);
  const [questions,  setQuestions]  = useState<GenQ[]>([]);
  const [saving,     setSaving]     = useState(false);
  const [savedCount, setSavedCount] = useState<number | null>(null);

  // ── "From YouTube Video" mode state ──
  const [youtubeUrl,          setYoutubeUrl]          = useState('');
  const [needsManualTranscript, setNeedsManualTranscript] = useState(false);
  const [manualTranscript,    setManualTranscript]    = useState('');
  const [ytGenerating,        setYtGenerating]        = useState(false);
  const [ytResult,            setYtResult]            = useState<{ subtopic: { name: string; brief: string }; contentMarkdown: string; questions: GenQ[] } | null>(null);
  const [ytSaving,             setYtSaving]           = useState(false);
  const [ytSaved,               setYtSaved]           = useState(false);

  // The lab identity hues (--lab-cv, --lab-system) only feed the hero glow and the icon tile, never a control: map them to the accent.
  const tokenVar = accentVar === '--lab-cv' || accentVar === '--lab-system' ? '--lab-accent' : accentVar;
  const accent = `var(${tokenVar})`;
  const accentSoft = `var(${tokenVar}-soft, color-mix(in srgb, var(${tokenVar}) 12%, transparent))`;
  // Text drawn in the accent uses its ink (>= 4.5:1 on its own tint for every preset); icons, borders and fills use the raw accent.
  const accentInk = `var(${tokenVar}-ink, color-mix(in srgb, var(${tokenVar}) 55%, var(--color-foreground)))`;

  const activeCount = questions.filter(q => !q.deleted).length;
  const ytActiveCount = ytResult ? ytResult.questions.filter(q => !q.deleted).length : 0;

  function switchMode(next: Mode) {
    setMode(next);
    setError(null);
  }

  async function generate() {
    setGenerating(true);
    setError(null);
    setSavedCount(null);
    setQuestions([]);
    try {
      const res = await apiFetch('/lab/generate-questions', {
        method: 'POST',
        body: JSON.stringify({
          topic: topicName,
          subtopic: subtopicName || undefined,
          lab: labName,
          context: context.trim() || undefined,
          count: 5,
          ...defaultAIRequestFields(),
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || `Server error ${res.status}`);
      }
      const data = await res.json();
      const generated = questionListToGenQ(data.questions as { text: string; difficulty: string; sub_type: string }[]);
      setQuestions(generated);
      notify({
        source: 'labs',
        tone: 'success',
        title: `${generated.length} questions ready`,
        body: `${subtopicName || topicName} · review and save them to your bank`,
      });
    } catch (e: any) {
      setError(e?.message ?? 'Generation failed. Check API key in Config.');
      notify({ source: 'labs', tone: 'error', title: 'Question generation failed', body: e?.message ?? 'Check your API key in Config.' });
    } finally {
      setGenerating(false);
    }
  }

  async function saveToBank() {
    const toSave = questions.filter(q => !q.deleted);
    if (!toSave.length) return;
    setSaving(true);
    setError(null);
    try {
      await questionsService.upsertMany(
        toSave.map(q => ({
          questionText: q.text,
          category: 'Interview' as const,
          subType: subtopicName ?? topicName,
          difficulty: (q.difficulty === 'Easy' || q.difficulty === 'Hard' ? q.difficulty : 'Medium') as 'Easy' | 'Medium' | 'Hard',
          questionType: q.subType,
          dateEncountered: new Date().toISOString().split('T')[0],
          lastReviewed: null,
        }))
      );
      setSavedCount(toSave.length);
      setQuestions([]);
      notify({
        source: 'labs',
        tone: 'success',
        title: `${toSave.length} question${toSave.length > 1 ? 's' : ''} saved`,
        body: 'Added to your Question Bank',
        href: '/question-bank',
      });
    } catch (e: any) {
      setError('Failed to save. Check backend connection.');
    } finally {
      setSaving(false);
    }
  }

  async function generateFromYoutube() {
    if (!youtubeUrl.trim()) return;
    setYtGenerating(true);
    setError(null);
    setYtSaved(false);
    setYtResult(null);
    try {
      const settings = await settingsService.getSettings();
      const res = await apiFetch('/lab/generate-from-youtube', {
        method: 'POST',
        body: JSON.stringify({
          youtube_url: youtubeUrl.trim(),
          topic: topicName,
          lab: labName,
          context: context.trim() || undefined,
          manual_transcript: needsManualTranscript ? (manualTranscript.trim() || undefined) : undefined,
          youtube_api_key: settings.youtubeApiKey || undefined,
          ...defaultAIRequestFields(),
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        if (res.status === 422) setNeedsManualTranscript(true);
        throw new Error(err.detail || `Server error ${res.status}`);
      }
      const data = await res.json();
      if (!data.subtopic?.name || typeof data.content_markdown !== 'string') {
        throw new Error('The AI response was missing expected fields. Try again.');
      }
      setYtResult({
        subtopic: data.subtopic,
        contentMarkdown: data.content_markdown,
        questions: questionListToGenQ(data.questions || []),
      });
    } catch (e: any) {
      setError(e?.message ?? 'Generation failed. Check API key in Config.');
    } finally {
      setYtGenerating(false);
    }
  }

  async function addYoutubeSubtopic() {
    if (!ytResult) return;
    setYtSaving(true);
    setError(null);
    try {
      onAddSubtopic?.({
        id: `sub-yt-${Date.now()}`,
        name: ytResult.subtopic.name,
        brief: ytResult.subtopic.brief,
        content: ytResult.contentMarkdown,
        sourceUrl: youtubeUrl.trim(),
      });
      const toSave = ytResult.questions.filter(q => !q.deleted);
      if (toSave.length) {
        await questionsService.upsertMany(
          toSave.map(q => ({
            questionText: q.text,
            category: 'Interview' as const,
            subType: ytResult.subtopic.name,
            difficulty: (q.difficulty === 'Easy' || q.difficulty === 'Hard' ? q.difficulty : 'Medium') as 'Easy' | 'Medium' | 'Hard',
            questionType: q.subType,
            dateEncountered: new Date().toISOString().split('T')[0],
            lastReviewed: null,
          }))
        );
      }
      setYtSaved(true);
      setYtResult(null);
      setYoutubeUrl('');
      setManualTranscript('');
      setNeedsManualTranscript(false);
    } catch (e: any) {
      setError('Failed to save. Check backend connection.');
    } finally {
      setYtSaving(false);
    }
  }

  return (
    <div className="lab-card overflow-hidden">
      {/* Header toggle */}
      <button
        onClick={() => { setOpen(o => !o); setSavedCount(null); setYtSaved(false); setError(null); }}
        aria-expanded={open}
        className="todo-focus w-full flex items-center gap-3 px-4 py-3 hover:mix-bg-foreground/[0.04] focus-visible:ring-inset focus-visible:ring-offset-0 transition-all group"
      >
        <div className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0"
          style={{ background: accentSoft }}>
          <Icon name="QuestionMarkCircleIcon" size={14} style={{ color: accent }} />
        </div>
        <div className="flex-1 text-left">
          <span className="text-sm font-semibold text-foreground">Generate Practice Material</span>
          <span className="text-xs font-medium text-muted-foreground ml-2">Questions, or a full lab from a YouTube video</span>
        </div>
        <Icon
          name={open ? 'ChevronUpIcon' : 'ChevronDownIcon'}
          size={14}
          className="text-muted-foreground group-hover:text-foreground transition-colors flex-shrink-0"
        />
      </button>

      {/* Expanded panel */}
      {open && (
        <div className="border-t px-4 pb-4 pt-3 space-y-3">

          {/* Mode tabs */}
          <div className="todo-segmented todo-segmented-accent">
            <button
              onClick={() => switchMode('questions')}
              aria-pressed={mode === 'questions'}
              className="todo-segment"
            >
              <Icon name="QuestionMarkCircleIcon" size={13} />
              Generate Questions
            </button>
            <button
              onClick={() => switchMode('youtube')}
              aria-pressed={mode === 'youtube'}
              className="todo-segment"
            >
              <Icon name="PlayCircleIcon" size={13} />
              From YouTube Video
            </button>
          </div>

          {/* Shared context toggle */}
          <button
            onClick={() => setShowCtx(s => !s)}
            className="todo-focus flex items-center gap-1.5 rounded-md text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
          >
            <Icon name={showCtx ? 'ChevronDownIcon' : 'ChevronRightIcon'} size={11} />
            {showCtx ? 'Hide context' : 'Add context / document (optional)'}
          </button>

          {showCtx && (
            <textarea
              value={context}
              onChange={e => setContext(e.target.value)}
              placeholder={
                mode === 'questions'
                  ? 'Paste relevant notes, documentation, or any extra context to guide question generation…'
                  : 'Optional: extra notes to combine with the video — e.g. what to focus on, your current skill level…'
              }
              rows={4}
              className="todo-input px-3 py-2 text-sm resize-none scrollbar-clean"
            />
          )}

          {/* ── Generate Questions mode ── */}
          {mode === 'questions' && (
            <>
              <button
                onClick={generate}
                disabled={generating}
                className="todo-btn todo-btn-primary gap-2 px-4 py-2 text-sm"
              >
                {generating ? (
                  <span className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
                ) : (
                  <Icon name="SparklesIcon" size={14} />
                )}
                {generating ? 'Generating…' : 'Generate 5 Questions'}
              </button>

              {questions.length > 0 && (
                <div className="space-y-2">
                  <p className="lab-caption">
                    Generated — {activeCount} remaining
                  </p>
                  {questions.map((q, idx) =>
                    q.deleted ? null : (
                      <div
                        key={q.id}
                        className="flex items-start gap-2.5 px-3 py-2.5 rounded-lg mix-bg-foreground/[0.04] group"
                      >
                        <span className="flex-shrink-0 text-xs font-medium tabular-nums text-muted-foreground mt-0.5 w-5 text-right leading-5">
                          {idx + 1}
                        </span>
                        <p className="flex-1 text-sm text-foreground leading-relaxed min-w-0">{q.text}</p>
                        <div className="flex items-center gap-1.5 flex-shrink-0 mt-0.5">
                          <DifficultyTag difficulty={q.difficulty} />
                          <button
                            onClick={() => setQuestions(prev => prev.map(p => p.id === q.id ? { ...p, deleted: true } : p))}
                            title="Remove question"
                            aria-label="Remove question"
                            className={`todo-focus p-1 rounded-md text-muted-foreground hover:text-error hover:mix-bg-error/10 ${LAB_REVEAL}`}
                          >
                            <Icon name="XMarkIcon" size={13} />
                          </button>
                        </div>
                      </div>
                    )
                  )}

                  <div className="flex items-center gap-3 pt-1">
                    <button
                      onClick={saveToBank}
                      disabled={saving || activeCount === 0}
                      className="todo-btn gap-2 border px-4 py-2 text-sm hover:mix-bg-foreground/[0.04]"
                      style={{ borderColor: accent, color: accentInk }}
                    >
                      {saving ? (
                        <span className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
                      ) : (
                        <Icon name="BookmarkIcon" size={14} />
                      )}
                      {saving ? 'Saving…' : `Save ${activeCount} to Question Bank`}
                    </button>
                    <button
                      onClick={() => setQuestions([])}
                      className="todo-btn todo-btn-ghost"
                    >
                      Clear
                    </button>
                  </div>
                </div>
              )}

              {savedCount !== null && (
                <div data-semantic="done" className="flex items-center gap-2 px-3 py-2 rounded-lg mix-bg-success/10 text-xs font-medium text-foreground">
                  <Icon name="CheckCircleIcon" size={13} className="flex-shrink-0 text-success" />
                  <span>{savedCount} question{savedCount !== 1 ? 's' : ''} saved to Question Bank</span>
                </div>
              )}
            </>
          )}

          {/* ── From YouTube Video mode ── */}
          {mode === 'youtube' && (
            <>
              {!ytResult && (
                <div className="space-y-2.5">
                  <input
                    type="text"
                    value={youtubeUrl}
                    onChange={e => setYoutubeUrl(e.target.value)}
                    placeholder="https://www.youtube.com/watch?v=…"
                    className="todo-input px-3 py-2 text-sm"
                  />

                  {needsManualTranscript && (
                    <div className="space-y-1.5">
                      <p data-semantic="hint" className="text-xs font-medium text-foreground flex items-start gap-1.5">
                        <Icon name="ExclamationTriangleIcon" size={13} className="flex-shrink-0 mt-0.5 text-warning" />
                        Couldn&apos;t auto-fetch captions for this video. Paste the transcript (or a detailed summary) below.
                      </p>
                      <textarea
                        value={manualTranscript}
                        onChange={e => setManualTranscript(e.target.value)}
                        placeholder="Paste the video transcript here…"
                        rows={5}
                        className="todo-input px-3 py-2 text-sm resize-none scrollbar-clean"
                      />
                    </div>
                  )}

                  <button
                    onClick={generateFromYoutube}
                    disabled={ytGenerating || !youtubeUrl.trim()}
                    className="todo-btn todo-btn-primary gap-2 px-4 py-2 text-sm"
                  >
                    {ytGenerating ? (
                      <span className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
                    ) : (
                      <Icon name="SparklesIcon" size={14} />
                    )}
                    {ytGenerating ? 'Analyzing video…' : 'Generate Lab from Video'}
                  </button>
                </div>
              )}

              {ytResult && (
                <div className="space-y-3">
                  <div className="px-3 py-2.5 rounded-lg" style={{ background: accentSoft }}>
                    <p className="lab-caption mb-1" style={{ color: accentInk }}>New subtopic</p>
                    <p className="text-sm font-semibold text-foreground">{ytResult.subtopic.name}</p>
                    <p className="text-xs font-medium text-muted-foreground mt-0.5">{ytResult.subtopic.brief}</p>
                  </div>

                  <div className="rounded-lg border p-4 max-h-[24rem] overflow-y-auto scrollbar-clean">
                    <MarkdownLite content={ytResult.contentMarkdown} />
                  </div>

                  {ytResult.questions.length > 0 && (
                    <div className="space-y-2">
                      <p className="lab-caption">
                        Generated questions — {ytActiveCount} remaining
                      </p>
                      {ytResult.questions.map((q, idx) =>
                        q.deleted ? null : (
                          <div
                            key={q.id}
                            className="flex items-start gap-2.5 px-3 py-2.5 rounded-lg mix-bg-foreground/[0.04] group"
                          >
                            <span className="flex-shrink-0 text-xs font-medium tabular-nums text-muted-foreground mt-0.5 w-5 text-right leading-5">
                              {idx + 1}
                            </span>
                            <p className="flex-1 text-sm text-foreground leading-relaxed min-w-0">{q.text}</p>
                            <div className="flex items-center gap-1.5 flex-shrink-0 mt-0.5">
                              <DifficultyTag difficulty={q.difficulty} />
                              <button
                                onClick={() => setYtResult(prev => prev ? { ...prev, questions: prev.questions.map(p => p.id === q.id ? { ...p, deleted: true } : p) } : prev)}
                                title="Remove question"
                                aria-label="Remove question"
                                className={`todo-focus p-1 rounded-md text-muted-foreground hover:text-error hover:mix-bg-error/10 ${LAB_REVEAL}`}
                              >
                                <Icon name="XMarkIcon" size={13} />
                              </button>
                            </div>
                          </div>
                        )
                      )}
                    </div>
                  )}

                  <div className="flex items-center gap-3 pt-1">
                    <button
                      onClick={addYoutubeSubtopic}
                      disabled={ytSaving}
                      className="todo-btn gap-2 border px-4 py-2 text-sm hover:mix-bg-foreground/[0.04]"
                      style={{ borderColor: accent, color: accentInk }}
                    >
                      {ytSaving ? (
                        <span className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
                      ) : (
                        <Icon name="BookmarkIcon" size={14} />
                      )}
                      {ytSaving ? 'Saving…' : `Add to Topic${ytActiveCount ? ` & Save ${ytActiveCount} Question${ytActiveCount !== 1 ? 's' : ''}` : ''}`}
                    </button>
                    <button
                      onClick={() => setYtResult(null)}
                      className="todo-btn todo-btn-ghost"
                    >
                      Discard
                    </button>
                  </div>
                </div>
              )}

              {ytSaved && (
                <div data-semantic="done" className="flex items-center gap-2 px-3 py-2 rounded-lg mix-bg-success/10 text-xs font-medium text-foreground">
                  <Icon name="CheckCircleIcon" size={13} className="flex-shrink-0 text-success" />
                  <span>Subtopic added — ready to practice like any other subtopic.</span>
                </div>
              )}
            </>
          )}

          {/* Error (shared) */}
          {error && (
            <div role="alert" className="flex items-start gap-2 px-3 py-2 rounded-lg mix-bg-error/10 text-xs font-medium text-foreground">
              <Icon name="ExclamationTriangleIcon" size={13} className="flex-shrink-0 mt-0.5 text-error" />
              <span>{error}</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
