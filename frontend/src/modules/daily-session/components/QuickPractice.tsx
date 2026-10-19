'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import Icon from '@/components/ui/AppIcon';
import { questionsService, Question } from '@/lib/services/questionsService';
import CompanionBubble from '../companion/CompanionBubble';
import CompanionSettings from '../companion/CompanionSettings';
import CompanionControls from '../companion/CompanionControls';
import { useCompanionSettings } from '../companion/useCompanion';
import { isSoundscapePlaying, playSoundscape, setSoundscapeVolume, stopSoundscape, playChime } from '../companion/soundscape';
import { speak, stopSpeaking } from '../companion/voice';
import { line, Mood } from '../companion/content';
import { apiFetch, parseApiError } from '@/lib/http/apiClient';
import { defaultAIRequestFields } from '@/lib/services/settingsService';
import { isLoggedIn } from '@/lib/auth/tokenStore';
import { openLoginModal } from '@/components/auth/LoginModal';
import { DifficultyTag } from '@/modules/common/lab/LabTags';
import { DECK_CATEGORY, cardsFromAi, MAX_IMPORT_BYTES, loadDeck, mergeDeck, parseDeckJson, saveDeck, type ParseResult, type QuickCard } from './quickDeck';

const QUICK_FLASHCARD_POOL: QuickCard[] = [
  {
    question: 'What is the time and space complexity of accessing, inserting, and deleting in a Hash Map vs a Balanced BST?',
    answer: 'Hash Map: Average O(1) time for search/insert/delete, worst case O(N) on hash collisions. Space O(N).\nBalanced BST (e.g. Red-Black / AVL): Guaranteed O(log N) worst-case time for search/insert/delete. Maintains sorted order.',
    category: 'Interview',
    subType: 'DSA',
    difficulty: 'Easy',
  },
  {
    question: 'Explain the difference between L1 and L2 regularization and why L1 produces sparse feature weights.',
    answer: 'L1 (Lasso) adds absolute value of weights |w| to the loss, creating diamond-shaped constraint boundaries that intersect axes, driving non-essential coefficients to zero (sparsity).\nL2 (Ridge) adds squared weights w^2, shrinking weights toward zero smoothly without making them exactly zero.',
    category: 'Interview',
    subType: 'ML Scenario',
    difficulty: 'Medium',
  },
  {
    question: 'How does Non-Maximum Suppression (NMS) eliminate redundant bounding boxes in object detection?',
    answer: '1. Sort all predicted boxes by confidence score.\n2. Pick the box with highest confidence and save it to results.\n3. Compute Intersection-over-Union (IoU) between this top box and remaining boxes.\n4. Discard any box with IoU > threshold (e.g., 0.5).\n5. Repeat until no boxes remain.',
    category: 'CV Skill',
    subType: 'Deep Learning Vision',
    difficulty: 'Medium',
  },
  {
    question: 'What is the CAP Theorem and why can a distributed system only guarantee two of Consistency, Availability, and Partition Tolerance?',
    answer: 'Network partitions (P) are inevitable in real-world distributed networks.\nWhen a partition occurs, the system must choose between:\n- Consistency (C): Return an error or block to prevent returning stale data.\n- Availability (A): Continue serving reads/writes, returning potentially stale data without cross-network synchronization.',
    category: 'Interview',
    subType: 'System Design',
    difficulty: 'Medium',
  },
  {
    question: 'What are Intrinsic vs Extrinsic Camera Parameters in Computer Vision?',
    answer: 'Intrinsic Parameters: Internal camera optical properties (focal lengths fx, fy, optical centers cx, cy, skew factor).\nExtrinsic Parameters: Camera position and orientation relative to world frame (3x3 Rotation matrix R, 3x1 Translation vector T).',
    category: 'CV Skill',
    subType: 'Classical CV',
    difficulty: 'Medium',
  },
  {
    question: 'What is the vanishing gradient problem in Deep Neural Networks and how do Residual connections solve it?',
    answer: 'With deep chains of non-linear activations (like Sigmoid), gradients shrink exponentially during backpropagation.\nResidual connections (ResNet) provide a skip pathway: y = F(x) + x. The derivative contains dy/dx = dF/dx + 1, ensuring a gradient of at least 1 flows directly back to earlier layers.',
    category: 'CV Skill',
    subType: 'Deep Learning Vision',
    difficulty: 'Hard',
  },
  {
    question: 'How do you design an idempotent payment processing API endpoint?',
    answer: '1. Client generates a unique Idempotency-Key (UUID) with each transaction request.\n2. Server caches the key in Redis or ACID database before execution.\n3. If key is already processing or completed, return the cached result instead of re-charging.\n4. Use distributed locks with short TTL to handle concurrent retries.',
    category: 'Interview',
    subType: 'System Design',
    difficulty: 'Hard',
  },
];

