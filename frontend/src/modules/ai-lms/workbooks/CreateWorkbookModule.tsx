'use client';

import { useEffect, useMemo, useRef, useState, type DragEvent, type FormEvent } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import Icon from '@/components/ui/AppIcon';
import BackButton from '@/components/ui/BackButton';
import { useAuth } from '@/contexts/AuthContext';
import { lmsService } from '../services/lmsService';
import { workbookService } from './workbookService';
import { WORKBOOK_LIMITS, type WorkbookVisibility } from './types';
import PrivacyNotice from './PrivacyNotice';

const ACCEPT = '.pdf,.docx,.txt,.md';
const MAX_FILE_BYTES = 25 * 1024 * 1024;

interface SourceFile {
  key: string;
  name: string;
  text: string;
  words: number;
}

const countWords = (text: string) => (text.trim() ? text.trim().split(/\s+/).length : 0);

/** Why a file can't be read, before it is sent anywhere; null when it may be uploaded. */
function refuseFile(file: File): string | null {
  const name = file.name.toLowerCase();
  if (name.endsWith('.doc'))
    return `${file.name}: old .doc files can't be read. Save it as .docx (File, Save As) and upload that.`;
  if (!/\.(pdf|docx|txt|md)$/.test(name))
    return `${file.name}: upload a PDF, Word (.docx), .txt or .md file.`;
  if (file.size > MAX_FILE_BYTES)
    return `${file.name} is larger than 25 MB. Split it, or paste the chapters you need.`;
  if (file.size === 0) return `${file.name} is empty.`;
  return null;
}

