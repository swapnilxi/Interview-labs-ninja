'use client';

import { ContentCard, FeedMode, TopicType, CardContentType, DifficultyLevel, GenerateFormat } from '../types';

const GEMINI_API_KEY_STORAGE = 'swipelearn_gemini_api_key_v1';
const GEMINI_MODEL_STORAGE = 'swipelearn_gemini_model_v1';

export function getStoredGeminiKey(): string {
  if (typeof window === 'undefined') return '';
  return localStorage.getItem(GEMINI_API_KEY_STORAGE) || '';
}

export function saveStoredGeminiKey(key: string): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(GEMINI_API_KEY_STORAGE, key.trim());
}

export function clearStoredGeminiKey(): void {
  if (typeof window === 'undefined') return;
  localStorage.removeItem(GEMINI_API_KEY_STORAGE);
}

export function getStoredGeminiModel(): string {
  if (typeof window === 'undefined') return 'gemini-2.5-flash';
  return localStorage.getItem(GEMINI_MODEL_STORAGE) || 'gemini-2.5-flash';
}

export function saveStoredGeminiModel(model: string): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(GEMINI_MODEL_STORAGE, model);
}

export async function testGeminiConnection(apiKey: string): Promise<{ success: boolean; error?: string }> {
  if (!apiKey || !apiKey.trim()) {
    return { success: false, error: 'API key cannot be empty.' };
  }

  const model = getStoredGeminiModel();
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(apiKey.trim())}`;

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: 'Respond with the single word "OK".' }] }],
        generationConfig: { maxOutputTokens: 10, temperature: 0.1 },
      }),
    });

    if (!res.ok) {
      const errJson = await res.json().catch(() => ({}));
      const msg = errJson?.error?.message || `HTTP ${res.status}: ${res.statusText}`;
      return { success: false, error: msg };
    }

    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message || 'Network error connecting to Gemini API.' };
  }
}

export async function generateGeminiCard(
  feedMode: FeedMode,
  existingTitles: string[] = [],
  format: GenerateFormat = 'random',
  activeTopicLabel?: string
): Promise<ContentCard> {
  const apiKey = getStoredGeminiKey();
  const model = getStoredGeminiModel();

  // If feedMode is 'mixed', pick a random topic from available topics
  const targetTopic: TopicType =
    feedMode === 'mixed'
      ? (['python', 'computer-vision', 'finance', 'ai', 'interview', 'quiz'] as const)[
          Math.floor(Math.random() * 6)
        ]
      : feedMode;

  const topicName = activeTopicLabel || targetTopic;

  if (apiKey) {
    try {
      const formatInstructions: Record<GenerateFormat, string> = {
        'quick-concept': 'Format: High-yield concept with a punchy definition (1-2 sentences) and expandable depth.',
        'code-example': 'Format: Code example with a clean, practical 3-8 line code snippet and explanation.',
        'interview-question': 'Format: Real-world technical interview scenario question highlighting engineering trade-offs.',
        quiz: 'Format: Multiple-choice quiz with exactly 4 options and 1 clear correct answer.',
        'advanced-concept': 'Format: Advanced internal architecture, performance gotchas, or low-level mechanics.',
        'recent-dev': 'Format: Recent 2025/2026 industry advancement, modern standard, or ecosystem breakthrough.',
        random: 'Format: Choose whichever format best teaches a high-impact concept in this domain.',
      };

      const systemPrompt = `You are a world-class technical educator creating mobile micro-learning cards for SwipeLearn.
Create exactly ONE card for the topic: "${topicName}".
${formatInstructions[format] || formatInstructions.random}
Do not repeat these concepts: ${existingTitles.slice(0, 15).join(', ')}.

MANDATORY CARD QUALITY CONTROLS:
- title: MUST be <= 60 characters. Crisp, memorable.
- hook: MUST be <= 100 characters. Punchy opening hook (e.g. "Stop doing this 👇" or "10x memory savings ⚡").
- content: MUST be <= 300 characters. Extremely short, readable, zero fluff.
- code: If included, code must be <= 15 lines. Clean formatting.
- depth: Include structured expandable breakdown:
    - howItWorks (1-2 sentences)
    - architecture (1-2 sentences or ASCII pipeline)
    - example (concrete 1 sentence scenario)
    - commonMistakes (1 common pitfall)
    - interviewQuestion (1 realistic interview follow-up)

