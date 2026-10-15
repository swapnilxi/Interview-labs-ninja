import { Suspense } from 'react';
import type { Metadata } from 'next';
import Header from '@/components/common/Header';
import SwipePdfReaderModule from '@/modules/swipe-pdf-reader/SwipePdfReaderModule';

export const metadata: Metadata = {
  title: 'Swipe PDF Reader - Convert PDF & Notes into Swipeable Cards | LabNinja',
  description: 'Upload PDFs or paste document text to extract text, preserve page numbers, and swipe through bite-sized learning cards.',
};

export default function SwipePdfReaderAliasPage() {
  return (
    <>
      <Header />
      <div className="min-h-screen bg-background pt-[60px]">
        {/* The module keeps the open screen in the URL (?doc=, &card=, ?input=), which needs a Suspense boundary above it. */}
        <Suspense
          fallback={
            <div className="flex min-h-[50vh] items-center justify-center text-sm text-muted-foreground">Loading…</div>
          }
        >
          <SwipePdfReaderModule />
        </Suspense>
      </div>
    </>
  );
}
