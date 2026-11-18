import { Suspense } from 'react';
import type { Metadata } from 'next';
import GenAILabModule from '@/modules/labs/genai-lab/GenAILabModule';

import Header from '@/components/common/Header';
import RequireAuth from '@/modules/auth/RequireAuth';
import { LabScreenLoading } from '@/modules/labs/common/labNavigation';

export const metadata: Metadata = {
  title: 'GenAI & AI Lab — Lab Ninja',
  description:
    'AI fundamentals, then LLMs, prompting, RAG, agents, fine-tuning, evaluation and shipping generative AI apps.',
};

export default function Page() {
  return (
    <>
      <Header />
      <RequireAuth feature="the GenAI & AI Lab">
        {/* The open topic/subtopic is read from the URL (useSearchParams), which needs a Suspense boundary */}
        <Suspense fallback={<LabScreenLoading />}>
          <GenAILabModule />
        </Suspense>
      </RequireAuth>
    </>
  );
}
