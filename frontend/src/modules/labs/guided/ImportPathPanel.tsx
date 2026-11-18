'use client';

import { useId, useRef, useState } from 'react';
import Icon from '@/components/ui/AppIcon';
import { confirmDialog } from '@/lib/ui/confirm';
import { toast } from '@/lib/ui/toast';
import { FormatHelp, FormatHelpButton } from './JsonFormatHelp';
import { AiParseError } from './parse';
import {
  externalPrompt,
  importNote,
  MAX_IMPORT_CHARS,
  parseImportedPath,
  type ImportedPath,
} from './importPath';

export type ImportMode = 'append' | 'replace';

/**
 * "Import from JSON", opened inline: paste a path (or open a .json file) and it becomes questions of the page with no AI call.
 * "Copy a prompt for another AI" hands over a prompt whose answer can be pasted straight back.
 *
 * On the start screen there is no path yet, so the JSON simply becomes it. Inside an existing path (`existing`) the person
 * chooses: add its phases after the last one (the default: nothing they have done is touched) or replace the whole path
 * (progress and XP on the page are lost, so that asks first).
 */
export default function ImportPathPanel({
  topicName,
  focus,
  existing = false,
  onImport,
  onClose,
}: {
  topicName: string;
  focus: string;
  existing?: boolean;
  onImport: (path: ImportedPath, mode: ImportMode) => void;
  onClose: () => void;
}) {
  const textId = useId();
  const helpId = useId();
  const fileInput = useRef<HTMLInputElement>(null);
  const [text, setText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<ImportMode>('append');
  const [help, setHelp] = useState(false);

  const submit = async () => {
    let path: ImportedPath;
    try {
      path = parseImportedPath(text);
    } catch (e) {
      setError(
        e instanceof AiParseError ? e.message : 'Could not read this. Check the JSON and try again.'
      );
      return;
    }
    const how: ImportMode = existing ? mode : 'replace';
    if (existing && how === 'replace') {
      const ok = await confirmDialog({
        title: 'Replace your path?',
        message:
          'Your path, progress, XP and answers on this page are replaced by the imported questions. This cannot be undone.',
        confirmLabel: 'Replace',
        tone: 'danger',
      });
      if (!ok) return;
    }
    onImport(path, how);
    const note = importNote(path);
    toast.success(
      `${how === 'append' ? 'Added' : 'Imported'} ${path.kept} question${path.kept === 1 ? '' : 's'}.`
    );
    if (note) toast.info(note);
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
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
        <label htmlFor={textId} className="text-sm font-medium text-foreground">
          {existing ? 'Paste questions as JSON' : 'Paste the path as JSON'}
        </label>
        <div className="flex items-center gap-2">
          {existing && (
            <FormatHelpButton open={help} onToggle={() => setHelp((v) => !v)} controlsId={helpId} />
          )}
          <button
            type="button"
            onClick={() => void copyPrompt()}
            className="text-[13px] text-muted-foreground hover:text-foreground hover:underline"
          >
            Copy a prompt for another AI
          </button>
        </div>
      </div>
      {existing && help && <FormatHelp id={helpId} existing />}
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

      {existing && (
        <fieldset className="mt-3">
          <legend className="text-[13px] font-medium text-foreground">
            What should happen to the questions?
          </legend>
          <div className="mt-1.5 space-y-1.5">
            {(
              [
                [
                  'append',
                  'Add them to my path',
                  'New phases after the last one. Nothing you have done changes.',
                ],
                [
                  'replace',
                  'Replace my path',
                  'Starts the path over with them. Progress and XP on this page are lost.',
                ],
              ] as const
            ).map(([value, label, hint]) => (
              <label key={value} className="flex cursor-pointer items-start gap-2.5 text-[13px]">
                <input
                  type="radio"
                  name={`${textId}-mode`}
                  checked={mode === value}
                  onChange={() => setMode(value)}
                  className="mt-[0.2rem] accent-[var(--color-primary)]"
                />
                <span>
                  <span className="font-medium text-foreground">{label}</span>
                  <span className="block text-xs text-muted-foreground">{hint}</span>
                </span>
              </label>
            ))}
          </div>
        </fieldset>
      )}

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
            onClick={() => void submit()}
            disabled={!text.trim()}
            className="todo-btn todo-btn-primary"
          >
            {existing && mode === 'append' ? 'Add questions' : 'Import path'}
          </button>
        </div>
      </div>
    </section>
  );
}
