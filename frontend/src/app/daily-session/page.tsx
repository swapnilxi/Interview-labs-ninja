import type { Metadata } from 'next';
import Header from '@/components/common/Header';
import DailySessionContainer from '@/modules/daily-session/DailySessionContainer';
import RequireAuth from '@/modules/auth/RequireAuth';

export const metadata: Metadata = {
  title: 'Daily Session & Practice - InterviewNinja',
  description: 'Practice 10 customized technical and Computer Vision interview questions daily, targeted drills, rapid-fire blitz, progress analytics, and question repository.',
};

export default function DailySessionPage() {
  return (
    <>
      <Header />
      <RequireAuth feature="Daily Session">
        <DailySessionContainer />
      </RequireAuth>
    </>
  );
}
