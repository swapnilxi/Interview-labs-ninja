import type { Metadata } from 'next';
import SystemDesignLabInteractive from '@/modules/system-design-lab/SystemDesignLabModule';

import Header from '@/components/common/Header';
import RequireAuth from '@/modules/auth/RequireAuth';

export const metadata: Metadata = {
  title: 'System Design Lab — InterviewNinja',
  description: 'Interactive System Design lab with 16 on-demand sections covering requirements, estimation, architecture, scaling, reliability, and more.',
};

export default function SystemDesignLabPage() {
  return (
    <>
      <Header />
      <RequireAuth feature="the System Design Lab">
        <SystemDesignLabInteractive />
      </RequireAuth>
    </>
  );
}
