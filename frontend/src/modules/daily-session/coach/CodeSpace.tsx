'use client';

import React, { useRef } from 'react';
import type { QuestionKind } from './questionKind';

export const LANGUAGES = ['Python', 'JavaScript', 'TypeScript', 'Java', 'C++', 'Go', 'Rust', 'SQL', 'Pseudo-code'];

interface Props {
  kind: QuestionKind;
  value: string;
  onChange: (v: string) => void;
  language: string;
  onLanguageChange: (l: string) => void;
}

/** Dedicated code / design-sketch editor: line numbers, Tab indent, monospace, dark surface. */
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
    <div className="overflow-hidden rounded-2xl border-2 border-border bg-[#0f1020] shadow-inner">
      <div className="flex items-center justify-between gap-2 border-b border-white/10 bg-white/5 px-3 py-2">
        <div className="flex items-center gap-2 text-xs font-extrabold text-white/80">
          <span className="flex gap-1" aria-hidden>
            <i className="h-2.5 w-2.5 rounded-full bg-rose-400" />
            <i className="h-2.5 w-2.5 rounded-full bg-amber-400" />
            <i className="h-2.5 w-2.5 rounded-full bg-emerald-400" />
          </span>
          {isDesign ? 'Design sketch · APIs, schema, pseudo-code' : 'Code'}
        </div>
        <label className="flex items-center gap-2 text-[11px] font-bold text-white/60">
          Language
          <select
            value={language}
            onChange={(e) => onLanguageChange(e.target.value)}
            className="rounded-lg border border-white/15 bg-[#1a1b30] px-2 py-1 text-xs font-semibold text-white focus:outline-none"
          >
            {LANGUAGES.map((l) => (
              <option key={l}>{l}</option>
            ))}
          </select>
        </label>
      </div>
      <div className="flex max-h-[28rem] overflow-auto">
        <div
          ref={gutterRef}
          aria-hidden
          className="select-none bg-white/[0.03] px-3 py-3 text-right font-mono text-[12.5px] leading-[1.6] text-white/30"
        >
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
          placeholder={isDesign ? '# API\nPOST /v1/resource\n\n# Schema\nusers(id, name, ...)' : '# write your solution here'}
          aria-label={isDesign ? 'Design sketch' : 'Code editor'}
          className="min-w-0 flex-1 resize-none overflow-hidden whitespace-pre bg-transparent py-3 pr-4 pl-1 font-mono text-[12.5px] leading-[1.6] text-[#e6e6f5] placeholder:text-white/25 focus:outline-none"
        />
      </div>
    </div>
  );
}
