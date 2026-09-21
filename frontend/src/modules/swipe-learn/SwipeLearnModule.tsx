'use client';

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  ContentCard,
  FeedMode,
  SwipeLearnNavTab,
  TopicMeta,
  GenerateFormat,
  QuizDisplayMode,
} from './types';
import { DEFAULT_TOPIC_METAS, DEFAULT_CONTENT_CARDS } from './data/defaultCards';
import SwipeLearnHeader from './components/SwipeLearnHeader';
import TopicPillSelector from './components/TopicPillSelector';
import SwipeDeckView from './components/SwipeDeckView';
import MixedVerticalFeed from './components/MixedVerticalFeed';
import SavedCardsView from './components/SavedCardsView';
import SettingsModal from './components/SettingsModal';
import AddTopicModal from './components/AddTopicModal';
import GenerateOptionsModal from './components/GenerateOptionsModal';
import BottomNavBar from './components/BottomNavBar';
import { generateGeminiCard } from './services/geminiService';
import { sounds } from './utils/soundEffects';

const SAVED_CARDS_STORAGE_KEY = 'swipelearn_saved_card_ids_v3';
const USER_CARDS_STORAGE_KEY = 'swipelearn_user_cards_v3';
const CUSTOM_TOPICS_STORAGE_KEY = 'swipelearn_custom_topics_v3';

