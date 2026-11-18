'use client';

import { useId, useRef, useState } from 'react';
import Icon from '@/components/ui/AppIcon';
import { toast } from '@/lib/ui/toast';
import { AiParseError } from './parse';
import {
  externalPrompt,
  importNote,
  MAX_IMPORT_CHARS,
  parseImportedPath,
  type ImportedPath,
} from './importPath';

/**
 * "Import from JSON" on the start screen, opened inline under the buttons: paste a path (or open a .json file), and it becomes the
 * page's path with no AI call. "Copy a prompt for another AI" hands over a prompt whose answer can be pasted straight back.
 */
export default function ImportPathPanel({
  topicName,
  focus,
  onImport,
  onClose,
}: {
  topicName: string;
  focus: string;
  onImport: (path: ImportedPath) => void;
  onClose: () => void;
}) {
  const textId = useId();
  const fileInput = useRef<HTMLInputElement>(null);
  const [text, setText] = useState('');
  const [error, setError] = useState<string | null>(null);

  const submit = (source = text) => {
    try {
      const path = parseImportedPath(source);
      onImport(path);
      const note = importNote(path);
      toast.success(`Imported ${path.kept} question${path.kept === 1 ? '' : 's'}.`);
      if (note) toast.info(note);
    } catch (e) {
      setError(
        e instanceof AiParseError ? e.message : 'Could not read this. Check the JSON and try again.'
      );
    }
  };

  const openFile = async (file: File) => {
    setError(null);
    if (file.size > MAX_IMPORT_CHARS * 4) {
      setError('This file is too large to be a path.');
      return;
    }
    try {
      setText(await file.text());
    } catch {
      setError('Could not read this file.');
    }
  };

  const copyPrompt = async () => {
    try {
      await navigator.clipboard.writeText(externalPrompt(topicName, focus));
      toast.success('Prompt copied. Paste the AI’s answer back here.');
    } catch {
      toast.error('Could not copy. Select the text yourself instead.');
    }
  };

  return (
    <section
      aria-label="Import a path from JSON"
      className="mt-5 rounded-xl border bg-[var(--color-fill)] p-4"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <label htmlFor={textId} className="text-sm font-medium text-foreground">
          Paste the path as JSON
        </label>
        <button
          type="button"
          onClick={() => void copyPrompt()}
          className="text-[13px] text-muted-foreground hover:text-foreground hover:underline"
        >
          Copy a prompt for another AI
        </button>
      </div>
      <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
        Phases with questions, or just a list of questions. Only each question’s title is required.
      </p>
      <textarea
        id={textId}
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          setError(null);
        }}
        rows={8}
        spellCheck={false}
        placeholder={
          '{"phases":[{"title":"Basics","questions":[{"title":"What is a linked list?"}]}]}'
        }
        className="todo-input todo-input-quiet mt-2 w-full resize-y px-3 py-2 font-mono text-[16px] sm:text-[13px]"
      />

      {error && (
        <p role="alert" className="mt-2 flex items-start gap-1.5 text-[0.8125rem] text-error">
          <Icon name="ExclamationTriangleIcon" size={15} className="mt-0.5 flex-shrink-0" />
          <span className="min-w-0 break-words">{error}</span>
        </p>
      )}

      <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
        <button
          type="button"
          onClick={() => fileInput.current?.click()}
          className="todo-btn todo-btn-secondary"
        >
          <Icon name="DocumentArrowUpIcon" size={15} aria-hidden="true" />
          Open a .json file
        </button>
        <input
          ref={fileInput}
          type="file"
          accept=".json,.txt,application/json,text/plain"
          className="hidden"
          tabIndex={-1}
          aria-hidden="true"
          onChange={(e) => {
            const file = e.target.files?.[0];
            e.target.value = '';
            if (file) void openFile(file);
          }}
        />
        <div className="flex gap-2">
          <button type="button" onClick={onClose} className="todo-btn todo-btn-secondary">
            Cancel
          </button>
          <button
            type="button"
            onClick={() => submit()}
            disabled={!text.trim()}
            className="todo-btn todo-btn-primary"
          >
            Import path
          </button>
        </div>
      </div>
    </section>
  );
}
