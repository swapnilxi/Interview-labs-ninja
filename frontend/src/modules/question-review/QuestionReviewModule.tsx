'use client';

import { useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense } from 'react';
import QuestionDetailCard from './QuestionDetailCard';
import ResponseEditor from './ResponseEditor';
import FeedbackPanel from './FeedbackPanel';
import RelatedQuestionsCard from './RelatedQuestionsCard';
import PerformanceMetricsCard from './PerformanceMetricsCard';
import ActionButtonsPanel from './ActionButtonsPanel';
import InterviewerPerspectiveCard from './InterviewerPerspectiveCard';
import AILabChat from './AILabChat';
import BackButton from '@/components/ui/BackButton';
import { questionsService, Question as ServiceQuestion } from '@/lib/services/questionsService';
import { toast } from '@/lib/ui/toast';

/** The review page is opened from the daily quiz, the question bank and other reviews; this is its parent. */
const QUESTION_BANK_URL = '/daily-session?tab=question-bank';

interface ReviewQuestion {
  id: string;
  title: string;
  category: string;
  subCategory: string;
  difficulty: 'Easy' | 'Medium' | 'Hard';
  dateEncountered: string;
  content: string;
  tags: string[];
  userResponse: string;
  feedback: {
    strengths: string[];
    improvements: string[];
    starGuidance?: {
      situation: string;
      task: string;
      action: string;
      result: string;
    };
    technicalDepth?: string[];
    bestPractices?: string[];
  };
  relatedQuestions: Array<{
    id: string;
    title: string;
    category: string;
    difficulty: 'Easy' | 'Medium' | 'Hard';
    similarity: number;
  }>;
  performanceMetrics: {
    attempts: Array<{
      date: string;
      score: number;
      timeSpent: string;
    }>;
    improvementAreas: string[];
  };
  interviewerPerspective: {
    whatInterviewersLookFor: string[];
    commonMistakes: string[];
    realWorldApplication: string;
  };
  isMastered: boolean;
  isInReviewList: boolean;
}

function mapBackendQuestionToReview(q: ServiceQuestion): ReviewQuestion {
  const tags = q.subType.split(' ').map((s) => s.toLowerCase()).filter(Boolean);

  return {
    id: q.id,
    title: `${q.subType} Core Practice`,
    category: q.category,
    subCategory: q.subType,
    difficulty: q.difficulty,
    dateEncountered: q.dateEncountered,
    content: q.questionText,
    tags: tags.length > 0 ? tags : ['interview'],
    userResponse: '',
    feedback: {
      strengths: ['Demonstrated initial structured reasoning', 'Identified primary design parameters'],
      improvements: ['Consider space optimization trade-offs under heavy throughput constraints'],
      starGuidance: {
        situation: 'Asked to analyze, design, or solve this engineering task.',
        task: 'Provide a robust, scale-aware solution covering standard edge cases.',
        action: 'Formulate structural blocks, compare choices, and implement cleanly.',
        result: 'Optimal complexity, minimized latency overhead, and robust correctness.',
      },
    },
    relatedQuestions: [],
    performanceMetrics: {
      attempts: [
        {
          date: q.dateEncountered,
          score: q.userPerformance !== undefined ? q.userPerformance * 20 : 80,
          timeSpent: '15 mins',
        },
      ],
      improvementAreas: ['Time complexity optimization', 'Production readiness design details'],
    },
    interviewerPerspective: {
      whatInterviewersLookFor: [
        'Problem-solving clarity',
        'Trade-off decisions rationale',
        'System constraints realization',
      ],
      commonMistakes: [
        'Skipping critical validation constraints',
        'Over-engineering the core solution baseline',
      ],
      realWorldApplication: 'Directly impacts application code reliability, performance limits, and resource efficiency.',
    },
    isMastered: q.userPerformance === 5,
    isInReviewList: false,
  };
}

function QuestionReviewContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [isHydrated, setIsHydrated] = useState(false);
  const [questions, setQuestions] = useState<ReviewQuestion[]>([]);
  const [currentQuestion, setCurrentQuestion] = useState<ReviewQuestion | null>(null);
  const [loading, setLoading] = useState(true);
  const [liveResponse, setLiveResponse] = useState('');

  // Each question is its own screen: the answer box, feedback and chat below start empty when the address moves to
  // another question (related question, browser Back/Forward) instead of carrying the previous question's text.
  const currentId = currentQuestion?.id;
  useEffect(() => {
    setLiveResponse('');
  }, [currentId]);

  useEffect(() => {
    setIsHydrated(true);
    let cancelled = false; // the address changed or the page was left while we were still loading
    async function load() {
      let redirecting = false;
      try {
        const questionId = searchParams.get('id');
        const backendQs = await questionsService.getAll();
        const reviewQs = backendQs.map(mapBackendQuestionToReview);
        if (cancelled) return;
        setQuestions(reviewQs);

        let targetQuestion: ReviewQuestion | null = null;
        if (questionId) {
          targetQuestion = reviewQs.find((q) => String(q.id) === String(questionId)) || null;
          // Ids are whole numbers: anything else cannot exist, so don't ask the server (it would only answer 422).
          if (!targetQuestion && /^\d+$/.test(questionId)) {
            const direct = await questionsService.getById(questionId);
            if (direct) {
              targetQuestion = mapBackendQuestionToReview(direct);
            }
          }
        }
        if (cancelled) return;

        if (!targetQuestion && reviewQs.length > 0) {
          // A missing or unknown id must not show some other question under this address: the question bank
          // is the parent screen, so fall back to it (replace: the bad address does not stay in history).
          redirecting = true;
          toast.info(questionId ? `Question ${questionId.slice(0, 40)} was not found.` : 'Pick a question to review it.');
          router.replace(QUESTION_BANK_URL);
          return;
        }

        if (targetQuestion) {
          if (targetQuestion.relatedQuestions.length === 0 && reviewQs.length > 1) {
            targetQuestion.relatedQuestions = reviewQs
              .filter((rq) => rq.id !== targetQuestion!.id)
              .slice(0, 3)
              .map((rq) => ({
                id: rq.id,
                title: rq.title,
                category: rq.category,
                difficulty: rq.difficulty,
                similarity: 85,
              }));
          }
          setCurrentQuestion(targetQuestion);
        }
      } catch (err) {
        console.error('Failed to load questions in review:', err);
      } finally {
        if (!cancelled && !redirecting) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [searchParams, router]);

  const handleResponseUpdate = (response: string) => {
    setLiveResponse(response);
    setCurrentQuestion((prev) => ({
      ...prev!,
      userResponse: response,
    }));
  };

  const handleQuestionSelect = (questionId: string) => {
    router.push(`/question-review?id=${questionId}`);
  };

  const handlePracticeSimilar = () => {
    router.push('/daily-session');
  };

  const handleToggleReviewList = () => {
    setCurrentQuestion((prev) => ({
      ...prev!,
      isInReviewList: !prev!.isInReviewList,
    }));
  };

  const handleToggleMastered = async () => {
    if (!currentQuestion) return;
    const newMastered = !currentQuestion.isMastered;
    const newPerformance = newMastered ? 5 : 3;
    try {
      await questionsService.updatePerformance(currentQuestion.id, newPerformance);
      setCurrentQuestion((prev) => {
        if (!prev) return null;
        return {
          ...prev,
          isMastered: newMastered,
          performanceMetrics: {
            ...prev.performanceMetrics,
            attempts: [
              ...prev.performanceMetrics.attempts,
              { date: new Date().toISOString().split('T')[0], score: newPerformance * 20, timeSpent: '5 mins' }
            ]
          }
        };
      });
    } catch (err) {
      console.error('Failed to update mastered state:', err);
    }
  };

  if (!isHydrated || loading) {
    return (
      <div className="min-h-screen bg-background pt-[60px]">
        <div className="max-w-[1400px] mx-auto px-24 py-36">
          <div className="flex items-center justify-center h-[400px]">
            <div className="w-12 h-12 border-4 border-primary/30 border-t-primary rounded-full animate-spin" />
          </div>
        </div>
      </div>
    );
  }

  if (!currentQuestion) {
    return (
      <div className="min-h-screen bg-background pt-[60px]">
        <div className="max-w-[1400px] mx-auto px-24 py-36 text-center">
          <div className="mb-[1.5rem] text-left">
            <BackButton href={QUESTION_BANK_URL} preferHistory />
          </div>
          <div className="max-w-md mx-auto p-8 rounded-2xl border border-border bg-card">
            <h2 className="text-xl font-bold mb-2">Question Not Found</h2>
            <p className="text-sm text-muted-foreground mb-6">
              Could not find question #{searchParams.get('id') || ''}. It may have been deleted or the ID is invalid.
            </p>
            <button
              onClick={() => router.push(QUESTION_BANK_URL)}
              className="px-5 py-2.5 bg-primary text-white rounded-xl text-sm font-semibold hover:bg-primary/90 transition-smooth"
            >
              Browse Question Bank
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background pt-[60px]">
      <div className="max-w-[1400px] mx-auto px-24 py-36">
        <div className="mb-24">
          {/* Reachable from the daily quiz, the question bank and other reviews: Back returns to wherever the
              user came from, and to the question bank when there is no history (a refresh, a shared link). */}
          <BackButton href={QUESTION_BANK_URL} preferHistory />
        </div>

        <div key={currentQuestion.id} className="grid grid-cols-1 lg:grid-cols-3 gap-24">
          <div className="lg:col-span-2 space-y-24">
            <QuestionDetailCard question={currentQuestion} />
            <ResponseEditor
              initialResponse={currentQuestion.userResponse}
              onResponseUpdate={handleResponseUpdate}
              questionId={currentQuestion.id}
            />
            <FeedbackPanel
              feedback={currentQuestion.feedback}
              questionType={currentQuestion.category}
              hasAnswer={liveResponse.trim().length > 10}
            />
            {liveResponse.trim().length > 10 && (
              <InterviewerPerspectiveCard
                perspective={currentQuestion.interviewerPerspective}
              />
            )}
          </div>

          <div className="space-y-24">
            <ActionButtonsPanel
              questionId={currentQuestion.id}
              isMastered={currentQuestion.isMastered}
              isInReviewList={currentQuestion.isInReviewList}
              onPracticeSimilar={handlePracticeSimilar}
              onToggleReviewList={handleToggleReviewList}
              onToggleMastered={handleToggleMastered}
            />
            <AILabChat 
              questionId={currentQuestion.id}
              questionText={currentQuestion.content}
            />
            <PerformanceMetricsCard
              attempts={currentQuestion.performanceMetrics.attempts}
              improvementAreas={currentQuestion.performanceMetrics.improvementAreas}
            />
            <RelatedQuestionsCard
              questions={currentQuestion.relatedQuestions}
              onQuestionSelect={handleQuestionSelect}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

function LoadingSkeleton() {
  return (
    <div className="min-h-screen bg-background pt-[60px]">
      <div className="max-w-[1400px] mx-auto px-24 py-36">
        <div className="flex items-center justify-center h-[400px]">
          <div className="w-48 h-48 border-4 border-primary/30 border-t-primary rounded-full animate-spin" />
        </div>
      </div>
    </div>
  );
}

export default function QuestionReviewInteractive() {
  return (
    <Suspense fallback={<LoadingSkeleton />}>
      <QuestionReviewContent />
    </Suspense>
  );
}