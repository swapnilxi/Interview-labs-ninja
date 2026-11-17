'use client';

import { useLayoutEffect, useRef, type KeyboardEvent } from 'react';
import { highlightPython } from './highlight';
import type { FontSize } from './prefs';

const INDENT = '    ';

/**
 * A small code editor: a transparent <textarea> over a coloured copy of its text (styles/guided-practice.css, `.gp-editor`),
 * with optional line numbers. Tab indents and Shift+Tab outdents; Esc then Tab leaves the field (so the keyboard is never
 * trapped); Enter keeps the indent (and adds one after a colon); Ctrl or Cmd + Enter runs the tests.
 */
export default function CodeEditor({
  value,
  onChange,
  onRun,
  onFocus,
  label,
  numbers = true,
  size = 'm',
  readOnly = false,
  minRows = 8,
  maxRows = 22,
}: {
  value: string;
  onChange: (next: string) => void;
  onRun?: () => void;
  onFocus?: () => void;
  label: string;
  numbers?: boolean;
  size?: FontSize;
  readOnly?: boolean;
  minRows?: number;
  maxRows?: number;
}) {
  const area = useRef<HTMLTextAreaElement>(null);
  const colour = useRef<HTMLPreElement>(null);
  const gutter = useRef<HTMLPreElement>(null);
  const selection = useRef<[number, number] | null>(null);
  const releaseTab = useRef(false);
  const lineCount = value.split('\n').length;
  const rows = Math.min(Math.max(lineCount + 1, minRows), maxRows);

  // After a programmatic edit (Tab, Enter) put the caret where the edit left it.
  useLayoutEffect(() => {
    if (selection.current && area.current) {
      area.current.setSelectionRange(selection.current[0], selection.current[1]);
      selection.current = null;
    }
  });

  const syncScroll = () => {
    if (!area.current) return;
    if (colour.current) {
      colour.current.scrollTop = area.current.scrollTop;
      colour.current.scrollLeft = area.current.scrollLeft;
    }
    if (gutter.current) gutter.current.scrollTop = area.current.scrollTop;
  };

  const edit = (next: string, start: number, end = start) => {
    selection.current = [start, end];
    onChange(next);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    const el = e.currentTarget;
    const { selectionStart: start, selectionEnd: end } = el;
    if (e.key === 'Escape') {
      releaseTab.current = true;
      return;
    }
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      e.preventDefault();
      onRun?.();
      return;
    }
    if (e.key === 'Tab') {
      if (releaseTab.current) {
        releaseTab.current = false;
        return; // Esc, then Tab: move focus on as usual
      }
      e.preventDefault();
      const lineStart = value.lastIndexOf('\n', start - 1) + 1;
      if (e.shiftKey) {
        // Outdent every line the selection touches by up to one indent.
        const block = value.slice(lineStart, end);
        const lines = block.split('\n');
        const removed = lines.map((l) =>
          l.startsWith(INDENT)
            ? INDENT.length
            : l.startsWith('\t')
              ? 1
              : (l.match(/^ {1,3}/)?.[0].length ?? 0)
        );
        const next =
          value.slice(0, lineStart) +
          lines.map((l, i) => l.slice(removed[i])).join('\n') +
          value.slice(end);
        edit(
          next,
          Math.max(lineStart, start - removed[0]),
          end - removed.reduce((a, b) => a + b, 0)
        );
      } else if (start !== end && value.slice(start, end).includes('\n')) {
        const block = value.slice(lineStart, end).split('\n');
        const next =
          value.slice(0, lineStart) + block.map((l) => INDENT + l).join('\n') + value.slice(end);
        edit(next, start + INDENT.length, end + INDENT.length * block.length);
      } else {
        edit(value.slice(0, start) + INDENT + value.slice(end), start + INDENT.length);
      }
      return;
    }
    releaseTab.current = false;
    if (e.key === 'Enter' && !e.shiftKey && !e.metaKey && !e.ctrlKey && !e.altKey) {
      e.preventDefault();
      const lineStart = value.lastIndexOf('\n', start - 1) + 1;
      const before = value.slice(lineStart, start);
      const indent = before.match(/^[ \t]*/)?.[0] ?? '';
      const extra = /:\s*$/.test(before) ? INDENT : '';
      const insert = `\n${indent}${extra}`;
      edit(value.slice(0, start) + insert + value.slice(end), start + insert.length);
    }
  };

  return (
    <div className="gp-editor" data-numbers={numbers} data-size={size}>
      {numbers && (
        <pre ref={gutter} className="gp-editor-gutter" aria-hidden="true">
          {Array.from({ length: lineCount }, (_, i) => i + 1).join('\n')}
          {'\n'}
        </pre>
      )}
      <pre ref={colour} className="gp-editor-hl" aria-hidden="true">
        <code>
          {highlightPython(value)}
          {'\n'}
        </code>
      </pre>
      <textarea
        ref={area}
        value={value}
        rows={rows}
        readOnly={readOnly}
        spellCheck={false}
        autoCapitalize="off"
        autoCorrect="off"
        autoComplete="off"
        wrap="off"
        aria-label={label}
        className="gp-editor-input"
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={readOnly ? undefined : onKeyDown}
        onScroll={syncScroll}
        onFocus={onFocus}
      />
    </div>
  );
}
