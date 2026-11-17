'use client';

import React from 'react';
import Icon from '@/components/ui/AppIcon';
import Mascot from '../../companion/Mascot';
import { EvaluationView } from '../../coach/AnswerCoach';
import type { Evaluation } from '../../coach/answerCoachService';
import { detectKind, KIND_LABEL } from '../../coach/questionKind';
import { Ring, toneClass } from '../ds';
import { GRADE_META, SELF_CHECK, type Grade } from './progression';
import { useCountUp, useSettle } from './useCountUp';

export type ReviewChange = 'added' | 'cleared' | null;

function XpLine({ base, combo, self }: { base: number; combo: number; self?: boolean }) {
  return (
    <p className="pm-xp-line">
      <span className="pm-xp-pop ds-num">+{base + combo} XP</span>
      {combo > 0 && (
        <span className="ds-chip ds-tone-gold">
          <Icon name="FireIcon" size={13} variant="solid" />
          Combo +{combo}
        </span>
      )}
      {self && <span className="text-xs ds-faint">Graded by you</span>}
    </p>
  );
}

function ReviewNote({ change, saveFailed }: { change: ReviewChange; saveFailed?: boolean }) {
  return (
    <>
      {change === 'cleared' && (
        <p className="ds-banner ds-tone-jade mt-3 text-[13px]">
          <Icon name="CheckCircleIcon" size={16} variant="solid" />
          <span>Cleared from your review list.</span>
        </p>
      )}
      {change === 'added' && (
        <p className="ds-banner ds-tone-rose mt-3 text-[13px]">
          <Icon name="ArrowPathIcon" size={16} />
          <span>Added to your review list. The review mission brings it back.</span>
        </p>
      )}
      {saveFailed && (
        <p className="mt-3 text-xs ds-tone-rose ds-tone-text" role="status">
          This result could not be saved to your question bank. Your XP still counts.
        </p>
      )}
    </>
  );
}

/** The AI is reading the answer. */
export function CheckingPanel({ chat }: { chat: boolean }) {
  return (
    <div className="pm-result pm-result-checking" role="status" aria-live="polite">
      <Mascot mood="think" size={44} className="flex-shrink-0" />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium ds-ink">{chat ? 'Scoring your chat' : 'Checking your answer'}</p>
        <p className="text-xs ds-faint">Against a rubric for this kind of question. This can take a few seconds.</p>
        <div className="pm-shimmer mt-3" aria-hidden="true">
          <span />
          <span />
        </div>
      </div>
    </div>
  );
}

export function CheckError({ message, onRetry, onSelf }: { message: string; onRetry: () => void; onSelf: () => void }) {
  return (
    <div className="ds-banner ds-tone-rose items-start" role="alert">
      <Icon name="ExclamationTriangleIcon" size={17} variant="solid" />
      <div className="min-w-0 flex-1">
        <p className="font-medium">The answer could not be checked</p>
        <p className="mt-0.5 text-[13px]">{message}</p>
        <div className="mt-3 flex flex-wrap gap-2">
          <button type="button" onClick={onRetry} className="ds-btn ds-btn-secondary ds-btn-sm">
            <Icon name="ArrowPathIcon" size={14} />
            Try again
          </button>
          <button type="button" onClick={onSelf} className="ds-btn ds-btn-ghost ds-btn-sm">
            Grade it myself
          </button>
        </div>
      </div>
    </div>
  );
}