export default function QuickPractice() {
  const [baseCards, setBaseCards] = useState<QuickCard[]>(QUICK_FLASHCARD_POOL);
  const [deck, setDeck] = useState<QuickCard[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isRevealed, setIsRevealed] = useState(false);
  const [categoryFilter, setCategoryFilter] = useState<string>('All');
  const [topicFilter, setTopicFilter] = useState('All');
  const cards = [...baseCards, ...deck];

  // Import panel
  const [importOpen, setImportOpen] = useState(false);
  const [importText, setImportText] = useState('');
  const [importFileName, setImportFileName] = useState('');
  const [importResult, setImportResult] = useState<ParseResult | null>(null);
  const [importNote, setImportNote] = useState<string | null>(null);
  const [converting, setConverting] = useState(false);
  useEffect(() => setDeck(loadDeck()), []);

  // Companion
  const [settings, updateSettings] = useCompanionSettings();
  const [sheetOpen, setSheetOpen] = useState(false);
  const [msg, setMsg] = useState('Quick round! Think first, then reveal. I believe in you.');
  const [msgMood, setMsgMood] = useState<Mood>('happy');

  const say = (text: string, m: Mood) => {
    setMsg(text);
    setMsgMood(m);
    if (settings.voiceOn && settings.mascotOn) speak(text, settings.voicePreset, settings.voiceURI);
  };

  // Start the focus sound on the first tap (browsers block audio before a gesture); silence on leave.
  const ensureSound = () => {
    if (settings.sound !== 'off' && !settings.soundMuted && !isSoundscapePlaying()) {
      playSoundscape(settings.sound);
      setSoundscapeVolume(settings.volume);
    }
  };
  useEffect(() => () => { stopSoundscape(); stopSpeaking(); }, []);

  // Blitz Score
  const [streak, setStreak] = useState(0);
  const [masteredCount, setMasteredCount] = useState(0);
  const [reviewCount, setReviewCount] = useState(0);
  const [isSyncingToBank, setIsSyncingToBank] = useState(false);

  // Try to load additional cards from backend
  useEffect(() => {
    async function loadDbQuestions() {
      try {
        const dbQs = await questionsService.getAll();
        if (dbQs && dbQs.length > 0) {
          const mapped = dbQs.map((q) => ({
            question: q.questionText,
            answer: `Category: ${q.category} (${q.subType})\nDifficulty: ${q.difficulty}.\n\nFormulate your core approach, list the key data structures or architectural blocks, discuss trade-offs, and double check edge cases.`,
            category: q.category,
            subType: q.subType,
            difficulty: q.difficulty,
          }));
          // Combine with our rich prompt cards
          setBaseCards([...QUICK_FLASHCARD_POOL, ...mapped]);
        }
      } catch (e) {
        // Fallback remains active
      }
    }
    loadDbQuestions();
  }, []);

  const deckTopics = [...new Set(deck.map((c) => c.subType))].sort();
  const filteredCards = cards.filter((c) => {
    if (categoryFilter !== 'All' && c.category !== categoryFilter) return false;
    if (categoryFilter === DECK_CATEGORY && topicFilter !== 'All' && c.subType !== topicFilter) return false;
    return true;
  });

  const pickFile = async (file: File | undefined) => {
    if (!file) return;
    setImportNote(null);
    if (file.size > MAX_IMPORT_BYTES) {
      setImportResult({ cards: [], skipped: [], error: 'That file is over 2 MB. Split it into smaller decks.' });
      return;
    }
    const text = await file.text();
    setImportFileName(file.name);
    setImportText(text);
    setImportResult(parseDeckJson(text));
  };

  const convertWithAi = async () => {
    if (!importText.trim()) return;
    if (!isLoggedIn()) {
      openLoginModal({ feature: 'AI import', redirectTo: `${window.location.pathname}${window.location.search}` });
      return;
    }
    setConverting(true);
    try {
      const res = await apiFetch('/sessions/convert-flashcards', {
        method: 'POST',
        body: JSON.stringify({ text: importText, ...defaultAIRequestFields() }),
      });
      if (!res.ok) throw new Error(await parseApiError(res));
      const data = await res.json();
      const cards = cardsFromAi(data.cards ?? []);
      if (!cards.length) {
        setImportResult({ cards: [], skipped: [], error: 'The AI could not find any question/answer pairs in that text.' });
      } else {
        const notes = [data.truncated ? 'Only the first ~40,000 characters were converted.' : '', data.failed_chunks ? `${data.failed_chunks} part(s) could not be converted.` : ''].filter(Boolean);
        setImportResult({ cards, skipped: notes.map((reason, i) => ({ index: i + 1, reason })), format: 'Converted by AI. Check the cards before relying on them' });
      }
    } catch (e: any) {
      setImportResult({ cards: [], skipped: [], error: e?.message || 'AI conversion failed.' });
    } finally {
      setConverting(false);
    }
  };

  const applyImport = async (mode: 'add' | 'replace') => {
    if (!importResult || importResult.error || !importResult.cards.length) return;
    setIsSyncingToBank(true);
    const next = mode === 'replace' ? importResult.cards : mergeDeck(deck, importResult.cards);
    if (!saveDeck(next)) {
      setImportResult({ ...importResult, error: 'Your browser would not store this deck (storage is full or disabled).' });
      setIsSyncingToBank(false);
      return;
    }
    setDeck(next);
    setCategoryFilter(DECK_CATEGORY);
    setTopicFilter('All');
    setCurrentIndex(0);
    setIsRevealed(false);

    let bankSyncNote = '';
    try {
      const payload = {
        date: importResult.date || new Date().toISOString().split('T')[0],
        session: importResult.session || 'Quick Practice Deck',
        format: importResult.deckFormat || '2-minute quick learning',
        questions: importResult.cards.map((c, idx) => ({
          id: c.sourceId || idx + 1,
          topic: c.subType,
          title: c.title,
          question: c.question,
          answer: c.answer,
          remember: c.remember,
          example: c.example,
          formula: c.formula,
          interview_tip: c.interviewTip,
          tradeoffs: c.tradeoffs,
          checklist: c.checklist,
          steps: c.steps,
          difficulty: c.difficulty || 'Medium',
        })),
      };

      const res = await questionsService.importDeck(payload);
      if (res && res.success) {
        if (res.inserted > 0 && res.duplicates > 0) {
          bankSyncNote = ` · Saved ${res.inserted} new questions to Question Bank (${res.duplicates} existing duplicates skipped).`;
        } else if (res.inserted > 0) {
          bankSyncNote = ` · Saved ${res.inserted} question(s) to Question Bank.`;
        } else if (res.duplicates > 0) {
          bankSyncNote = ` · All ${res.duplicates} question(s) already in Question Bank.`;
        }
      }
    } catch (err) {
      console.error('Failed to sync questions to Question Bank:', err);
      bankSyncNote = ' · (Deck loaded in practice; Question Bank sync unavailable).';
    } finally {
      setIsSyncingToBank(false);
    }

    setImportNote(`${mode === 'replace' ? 'Replaced your deck with' : 'Added'} ${importResult.cards.length} card${importResult.cards.length === 1 ? '' : 's'}.${bankSyncNote}`);
    setImportText('');
    setImportFileName('');
    setImportResult(null);
    setImportOpen(false);
    say(`Deck loaded with ${next.length} cards and synced to Question Bank!`, 'cheer');
  };

  const clearDeck = () => {
    if (!window.confirm(`Remove all ${deck.length} cards from your uploaded deck?`)) return;
    saveDeck([]);
    setDeck([]);
    setCategoryFilter('All');
    setTopicFilter('All');
    setCurrentIndex(0);
    setIsRevealed(false);
  };

  const currentCard = filteredCards[currentIndex % filteredCards.length] || QUICK_FLASHCARD_POOL[0];

  const handleNext = () => {
    setIsRevealed(false);
    setCurrentIndex((prev) => (prev + 1) % filteredCards.length);
  };

  const handleShuffle = () => {
    setIsRevealed(false);
    const randomIndex = Math.floor(Math.random() * filteredCards.length);
    setCurrentIndex(randomIndex);
  };

  const handleGotIt = () => {
    setMasteredCount((prev) => prev + 1);
    setStreak((prev) => prev + 1);
    if (settings.chimes && !settings.soundMuted) playChime('good', settings.volume);
    say(line('nailed'), 'cheer');
    handleNext();
  };

  const handleNeedsReview = () => {
    setReviewCount((prev) => prev + 1);
    setStreak(0);
    if (settings.chimes && !settings.soundMuted) playChime('soft', settings.volume);
    say(line('review'), 'comfort');
    handleNext();
  };

  return (
    <div className="mx-auto max-w-3xl space-y-[1.5rem] animate-fade-in">
      <div className="flex items-end justify-between gap-3">
        <div className="flex-1">
          <CompanionBubble text={msg} mood={msgMood} onSpeak={() => say(msg, msgMood)} />
        </div>
        <CompanionControls settings={settings} update={updateSettings} onOpenSettings={() => setSheetOpen(true)} />
      </div>
      <CompanionSettings open={sheetOpen} onClose={() => setSheetOpen(false)} settings={settings} update={updateSettings} />
      {/* Top Blitz Scoreboard: one quiet row (caption over value), no tinted tiles */}
      <div className="grid grid-cols-3 divide-x divide-border">
        <div className="pr-3">
          <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Streak</div>
          <div className="mt-0.5 flex items-center gap-1 text-lg font-semibold tabular-nums text-foreground">
            {streak}
            <Icon name="FireIcon" size={18} variant="solid" className="text-amber-500" aria-hidden="true" />
          </div>
        </div>

        <div className="px-3 sm:px-[1.5rem]">
          <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Mastered</div>
          <div className="mt-0.5 text-lg font-semibold tabular-nums text-foreground">{masteredCount}</div>
        </div>

        <div className="pl-3 sm:pl-[1.5rem]">
          <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Review</div>
          <div className="mt-0.5 text-lg font-semibold tabular-nums text-foreground">{reviewCount}</div>
        </div>
      </div>

      {/* Filter and Shuffle Row */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="todo-segmented todo-segmented-accent flex-wrap">
          {(['All', 'Interview', 'CV Skill', ...(deck.length ? [DECK_CATEGORY] : [])]).map((cat) => (
            <button
              key={cat}
              type="button"
              onClick={() => {
                setCategoryFilter(cat);
                setTopicFilter('All');
                setCurrentIndex(0);
                setIsRevealed(false);
              }}
              aria-pressed={categoryFilter === cat}
              className="todo-segment"
            >
              {cat === 'All' ? 'All Questions' : cat === DECK_CATEGORY ? `${DECK_CATEGORY} (${deck.length})` : cat}
            </button>
          ))}
        </div>

        {categoryFilter === DECK_CATEGORY && deckTopics.length > 1 && (
          <select
            value={topicFilter}
            onChange={(e) => {
              setTopicFilter(e.target.value);
              setCurrentIndex(0);
              setIsRevealed(false);
            }}
            aria-label="Filter deck by topic"
            className="todo-focus rounded-lg border border-border bg-card px-3 py-1.5 text-xs font-semibold text-foreground"
          >
            <option value="All">All topics</option>
            {deckTopics.map((t) => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
        )}

        <button
          type="button"
          onClick={() => {
            setImportOpen((o) => !o);
            setImportNote(null);
          }}
          aria-expanded={importOpen}
          className="todo-btn todo-btn-secondary"
        >
          <Icon name="ArrowUpTrayIcon" size={14} />
          Import JSON
        </button>

        <button
          type="button"
          onClick={handleShuffle}
          className="todo-btn todo-btn-secondary"
        >
          <Icon name="ArrowPathIcon" size={14} />
          Random Shuffle
        </button>
      </div>

      {importNote && !importOpen && (
        <div className="flex items-center justify-between gap-3 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-2.5 text-xs font-semibold text-emerald-700 dark:text-emerald-300">
          <span>{importNote}</span>
          {deck.length > 0 && (
            <button type="button" onClick={clearDeck} className="underline">Remove my deck</button>
          )}
        </div>
      )}

      {importOpen && (
        <div className="space-y-3 rounded-xl border border-border bg-card p-4 animate-fade-in">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h4 className="text-sm font-bold text-foreground flex items-center gap-2">
                <span>Import Flashcard Deck</span>
                <span className="rounded-full px-2 py-0.5 text-xs font-medium lab-tint lab-ink ring-1 ring-inset mix-ring-primary/25">
                  Auto-syncs to Question Bank
                </span>
              </h4>
              <p className="mt-1 text-xs text-muted-foreground leading-relaxed">
                Upload or paste your JSON format with <code>date</code>, <code>session</code>, <code>format</code>, and <code>questions</code>.
                Rich fields supported: <code>title</code>, <code>topic</code>, <code>question</code>, <code>answer</code>, <code>remember</code>, <code>example</code>, <code>interview_tip</code>, <code>tradeoffs</code>, <code>checklist</code>, <code>steps</code>, and <code>formula</code>.
                Questions are loaded into your practice deck and automatically saved to your Question Bank with SQL deduplication.
              </p>
            </div>
            <button type="button" onClick={() => setImportOpen(false)} aria-label="Close import" className="todo-focus rounded-md p-1 text-muted-foreground hover:text-foreground"><Icon name="XMarkIcon" size={16} /></button>
          </div>

          <label className="flex cursor-pointer items-center justify-between gap-3 rounded-xl border-2 border-dashed border-border px-4 py-3 text-xs font-semibold text-muted-foreground hover:mix-border-primary/50">
            <span>{importFileName || 'Choose a JSON file (.json, .txt, .csv, .md)…'}</span>
            <span className="rounded-lg px-2.5 py-1 lab-tint lab-ink">Browse</span>
            <input type="file" accept=".json,.jsonl,.csv,.tsv,.txt,.md,application/json,text/plain,text/csv" className="hidden" onChange={(e) => { void pickFile(e.target.files?.[0]); e.target.value = ''; }} />
          </label>

          <textarea
            value={importText}
            spellCheck={false}
            onChange={(e) => {
              setImportText(e.target.value);
              setImportFileName('');
              setImportResult(e.target.value.trim() ? parseDeckJson(e.target.value) : null);
            }}
            rows={8}
            placeholder={`{\n  "date": "2026-09-22",\n  "session": "Daily Interview Revision",\n  "format": "2-minute quick learning",\n  "questions": [\n    {\n      "id": 1,\n      "topic": "DSA",\n      "title": "Sliding Window",\n      "question": "When should you use a sliding window?",\n      "answer": "Use it for contiguous subarrays or substrings when you can maintain a condition while expanding and shrinking the window.",\n      "remember": [\n        "Expand right",\n        "Shrink left when constraint breaks",\n        "Often reduces O(n²) to O(n)"\n      ],\n      "example": "Longest substring without repeating characters.",\n      "interview_tip": "First ask whether the problem involves a contiguous range."\n    }\n  ]\n}`}
            aria-label="Paste flashcards JSON"
            className="todo-input resize-y px-3.5 py-2.5 font-mono text-xs"
          />

          {importResult?.error && <p className="rounded-lg bg-rose-500/10 px-3 py-2 text-xs font-semibold text-rose-600 dark:text-rose-300">{importResult.error}</p>}
          {importText.trim() && (!importResult || importResult.error) && (
            <button
              type="button"
              onClick={convertWithAi}
              disabled={converting}
              className="todo-focus inline-flex items-center gap-2 rounded-lg border mix-border-primary/30 lab-tint px-4 py-2 text-xs font-semibold lab-ink disabled:opacity-60"
            >
              {converting ? 'Converting…' : (
                <>
                  <Icon name="SparklesIcon" size={14} />
                  Convert with AI
                </>
              )}
              <span className="font-medium opacity-70">restructures your text, adds nothing</span>
            </button>
          )}
          {importResult && !importResult.error && (
            <div className="space-y-1.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20 px-3.5 py-2.5 text-xs text-emerald-800 dark:text-emerald-300">
              <div className="flex flex-wrap items-center justify-between gap-1.5 font-bold">
                <span>
                  Found {importResult.cards.length} card{importResult.cards.length === 1 ? '' : 's'}
                  {importResult.skipped.length > 0 && ` · skipped ${importResult.skipped.length}`}
                </span>
                {(importResult.date || importResult.session) && (
                  <span className="text-[11px] font-normal opacity-90">
                    {importResult.session && `Session: ${importResult.session}`}
                    {importResult.date && ` (${importResult.date})`}
                  </span>
                )}
              </div>
              <div className="text-[11px] text-emerald-600 dark:text-emerald-400">
                ✓ Cards will be loaded into Quick Practice & stored in SQLite Question Bank.
              </div>
              {importResult.format && <div className="opacity-80 text-[11px]">Format: {importResult.format}</div>}
              {importResult.skipped.slice(0, 5).map((k) => (
                <div key={k.index} className="text-amber-700 dark:text-amber-300 text-[11px]">Item {k.index}: {k.reason}</div>
              ))}
              {importResult.skipped.length > 5 && <div className="text-amber-700 dark:text-amber-300 text-[11px]">…and {importResult.skipped.length - 5} more.</div>}
            </div>
          )}

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              disabled={!importResult || !!importResult.error || isSyncingToBank}
              onClick={() => applyImport('add')}
              className="todo-btn todo-btn-primary px-4 py-2"
            >
              {isSyncingToBank ? (
                <>
                  <Icon name="ArrowPathIcon" size={13} className="animate-spin" />
                  Saving to Question Bank...
                </>
              ) : deck.length ? (
                'Add to my deck & Question Bank'
              ) : (
                'Import deck & save to Question Bank'
              )}
            </button>
            {deck.length > 0 && (
              <>
                <button
                  type="button"
                  disabled={!importResult || !!importResult.error || isSyncingToBank}
                  onClick={() => applyImport('replace')}
                  className="todo-btn todo-btn-secondary px-4 py-2"
                >
                  Replace my deck
                </button>
                <button type="button" onClick={clearDeck} className="ml-auto text-xs font-semibold text-rose-500 hover:underline">
                  Remove my deck ({deck.length})
                </button>
              </>
            )}
          </div>
        </div>
      )}

      {/* Main Flashcard Container */}
      <div className="relative min-h-[340px] rounded-xl border border-border bg-card p-4 sm:p-[2rem] flex flex-col justify-between">

        {/* Card Header Meta */}
        <div>
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border pb-4">
            <div className="flex items-center gap-2">
              <span className="rounded-full px-2.5 py-1 text-xs font-semibold lab-tint lab-ink">
                {currentCard.category}
              </span>
              <span className="rounded-full mix-bg-foreground/[0.06] px-2.5 py-1 text-xs font-medium text-foreground">
                {currentCard.subType}
              </span>
              {currentCard.difficulty && <DifficultyTag difficulty={currentCard.difficulty} />}
              {currentCard.imported && (
                <span className="rounded-md bg-emerald-500/10 border border-emerald-500/20 text-emerald-700 dark:text-emerald-300 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wider">
                  Deck & Bank
                </span>
              )}
            </div>
            <span className="text-xs font-medium text-muted-foreground">
              Card {currentIndex + 1} of {filteredCards.length}
            </span>
          </div>

          {/* Question Text */}
          <div className="my-[1.5rem]">
            {currentCard.title && (
              <div className="mb-1.5 text-xs font-semibold uppercase tracking-wider lab-ink">{currentCard.title}</div>
            )}
            <h3 className="font-heading text-lg sm:text-2xl font-semibold text-foreground leading-relaxed">
              {currentCard.question}
            </h3>
          </div>
        </div>

        {/* Revealed Answer Box */}
        {isRevealed ? (
          <div className="my-4 rounded-xl border border-emerald-500/25 bg-emerald-500/5 p-5 animate-fade-in space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 font-semibold text-emerald-700 dark:text-emerald-300 text-xs sm:text-sm">
                <Icon name="CheckCircleIcon" size={18} variant="solid" />
                Model Answer & Key Takeaway:
              </div>
              <Link
                href="/daily-session?tab=question-bank"
                className="text-xs font-semibold lab-ink hover:underline flex items-center gap-1"
              >
                Question Bank
                <Icon name="ArrowTopRightOnSquareIcon" size={12} />
              </Link>
            </div>
            <div className="text-xs sm:text-sm text-foreground whitespace-pre-line leading-relaxed font-body">
              {currentCard.answer}
            </div>

            {/* Formula */}
            {currentCard.formula && (
              <div className="rounded-lg mix-bg-foreground/[0.05] px-3.5 py-2.5">
                <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                  <Icon name="CalculatorIcon" size={13} />
                  Formula
                </div>
                <div className="mt-1 font-mono text-xs sm:text-sm text-foreground whitespace-pre-line">{currentCard.formula}</div>
              </div>
            )}

            {/* Example */}
            {currentCard.example && (
              <div className="rounded-lg mix-bg-foreground/[0.05] px-3.5 py-2 text-xs sm:text-sm text-foreground leading-relaxed">
                <span className="font-semibold text-foreground">Example: </span>{currentCard.example}
              </div>
            )}

            {/* Remember */}
            {currentCard.remember && currentCard.remember.length > 0 && (
              <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-3.5 py-2.5">
                <div className="text-[11px] font-semibold uppercase tracking-wider text-amber-700 dark:text-amber-300 flex items-center gap-1.5">
                  <Icon name="LightBulbIcon" size={13} />
                  Remember
                </div>
                <ul className="mt-1 list-disc space-y-0.5 pl-4 text-xs sm:text-sm text-foreground">
                  {currentCard.remember.map((r, i) => (
                    <li key={i}>{r}</li>
                  ))}
                </ul>
              </div>
            )}

            {/* Interview Tip */}
            {currentCard.interviewTip && (
              <div className="rounded-xl border mix-border-primary/30 lab-tint px-3.5 py-2.5">
                <div className="text-[11px] font-semibold uppercase tracking-wider lab-ink flex items-center gap-1.5">
                  <Icon name="SparklesIcon" size={13} />
                  Interview Tip
                </div>
                <div className="mt-1 text-xs sm:text-sm font-medium text-foreground leading-relaxed">
                  {currentCard.interviewTip}
                </div>
              </div>
            )}

            {/* Trade-offs */}
            {currentCard.tradeoffs && currentCard.tradeoffs.length > 0 && (
              <div className="rounded-xl border border-orange-500/30 bg-orange-500/10 px-3.5 py-2.5">
                <div className="text-[11px] font-semibold uppercase tracking-wider text-orange-700 dark:text-orange-300 flex items-center gap-1.5">
                  <Icon name="ScaleIcon" size={13} />
                  Key Trade-offs
                </div>
                <ul className="mt-1 list-disc space-y-0.5 pl-4 text-xs sm:text-sm text-foreground">
                  {currentCard.tradeoffs.map((t, i) => (
                    <li key={i}>{t}</li>
                  ))}
                </ul>
              </div>
            )}

            {/* Checklist */}
            {currentCard.checklist && currentCard.checklist.length > 0 && (
              <div className="rounded-xl border border-cyan-500/30 bg-cyan-500/10 px-3.5 py-2.5">
                <div className="text-[11px] font-semibold uppercase tracking-wider text-cyan-700 dark:text-cyan-300 flex items-center gap-1.5">
                  <Icon name="ClipboardDocumentCheckIcon" size={13} />
                  Checklist
                </div>
                <ul className="mt-1 list-disc space-y-0.5 pl-4 text-xs sm:text-sm text-foreground">
                  {currentCard.checklist.map((c, i) => (
                    <li key={i}>{c}</li>
                  ))}
                </ul>
              </div>
            )}

            {/* Steps */}
            {currentCard.steps && currentCard.steps.length > 0 && (
              <div className="rounded-xl border border-border mix-bg-foreground/[0.05] px-3.5 py-2.5">
                <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                  <Icon name="QueueListIcon" size={13} />
                  Execution Steps
                </div>
                <ol className="mt-1 list-decimal space-y-0.5 pl-4 text-xs sm:text-sm text-foreground">
                  {currentCard.steps.map((s, i) => (
                    <li key={i}>{s}</li>
                  ))}
                </ol>
              </div>
            )}
          </div>
        ) : (
          <div className="my-[1.5rem] flex items-center justify-center">
            <button
              type="button"
              onClick={() => { ensureSound(); setIsRevealed(true); }}
              className="todo-btn todo-btn-primary gap-2 px-[2rem] py-4 text-sm"
            >
              <Icon name="EyeIcon" size={18} variant="solid" />
              Reveal Answer
            </button>
          </div>
        )}

        {/* Card Footer Actions */}
        <div className="border-t border-border pt-4 flex flex-col sm:flex-row items-center justify-between gap-3">
          {isRevealed ? (
            <>
              <div className="text-xs font-medium text-muted-foreground">
                How did you do on this question?
              </div>
              <div className="flex items-center gap-2 w-full sm:w-auto">
                <button
                  type="button"
                  onClick={handleNeedsReview}
                  className="flex-1 sm:flex-initial inline-flex items-center justify-center gap-1.5 rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-2.5 text-xs font-bold text-rose-500 hover:bg-rose-500/20 transition-colors"
                >
                  <Icon name="XMarkIcon" size={15} />
                  Needs Review
                </button>
                <button
                  type="button"
                  onClick={handleGotIt}
                  className="flex-1 sm:flex-initial inline-flex items-center justify-center gap-1.5 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-5 py-2.5 text-xs font-bold text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/20 transition-colors"
                >
                  <Icon name="CheckIcon" size={15} />
                  Nailed It!
                </button>
              </div>
            </>
          ) : (
            <div className="flex w-full items-center justify-between">
              <span className="text-xs text-muted-foreground">
                Take 30 seconds to formulate your answer mentally before revealing.
              </span>
              <button
                type="button"
                onClick={handleNext}
                className="todo-focus inline-flex items-center gap-1 text-xs font-semibold lab-ink hover:underline"
              >
                Skip Question
                <Icon name="ChevronRightIcon" size={14} />
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