/** /ai-lms/classes/<class>/workbooks/new: details + learning material + optional AI instructions, saved as a draft. */
export default function CreateWorkbookModule({ classSlug }: { classSlug: string }) {
  const router = useRouter();
  const { canEdit } = useAuth();
  const [className, setClassName] = useState('');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [instructions, setInstructions] = useState('');
  const [mode, setMode] = useState<'upload' | 'paste'>('upload');
  const [files, setFiles] = useState<SourceFile[]>([]);
  const [pasted, setPasted] = useState('');
  const [visibility, setVisibility] = useState<WorkbookVisibility>('private');
  const [uploading, setUploading] = useState<string[]>([]);
  const [fileErrors, setFileErrors] = useState<string[]>([]);
  const [dragOver, setDragOver] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    lmsService
      .getClass(classSlug)
      .then((cls) => setClassName(cls.name))
      .catch(() => setClassName(''));
  }, [classSlug]);

  // The material sent to the AI: every uploaded file's text, then anything pasted, one blank line apart.
  const sourceText = useMemo(
    () => [...files.map((f) => f.text), pasted.trim()].filter(Boolean).join('\n\n'),
    [files, pasted]
  );
  const sourceChars = Array.from(sourceText).length;
  const sourceWords = countWords(sourceText);
  const overLimit = sourceChars > WORKBOOK_LIMITS.source;

  const addFiles = async (list: FileList | File[]) => {
    const picked = Array.from(list);
    const problems: string[] = [];
    const accepted = picked.filter((file) => {
      const why = refuseFile(file);
      if (why) problems.push(why);
      return !why;
    });
    setFileErrors(problems);
    if (!title.trim() && accepted[0])
      setTitle(
        accepted[0].name
          .replace(/\.[^.]+$/, '')
          .replace(/[_-]+/g, ' ')
          .slice(0, WORKBOOK_LIMITS.title)
      );
    for (const file of accepted) {
      setUploading((u) => [...u, file.name]);
      try {
        const result = await lmsService.uploadSourceFile(file);
        const text = (result.text || '').trim();
        if (!text)
          throw new Error(`${file.name}: no text could be read. A scanned PDF needs OCR first.`);
        setFiles((current) => [
          ...current,
          {
            key: `${file.name}-${Date.now()}-${Math.random()}`,
            name: file.name,
            text,
            words: countWords(text),
          },
        ]);
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Upload failed.';
        setFileErrors((current) => [
          ...current,
          message.startsWith(file.name) ? message : `${file.name}: ${message}`,
        ]);
      } finally {
        setUploading((u) => u.filter((name) => name !== file.name));
      }
    }
  };

  const onDrop = (event: DragEvent<HTMLLabelElement>) => {
    event.preventDefault();
    setDragOver(false);
    if (event.dataTransfer.files?.length) addFiles(event.dataTransfer.files);
  };

  const canSave =
    title.trim().length > 0 &&
    sourceText.length > 0 &&
    !overLimit &&
    uploading.length === 0 &&
    !saving;

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!canSave) return;
    setSaving(true);
    setError(null);
    try {
      const created = await workbookService.create(classSlug, {
        title: title.trim(),
        description: description.trim(),
        instructions: instructions.trim(),
        source_name: files
          .map((f) => f.name)
          .join(', ')
          .slice(0, 200),
        source_text: sourceText,
        visibility: canEdit ? visibility : 'private',
      });
      router.push(`/ai-lms/classes/${classSlug}/workbooks/${created.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'The workbook could not be saved.');
      setSaving(false);
    }
  };

  return (
    <div className="wb-accent mx-auto w-full max-w-3xl px-4 pb-[8rem] pt-[2rem] sm:px-[1.5rem] md:pt-[3rem]">
      <nav
        className="mb-5 flex flex-wrap items-center gap-2.5 text-xs text-muted-foreground"
        aria-label="Breadcrumb"
      >
        <BackButton href={`/ai-lms/classes/${classSlug}`} label="Back" className="-ml-2.5" />
        <Link href="/ai-lms" className="hover:text-foreground">
          AI LMS
        </Link>
        <span aria-hidden="true">/</span>
        <Link
          href={`/ai-lms/classes/${classSlug}`}
          className="min-w-0 break-words hover:text-foreground"
        >
          {className || 'Class'}
        </Link>
        <span aria-hidden="true">/</span>
        <span className="font-semibold text-foreground">New workbook</span>
      </nav>

      <header className="wb-hero wb-wash wb-enter mb-8 px-5 py-7 sm:px-8">
        <span className="wb-cover mb-4" aria-hidden="true">
          <Icon name="BookOpenIcon" size={22} />
        </span>
        <h1 className="font-heading text-2xl font-semibold text-foreground md:text-3xl">
          Create a workbook
        </h1>
        <p className="mt-2 max-w-xl text-sm leading-relaxed text-muted-foreground">
          Bring a book chapter, lesson or notes. AI reads it and turns it into chapters you work
          through: checklists, planners, trackers, quizzes and reflections, not a summary.
        </p>
      </header>

      <form onSubmit={submit} className="space-y-8" noValidate>
        <section className="wb-card space-y-5 p-5 sm:p-[1.5rem]" aria-labelledby="wb-details">
          <h2 id="wb-details" className="text-base font-semibold text-foreground">
            Details
          </h2>
          <div>
            <label htmlFor="wb-title" className="wb-label">
              Title
            </label>
            <input
              id="wb-title"
              className="wb-field"
              value={title}
              maxLength={WORKBOOK_LIMITS.title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="My daily routine planner"
              required
            />
          </div>
          <div>
            <label htmlFor="wb-description" className="wb-label">
              Short description{' '}
              <span className="font-normal text-muted-foreground">(optional)</span>
            </label>
            <textarea
              id="wb-description"
              className="wb-field min-h-[5rem]"
              value={description}
              maxLength={WORKBOOK_LIMITS.description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What will someone get out of working through it?"
            />
          </div>
        </section>

        <section className="wb-card space-y-5 p-5 sm:p-[1.5rem]" aria-labelledby="wb-source">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 id="wb-source" className="text-base font-semibold text-foreground">
              Learning material
            </h2>
            <div className="wb-seg" role="group" aria-label="How to add the material">
              <button
                type="button"
                aria-pressed={mode === 'upload'}
                onClick={() => setMode('upload')}
              >
                Upload files
              </button>
              <button
                type="button"
                aria-pressed={mode === 'paste'}
                onClick={() => setMode('paste')}
              >
                Paste text
              </button>
            </div>
          </div>

          {mode === 'upload' ? (
            <label
              className="wb-drop"
              data-over={dragOver}
              onDragOver={(e) => {
                e.preventDefault();
                setDragOver(true);
              }}
              onDragLeave={() => setDragOver(false)}
              onDrop={onDrop}
            >
              <input
                ref={inputRef}
                type="file"
                accept={ACCEPT}
                multiple
                className="sr-only"
                onChange={(e) => {
                  if (e.target.files?.length) addFiles(e.target.files);
                  e.target.value = '';
                }}
              />
              <Icon name="ArrowUpTrayIcon" size={24} className="text-muted-foreground" />
              <span className="text-sm font-medium text-foreground">
                Drop files here, or choose files
              </span>
              <span className="wb-hint">
                PDF, Word (.docx), .txt or .md, up to 25 MB each. Several files are joined in order.
              </span>
            </label>
          ) : (
            <div>
              <label htmlFor="wb-paste" className="wb-label">
                Text
              </label>
              <textarea
                id="wb-paste"
                className="wb-field min-h-[16rem] font-[inherit]"
                value={pasted}
                onChange={(e) => setPasted(e.target.value)}
                placeholder="Paste a chapter, lesson or notes. Headings and paragraphs help the AI find the chapters."
              />
            </div>
          )}

          {(files.length > 0 || uploading.length > 0) && (
            <ul className="space-y-2" aria-label="Uploaded files">
              {files.map((file) => (
                <li
                  key={file.key}
                  className="flex items-center gap-3 rounded-xl border border-border px-3 py-2.5"
                >
                  <Icon
                    name="DocumentTextIcon"
                    size={18}
                    className="flex-shrink-0 text-muted-foreground"
                  />
                  <div className="min-w-0 flex-1">
                    <p className="break-words text-sm font-medium text-foreground">{file.name}</p>
                    <p className="wb-hint">{file.words.toLocaleString()} words read</p>
                  </div>
                  <button
                    type="button"
                    className="wb-btn wb-btn-sm"
                    onClick={() => setFiles((current) => current.filter((f) => f.key !== file.key))}
                    aria-label={`Remove ${file.name}`}
                  >
                    <Icon name="XMarkIcon" size={14} />
                  </button>
                </li>
              ))}
              {uploading.map((name) => (
                <li
                  key={`up-${name}`}
                  className="flex items-center gap-3 rounded-xl border border-border px-3 py-2.5"
                >
                  <Icon
                    name="ArrowPathIcon"
                    size={18}
                    className="flex-shrink-0 animate-spin text-muted-foreground"
                  />
                  <p className="min-w-0 flex-1 break-words text-sm text-muted-foreground">
                    Reading {name}…
                  </p>
                </li>
              ))}
            </ul>
          )}

          {mode === 'upload' && pasted.trim() && (
            <p className="wb-hint">Your pasted text is kept too and added after the files.</p>
          )}
          {mode === 'paste' && files.length > 0 && (
            <p className="wb-hint">
              The uploaded files are kept too; your text is added after them.
            </p>
          )}

          {fileErrors.length > 0 && (
            <ul className="space-y-1 text-sm text-destructive" role="alert">
              {fileErrors.map((message) => (
                <li key={message}>{message}</li>
              ))}
            </ul>
          )}

          <p
            className={`text-xs ${overLimit ? 'font-medium text-destructive' : 'text-muted-foreground'}`}
            aria-live="polite"
          >
            {sourceWords > 0
              ? `${sourceWords.toLocaleString()} words in total${overLimit ? `: too long, keep it under ${WORKBOOK_LIMITS.source.toLocaleString()} characters (about 400 pages).` : '.'}`
              : 'No material yet.'}
          </p>
        </section>

        <section className="wb-card space-y-5 p-5 sm:p-[1.5rem]" aria-labelledby="wb-ai">
          <h2 id="wb-ai" className="text-base font-semibold text-foreground">
            Instructions for the AI{' '}
            <span className="text-sm font-normal text-muted-foreground">(optional)</span>
          </h2>
          <textarea
            id="wb-instructions"
            aria-labelledby="wb-ai"
            className="wb-field min-h-[6rem]"
            value={instructions}
            maxLength={WORKBOOK_LIMITS.instructions}
            onChange={(e) => setInstructions(e.target.value)}
            placeholder="For example: focus on building habits, keep each exercise short, add a weekly review, use simple English."
          />
        </section>

        {canEdit && (
          <section className="wb-card space-y-3 p-5 sm:p-[1.5rem]" aria-labelledby="wb-visibility">
            <h2 id="wb-visibility" className="text-base font-semibold text-foreground">
              Who can use it
            </h2>
            <div className="wb-seg" role="group" aria-labelledby="wb-visibility">
              <button
                type="button"
                aria-pressed={visibility === 'private'}
                onClick={() => setVisibility('private')}
              >
                Only me
              </button>
              <button
                type="button"
                aria-pressed={visibility === 'class'}
                onClick={() => setVisibility('class')}
              >
                Everyone in the class
              </button>
            </div>
            <p className="wb-hint">
              {visibility === 'class'
                ? 'Learners see it once you publish it. Each of them gets their own private copy to fill in; you never see their answers.'
                : 'Only you can open it. You can share it with the class later.'}
            </p>
          </section>
        )}

        <PrivacyNotice compact />

        {error && (
          <p className="text-sm font-medium text-destructive" role="alert">
            {error}
          </p>
        )}

        <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
          <Link href={`/ai-lms/classes/${classSlug}`} className="wb-btn">
            Cancel
          </Link>
          <button type="submit" className="wb-btn wb-btn-primary" disabled={!canSave}>
            {saving ? 'Saving…' : 'Save workbook'}
            {!saving && <Icon name="ArrowRightIcon" size={16} />}
          </button>
        </div>
      </form>
    </div>
  );
}
