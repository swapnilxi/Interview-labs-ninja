export type TopicType =
  | 'python'
  | 'computer-vision'
  | 'finance'
  | 'ai'
  | 'genai'
  | 'interview'
  | 'quiz'
  | (string & {}); // allows custom topics

export type FeedMode =
  | 'mixed'
  | 'python'
  | 'computer-vision'
  | 'finance'
  | 'ai'
  | 'genai'
  | 'interview'
  | 'quiz'
  | (string & {}); // allows custom feed modes

export type CardContentType =
  | 'code'
  | 'concept'
  | 'quiz'
  | 'fact'
  | 'case-study'
  | 'tip';

export type DifficultyLevel = 'beginner' | 'intermediate' | 'advanced';

export type GenerateFormat =
  | 'quick-concept'
  | 'code-example'
  | 'interview-question'
  | 'quiz'
  | 'advanced-concept'
  | 'recent-dev'
  | 'random';

export type QuizDisplayMode = 'quiz' | 'flashcard';

export interface CardDepth {
  howItWorks?: string;
  architecture?: string;
  example?: string;
  commonMistakes?: string;
  interviewQuestion?: string;
}

export interface ContentCard {
  id: string;

  // Classification
  topic: TopicType;
  subCategory?: string; // e.g. 'system-design', 'dsa', 'behavioral', 'leadership'
  type: CardContentType;

  // Main content (strictly enforced card quality controls)
  title: string; // <= 60 chars
  hook?: string; // <= 100 chars
  content: string; // <= 300 chars

  // Optional structured content
  code?: {
    language: string;
    code: string; // <= 15 lines
    explanation?: string;
  };

  quiz?: {
    question: string;
    options: string[];
    correctAnswer: number;
    explanation: string;
  };

  // Expandable depth (keeps initial card short without sacrificing depth)
  depth?: CardDepth;

  // Visual
  image?: {
    url: string;
    alt: string;
    prompt?: string;
  };

  // Learning metadata
  difficulty?: DifficultyLevel;
  estimatedReadTime?: number; // seconds
  tags?: string[];

  // User interaction
  isSaved: boolean;
  isRead: boolean;
  swipeDirection?: 'left' | 'right' | 'up' | 'down';

  // AI generation metadata
  source: 'seed' | 'generated';
  generatedAt?: string;
  model?: string;
  generateFormat?: GenerateFormat;

  // Feed metadata
  createdAt: string;
}

export type SwipeLearnNavTab = 'feed' | 'mixed' | 'saved' | 'settings';

export interface TopicSubTab {
  id: string;
  label: string;
  emoji?: string;
}

export interface TopicMeta {
  id: FeedMode;
  label: string;
  emoji: string;
  color: string;
  bgActive: string;
  textActive: string;
  isCustom?: boolean;
  subTabs?: TopicSubTab[];
}

export interface GeminiSettings {
  apiKey: string;
  model: string;
}
