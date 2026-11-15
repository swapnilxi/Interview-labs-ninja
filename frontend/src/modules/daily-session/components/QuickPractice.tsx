'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import Icon from '@/components/ui/AppIcon';
import { questionsService } from '@/lib/services/questionsService';
import CompanionBubble from '../companion/CompanionBubble';
import CompanionSettings from '../companion/CompanionSettings';
import CompanionControls from '../companion/CompanionControls';
import { useCompanionSettings } from '../companion/useCompanion';
import {
  isSoundscapePlaying,
  playSoundscape,
  setSoundscapeVolume,
  stopSoundscape,
  playChime,
} from '../companion/soundscape';
import { speak, stopSpeaking } from '../companion/voice';
import { line, Mood } from '../companion/content';
import { apiFetch, parseApiError } from '@/lib/http/apiClient';
import { defaultAIRequestFields } from '@/lib/services/settingsService';
import { isLoggedIn } from '@/lib/auth/tokenStore';
import { openLoginModal } from '@/components/auth/LoginModal';
import Modal from '@/components/ui/Modal';
import { DifficultyChip, toneClass, type Tone } from './ds';
import {
  DECK_CATEGORY,
  cardsFromAi,
  MAX_IMPORT_BYTES,
  loadDeck,
  mergeDeck,
  parseDeckJson,
  saveDeck,
  type ParseResult,
  type QuickCard,
} from './quickDeck';