Return RAW valid JSON ONLY (no markdown backticks, no markdown code block formatting):
{
  "title": "Concept Title (<= 60 chars)",
  "hook": "Punchy Hook (<= 100 chars)",
  "content": "Short core insight (<= 300 chars)",
  "type": "code" | "concept" | "quiz" | "fact" | "tip",
  "code": {
    "language": "python",
    "code": "executable lines",
    "explanation": "why this works"
  },
  "quiz": {
    "question": "question text",
    "options": ["A", "B", "C", "D"],
    "correctAnswer": 0,
    "explanation": "why A is correct"
  },
  "depth": {
    "howItWorks": "core mechanism",
    "architecture": "flow pipeline",
    "example": "real use case",
    "commonMistakes": "what to avoid",
    "interviewQuestion": "follow-up question"
  },
  "difficulty": "beginner" | "intermediate" | "advanced",
  "estimatedReadTime": 15,
  "tags": ["tag1", "tag2"]
}`;

      const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(apiKey)}`;
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: systemPrompt }] }],
          generationConfig: {
            responseMimeType: 'application/json',
            temperature: 0.7,
            maxOutputTokens: 800,
          },
        }),
      });

      if (res.ok) {
        const data = await res.json();
        const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
        if (text) {
          const parsed = JSON.parse(text);
          return {
            id: `gen-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`,
            topic: targetTopic,
            type: (['code', 'concept', 'quiz', 'fact', 'case-study', 'tip'].includes(parsed.type)
              ? parsed.type
              : format === 'quiz'
              ? 'quiz'
              : format === 'code-example'
              ? 'code'
              : 'concept') as CardContentType,
            title: (parsed.title || `${topicName} Concept`).slice(0, 60),
            hook: parsed.hook ? parsed.hook.slice(0, 100) : undefined,
            content: (parsed.content || 'Quick micro-learning insight.').slice(0, 300),
            code: parsed.code?.code
              ? {
                  language: parsed.code.language || 'python',
                  code: parsed.code.code.split('\n').slice(0, 15).join('\n'),
                  explanation: parsed.code.explanation,
                }
              : undefined,
            quiz: parsed.quiz?.options
              ? {
                  question: parsed.quiz.question || parsed.content,
                  options: parsed.quiz.options,
                  correctAnswer: typeof parsed.quiz.correctAnswer === 'number' ? parsed.quiz.correctAnswer : 0,
                  explanation: parsed.quiz.explanation || 'Verified correct answer.',
                }
              : undefined,
            depth: parsed.depth
              ? {
                  howItWorks: parsed.depth.howItWorks,
                  architecture: parsed.depth.architecture,
                  example: parsed.depth.example,
                  commonMistakes: parsed.depth.commonMistakes,
                  interviewQuestion: parsed.depth.interviewQuestion,
                }
              : undefined,
            difficulty: (['beginner', 'intermediate', 'advanced'].includes(parsed.difficulty)
              ? parsed.difficulty
              : 'intermediate') as DifficultyLevel,
            estimatedReadTime: parsed.estimatedReadTime || 15,
            tags: Array.isArray(parsed.tags) ? parsed.tags : [topicName],
            isSaved: false,
            isRead: false,
            source: 'generated',
            generateFormat: format,
            model: 'gemini',
            createdAt: new Date().toISOString(),
          };
        }
      }
    } catch (e) {
      console.warn('Gemini dynamic card generation error, using fallback generator:', e);
    }
  }

  // Fallback offline dynamic generator
  return generateFallbackContentCard(targetTopic, format, topicName);
}

function generateFallbackContentCard(
  topic: TopicType,
  format: GenerateFormat = 'random',
  topicName: string = topic
): ContentCard {
  const fallbackTemplates: Record<string, Omit<ContentCard, 'id' | 'topic' | 'isSaved' | 'isRead' | 'source' | 'createdAt'>> = {
    'quick-concept': {
      type: 'concept',
      title: `${topicName} Core Invariant`,
      hook: 'Foundation concept ⚡',
      content: `In ${topicName}, understanding core state management and performance invariants is critical for production reliability.`,
      depth: {
        howItWorks: `Components communicate via well-defined interfaces, isolating mutations and minimizing side effects.`,
        architecture: `Client / Input → State Processor → Validation Invariant → Output Result.`,
        example: `Production service handling 10k requests/sec while maintaining idempotent transaction boundaries.`,
        commonMistakes: `Failing to handle network partition timeouts and missing telemetry error budgets.`,
        interviewQuestion: `How would you architect this system to scale horizontally under 10x traffic spikes?`,
      },
      difficulty: 'intermediate',
      estimatedReadTime: 15,
      tags: [topicName, 'concept'],
    },
    'code-example': {
      type: 'code',
      title: `${topicName} Idiomatic Pattern`,
      hook: 'Clean and maintainable 💻',
      content: `A clean implementation pattern in ${topicName} demonstrating defensive checks and zero-allocation logic.`,
      code: {
        language: 'python',
        code: `# Idiomatic ${topicName} processing\ndef process_batch(items):\n    return [item.strip() for item in items if item]`,
        explanation: 'Avoids redundant memory copies by utilizing lazy generator evaluation.',
      },
      depth: {
        howItWorks: 'Filters whitespace and empty elements in a single pass without extra memory allocations.',
        example: 'Preprocessing dirty telemetry streams before passing to downstream analytical pipelines.',
      },
      difficulty: 'beginner',
      estimatedReadTime: 15,
      tags: [topicName, 'code'],
    },
    quiz: {
      type: 'quiz',
      title: `${topicName} Recall Check`,
      content: `What is the primary architectural trade-off when optimizing for throughput in ${topicName}?`,
      quiz: {
        question: `What is the primary trade-off when optimizing throughput in ${topicName}?`,
        options: [
          'Higher batching latency per item',
          'Decreased disk storage footprint',
          'Increased single-thread CPU affinity',
          'Elimination of network serializations',
        ],
        correctAnswer: 0,
        explanation: 'Batching increases throughput at the expense of higher individual item latency.',
      },
      difficulty: 'intermediate',
      estimatedReadTime: 15,
      tags: [topicName, 'quiz'],
    },
  };

  const selectedKey = format === 'quiz' ? 'quiz' : format === 'code-example' ? 'code-example' : 'quick-concept';
  const t = fallbackTemplates[selectedKey];

  return {
    id: `fallback-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`,
    topic,
    type: t.type,
    title: t.title.slice(0, 60),
    hook: t.hook?.slice(0, 100),
    content: t.content.slice(0, 300),
    code: t.code,
    quiz: t.quiz,
    depth: t.depth,
    difficulty: t.difficulty,
    estimatedReadTime: t.estimatedReadTime,
    tags: t.tags,
    isSaved: false,
    isRead: false,
    source: 'generated',
    generateFormat: format,
    model: 'gemini-fallback',
    createdAt: new Date().toISOString(),
  };
}