/** The AI's verdict: score ring, grade, XP, the one thing that landed and the one thing to fix, full review folded. */
export function ScoredPanel({
  ev,
  grade,
  xp,
  combo,
  change,
  saveFailed,
  onDeeper,
}: {
  ev: Evaluation;
  grade: Grade;
  xp: number;
  combo: number;
  change: ReviewChange;
  saveFailed?: boolean;
  onDeeper?: () => void;
}) {
  const meta = GRADE_META[grade];
  const score = useCountUp(ev.overall);
  const ring = useSettle(ev.overall);
  const landed = ev.strengths[0];
  const fix = ev.factual_issues.find((f) => f.severity === 'major')?.correction || ev.missing[0] || ev.improvements[0];
  const corrections = ev.factual_issues.length;

  return (
    <div className={`pm-result ${toneClass(meta.tone)}`} data-grade={grade}>
      <div className="pm-result-head">
        <Ring value={ring / 100} size={88} stroke={7} tone={meta.tone} label={`Scored ${ev.overall} out of 100`}>
          <span className="pm-score">
            <b className="ds-num">{score}</b>
            <small>of 100</small>
          </span>
        </Ring>
        <div className="min-w-0 flex-1">
          <p className="pm-result-grade ds-tone-text">{meta.title}</p>
          <p className="text-[13px] ds-muted">
            {ev.level} answer{corrections > 0 ? `, ${corrections} correction${corrections === 1 ? '' : 's'}` : ''}
          </p>
          <XpLine base={xp} combo={combo} />
        </div>
      </div>

      {(landed || fix) && (
        <ul className="pm-takeaways">
          {landed && (
            <li>
              <Icon name="CheckCircleIcon" size={17} variant="solid" className="ds-tone-jade ds-tone-text" />
              <span>
                <b>What landed.</b> {landed}
              </span>
            </li>
          )}
          {fix && (
            <li>
              <Icon name="ArrowTrendingUpIcon" size={17} className="ds-tone-gold ds-tone-text" />
              <span>
                <b>Next time.</b> {fix}
              </span>
            </li>
          )}
        </ul>
      )}

      <ReviewNote change={change} saveFailed={saveFailed} />

      <div className="mt-4 flex flex-wrap items-center gap-2">
        {onDeeper && (
          <button type="button" onClick={onDeeper} className="ds-btn ds-btn-soft ds-btn-sm ds-tone-indigo">
            <Icon name="ChatBubbleLeftRightIcon" size={15} />
            Go deeper with the tutor
          </button>
        )}
      </div>

      <details className="pm-more">
        <summary>
          <span>Full review</span>
          <Icon name="ChevronDownIcon" size={16} className="ds-caret" />
        </summary>
        <div className="mt-3">
          <EvaluationView ev={ev} />
        </div>
      </details>
    </div>
  );
}

/** After grading yourself. */
export function SelfPanel({
  grade,
  xp,
  combo,
  change,
  saveFailed,
  onDeeper,
}: {
  grade: Grade;
  xp: number;
  combo: number;
  change: ReviewChange;
  saveFailed?: boolean;
  onDeeper?: () => void;
}) {
  const meta = GRADE_META[grade];
  return (
    <div className={`pm-result ${toneClass(meta.tone)}`} data-grade={grade}>
      <div className="pm-result-head">
        <span className="ds-icon-tile ds-icon-tile-lg">
          <Icon name={meta.icon} size={24} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="pm-result-grade ds-tone-text">{meta.title}</p>
          <XpLine base={xp} combo={combo} self />
        </div>
      </div>
      <ReviewNote change={change} saveFailed={saveFailed} />
      {onDeeper && (
        <button type="button" onClick={onDeeper} className="ds-btn ds-btn-soft ds-btn-sm ds-tone-indigo mt-4">
          <Icon name="ChatBubbleLeftRightIcon" size={15} />
          Go deeper with the tutor
        </button>
      )}
    </div>
  );
}

/** Grading yourself: what a strong answer to this kind of question covers, next to what you wrote. */
export function SelfCheck({
  question,
  draft,
}: {
  question: { questionText: string; subType?: string; category?: string };
  draft: string;
}) {
  const kind = detectKind(question.subType, question.category, question.questionText);
  return (
    <div className="pm-result">
      <p className="text-sm font-medium ds-ink">Check your answer against this</p>
      <p className="text-xs ds-faint">What a strong {KIND_LABEL[kind]} answer usually covers. Then pick how it went.</p>
      <ul className="pm-takeaways">
        {SELF_CHECK[kind].map((t) => (
          <li key={t}>
            <Icon name="CheckCircleIcon" size={17} className="ds-faint" />
            <span>{t}</span>
          </li>
        ))}
      </ul>
      {draft.trim() && (
        <div className="mt-4 border-t ds-hairline pt-3">
          <p className="text-xs font-medium ds-faint">Your answer</p>
          <p className="mt-1 whitespace-pre-wrap text-sm ds-muted">{draft}</p>
        </div>
      )}
    </div>
  );
}
