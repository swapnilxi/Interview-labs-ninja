'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import './swipe-learn.css';
import type {
  ContentCard,
  FeedMode,
  GenerateFormat,
  GenerateOptions,
  QuizDisplayMode,
  SwipeLearnView,
  TopicMeta,
} from './types';
import {
  DEFAULT_TOPIC_METAS,
  DEFAULT_CONTENT_CARDS,
  DEFAULT_SAVED_CARD_IDS,
} from './data/defaultCards';
import SwipeLearnHeader from './components/SwipeLearnHeader';
import TopicPillSelector from './components/TopicPillSelector';
import SwipeDeckView, { type GeneratingState } from './components/SwipeDeckView';
import ScrollFeedView from './components/ScrollFeedView';
import SavedCardsView from './components/SavedCardsView';
import SettingsModal from './components/SettingsModal';
import AddTopicModal from './components/AddTopicModal';
import GenerateSheet from './components/GenerateSheet';
import Icon from '@/components/ui/AppIcon';
import {
  generateCards,
  isSettingsFixable,
  resolveGemini,
  type GenerateCardsRequest,
  type ResolvedGemini,
} from './services/geminiService';
import { sounds } from './utils/soundEffects';
import { useSwipeLearnStorage } from './utils/useSwipeLearnStorage';
import type { StoredCard, StoredCustomTopic } from './utils/useSwipeLearnStorage';
import { useUrlState } from '@/lib/navigation/urlState';

/** The topic shown when the URL names none (or one that does not exist). */
const DEFAULT_TOPIC: FeedMode = 'python';
/** How many cards the one-tap "Generate" buttons ask for. */
const QUICK_COUNT = 5;
/** Last-used Generate options (count, level, and the card type per topic). Per-browser convenience only. */
const PREFS_KEY = 'swipelearn_generate_prefs_v1';

interface GeneratePrefs {
  count?: number;
  difficulty?: GenerateOptions['difficulty'];
  formats?: Record<string, GenerateFormat>;
}

function readPrefs(): GeneratePrefs {
  try {
    return JSON.parse(window.localStorage.getItem(PREFS_KEY) || '{}') as GeneratePrefs;
  } catch {
    return {};
  }
}

function writePrefs(prefs: GeneratePrefs): void {
  try {
    window.localStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
  } catch {
    /* storage blocked: options just aren't remembered */
  }
}

/** The card type a deck wants when nothing was picked for it yet. */
function naturalFormat(topicId: string): GenerateFormat {
  if (topicId === 'quiz') return 'quiz';
  if (topicId === 'interview') return 'interview-question';
  return 'random';
}

const FOCUS_PLACEHOLDERS: Record<string, string> = {
  python: 'e.g. decorators, asyncio, dataclasses',
  'computer-vision': 'e.g. convolutions, YOLO, augmentation',
  finance: 'e.g. compound interest, options, P/E ratio',
  ai: 'e.g. RAG, fine-tuning, embeddings',
  interview: 'e.g. rate limiter, two pointers, conflict',
  quiz: 'e.g. Python internals, ML basics',
  mixed: 'e.g. anything you are curious about',
};

interface SwipeRecord {
  cardId: string;
  action: 'skip' | 'save';
  /** Was it saved before this swipe? Undo only un-saves what the swipe saved. */
  wasSaved: boolean;
}

interface Toast {
  id: number;
  message: string;
  tone: 'info' | 'error';
  action?: { label: string; run: () => void };
}

