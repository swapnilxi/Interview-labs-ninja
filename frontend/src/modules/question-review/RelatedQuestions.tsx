'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import Icon from '@/components/ui/AppIcon';
import { difficultyTone, toneClass } from '@/modules/daily-session/components/ds';
import {
  difficultyLabel,
  questionReviewService,
  type ReviewQuestion,
} from './questionReviewService';

const MAX_RELATED = 5;

interface Ranked {
  q: ReviewQuestion;
  shared: string[];
  sameType: boolean;
}

const norm = (s: string) => s.trim().toLowerCase();

/** Questions that share a topic (counts twice) or the question type with `current`, best first. Repeats dropped. */
export function rankRelated(all: ReviewQuestion[], current: ReviewQuestion): Ranked[] {
  const topics = new Set(current.topics.map(norm));
  const seen = new Set([norm(current.questionText)]);
  const ranked: (Ranked & { score: number })[] = [];
  for (const q of all) {
    const text = norm(q.questionText);
    if (q.id === current.id || seen.has(text)) continue;
    seen.add(text);
    const shared = q.topics.filter((t) => topics.has(norm(t)));
    const sameType = !!current.subType && norm(q.subType) === norm(current.subType);
    const score = shared.length * 2 + (sameType ? 1 : 0);
    if (score > 0) ranked.push({ q, shared, sameType, score });
  }
  ranked.sort((a, b) => b.score - a.score || b.q.id - a.q.id);
  return ranked.slice(0, MAX_RELATED);
}

/** Other questions on the same ground. Loaded after the page, and simply left out when there are none. */
export default function RelatedQuestions({ question }: { question: ReviewQuestion }) {
  const [related, setRelated] = useState<Ranked[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    questionReviewService
      .listQuestions()
      .then((all) => !cancelled && setRelated(rankRelated(all, question)))
      .catch(() => !cancelled && setRelated([]));
    return () => {
      cancelled = true;
    };
  }, [question]);

  if (!related || related.length === 0) return null;

  return (
    <section aria-labelledby="qr-related-title">
      <div className="ds-section-head">
        <h2 id="qr-related-title">Related questions</h2>
        <span>Same topic or type</span>
      </div>
      <ul className="ds-list">
        {related.map(({ q, shared, sameType }) => (
          <li key={q.id}>
            <Link
              href={`/question-review?id=${q.id}`}
              prefetch={false}
              className="ds-list-row ds-list-row-top"
            >
              <span className="min-w-0 flex-1">
                <span className="ds-clamp-2 text-[0.9375rem] font-semibold leading-snug ds-ink">
                  {q.questionText}
                </span>
                <span className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs ds-faint">
                  <span
                    className={`inline-flex items-center gap-1.5 font-semibold ${toneClass(difficultyTone(q.difficulty))} ds-tone-text`}
                  >
                    <span className="ds-dot" aria-hidden="true" />
                    {difficultyLabel(q.difficulty)}
                  </span>
                  {q.subType && (
                    <>
                      <span aria-hidden="true">·</span>
                      <span className="break-words">{q.subType}</span>
                    </>
                  )}
                  <span aria-hidden="true">·</span>
                  <span className="break-words">
                    {shared.length > 0
                      ? `Shares ${shared.join(', ')}`
                      : sameType
                        ? 'Same type'
                        : ''}
                  </span>
                </span>
              </span>
              <Icon name="ChevronRightIcon" size={16} className="ds-chevron mt-0.5" />
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
