'use client';

import React, { useRef } from 'react';
import Icon from '@/components/ui/AppIcon';
import type { QuestionKind } from './questionKind';

export const LANGUAGES = [
  'Python',
  'JavaScript',
  'TypeScript',
  'Java',
  'C++',
  'Go',
  'Rust',
  'SQL',
  'Pseudo-code',
];

interface Props {
  kind: QuestionKind;
  value: string;
  onChange: (v: string) => void;
  language: string;
  onLanguageChange: (l: string) => void;
}

/** Dedicated code / design-sketch editor: line numbers, Tab indent, monospace, an editor surface that follows the theme. */
export default function CodeSpace({ kind, value, onChange, language, onLanguageChange }: Props) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const gutterRef = useRef<HTMLDivElement>(null);
  const isDesign = kind === 'system_design';
  const lines = Math.max(value.split('\n').length, 12);

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key !== 'Tab') return;
    e.preventDefault();
    const el = e.currentTarget;
    const { selectionStart: s, selectionEnd: en } = el;
    const next = value.slice(0, s) + '    ' + value.slice(en);
    onChange(next);
    requestAnimationFrame(() => el.setSelectionRange(s + 4, s + 4));
  };

  return (
    <div className="bs-code">
      <div className="bs-code-head">
        <div className="flex min-w-0 items-center gap-2">
          <span className={`ds-tone-text ${isDesign ? 'ds-tone-jade' : 'ds-tone-indigo'}`}>
            <Icon name={isDesign ? 'CubeTransparentIcon' : 'CodeBracketIcon'} size={17} />
          </span>
          <span className="text-sm font-medium ds-ink">
            {isDesign ? 'Design sketch' : 'Code'}
          </span>
          {isDesign && (
            <span className="hidden truncate text-xs ds-faint sm:inline">
              APIs, schema, pseudo-code
            </span>
          )}
        </div>
        <label className="bs-select-wrap flex-shrink-0">
          <span className="sr-only">Language</span>
          <select
            value={language}
            onChange={(e) => onLanguageChange(e.target.value)}
            className="bs-select"
          >
            {LANGUAGES.map((l) => (
              <option key={l}>{l}</option>
            ))}
          </select>
          <Icon name="ChevronUpDownIcon" size={14} />
        </label>
      </div>
      <div className="flex max-h-[28rem] overflow-auto">
        <div ref={gutterRef} aria-hidden className="bs-code-gutter">
          {Array.from({ length: lines }, (_, i) => (
            <div key={i}>{i + 1}</div>
          ))}
        </div>
        <textarea
          ref={ref}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={onKeyDown}
          spellCheck={false}
          autoCapitalize="off"
          autoCorrect="off"
          rows={lines}
          wrap="off"
          placeholder={
            isDesign
              ? '# API\nPOST /v1/resource\n\n# Schema\nusers(id, name, ...)'
              : '# write your solution here'
          }
          aria-label={isDesign ? 'Design sketch' : 'Code editor'}
          className="bs-code-area"
        />
      </div>
    </div>
  );
}