export default function SwipeLearnModule() {
  const [allCards, setAllCards] = useState<ContentCard[]>(DEFAULT_CONTENT_CARDS);
  const [customTopics, setCustomTopics] = useState<TopicMeta[]>([]);
  const [feedMode, setFeedMode] = useState<FeedMode>('python');
  const [currentTab, setCurrentTab] = useState<SwipeLearnNavTab>('feed');
  const [savedCardIds, setSavedCardIds] = useState<string[]>([]);
  const [cardIndices, setCardIndices] = useState<Record<string, number>>({});
  const [swipeHistory, setSwipeHistory] = useState<Array<{ card: ContentCard; action: 'save' | 'skip' }>>([]);
  const [isGenerating, setIsGenerating] = useState(false);

  // Sub-tabs state (e.g. for interview or mixed)
  const [activeSubTab, setActiveSubTab] = useState<string>('all');

  // Quiz mode (interactive multiple-choice vs front-back flashcard)
  const [quizMode, setQuizMode] = useState<QuizDisplayMode>('quiz');

  // Learn mode toggle
  const [learnModeEnabled, setLearnModeEnabled] = useState(false);

  // Modals
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [showAddTopicModal, setShowAddTopicModal] = useState(false);
  const [showGenerateOptionsModal, setShowGenerateOptionsModal] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Combine default topics with user's custom topics
  const allTopics: TopicMeta[] = useMemo(() => {
    return [...DEFAULT_TOPIC_METAS, ...customTopics];
  }, [customTopics]);

  // Active topic meta
  const activeTopicMeta = useMemo(() => {
    return allTopics.find((t) => t.id === feedMode) || allTopics[1];
  }, [allTopics, feedMode]);

  // Hydrate from localStorage
  useEffect(() => {
    try {
      // Saved cards
      const savedIds = localStorage.getItem(SAVED_CARDS_STORAGE_KEY);
      if (savedIds) {
        setSavedCardIds(JSON.parse(savedIds));
      } else {
        const initial = ['py-001', 'py-002'];
        setSavedCardIds(initial);
        localStorage.setItem(SAVED_CARDS_STORAGE_KEY, JSON.stringify(initial));
      }

      // Custom topics
      const savedTopics = localStorage.getItem(CUSTOM_TOPICS_STORAGE_KEY);
      if (savedTopics) {
        setCustomTopics(JSON.parse(savedTopics));
      }

      // Custom generated cards
      const savedUserCards = localStorage.getItem(USER_CARDS_STORAGE_KEY);
      if (savedUserCards) {
        const parsed: ContentCard[] = JSON.parse(savedUserCards);
        setAllCards([...DEFAULT_CONTENT_CARDS, ...parsed]);
      }
    } catch {
      // Local storage fallback
    }
  }, []);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => {
      setToastMessage((prev) => (prev === msg ? null : prev));
    }, 2400);
  };

  // Add custom topic
  const handleAddTopic = useCallback((newTopic: TopicMeta) => {
    setCustomTopics((prev) => {
      const next = [...prev, newTopic];
      try {
        localStorage.setItem(CUSTOM_TOPICS_STORAGE_KEY, JSON.stringify(next));
      } catch {}
      return next;
    });

    // Automatically select the new topic & update feed
    setFeedMode(newTopic.id);
    setCurrentTab('feed');
    showToast(`Added topic "${newTopic.label}"!`);
  }, []);

  // Remove custom topic
  const handleRemoveCustomTopic = useCallback((topicId: string) => {
    setCustomTopics((prev) => {
      const next = prev.filter((t) => t.id !== topicId);
      try {
        localStorage.setItem(CUSTOM_TOPICS_STORAGE_KEY, JSON.stringify(next));
      } catch {}
      return next;
    });

    setFeedMode((prev) => (prev === topicId ? 'python' : prev));
    showToast('Topic removed.');
  }, []);

  // Save card
  const handleSaveCard = useCallback((card: ContentCard) => {
    sounds.playMastered();
    setSavedCardIds((prev) => {
      if (prev.includes(card.id)) return prev;
      const next = [card.id, ...prev];
      try {
        localStorage.setItem(SAVED_CARDS_STORAGE_KEY, JSON.stringify(next));
      } catch {}
      return next;
    });

    setAllCards((prev) =>
      prev.map((c) => (c.id === card.id ? { ...c, isSaved: true, isRead: true } : c))
    );

    showToast(`Saved "${card.title}"`);
  }, []);

  // Remove card from saved
  const handleRemoveSavedCard = useCallback((cardId: string) => {
    setSavedCardIds((prev) => {
      const next = prev.filter((id) => id !== cardId);
      try {
        localStorage.setItem(SAVED_CARDS_STORAGE_KEY, JSON.stringify(next));
      } catch {}
      return next;
    });

    setAllCards((prev) =>
      prev.map((c) => (c.id === cardId ? { ...c, isSaved: false } : c))
    );
  }, []);

  // Filter cards based on active FeedMode and sub-tabs
  const activeDeckCards = useMemo(() => {
    let list = [...allCards];

    // Filter by mode
    if (feedMode !== 'mixed') {
      list = list.filter((c) => c.topic === feedMode);
    }

    // Filter by sub-tab if active
    if (activeSubTab && activeSubTab !== 'all') {
      if (feedMode === 'interview') {
        list = list.filter((c) => c.subCategory === activeSubTab);
      } else if (feedMode === 'mixed' && activeSubTab === 'for-you') {
        // "For You" filter: prioritize unread cards and user saved domains
        list = list.filter((c) => !c.isRead || c.isSaved);
      }
    }

    // Filter by Learn Mode (prioritizes deep concept cards)
    if (learnModeEnabled) {
      const conceptCards = list.filter((c) => c.type === 'concept' || c.depth);
      if (conceptCards.length > 0) list = conceptCards;
    }

    return list;
  }, [allCards, feedMode, activeSubTab, learnModeEnabled]);

  const currentIndex = cardIndices[feedMode] || 0;

  // Swiping left: Skip
  const handleSwipeLeft = useCallback((card: ContentCard) => {
    sounds.playReview();
    setSwipeHistory((prev) => [{ card, action: 'skip' }, ...prev.slice(0, 19)]);
    setCardIndices((prev) => ({
      ...prev,
      [feedMode]: (prev[feedMode] || 0) + 1,
    }));
    setAllCards((prev) =>
      prev.map((c) => (c.id === card.id ? { ...c, isRead: true, swipeDirection: 'left' } : c))
    );
  }, [feedMode]);

  // Swiping right: Save
  const handleSwipeRight = useCallback((card: ContentCard) => {
    handleSaveCard(card);
    setSwipeHistory((prev) => [{ card, action: 'save' }, ...prev.slice(0, 19)]);
    setCardIndices((prev) => ({
      ...prev,
      [feedMode]: (prev[feedMode] || 0) + 1,
    }));
    setAllCards((prev) =>
      prev.map((c) => (c.id === card.id ? { ...c, isSaved: true, isRead: true, swipeDirection: 'right' } : c))
    );
  }, [handleSaveCard, feedMode]);

  // Undo last swipe
  const handleUndo = useCallback(() => {
    if (swipeHistory.length === 0) return;
    const [lastItem, ...rest] = swipeHistory;
    setSwipeHistory(rest);

    if (lastItem.action === 'save') {
      handleRemoveSavedCard(lastItem.card.id);
    }

    setCardIndices((prev) => ({
      ...prev,
      [feedMode]: Math.max((prev[feedMode] || 0) - 1, 0),
    }));
  }, [swipeHistory, feedMode, handleRemoveSavedCard]);

  const handleResetDeck = useCallback(() => {
    setCardIndices((prev) => ({
      ...prev,
      [feedMode]: 0,
    }));
  }, [feedMode]);

  // Dynamic Card Generation with specific format
  const handleGenerateWithFormat = useCallback(async (format: GenerateFormat) => {
    setIsGenerating(true);
    try {
      const existingTitles = allCards.map((c) => c.title);
      const newCard = await generateGeminiCard(
        feedMode,
        existingTitles,
        format,
        activeTopicMeta?.label
      );

      setAllCards((prev) => [newCard, ...prev]);

      try {
        const saved = localStorage.getItem(USER_CARDS_STORAGE_KEY);
        const parsed: ContentCard[] = saved ? JSON.parse(saved) : [];
        localStorage.setItem(USER_CARDS_STORAGE_KEY, JSON.stringify([newCard, ...parsed]));
      } catch {}

      sounds.playFlip();
      showToast(`✨ Generated: ${newCard.title}`);
    } catch {
      showToast('Generation failed. Check your Gemini API key in Settings.');
    } finally {
      setIsGenerating(false);
    }
  }, [allCards, feedMode, activeTopicMeta]);

  // Learn -> Test -> Reinforce loop
  const handleReinforceQuiz = useCallback((card: ContentCard) => {
    // Generate a follow-up test specifically on this concept
    showToast(`Generating quiz for ${card.title}...`);
    handleGenerateWithFormat('quiz');
  }, [handleGenerateWithFormat]);

  // Handle Mode / Topic Selection
  const handleSelectMode = (mode: FeedMode) => {
    setFeedMode(mode);
    setActiveSubTab('all');
    if (mode === 'mixed') {
      setCurrentTab('mixed');
    } else {
      setCurrentTab('feed');
    }
  };

  const savedCardsList = useMemo(() => {
    return allCards.filter((c) => savedCardIds.includes(c.id));
  }, [allCards, savedCardIds]);

  return (
    <div className="w-full min-h-[calc(100vh-60px)] bg-background flex flex-col items-center">
      {/* Mobile-first centered frame */}
      <div className="w-full max-w-[600px] flex-1 flex flex-col bg-background/50 border-x border-border/30 relative">
        {/* Toast Alert */}
        {toastMessage && (
          <div className="fixed top-20 left-1/2 transform -translate-x-1/2 z-50 px-4 py-2 rounded-2xl bg-foreground text-background text-xs font-semibold shadow-xl flex items-center gap-2 animate-bounce">
            <span>{toastMessage}</span>
          </div>
        )}

        {/* 1. Header with Generate dropdown */}
        <SwipeLearnHeader
          savedCount={savedCardIds.length}
          onOpenSaved={() => setCurrentTab('saved')}
          onOpenSettings={() => setShowSettingsModal(true)}
          onGenerate={() => setShowGenerateOptionsModal(true)}
          isGenerating={isGenerating}
        />

        {/* 2. Horizontally scrollable Sticky Topic Pills Bar */}
        {currentTab !== 'saved' && (
          <TopicPillSelector
            topics={allTopics}
            selectedMode={feedMode}
            onSelectMode={handleSelectMode}
            onOpenAddTopic={() => setShowAddTopicModal(true)}
            activeSubTab={activeSubTab}
            onSelectSubTab={setActiveSubTab}
            quizMode={quizMode}
            onToggleQuizMode={setQuizMode}
            learnModeEnabled={learnModeEnabled}
            onToggleLearnMode={() => setLearnModeEnabled((prev) => !prev)}
          />
        )}

        {/* 3. Main View Area */}
        <main className="flex-1 flex flex-col justify-center">
          {currentTab === 'saved' ? (
            <SavedCardsView
              cards={savedCardsList}
              onRemoveSaved={handleRemoveSavedCard}
              onBackToFeed={() => setCurrentTab('feed')}
            />
          ) : feedMode === 'mixed' || currentTab === 'mixed' ? (
            <MixedVerticalFeed
              cards={activeDeckCards}
              savedCardIds={savedCardIds}
              onSaveCard={handleSaveCard}
              onSkipCard={(card) => {
                setSwipeHistory((prev) => [{ card, action: 'skip' }, ...prev.slice(0, 19)]);
              }}
              onGenerateMore={() => setShowGenerateOptionsModal(true)}
              isGenerating={isGenerating}
              onReinforceQuiz={handleReinforceQuiz}
            />
          ) : (
            <SwipeDeckView
              cards={activeDeckCards}
              currentIndex={currentIndex}
              savedCardIds={savedCardIds}
              quizMode={quizMode}
              onSwipeLeft={handleSwipeLeft}
              onSwipeRight={handleSwipeRight}
              onUndo={handleUndo}
              canUndo={swipeHistory.length > 0}
              onResetDeck={handleResetDeck}
              onReinforceQuiz={handleReinforceQuiz}
            />
          )}
        </main>

        {/* 4. Mobile Bottom Navigation */}
        <BottomNavBar
          currentTab={currentTab}
          savedCount={savedCardIds.length}
          onTabChange={(tab) => {
            if (tab === 'settings') {
              setShowSettingsModal(true);
            } else if (tab === 'mixed') {
              setFeedMode('mixed');
              setCurrentTab('mixed');
            } else if (tab === 'feed') {
              if (feedMode === 'mixed') {
                setFeedMode('python');
              }
              setCurrentTab('feed');
            } else {
              setCurrentTab(tab);
            }
          }}
        />

        {/* 5. Modals */}
        <SettingsModal
          isOpen={showSettingsModal}
          onClose={() => setShowSettingsModal(false)}
        />

        <AddTopicModal
          isOpen={showAddTopicModal}
          onClose={() => setShowAddTopicModal(false)}
          onAddTopic={handleAddTopic}
          existingTopicIds={allTopics.map((t) => t.id)}
          customTopics={customTopics}
          onRemoveCustomTopic={handleRemoveCustomTopic}
        />

        <GenerateOptionsModal
          isOpen={showGenerateOptionsModal}
          onClose={() => setShowGenerateOptionsModal(false)}
          activeMode={feedMode}
          activeTopicLabel={activeTopicMeta?.label || 'Topic'}
          onSelectFormat={handleGenerateWithFormat}
          isGenerating={isGenerating}
        />
      </div>
    </div>
  );
}
