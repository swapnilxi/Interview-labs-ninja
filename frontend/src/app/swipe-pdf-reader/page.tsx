import type { Metadata } from 'next';
import Header from '@/components/common/Header';
import SwipePdfReaderModule from '@/modules/swipe-pdf-reader/SwipePdfReaderModule';

export const metadata: Metadata = {
  title: 'Swipe PDF Reader - Convert PDF & Notes into Swipeable Cards | LabNinja',
  description: 'Upload PDFs or paste document text to extract text, preserve page numbers, and swipe through bite-sized learning cards.',
};

export default function SwipePdfReaderPage() {
  return (
    <>
      <Header />
      <div className="min-h-screen bg-background pt-[60px]">
        <SwipePdfReaderModule />
      </div>
    </>
  );
}
