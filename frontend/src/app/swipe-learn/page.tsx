import type { Metadata } from 'next';
import Header from '@/components/common/Header';
import SwipeLearnModule from '@/modules/swipe-learn/SwipeLearnModule';

export const metadata: Metadata = {
  title: 'SwipeLearn - Quick Swipeable Learning Feed | LabNinja',
  description: 'A mobile-first learning app that replaces social media scrolling with quick, swipeable learning content across Python, Computer Vision, Finance, and AI.',
};

export default function SwipeLearnPage() {
  return (
    <>
      <Header />
      <div className="min-h-screen bg-background pt-[60px]">
        <SwipeLearnModule />
      </div>
    </>
  );
}
