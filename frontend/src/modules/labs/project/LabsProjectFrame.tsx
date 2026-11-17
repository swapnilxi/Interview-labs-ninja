import type { ReactNode } from 'react';
import Header from '@/components/common/Header';
import RequireAuth from '@/modules/auth/RequireAuth';

/** The frame every Labs Project page shares (the list and its screens, New project): app header, login gate, the lab hairline, one column. */
export default function LabsProjectFrame({ children }: { children: ReactNode }) {
  return (
    <>
      <Header />
      <RequireAuth feature="Labs Project">
        <div className="lab-page min-h-screen bg-background pt-[60px]">
          <div className="mx-auto max-w-[1100px] px-4 py-[1.5rem] sm:px-[2rem] sm:py-[2rem]">
            {children}
          </div>
        </div>
      </RequireAuth>
    </>
  );
}
