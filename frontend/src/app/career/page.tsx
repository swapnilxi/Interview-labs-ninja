import type { Metadata } from 'next';
import Header from '@/components/common/Header';
import Icon from '@/components/ui/AppIcon';
import CareerStudioTabs from '@/modules/career-studio/views/CareerStudioTabs';

export const metadata: Metadata = {
  title: 'Career Studio - InterviewNinja',
  description: 'Fill your data once, then generate resumes and portfolios in any template — your personal career workspace.',
};

export default function CareerStudioPage() {
  return (
    <>
      <Header />
      <div className="min-h-screen bg-background pt-[60px]">
        <div className="max-w-[1400px] mx-auto px-24 py-24">
          <div className="relative overflow-hidden rounded-2xl p-7 sm:p-8 mb-10 text-white shadow-xl bg-gradient-to-br from-[#5b5bd6] via-[#6d5be0] to-[#7c3aed]">
            <div className="pointer-events-none absolute -top-20 -right-14 w-64 h-64 rounded-full bg-white/10 blur-3xl" />
            <div className="pointer-events-none absolute -bottom-28 -left-14 w-64 h-64 rounded-full bg-black/10 blur-3xl" />
            <div
              className="pointer-events-none absolute inset-0 opacity-[0.07]"
              style={{ backgroundImage: 'radial-gradient(rgba(255,255,255,0.9) 1px, transparent 1px)', backgroundSize: '18px 18px' }}
            />
            <div className="relative flex items-center gap-4">
              <div className="w-12 h-12 rounded-xl bg-white/15 ring-1 ring-white/25 backdrop-blur-sm flex items-center justify-center shadow-lg shrink-0">
                <Icon name="BriefcaseIcon" size={24} className="text-white" />
              </div>
              <div>
                <h1 className="font-heading text-2xl font-bold text-white tracking-tight">Career Studio</h1>
                <p className="text-sm text-white/80 mt-0.5 max-w-2xl">
                  Fill your data once in a profile, then generate resumes &amp; portfolios in any template. Edit the profile and every document updates.
                </p>
              </div>
            </div>
          </div>
          <CareerStudioTabs />
        </div>
      </div>
    </>
  );
}
