'use client';

import React from 'react';
import Icon from '@/components/ui/AppIcon';
import type { Question } from '@/lib/services/questionsService';
import { toneClass, type Tone } from '../ds';

export interface Mission {
  id: 'review' | 'fresh' | 'weak' | 'hard';
  icon: string;
  tone: Tone;
  title: string;
  sub: string;
  /** The run it starts. Empty: the row is a quiet note, not a button (an empty review list). */
  questions: Question[];
}

/** One-tap drills built from your own data (review list, unrated questions, weakest topic). iOS grouped list. */
export default function Missions({ missions, onStart }: { missions: Mission[]; onStart: (m: Mission) => void }) {
  return (
    <section aria-labelledby="pm-missions-title">
      <div className="ds-section-head">
        <h2 id="pm-missions-title">Missions</h2>
        <span>One tap to start</span>
      </div>
      <ul className="ds-list" data-icons="true">
        {missions.map((m) => {
          const body = (
            <>
              <span className={`ds-icon-tile ds-icon-tile-sm ${toneClass(m.tone)}`}>
                <Icon name={m.icon} size={16} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-[15px] font-semibold leading-snug ds-ink">{m.title}</span>
                <span className="block text-xs leading-snug ds-faint">{m.sub}</span>
              </span>
            </>
          );
          return (
            <li key={m.id}>
              {m.questions.length > 0 ? (
                <button type="button" className="ds-list-row w-full text-left" onClick={() => onStart(m)}>
                  {body}
                  <span className="pm-mission-count ds-num">{m.questions.length}</span>
                  <Icon name="ChevronRightIcon" size={16} className="ds-chevron" />
                </button>
              ) : (
                <div className="ds-list-row">{body}</div>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
