import type { Metadata } from 'next';
import Header from '@/components/common/Header';
import QuestionReviewInteractive from '@/modules/question-review/QuestionReviewModule';
import RequireAuth from '@/modules/auth/RequireAuth';

export const metadata: Metadata = {
  title: 'Question review - Lab-Ninja',
  description:
    'Work on one interview question: write and dictate your answer, get it evaluated, learn it with an AI tutor, quiz yourself and keep notes.',
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
