import type { Metadata } from 'next';
import Header from '@/components/common/Header';
import QuestionReviewInteractive from '@/modules/question-review/QuestionReviewModule';
import RequireAuth from '@/modules/auth/RequireAuth';

export const metadata: Metadata = {
  title: 'Question Review - InterviewNinja',
  description: 'Review individual questions with detailed feedback, improvement recommendations, and performance metrics for targeted skill development and interview preparation.',
};

export default function QuestionReviewPage() {
  return (
    <>
      <Header />
      <RequireAuth feature="Question Review">
        <QuestionReviewInteractive />
      </RequireAuth>
    </>
  );
}