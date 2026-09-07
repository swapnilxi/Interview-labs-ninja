import type { Metadata } from 'next';
import DSALabInteractive from '@/modules/dsa-lab/DSALabModule';
import Header from '@/components/common/Header';
import RequireAuth from '@/modules/auth/RequireAuth';

export const metadata: Metadata = {
  title: 'DSA Lab — InterviewNinja',
  description: 'Interactive Data Structures and Algorithms lab with AI-powered topic exploration, quizzes, and deep-dive sessions.',
};

export default function DSALabPage() {
  return (
    <>
      <Header />
      <RequireAuth feature="the DSA Lab">
        <DSALabInteractive />
      </RequireAuth>
    </>
  );
}
