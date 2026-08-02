import type { Metadata } from 'next';
import Header from '@/components/common/Header';
import DailySessionInteractive from '@/modules/daily-session/DailySessionModule';
import RequireAuth from '@/modules/auth/RequireAuth';

export const metadata: Metadata = {
  title: 'Daily Session - InterviewNinja',
  description: 'Practice 10 customized technical and Computer Vision interview questions daily based on your profile resume and target job descriptions.',
};

export default function DailySessionPage() {
  return (
    <>
      <Header />
      <RequireAuth feature="Daily Session">
      <div className="min-h-screen bg-background pt-[60px]">
        {/* Gradient page header */}
        <div className="relative overflow-hidden border-b border-border">
          <div className="absolute inset-0 bg-gradient-to-br from-violet-600/10 via-primary/5 to-blue-600/8 pointer-events-none" />
          <div className="absolute -top-10 right-16 w-56 h-56 bg-primary/6 rounded-full blur-3xl pointer-events-none" />
          <div className="relative max-w-[1100px] mx-auto px-24 py-24">
            <div className="flex items-center gap-3.5 mb-18">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-violet-500 to-primary flex items-center justify-center shadow-lg shadow-primary/25 flex-shrink-0">
                <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4.26 10.147a60.436 60.436 0 00-.491 6.347A48.627 48.627 0 0112 20.904a48.627 48.627 0 018.232-4.41 60.46 60.46 0 00-.491-6.347m-15.482 0a50.57 50.57 0 00-2.658-.813A59.905 59.905 0 0112 3.493a59.902 59.902 0 0110.399 5.84c-.896.248-1.783.52-2.658.814m-15.482 0A50.697 50.697 0 0112 13.489a50.702 50.702 0 017.74-3.342M6.75 15a.75.75 0 100-1.5.75.75 0 000 1.5zm0 0v-3.675A55.378 55.378 0 0112 8.443m-7.007 11.55A5.981 5.981 0 006.75 15.75v-1.5" />
                </svg>
              </div>
              <div>
                <h1 className="text-2xl font-bold text-foreground tracking-tight">Daily Training Session</h1>
                <p className="text-sm text-muted-foreground mt-0.5">10 personalised questions · timed practice · AI-powered hints</p>
              </div>
            </div>
            <div className="flex flex-wrap gap-5 ml-[54px]">
              {[
                { label: 'Timed practice' },
                { label: 'AI hints on demand' },
                { label: 'Progress tracked' },
                { label: 'DB-backed questions' },
              ].map(item => (
                <span key={item.label} className="text-xs text-muted-foreground/70 before:content-['·'] before:mr-1.5 before:text-primary/50 first:before:content-none">
                  {item.label}
                </span>
              ))}
            </div>
          </div>
        </div>
        <div className="page-wrapper">
          <DailySessionInteractive />
        </div>
      </div>
      </RequireAuth>
    </>
  );
}
