import type { Metadata } from 'next';
import Header from '@/components/common/Header';
import LabsHomeModule from '@/modules/labs/home/LabsHomeModule';

export const metadata: Metadata = {
  title: 'Labs — InterviewNinja',
  description:
    'Every lab in one place: DSA, System Design, Computer Vision, Communication, Finance and Python.',
};

// Public: it only links to the labs (each lab page asks for a login itself).
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
