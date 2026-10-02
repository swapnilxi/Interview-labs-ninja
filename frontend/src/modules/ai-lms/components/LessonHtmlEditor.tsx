'use client';

import React, { forwardRef, useImperativeHandle, useMemo, useRef } from 'react';
import Icon from '@/components/ui/AppIcon';

export interface LessonHtmlEditorHandle {
  /** The full edited HTML document (editor-only styles stripped). */
  getHtml: () => string;
}

interface LessonHtmlEditorProps {
  html: string;
}

const EDIT_STYLE_ID = 'lms-edit-style';
const EDIT_STYLE = `<style id="${EDIT_STYLE_ID}">
  body { outline: none; caret-color: #5b5bd6; }
  [class*="reveal"], [class*="fade"], [data-animate] { opacity: 1 !important; transform: none !important; }
  a { pointer-events: none; }
</style>`;

type ToolbarAction =
  | { kind: 'cmd'; cmd: string; value?: string; label: string; icon?: string; text?: string }
  | { kind: 'sep' };

const TOOLBAR: ToolbarAction[] = [
  { kind: 'cmd', cmd: 'formatBlock', value: 'h2', label: 'Heading', text: 'H2' },
  { kind: 'cmd', cmd: 'formatBlock', value: 'h3', label: 'Subheading', text: 'H3' },
  { kind: 'cmd', cmd: 'formatBlock', value: 'p', label: 'Paragraph', text: '¶' },
  { kind: 'sep' },
  { kind: 'cmd', cmd: 'bold', label: 'Bold', text: 'B' },
  { kind: 'cmd', cmd: 'italic', label: 'Italic', text: 'I' },
  { kind: 'cmd', cmd: 'underline', label: 'Underline', text: 'U' },
  { kind: 'sep' },
  { kind: 'cmd', cmd: 'insertUnorderedList', label: 'Bulleted list', icon: 'ListBulletIcon' },
  { kind: 'cmd', cmd: 'insertOrderedList', label: 'Numbered list', text: '1.' },
  { kind: 'cmd', cmd: 'formatBlock', value: 'blockquote', label: 'Quote', text: '“' },
  { kind: 'sep' },
  { kind: 'cmd', cmd: 'createLink', label: 'Link', icon: 'LinkIcon' },
  { kind: 'cmd', cmd: 'removeFormat', label: 'Clear formatting', text: 'Tx' },
  { kind: 'sep' },
  { kind: 'cmd', cmd: 'undo', label: 'Undo', icon: 'ArrowUturnLeftIcon' },
  { kind: 'cmd', cmd: 'redo', label: 'Redo', icon: 'ArrowUturnRightIcon' },
];

/** On-page WYSIWYG editor for a lesson's HTML. The lesson renders in a same-origin iframe
 * with scripts disabled (so quizzes/visuals don't run or mutate the DOM while editing) and
 * designMode on, so you click and type directly in the rendered page. Scripts/styles in
 * the document are preserved untouched on save. */
const LessonHtmlEditor = forwardRef<LessonHtmlEditorHandle, LessonHtmlEditorProps>(
  function LessonHtmlEditor({ html }, ref) {
    const iframeRef = useRef<HTMLIFrameElement>(null);

    // Computed once per mount so typing never reloads the iframe.
    const srcDoc = useMemo(() => {
      const headMatch = html.match(/<head[^>]*>/i);
      if (!headMatch || headMatch.index === undefined) return EDIT_STYLE + html;
      const at = headMatch.index + headMatch[0].length;
      return html.slice(0, at) + EDIT_STYLE + html.slice(at);
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    useImperativeHandle(ref, () => ({
      getHtml: () => {
        const doc = iframeRef.current?.contentDocument;
        if (!doc) return html;
        const clone = doc.documentElement.cloneNode(true) as HTMLElement;
        clone.querySelector(`#${EDIT_STYLE_ID}`)?.remove();
        return `<!DOCTYPE html>\n${clone.outerHTML}`;
      },
    }));

    const exec = (action: Extract<ToolbarAction, { kind: 'cmd' }>) => {
      const doc = iframeRef.current?.contentDocument;
      if (!doc) return;
      iframeRef.current?.contentWindow?.focus();
      if (action.cmd === 'createLink') {
        const url = window.prompt('Link URL');
        if (url) doc.execCommand('createLink', false, url);
        return;
      }
      doc.execCommand(action.cmd, false, action.value);
    };

    return (
      <div className="flex-1 w-full rounded-2xl border border-primary/40 bg-card shadow-lg overflow-hidden relative min-h-[70vh] sm:min-h-[620px] flex flex-col">
        <div className="flex flex-wrap items-center gap-1 px-3 py-2 border-b border-border bg-muted/40">
          {TOOLBAR.map((a, i) =>
            a.kind === 'sep' ? (
              <div key={`sep-${i}`} className="w-px h-5 bg-border mx-1" />
            ) : (
              <button
                key={`${a.cmd}-${a.value ?? i}`}
                type="button"
                title={a.label}
                aria-label={a.label}
                // Keep the iframe selection alive when the toolbar is clicked.
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => exec(a)}
                className="min-w-7 h-7 px-1.5 inline-flex items-center justify-center rounded-md text-xs font-bold text-foreground hover:bg-card border border-transparent hover:border-border"
              >
                {a.icon ? <Icon name={a.icon} size={14} /> : a.text}
              </button>
            )
          )}
          <span className="ml-auto text-[11px] text-muted-foreground">
            Click anywhere in the lesson to edit · scripts are paused while editing
          </span>
        </div>
        <iframe
          ref={iframeRef}
          srcDoc={srcDoc}
          title="Lesson editor"
          sandbox="allow-same-origin"
          onLoad={() => {
            const doc = iframeRef.current?.contentDocument;
            if (doc) doc.designMode = 'on';
          }}
          className="w-full flex-1 border-0"
        />
      </div>
    );
  }
);

export default LessonHtmlEditor;
