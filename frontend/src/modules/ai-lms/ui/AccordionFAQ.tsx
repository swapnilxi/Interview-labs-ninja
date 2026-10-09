'use client';

import React, { useState } from 'react';

export interface AbFaqItem {
  question: string;
  answer: string;
}

/** Ported from AI-Bootcamp-reference's `components/ui/AccordionFAQ.tsx`. */
export function AbAccordionFAQ({
  items,
  className = '',
}: {
  items: AbFaqItem[];
  className?: string;
}) {
  const [openIndex, setOpenIndex] = useState<number | null>(0);

  return (
    <div className={`divide-y divide-white/5 border-y border-white/5 ${className}`}>
      {items.map((item, idx) => {
        const isOpen = openIndex === idx;
        return (
          <div key={idx} className="py-5 sm:py-6 group/item">
            <button
              type="button"
              onClick={() => setOpenIndex(isOpen ? null : idx)}
              className="w-full flex items-center justify-between text-left gap-4 py-1 text-ab-text hover:text-ab-gold transition-colors duration-300 focus-visible:outline-2 focus-visible:outline-ab-gold group"
              aria-expanded={isOpen}
            >
              <span className="font-ab-serif text-lg sm:text-xl font-normal text-ab-text group-hover:text-ab-gold group-hover:translate-x-1 transition-[color,transform] duration-500 ease-[cubic-bezier(0.16,1,0.3,1)]">
                {item.question}
              </span>
              <span
                className={`flex items-center justify-center w-9 h-9 rounded-full border text-ab-text-muted text-xl font-light shrink-0 select-none transition-[transform,border-color,background-color] duration-500 ease-[cubic-bezier(0.16,1,0.3,1)] ${
                  isOpen
                    ? 'rotate-45 border-ab-gold/50 bg-ab-gold/10'
                    : 'border-white/10 group-hover:border-ab-gold/40'
                }`}
                aria-hidden="true"
              >
                +
              </span>
            </button>
            <div className="accordion-panel" data-open={isOpen} aria-hidden={!isOpen}>
              <div>
                <p className="pt-3 pr-12 text-ab-text-muted text-base leading-relaxed">
                  {item.answer}
                </p>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
