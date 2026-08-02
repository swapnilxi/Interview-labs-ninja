import type { Metadata } from 'next';
import Header from '@/components/common/Header';
import QuestionBankInteractive from '@/modules/question-bank/QuestionBankModule';
import RequireAuth from '@/modules/auth/RequireAuth';

export const metadata: Metadata = {
  title: 'Question Bank - InterviewNinja',
  description: 'Review, filter, and practice previously encountered interview and computer vision questions for targeted skill reinforcement and long-term retention.',
};

export default function QuestionBankPage() {
  return (
    <>
      <Header />
      <RequireAuth feature="the Question Bank">
        <QuestionBankInteractive />
      </RequireAuth>
    </>
  );
}