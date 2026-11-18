import type { Metadata } from 'next';
import Header from '@/components/common/Header';
import LabsHomeModule from '@/modules/labs/home/LabsHomeModule';

export const metadata: Metadata = {
  title: 'Labs — Lab Ninja',
  description:
    'Every lab in one place: DSA, System Design, Computer Vision, Communication, Finance, Python and GenAI & AI.',
};

// Login required like every page (AuthGate in the root layout); it only links to the labs.
export default function LabsPage() {
  return (
    <>
      <Header />
      <div className="lab-page min-h-screen bg-background pt-[60px]">
        <div className="mx-auto max-w-[1100px] px-4 py-[1.5rem] sm:px-[2rem] sm:py-[2rem]">
          <LabsHomeModule />
        </div>
      </div>
    </>
  );
}