const QUICK_FLASHCARD_POOL: QuickCard[] = [
  {
    question:
      'What is the time and space complexity of accessing, inserting, and deleting in a Hash Map vs a Balanced BST?',
    answer:
      'Hash Map: Average O(1) time for search/insert/delete, worst case O(N) on hash collisions. Space O(N).\nBalanced BST (e.g. Red-Black / AVL): Guaranteed O(log N) worst-case time for search/insert/delete. Maintains sorted order.',
    category: 'Interview',
    subType: 'DSA',
    difficulty: 'Easy',
  },
  {
    question:
      'Explain the difference between L1 and L2 regularization and why L1 produces sparse feature weights.',
    answer:
      'L1 (Lasso) adds absolute value of weights |w| to the loss, creating diamond-shaped constraint boundaries that intersect axes, driving non-essential coefficients to zero (sparsity).\nL2 (Ridge) adds squared weights w^2, shrinking weights toward zero smoothly without making them exactly zero.',
    category: 'Interview',
    subType: 'ML Scenario',
    difficulty: 'Medium',
  },
  {
    question:
      'How does Non-Maximum Suppression (NMS) eliminate redundant bounding boxes in object detection?',
    answer:
      '1. Sort all predicted boxes by confidence score.\n2. Pick the box with highest confidence and save it to results.\n3. Compute Intersection-over-Union (IoU) between this top box and remaining boxes.\n4. Discard any box with IoU > threshold (e.g., 0.5).\n5. Repeat until no boxes remain.',
    category: 'CV Skill',
    subType: 'Deep Learning Vision',
    difficulty: 'Medium',
  },
  {
    question:
      'What is the CAP Theorem and why can a distributed system only guarantee two of Consistency, Availability, and Partition Tolerance?',
    answer:
      'Network partitions (P) are inevitable in real-world distributed networks.\nWhen a partition occurs, the system must choose between:\n- Consistency (C): Return an error or block to prevent returning stale data.\n- Availability (A): Continue serving reads/writes, returning potentially stale data without cross-network synchronization.',
    category: 'Interview',
    subType: 'System Design',
    difficulty: 'Medium',
  },
  {
    question: 'What are Intrinsic vs Extrinsic Camera Parameters in Computer Vision?',
    answer:
      'Intrinsic Parameters: Internal camera optical properties (focal lengths fx, fy, optical centers cx, cy, skew factor).\nExtrinsic Parameters: Camera position and orientation relative to world frame (3x3 Rotation matrix R, 3x1 Translation vector T).',
    category: 'CV Skill',
    subType: 'Classical CV',
    difficulty: 'Medium',
  },
  {
    question:
      'What is the vanishing gradient problem in Deep Neural Networks and how do Residual connections solve it?',
    answer:
      'With deep chains of non-linear activations (like Sigmoid), gradients shrink exponentially during backpropagation.\nResidual connections (ResNet) provide a skip pathway: y = F(x) + x. The derivative contains dy/dx = dF/dx + 1, ensuring a gradient of at least 1 flows directly back to earlier layers.',
    category: 'CV Skill',
    subType: 'Deep Learning Vision',
    difficulty: 'Hard',
  },
  {
    question: 'How do you design an idempotent payment processing API endpoint?',
    answer:
      '1. Client generates a unique Idempotency-Key (UUID) with each transaction request.\n2. Server caches the key in Redis or ACID database before execution.\n3. If key is already processing or completed, return the cached result instead of re-charging.\n4. Use distributed locks with short TTL to handle concurrent retries.',
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
  useEffect(
    () => () => {
      stopSoundscape();
      stopSpeaking();
    },
    []
  );

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
      } catch {
        // Fallback remains active
      }
    }
    loadDbQuestions();
  }, []);

  const deckTopics = [...new Set(deck.map((c) => c.subType))].sort();
  const filteredCards = cards.filter((c) => {
    if (categoryFilter !== 'All' && c.category !== categoryFilter) return false;
    if (categoryFilter === DECK_CATEGORY && topicFilter !== 'All' && c.subType !== topicFilter)
      return false;
    return true;
  });

  const pickFile = async (file: File | undefined) => {
    if (!file) return;
    setImportNote(null);
    if (file.size > MAX_IMPORT_BYTES) {
      setImportResult({
        cards: [],
        skipped: [],
        error: 'That file is over 2 MB. Split it into smaller decks.',
      });
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
      openLoginModal({
        feature: 'AI import',
        redirectTo: `${window.location.pathname}${window.location.search}`,
      });
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
        setImportResult({
          cards: [],
          skipped: [],
          error: 'The AI could not find any question/answer pairs in that text.',
        });
      } else {
        const notes = [
          data.truncated ? 'Only the first ~40,000 characters were converted.' : '',
          data.failed_chunks ? `${data.failed_chunks} part(s) could not be converted.` : '',
        ].filter(Boolean);
        setImportResult({
          cards,
          skipped: notes.map((reason, i) => ({ index: i + 1, reason })),
          format: 'Converted by AI. Check the cards before relying on them',
        });
      }
    } catch (e: unknown) {
      setImportResult({
        cards: [],
        skipped: [],
        error: (e as { message?: string } | null)?.message || 'AI conversion failed.',
      });
    } finally {
      setConverting(false);
    }
  };

  const applyImport = async (mode: 'add' | 'replace') => {
    if (!importResult || importResult.error || !importResult.cards.length) return;
    setIsSyncingToBank(true);
    const next = mode === 'replace' ? importResult.cards : mergeDeck(deck, importResult.cards);
    if (!saveDeck(next)) {
      setImportResult({
        ...importResult,
        error: 'Your browser would not store this deck (storage is full or disabled).',
      });
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

    setImportNote(
      `${mode === 'replace' ? 'Replaced your deck with' : 'Added'} ${importResult.cards.length} card${importResult.cards.length === 1 ? '' : 's'}.${bankSyncNote}`
    );
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

  const canImport = !!importResult && !importResult.error && importResult.cards.length > 0;
  const categories = ['All', 'Interview', 'CV Skill', ...(deck.length ? [DECK_CATEGORY] : [])];
  const categoryLabel = (cat: string) =>
    cat === 'All'
      ? 'All'
      : cat === 'CV Skill'
        ? 'CV skill'
        : cat === DECK_CATEGORY
          ? 'My deck'
          : cat;

  // What the revealed answer carries beyond the model answer, as rows of one inset group.
  const extras: { key: string; icon: string; tone: Tone; title: string; body: React.ReactNode }[] =
    [];
  if (currentCard.formula) {
    extras.push({
      key: 'formula',
      icon: 'CalculatorIcon',
      tone: 'neutral',
      title: 'Formula',
      body: <p className="bs-mono">{currentCard.formula}</p>,
    });
  }
  if (currentCard.example) {
    extras.push({
      key: 'example',
      icon: 'BookOpenIcon',
      tone: 'neutral',
      title: 'Example',
      body: <p>{currentCard.example}</p>,
    });
  }
  if (currentCard.remember?.length) {
    extras.push({
      key: 'remember',
      icon: 'LightBulbIcon',
      tone: 'gold',
      title: 'Remember',
      body: (
        <ul className="bs-bullets">
          {currentCard.remember.map((r, i) => (
            <li key={i}>{r}</li>
          ))}
        </ul>
      ),
    });
  }
  if (currentCard.interviewTip) {
    extras.push({
      key: 'tip',
      icon: 'SparklesIcon',
      tone: 'indigo',
      title: 'Interview tip',
      body: <p>{currentCard.interviewTip}</p>,
    });
  }
  if (currentCard.tradeoffs?.length) {
    extras.push({
      key: 'tradeoffs',
      icon: 'ScaleIcon',
      tone: 'neutral',
      title: 'Key trade-offs',
      body: (
        <ul className="bs-bullets">
          {currentCard.tradeoffs.map((t, i) => (
            <li key={i}>{t}</li>
          ))}
        </ul>
      ),
    });
  }
  if (currentCard.checklist?.length) {
    extras.push({
      key: 'checklist',
      icon: 'ClipboardDocumentCheckIcon',
      tone: 'jade',
      title: 'Checklist',
      body: (
        <ul className="bs-bullets">
          {currentCard.checklist.map((c, i) => (
            <li key={i}>{c}</li>
          ))}
        </ul>
      ),
    });
  }
  if (currentCard.steps?.length) {
    extras.push({
      key: 'steps',
      icon: 'QueueListIcon',
      tone: 'neutral',
      title: 'Steps',
      body: (
        <ol className="bs-bullets">
          {currentCard.steps.map((s, i) => (
            <li key={i}>{s}</li>
          ))}
        </ol>
      ),
    });
  }

  return (
    <div className="bs-blitz">
      {/* Deepu on one line: mascot, bubble, sound and settings */}
      <div data-area="coach" className="flex min-w-0 items-center gap-2">
        <div className="min-w-0 flex-1">
          <CompanionBubble text={msg} mood={msgMood} size={40} onSpeak={() => say(msg, msgMood)} />
        </div>
        <CompanionControls
          settings={settings}
          update={updateSettings}
          onOpenSettings={() => setSheetOpen(true)}
        />
      </div>
      <CompanionSettings
        open={sheetOpen}
        onClose={() => setSheetOpen(false)}
        settings={settings}
        update={updateSettings}
      />

      {/* Which cards: one segmented control (plus a topic menu for an uploaded deck) */}
      <div data-area="tools" className="min-w-0 space-y-3">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <div className="ds-seg ds-seg-inline bs-seg" role="group" aria-label="Show cards from">
            {categories.map((cat) => (
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
              >
                {categoryLabel(cat)}
                {cat === DECK_CATEGORY && <small className="ds-num">{deck.length}</small>}
              </button>
            ))}
          </div>

          {categoryFilter === DECK_CATEGORY && deckTopics.length > 1 && (
            <label className="bs-select-wrap w-full sm:w-auto">
              <span className="sr-only">Filter deck by topic</span>
              <select
                value={topicFilter}
                onChange={(e) => {
                  setTopicFilter(e.target.value);
                  setCurrentIndex(0);
                  setIsRevealed(false);
                }}
                className="bs-select"
              >
                <option value="All">All topics</option>
                {deckTopics.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
              <Icon name="ChevronUpDownIcon" size={14} />
            </label>
          )}
        </div>

        {importNote && !importOpen && (
          <div className="ds-banner ds-tone-jade ds-banner-center ds-enter" role="status">
            <Icon name="CheckCircleIcon" variant="solid" size={18} />
            <span className="min-w-0 flex-1">{importNote}</span>
            {deck.length > 0 && (
              <button
                type="button"
                onClick={clearDeck}
                className="flex-shrink-0 text-xs font-semibold underline underline-offset-2"
              >
                Remove my deck
              </button>
            )}
          </div>
        )}
      </div>

      {/* The flashcard: the one thing on this screen */}
      <section data-area="card" className="ds-hero" aria-labelledby="bs-card-q">
        <div className="bs-card-body">
          <div className="flex items-start justify-between gap-3">
            <div className="flex min-w-0 flex-wrap items-center gap-1.5">
              <span className="ds-chip ds-tone-indigo">{categoryLabel(currentCard.category)}</span>
              {currentCard.subType && <span className="ds-chip">{currentCard.subType}</span>}
              {currentCard.difficulty && <DifficultyChip difficulty={currentCard.difficulty} />}
              {currentCard.imported && (
                <span
                  className="ds-chip ds-tone-jade"
                  title="From your uploaded deck, also saved to your question bank"
                >
                  <Icon name="CheckCircleIcon" variant="solid" size={13} />
                  Your deck
                </span>
              )}
            </div>
            <div className="-mr-2 -mt-1.5 flex flex-shrink-0 items-center gap-0.5">
              <span
                className="text-xs font-medium ds-faint ds-num"
                aria-label={`Card ${currentIndex + 1} of ${filteredCards.length}`}
              >
                {currentIndex + 1} / {filteredCards.length}
              </span>
              <button
                type="button"
                onClick={handleShuffle}
                className="ds-btn ds-btn-ghost ds-btn-icon"
                aria-label="Shuffle: jump to a random card"
                title="Shuffle"
              >
                <Icon name="ArrowsRightLeftIcon" size={18} />
              </button>
            </div>
          </div>

          <div
            key={`${categoryFilter}-${topicFilter}-${currentIndex}`}
            className="ds-fade mt-5 sm:mt-[1.5rem]"
          >
            {currentCard.title && (
              <p className="ds-eyebrow ds-tone-indigo ds-tone-text mb-1.5">{currentCard.title}</p>
            )}
            <h3 id="bs-card-q" className="ds-question bs-card-q">
              {currentCard.question}
            </h3>
            {!isRevealed && (
              <p className="mt-3 flex items-start gap-1.5 text-[13px] leading-snug ds-faint">
                <Icon name="ClockIcon" size={15} className="mt-px flex-shrink-0" />
                Take 30 seconds to think it through, then reveal.
              </p>
            )}
          </div>

          {isRevealed && (
            <div className="bs-answer ds-enter">
              <div className="flex items-center justify-between gap-3">
                <p className="flex items-center gap-1.5 text-[13px] font-semibold ds-tone-jade ds-tone-text">
                  <Icon name="CheckCircleIcon" variant="solid" size={17} />
                  Model answer
                </p>
                <Link
                  href="/daily-session?tab=question-bank"
                  className="ds-link inline-flex items-center gap-1 text-xs"
                >
                  Question bank
                  <Icon name="ArrowUpRightIcon" size={12} />
                </Link>
              </div>
              <p className="bs-answer-text mt-2">{currentCard.answer}</p>

              {extras.length > 0 && (
                <div className="bs-group mt-4">
                  {extras.map((x) => (
                    <div key={x.key} className="bs-group-row">
                      <span className={`ds-icon-tile ds-icon-tile-sm ${toneClass(x.tone)}`}>
                        <Icon name={x.icon} variant="solid" size={16} />
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="bs-group-title">{x.title}</p>
                        <div className="bs-group-body">{x.body}</div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        <div className="bs-card-foot">
          {isRevealed ? (
            <>
              <p className="w-full text-[13px] font-medium ds-faint sm:w-auto sm:flex-1">
                How did it go?
              </p>
              <div className="grid w-full grid-cols-2 gap-2 sm:flex sm:w-auto">
                <button
                  type="button"
                  onClick={handleNeedsReview}
                  className="ds-btn ds-btn-soft ds-tone-rose"
                >
                  <Icon name="ArrowUturnLeftIcon" size={17} />
                  Review again
                </button>
                <button
                  type="button"
                  onClick={handleGotIt}
                  className="ds-btn ds-btn-solid ds-tone-jade"
                >
                  <Icon name="CheckIcon" size={17} />
                  Got it
                </button>
              </div>
            </>
          ) : (
            <>
              <button type="button" onClick={handleNext} className="ds-btn ds-btn-ghost">
                Skip
              </button>
              <button
                type="button"
                onClick={() => {
                  ensureSound();
                  setIsRevealed(true);
                }}
                className="ds-btn ds-btn-primary ds-btn-lg flex-1 sm:ml-auto sm:flex-none"
              >
                <Icon name="EyeIcon" size={18} />
                Reveal answer
              </button>
            </>
          )}
        </div>
      </section>

      {/* Side column on desktop, below the card on phones */}
      <aside data-area="aside" className="min-w-0 space-y-[1.5rem]">
        <section aria-labelledby="bs-round-title">
          <div className="ds-section-head">
            <h2 id="bs-round-title">This round</h2>
          </div>
          <dl className="bs-stats">
            <div>
              <dt>
                <span className="ds-tone-gold ds-tone-text">
                  <Icon name="FireIcon" variant="solid" size={14} />
                </span>
                Streak
              </dt>
              <dd>{streak}</dd>
            </div>
            <div>
              <dt>
                <span className="ds-tone-jade ds-tone-text">
                  <Icon name="CheckCircleIcon" variant="solid" size={14} />
                </span>
                Mastered
              </dt>
              <dd>{masteredCount}</dd>
            </div>
            <div>
              <dt>
                <span className="ds-tone-rose ds-tone-text">
                  <Icon name="ArrowUturnLeftIcon" size={14} />
                </span>
                Review
              </dt>
              <dd>{reviewCount}</dd>
            </div>
          </dl>
        </section>

        <section aria-labelledby="bs-deck-title">
          <div className="ds-section-head">
            <h2 id="bs-deck-title">Your deck</h2>
            <span className="ds-num">
              {deck.length ? `${deck.length} card${deck.length === 1 ? '' : 's'}` : 'Empty'}
            </span>
          </div>
          <div className="ds-list" data-icons="true">
            <button
              type="button"
              onClick={() => {
                setImportOpen(true);
                setImportNote(null);
              }}
              aria-haspopup="dialog"
              aria-expanded={importOpen}
              className="ds-list-row"
            >
              <span className="ds-icon-tile ds-icon-tile-sm ds-tone-indigo">
                <Icon name="ArrowUpTrayIcon" size={16} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-[15px] font-medium ds-ink">
                  {deck.length ? 'Import more cards' : 'Import a deck'}
                </span>
                <span className="block text-xs ds-faint">
                  JSON, CSV or text. Also saved to your question bank.
                </span>
              </span>
              <Icon name="ChevronRightIcon" size={16} className="ds-chevron" />
            </button>
            {deck.length > 0 && (
              <button type="button" onClick={clearDeck} className="ds-list-row">
                <span className="ds-icon-tile ds-icon-tile-sm ds-tone-rose">
                  <Icon name="TrashIcon" size={16} />
                </span>
                <span className="min-w-0 flex-1 text-[15px] font-medium ds-tone-rose ds-tone-text">
                  Remove my deck
                </span>
              </button>
            )}
          </div>
        </section>
      </aside>

      {/* Import: a sheet on phones, a centred card above */}
      <Modal
        isOpen={importOpen}
        onClose={() => setImportOpen(false)}
        labelledBy="bs-import-title"
        closeOnBackdrop={!importText.trim()}
        className="lab-page ds-skin ios-sheet flex max-h-[90vh] w-full flex-col overflow-hidden rounded-[22px] sm:max-w-xl"
      >
        <div className="ios-sheet-grabber sm:hidden" data-sheet-grabber="" aria-hidden="true">
          <span />
        </div>
        <div className="ios-sheet-head sm:pt-4">
          <h2 id="bs-import-title" className="ios-sheet-title">
            Import a deck
          </h2>
          <button type="button" onClick={() => setImportOpen(false)} className="sheet-done">
            Cancel
          </button>
        </div>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 pb-4 sm:px-5">
          <p className="px-1 text-sm leading-relaxed ds-muted">
            Cards join your Quick blitz deck and are saved to your question bank. Questions you
            already have are skipped.
          </p>

          <div className="ds-list" data-icons="true">
            <label className="ds-list-row bs-file">
              <span className="ds-icon-tile ds-icon-tile-sm ds-tone-indigo">
                <Icon name="DocumentArrowUpIcon" size={16} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block break-all text-[15px] font-medium ds-ink">
                  {importFileName || 'Choose a file'}
                </span>
                <span className="block text-xs ds-faint">.json, .csv, .txt or .md, up to 2 MB</span>
              </span>
              <span className="ds-chip ds-tone-indigo">Browse</span>
              <input
                type="file"
                accept=".json,.jsonl,.csv,.tsv,.txt,.md,application/json,text/plain,text/csv"
                className="sr-only"
                onChange={(e) => {
                  void pickFile(e.target.files?.[0]);
                  e.target.value = '';
                }}
              />
            </label>
          </div>

          <div>
            <label htmlFor="bs-import-text" className="bs-label">
              Or paste it
            </label>
            <textarea
              id="bs-import-text"
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
              className="ds-field bs-mono-field resize-y"
            />
          </div>

          <details className="ds-disclosure">
            <summary className="flex items-center gap-1.5 px-1 text-[13px] font-medium ds-faint">
              Supported fields
              <Icon name="ChevronDownIcon" size={14} className="ds-caret" />
            </summary>
            <div className="bs-code-tags mt-2 space-y-1.5 px-1 text-xs leading-relaxed ds-faint">
              <p>
                A deck has <code>date</code> <code>session</code> <code>format</code> and{' '}
                <code>questions</code>.
              </p>
              <p>
                Each question can have <code>title</code> <code>topic</code> <code>question</code>{' '}
                <code>answer</code> <code>remember</code> <code>example</code>{' '}
                <code>interview_tip</code> <code>tradeoffs</code> <code>checklist</code>{' '}
                <code>steps</code> and <code>formula</code>.
              </p>
            </div>
          </details>

          {importResult?.error && (
            <p className="ds-banner ds-tone-rose" role="alert">
              <Icon name="ExclamationTriangleIcon" size={17} />
              <span>{importResult.error}</span>
            </p>
          )}

          {importText.trim() && (!importResult || importResult.error) && (
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
              <button
                type="button"
                onClick={convertWithAi}
                disabled={converting}
                className="ds-btn ds-btn-soft ds-btn-sm ds-tone-indigo"
              >
                {converting ? (
                  <span
                    className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent"
                    aria-hidden="true"
                  />
                ) : (
                  <Icon name="SparklesIcon" size={15} />
                )}
                {converting ? 'Converting…' : 'Convert with AI'}
              </button>
              <span className="text-xs ds-faint">Restructures your text, adds nothing.</span>
            </div>
          )}

          {importResult && !importResult.error && (
            <div className="ds-banner bs-tone-p ds-tone-jade" role="status">
              <Icon name="CheckCircleIcon" variant="solid" size={18} />
              <div className="min-w-0 flex-1 space-y-1">
                <p className="font-semibold">
                  Found {importResult.cards.length} card{importResult.cards.length === 1 ? '' : 's'}
                  {importResult.skipped.length > 0 && ` · skipped ${importResult.skipped.length}`}
                </p>
                {(importResult.date || importResult.session) && (
                  <p className="text-xs">
                    {importResult.session && `Session: ${importResult.session}`}
                    {importResult.date && ` (${importResult.date})`}
                  </p>
                )}
                <p className="text-xs">They go into Quick blitz and your question bank.</p>
                {importResult.format && (
                  <p className="text-xs opacity-80">Format: {importResult.format}</p>
                )}
                {importResult.skipped.length > 0 && (
                  <ul className="space-y-0.5 pt-1 text-xs ds-tone-gold ds-tone-text">
                    {importResult.skipped.slice(0, 5).map((k) => (
                      <li key={k.index}>
                        Item {k.index}: {k.reason}
                      </li>
                    ))}
                    {importResult.skipped.length > 5 && (
                      <li>…and {importResult.skipped.length - 5} more.</li>
                    )}
                  </ul>
                )}
              </div>
            </div>
          )}
        </div>

        <div className="bs-sheet-foot">
          {deck.length > 0 && (
            <button
              type="button"
              onClick={clearDeck}
              className="ds-btn ds-btn-danger ds-btn-sm mr-auto"
            >
              Remove my deck ({deck.length})
            </button>
          )}
          <div className="ml-auto flex w-full gap-2 sm:w-auto">
            {deck.length > 0 && (
              <button
                type="button"
                disabled={!canImport || isSyncingToBank}
                onClick={() => applyImport('replace')}
                className="ds-btn ds-btn-secondary flex-1 sm:flex-none"
              >
                Replace deck
              </button>
            )}
            <button
              type="button"
              disabled={!canImport || isSyncingToBank}
              onClick={() => applyImport('add')}
              className="ds-btn ds-btn-primary flex-1 sm:flex-none"
            >
              {isSyncingToBank ? (
                <>
                  <span
                    className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent"
                    aria-hidden="true"
                  />
                  Saving…
                </>
              ) : deck.length ? (
                'Add to my deck'
              ) : (
                'Import deck'
              )}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