export default function SwipeLearnModule() {
  const learnStorage = useSwipeLearnStorage();
  const { get, update } = useUrlState();

  const [allCards, setAllCards] = useState<ContentCard[]>(DEFAULT_CONTENT_CARDS);
  const [customTopics, setCustomTopics] = useState<TopicMeta[]>([]);
  // Custom topics and progress come from IndexedDB; a ?topic= naming a custom topic can only be checked after.
  const [hydrated, setHydrated] = useState(false);
  const [savedCardIds, setSavedCardIds] = useState<string[]>([]);
  const [seen, setSeen] = useState<Set<string>>(() => new Set());
  const [history, setHistory] = useState<SwipeRecord[]>([]);
  const [returning, setReturning] = useState<{
    id: string;
    dir: 'left' | 'right';
    n: number;
  } | null>(null);

  const [activeSubTab, setActiveSubTab] = useState<string>('all');
  const [quizMode, setQuizMode] = useState<QuizDisplayMode>('quiz');
  const [learnModeEnabled, setLearnModeEnabled] = useState(false);

  const [gemini, setGemini] = useState<ResolvedGemini>({ apiKey: '', source: 'none', model: '' });
  const [generating, setGenerating] = useState<GeneratingState | null>(null);
  const generatingRef = useRef(false);
  const abortRef = useRef<AbortController | null>(null);

  const [showSettings, setShowSettings] = useState(false);
  const [showAddTopic, setShowAddTopic] = useState(false);
  const [showGenerate, setShowGenerate] = useState(false);
  const [sheetInitial, setSheetInitial] = useState<GenerateOptions>({
    format: 'random',
    count: QUICK_COUNT,
    difficulty: 'any',
    focus: '',
  });
  const [toast, setToast] = useState<Toast | null>(null);
  const mainRef = useRef<HTMLElement>(null);

  const allTopics: TopicMeta[] = useMemo(
    () => [...DEFAULT_TOPIC_METAS, ...customTopics],
    [customTopics]
  );
  const topicMap = useMemo(() => new Map(allTopics.map((t) => [t.id, t])), [allTopics]);
  const topicById = useCallback((id: string) => topicMap.get(id), [topicMap]);
  const savedSet = useMemo(() => new Set(savedCardIds), [savedCardIds]);

  // ── Which screen lives in the URL ─────────────────────────────────────────
  //   /swipe-learn                       swipe deck, default topic
  //   /swipe-learn?topic=<id>            swipe deck for a topic (mixed = every topic)
  //   /swipe-learn?tab=scroll[&topic=]   the same cards as a scrolling feed
  //   /swipe-learn?tab=saved             saved cards
  // Old links: ?tab=mixed was the every-topic scroll feed (rewritten to tab=scroll&topic=mixed).
  const tabParam = get('tab');
  const topicParam = get('topic');
  const view: SwipeLearnView =
    tabParam === 'saved'
      ? 'saved'
      : tabParam === 'scroll' || tabParam === 'mixed'
        ? 'scroll'
        : 'swipe';
  const topicIsKnown = !!topicParam && topicMap.has(topicParam);
  const feedMode: FeedMode =
    tabParam === 'mixed' && !topicParam
      ? 'mixed'
      : topicIsKnown
        ? (topicParam as string)
        : DEFAULT_TOPIC;
  const waitingForTopic =
    !hydrated && !!topicParam && !DEFAULT_TOPIC_METAS.some((t) => t.id === topicParam);

  useEffect(() => {
    if (tabParam === 'mixed') {
      update({ tab: 'scroll', topic: topicParam ?? 'mixed' }, 'replace');
    } else if (tabParam !== null && !['scroll', 'saved'].includes(tabParam)) {
      update({ tab: null }, 'replace');
    } else if (topicParam !== null && hydrated && !topicIsKnown) {
      update({ topic: null }, 'replace');
    }
  }, [tabParam, topicParam, hydrated, topicIsKnown, update]);

  const feedModeRef = useRef(feedMode);
  feedModeRef.current = feedMode;

  const activeTopic = topicById(feedMode);
  const activeSub =
    feedMode !== 'mixed' && activeSubTab !== 'all'
      ? activeTopic?.subTabs?.find((s) => s.id === activeSubTab)
      : undefined;
  const deckLabel =
    activeSub?.label ?? (feedMode === 'mixed' ? 'mixed' : (activeTopic?.label ?? feedMode));

  // ── Gemini key/model (localStorage, so only readable on the client) ──────
  const refreshGemini = useCallback(() => setGemini(resolveGemini()), []);
  useEffect(() => {
    refreshGemini();
    // A key saved on the Config page in another tab should work here without a reload.
    window.addEventListener('storage', refreshGemini);
    window.addEventListener('focus', refreshGemini);
    return () => {
      window.removeEventListener('storage', refreshGemini);
      window.removeEventListener('focus', refreshGemini);
    };
  }, [refreshGemini]);
  const hasKey = gemini.source !== 'none';

  // ── Hydrate from IndexedDB ───────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    learnStorage
      .hydrate()
      .then((state) => {
        if (cancelled) return;
        const saved = state.savedCardIds.length > 0 ? state.savedCardIds : DEFAULT_SAVED_CARD_IDS;
        if (state.savedCardIds.length === 0) saved.forEach((id) => learnStorage.addSavedId(id));
        setSavedCardIds(saved);

        // Generated cards lead their deck, newest batch first (a batch keeps its order: ids are zero-padded).
        // The template "fallback" cards older versions wrote when a call failed are dropped unless saved.
        const savedIds = new Set(saved);
        const userCards = (state.userCards as unknown as ContentCard[])
          .filter((c) => c.model !== 'gemini-fallback' || savedIds.has(c.id))
          .sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
        setAllCards([...userCards, ...DEFAULT_CONTENT_CARDS]);

        if (state.customTopics.length > 0)
          setCustomTopics(state.customTopics as unknown as TopicMeta[]);

        if (state.seenIds) {
          setSeen(new Set(state.seenIds));
        } else if (Object.keys(state.cardIndices).length > 0) {
          // Older versions kept a position per topic; the first N cards of that deck (old order) were swiped.
          const oldOrder = [
            ...DEFAULT_CONTENT_CARDS,
            ...(state.userCards as unknown as ContentCard[]),
          ];
          const migrated = new Set<string>();
          Object.entries(state.cardIndices).forEach(([mode, n]) => {
            oldOrder
              .filter((c) => mode === 'mixed' || c.topic === mode)
              .slice(0, Math.max(0, n))
              .forEach((c) => migrated.add(c.id));
          });
          setSeen(migrated);
        }
        setHydrated(true);
      })
      .catch(() => {
        // IndexedDB unavailable: the app still works, in memory only.
        if (!cancelled) setHydrated(true);
      });
    return () => {
      cancelled = true;
    };
  }, [learnStorage]);

  // Persist progress (after hydration, so the stored value is never overwritten by the empty initial set).
  useEffect(() => {
    if (hydrated) learnStorage.saveSeenIds(Array.from(seen));
  }, [seen, hydrated, learnStorage]);

  // Stop an in-flight generation when leaving the page.
  useEffect(() => () => abortRef.current?.abort(), []);

  // ── Toast ────────────────────────────────────────────────────────────────
  const showToast = useCallback(
    (message: string, tone: Toast['tone'] = 'info', action?: Toast['action']) => {
      setToast({ id: Date.now(), message, tone, action });
    },
    []
  );
  useEffect(() => {
    if (!toast) return;
    const t = window.setTimeout(
      () => setToast((cur) => (cur?.id === toast.id ? null : cur)),
      toast.tone === 'error' || toast.action ? 6000 : 3200
    );
    return () => window.clearTimeout(t);
  }, [toast]);

  // ── Topics ───────────────────────────────────────────────────────────────
  const handleSelectMode = (mode: FeedMode) => {
    setActiveSubTab('all');
    update({ topic: mode === DEFAULT_TOPIC ? null : mode });
  };

  // ── Saving ───────────────────────────────────────────────────────────────
  const saveCard = useCallback(
    (cardId: string) => {
      setSavedCardIds((prev) => {
        if (prev.includes(cardId)) return prev;
        learnStorage.addSavedId(cardId);
        return [cardId, ...prev];
      });
    },
    [learnStorage]
  );

  const unsaveCard = useCallback(
    (cardId: string) => {
      setSavedCardIds((prev) => {
        if (!prev.includes(cardId)) return prev;
        learnStorage.removeSavedId(cardId);
        return prev.filter((id) => id !== cardId);
      });
    },
    [learnStorage]
  );

  const toggleSave = useCallback(
    (card: ContentCard) => {
      if (savedSet.has(card.id)) {
        unsaveCard(card.id);
      } else {
        sounds.playMastered();
        saveCard(card.id);
      }
    },
    [savedSet, saveCard, unsaveCard]
  );

  // ── Decks ────────────────────────────────────────────────────────────────
  const deckCards = useMemo(() => {
    let list = feedMode === 'mixed' ? allCards : allCards.filter((c) => c.topic === feedMode);
    if (activeSubTab === 'for-you') {
      // "For you" (Mixed): what you haven't swiped yet, plus what you kept. Only meaningful as a feed.
      if (view === 'scroll') list = list.filter((c) => !seen.has(c.id) || savedSet.has(c.id));
    } else if (activeSubTab !== 'all') {
      list = list.filter((c) => c.subCategory === activeSubTab);
    }
    if (learnModeEnabled) {
      const deep = list.filter((c) => c.type === 'concept' || !!c.depth);
      if (deep.length > 0) list = deep;
    }
    return list;
  }, [allCards, feedMode, activeSubTab, learnModeEnabled, view, seen, savedSet]);

  const remaining = useMemo(() => deckCards.filter((c) => !seen.has(c.id)), [deckCards, seen]);
  const deckIds = useMemo(() => new Set(deckCards.map((c) => c.id)), [deckCards]);
  const lastUndoable = history.find((h) => deckIds.has(h.cardId));

  const markSeen = useCallback(
    (card: ContentCard, action: SwipeRecord['action'], wasSaved: boolean) => {
      setSeen((prev) => {
        if (prev.has(card.id)) return prev;
        const next = new Set(prev);
        next.add(card.id);
        return next;
      });
      setHistory((prev) => [{ cardId: card.id, action, wasSaved }, ...prev.slice(0, 49)]);
    },
    []
  );

  const handleSkip = useCallback(
    (card: ContentCard) => {
      sounds.playReview();
      markSeen(card, 'skip', savedSet.has(card.id));
    },
    [markSeen, savedSet]
  );

  const handleSave = useCallback(
    (card: ContentCard) => {
      const wasSaved = savedSet.has(card.id);
      sounds.playMastered();
      saveCard(card.id);
      markSeen(card, 'save', wasSaved);
    },
    [markSeen, saveCard, savedSet]
  );

  const handleUndo = useCallback(() => {
    const record = history.find((h) => deckIds.has(h.cardId));
    if (!record) return;
    setHistory((prev) => prev.filter((h) => h !== record));
    setSeen((prev) => {
      const next = new Set(prev);
      next.delete(record.cardId);
      return next;
    });
    if (record.action === 'save' && !record.wasSaved) unsaveCard(record.cardId);
    setReturning({
      id: record.cardId,
      dir: record.action === 'save' ? 'right' : 'left',
      n: Date.now(),
    });
  }, [history, deckIds, unsaveCard]);

  const handleReviewAgain = useCallback(() => {
    setSeen((prev) => {
      const next = new Set(prev);
      deckIds.forEach((id) => next.delete(id));
      return next;
    });
    setHistory((prev) => prev.filter((h) => !deckIds.has(h.cardId)));
  }, [deckIds]);

  const handleResetProgress = useCallback(() => {
    setSeen(new Set());
    setHistory([]);
    showToast('Every deck starts over.');
  }, [showToast]);

  // ── Generation ───────────────────────────────────────────────────────────
  const generateDefaults = useCallback((topicId: string): GenerateOptions => {
    const prefs = typeof window === 'undefined' ? {} : readPrefs();
    return {
      format: prefs.formats?.[topicId] ?? naturalFormat(topicId),
      count: prefs.count ?? QUICK_COUNT,
      difficulty: prefs.difficulty ?? 'any',
      focus: '',
    };
  }, []);

  const runGenerate = useCallback(
    async (
      options: GenerateOptions,
      target: { aboutCard?: ContentCard; topic?: TopicMeta } = {}
    ) => {
      if (generatingRef.current) return;
      const { aboutCard } = target;
      const fresh = resolveGemini();
      setGemini(fresh);
      if (fresh.source === 'none') {
        setShowSettings(true);
        return;
      }

      // "Quiz me" belongs to the card's own topic, even inside the Mixed deck. A just-added topic is passed in
      // (it isn't in topicMap until the next render).
      const topicId = target.topic?.id ?? (aboutCard ? aboutCard.topic : feedModeRef.current);
      const topic = target.topic ?? topicMap.get(topicId);
      const isMixed = topicId === 'mixed';
      const subTabs = isMixed ? undefined : topic?.subTabs?.filter((s) => s.id !== 'all');
      const sub = !aboutCard ? subTabs?.find((s) => s.id === activeSubTab) : undefined;
      const inTopic = (c: ContentCard) => isMixed || c.topic === topicId;

      const req: GenerateCardsRequest = {
        topic: { id: topicId, label: topic?.label ?? topicId },
        mixedTopics: isMixed
          ? allTopics
              .filter((t) => t.id !== 'mixed' && t.id !== 'quiz')
              .map((t) => ({ id: t.id, label: t.label }))
          : undefined,
        subCategories: subTabs?.length
          ? subTabs.map((s) => ({ id: s.id, label: s.label }))
          : undefined,
        subCategory: sub ? { id: sub.id, label: sub.label } : undefined,
        format: aboutCard ? 'quiz' : options.format,
        count: options.count,
        focus: options.focus,
        difficulty: options.difficulty,
        aboutCard,
        avoidTitles: allCards.filter(inTopic).map((c) => c.title),
      };

      const controller = new AbortController();
      abortRef.current = controller;
      generatingRef.current = true;
      setToast(null);
      setGenerating({
        count: options.count,
        label: aboutCard
          ? `a quiz on “${aboutCard.title}”`
          : `${options.count} ${sub?.label ?? topic?.label ?? ''} ${options.count === 1 ? 'card' : 'cards'}`,
        forCardId: aboutCard?.id,
      });

      try {
        const cards = await generateCards(req, controller.signal);
        // New cards go on top: next in the deck, first in the feed.
        setAllCards((prev) => [...cards, ...prev.filter((c) => !cards.some((n) => n.id === c.id))]);
        learnStorage.saveCards(cards as unknown as StoredCard[]);
        if (learnModeEnabled && !cards.some((c) => c.type === 'concept' || !!c.depth))
          setLearnModeEnabled(false);
        // The card the quiz is about counts as read (Undo brings it back).
        if (aboutCard && view === 'swipe') markSeen(aboutCard, 'skip', savedSet.has(aboutCard.id));
        sounds.playFlip();
        mainRef.current?.scrollTo({ top: 0, behavior: 'smooth' });

        const n = cards.length;
        const elsewhere =
          !aboutCard && feedModeRef.current !== topicId && feedModeRef.current !== 'mixed';
        showToast(
          aboutCard
            ? `Quiz ready: ${n} ${n === 1 ? 'question' : 'questions'} on “${aboutCard.title}”`
            : `Added ${n} ${topic?.label ?? ''} ${n === 1 ? 'card' : 'cards'}${n < options.count ? ` (of ${options.count})` : ''}`,
          'info',
          elsewhere
            ? {
                label: 'View',
                run: () => update({ topic: topicId === DEFAULT_TOPIC ? null : topicId }),
              }
            : undefined
        );
      } catch (error) {
        if ((error as Error)?.name === 'AbortError') {
          showToast('Stopped.');
          return;
        }
        const message = (error as Error)?.message || 'Generation failed.';
        showToast(
          message,
          'error',
          isSettingsFixable(error)
            ? { label: 'Settings', run: () => setShowSettings(true) }
            : { label: 'Retry', run: () => void runGenerate(options, target) }
        );
      } finally {
        generatingRef.current = false;
        abortRef.current = null;
        setGenerating(null);
      }
    },
    [
      activeSubTab,
      allCards,
      allTopics,
      learnModeEnabled,
      learnStorage,
      markSeen,
      savedSet,
      showToast,
      topicMap,
      update,
      view,
    ]
  );

  const handleSheetGenerate = useCallback(
    (options: GenerateOptions) => {
      const prefs = readPrefs();
      writePrefs({
        count: options.count,
        difficulty: options.difficulty,
        formats: { ...(prefs.formats ?? {}), [feedModeRef.current]: options.format },
      });
      void runGenerate(options);
    },
    [runGenerate]
  );

  const handleQuickGenerate = useCallback(() => {
    void runGenerate({ ...generateDefaults(feedModeRef.current), count: QUICK_COUNT, focus: '' });
  }, [generateDefaults, runGenerate]);

  const handleQuizMe = useCallback(
    (card: ContentCard) => {
      void runGenerate(
        { format: 'quiz', count: 2, difficulty: card.difficulty ?? 'any', focus: '' },
        { aboutCard: card }
      );
    },
    [runGenerate]
  );

  const openGenerate = useCallback(() => {
    refreshGemini();
    // The sheet starts from the last-used options for the deck on screen, read fresh each time it opens.
    setSheetInitial(generateDefaults(feedModeRef.current));
    setShowGenerate(true);
  }, [generateDefaults, refreshGemini]);

  // ── Custom topics ────────────────────────────────────────────────────────
  const handleAddTopic = useCallback(
    (newTopic: TopicMeta, generateStarter: boolean) => {
      setCustomTopics((prev) => [...prev, newTopic]);
      learnStorage.saveCustomTopic(newTopic as unknown as StoredCustomTopic);
      setActiveSubTab('all');
      update(view === 'saved' ? { tab: null, topic: newTopic.id } : { topic: newTopic.id });
      if (generateStarter) {
        feedModeRef.current = newTopic.id;
        void runGenerate(
          { format: 'random', count: QUICK_COUNT, difficulty: 'any', focus: '' },
          { topic: newTopic }
        );
      } else {
        showToast(`Added “${newTopic.label}”`);
      }
    },
    [learnStorage, runGenerate, showToast, update, view]
  );

  const handleRemoveCustomTopic = useCallback(
    (topicId: string) => {
      setCustomTopics((prev) => prev.filter((t) => t.id !== topicId));
      learnStorage.removeCustomTopic(topicId);
      // If it was on screen, ?topic= no longer resolves and the URL falls back to the default topic.
      showToast('Topic removed.');
    },
    [learnStorage, showToast]
  );

  // Saved cards, most recently saved first.
  const savedCards = useMemo(() => {
    const byId = new Map(allCards.map((c) => [c.id, c]));
    return savedCardIds.map((id) => byId.get(id)).filter((c): c is ContentCard => !!c);
  }, [allCards, savedCardIds]);

  // ── Generate sheet inputs ────────────────────────────────────────────────
  const top = view === 'swipe' ? remaining[0] : undefined;
  const focusIdeas = useMemo(() => {
    if (!top) return [];
    return Array.from(new Set([top.title, ...(top.tags ?? []).slice(0, 2)])).filter(Boolean);
  }, [top]);
  const targetLabel =
    `${activeTopic?.emoji ?? ''} ${feedMode === 'mixed' ? 'all topics' : (activeTopic?.label ?? feedMode)}${
      activeSub ? ` · ${activeSub.label}` : ''
    }`.trim();

  return (
    <div className="flex h-[calc(100dvh_-_60px_-_var(--app-banner-h,0px)_-_var(--mobile-tab-h,0px))] w-full flex-col items-center overflow-hidden bg-background">
      <div className="relative flex min-h-0 w-full max-w-[680px] flex-1 flex-col md:border-x md:border-border">
        <SwipeLearnHeader
          view={view}
          savedCount={savedCardIds.length}
          onNavigate={(v) => update({ tab: v === 'swipe' ? null : v })}
          onGenerate={openGenerate}
          onOpenSettings={() => setShowSettings(true)}
          isGenerating={!!generating}
        />

        {view !== 'saved' && (
          <TopicPillSelector
            topics={allTopics}
            selectedMode={feedMode}
            onSelectMode={handleSelectMode}
            onOpenAddTopic={() => setShowAddTopic(true)}
            activeSubTab={activeSubTab}
            onSelectSubTab={setActiveSubTab}
            quizMode={quizMode}
            onToggleQuizMode={setQuizMode}
            learnModeEnabled={learnModeEnabled}
            onToggleLearnMode={() => setLearnModeEnabled((prev) => !prev)}
          />
        )}

        <div className="relative flex min-h-0 flex-1 flex-col">
          <main
            ref={mainRef}
            className={`flex min-h-0 flex-1 flex-col ${view === 'swipe' ? 'overflow-hidden' : 'overflow-y-auto overscroll-contain scrollbar-clean'}`}
          >
            {view === 'saved' ? (
              <SavedCardsView
                cards={savedCards}
                topicById={topicById}
                quizMode={quizMode}
                onRemoveSaved={unsaveCard}
                onStartSwiping={() => update({ tab: null })}
              />
            ) : waitingForTopic ? (
              <div className="flex flex-1 items-center justify-center py-16" aria-busy="true">
                <span className="h-[1.5rem] w-[1.5rem] animate-spin rounded-full border-2 border-border border-t-primary" />
              </div>
            ) : view === 'scroll' ? (
              <ScrollFeedView
                key={`${feedMode}:${activeSubTab}`}
                cards={deckCards}
                deckLabel={deckLabel}
                topicById={topicById}
                savedCardIds={savedCardIds}
                quizMode={quizMode}
                onToggleSave={toggleSave}
                onQuizMe={handleQuizMe}
                onQuickGenerate={handleQuickGenerate}
                onOpenGenerate={openGenerate}
                onOpenSettings={() => setShowSettings(true)}
                generating={generating}
                hasKey={hasKey}
              />
            ) : (
              <SwipeDeckView
                remaining={remaining}
                total={deckCards.length}
                deckLabel={deckLabel}
                topicById={topicById}
                savedCardIds={savedCardIds}
                quizMode={quizMode}
                onSkip={handleSkip}
                onSave={handleSave}
                onUndo={handleUndo}
                canUndo={!!lastUndoable}
                returning={returning}
                onReviewAgain={handleReviewAgain}
                onQuickGenerate={handleQuickGenerate}
                onOpenGenerate={openGenerate}
                onQuizMe={handleQuizMe}
                generating={generating}
                hasKey={hasKey}
                onOpenSettings={() => setShowSettings(true)}
              />
            )}
          </main>

          {/* Floating status while cards are being written (over the content, so nothing jumps) */}
          {generating && (
            <div className="pointer-events-none absolute inset-x-0 top-2 z-40 flex justify-center px-3">
              <div
                className="swipe-status swipe-status-shimmer pointer-events-auto shadow-lg animate-fadeIn"
                role="status"
                aria-live="polite"
              >
                <span className="h-4 w-4 shrink-0 animate-spin rounded-full border-2 border-current border-t-transparent opacity-80" />
                <span className="min-w-0 truncate">Writing {generating.label}…</span>
                <button
                  type="button"
                  onClick={() => abortRef.current?.abort()}
                  className="swipe-ghost-btn -my-1 -mr-1 shrink-0 px-2"
                >
                  Stop
                </button>
              </div>
            </div>
          )}

          {toast && (
            <div
              className={`pointer-events-none absolute inset-x-0 z-40 flex justify-center px-3 ${
                view === 'swipe' && remaining.length > 0 ? 'bottom-[5.5rem]' : 'bottom-4'
              }`}
            >
              <div
                key={toast.id}
                className={`swipe-toast pointer-events-auto ${toast.tone === 'error' ? 'swipe-toast-error' : ''}`}
                role={toast.tone === 'error' ? 'alert' : 'status'}
              >
                {toast.tone === 'error' ? (
                  <Icon name="ExclamationTriangleIcon" size={18} className="shrink-0" />
                ) : (
                  <Icon name="SparklesIcon" size={16} variant="solid" className="shrink-0" />
                )}
                <span className="min-w-0 flex-1">{toast.message}</span>
                {toast.action && (
                  <button
                    type="button"
                    onClick={() => {
                      const run = toast.action?.run;
                      setToast(null);
                      run?.();
                    }}
                    className="swipe-toast-action"
                  >
                    {toast.action.label}
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setToast(null)}
                  className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg opacity-70 hover:opacity-100"
                  aria-label="Dismiss"
                >
                  <Icon name="XMarkIcon" size={16} />
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      <GenerateSheet
        isOpen={showGenerate}
        onClose={() => setShowGenerate(false)}
        targetLabel={targetLabel}
        initial={sheetInitial}
        focusIdeas={focusIdeas}
        focusPlaceholder={
          FOCUS_PLACEHOLDERS[feedMode] ?? `e.g. a part of ${activeTopic?.label ?? 'this topic'}`
        }
        onGenerate={handleSheetGenerate}
        keySource={gemini.source}
        model={gemini.model}
        onOpenSettings={() => setShowSettings(true)}
        busy={!!generating}
      />

      <SettingsModal
        isOpen={showSettings}
        onClose={() => setShowSettings(false)}
        onSaved={refreshGemini}
        onResetProgress={handleResetProgress}
      />

      <AddTopicModal
        isOpen={showAddTopic}
        onClose={() => setShowAddTopic(false)}
        onAddTopic={handleAddTopic}
        existingTopicIds={allTopics.map((t) => t.id)}
        customTopics={customTopics}
        onRemoveCustomTopic={handleRemoveCustomTopic}
        canGenerate={hasKey}
      />
    </div>
  );
}
