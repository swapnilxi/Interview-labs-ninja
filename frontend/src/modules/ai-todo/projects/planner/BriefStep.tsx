'use client';

import { useRef, useState } from 'react';
import Icon from '@/components/ui/AppIcon';
import { MAX_MATERIAL_CHARS, MAX_STORED_MATERIAL_CHARS, type PlanDocument, type PlannerState } from '@/lib/services/projectPlannerService';

/** Text the browser can read as-is. PDFs and Word files are not read here: their text has to be pasted. */
const TEXT_EXTENSIONS = ['.txt', '.md', '.markdown', '.csv', '.tsv', '.json', '.log'];
const MAX_FILE_BYTES = 2 * 1024 * 1024;

interface BriefStepProps {
  state: PlannerState;
  projectDescription: string | null;
  busy: boolean;
  onChange: (patch: Partial<PlannerState>) => void;
  onAskQuestions: () => void;
  onSkip: () => void;
}

export function materialLength(state: Pick<PlannerState, 'context' | 'documents'>): number {
  return state.context.trim().length + state.documents.reduce((sum, d) => sum + d.text.trim().length, 0);
}

export default function BriefStep({ state, projectDescription, busy, onChange, onAskQuestions, onSkip }: BriefStepProps) {
  const fileInput = useRef<HTMLInputElement>(null);
  const [fileNotice, setFileNotice] = useState<string | null>(null);

  const total = materialLength(state);
  const overLimit = total > MAX_MATERIAL_CHARS;
  const hasMaterial = total > 0 || !!projectDescription?.trim();

  const addFiles = async (files: FileList | null) => {
    if (!files?.length) return;
    const added: PlanDocument[] = [];
    const problems: string[] = [];
    let stored = materialLength(state);
    for (const file of Array.from(files)) {
      const lower = file.name.toLowerCase();
      if (!TEXT_EXTENSIONS.some((ext) => lower.endsWith(ext))) {
        problems.push(`${file.name}: only plain-text files can be attached (${TEXT_EXTENSIONS.join(', ')}). For a PDF or Word file, paste its text into the box above.`);
        continue;
      }
      if (file.size > MAX_FILE_BYTES) {
        problems.push(`${file.name}: larger than 2 MB.`);
        continue;
      }
      try {
        const text = await file.text();
        if (!text.trim()) problems.push(`${file.name}: the file is empty.`);
        else if (stored + text.trim().length > MAX_STORED_MATERIAL_CHARS) {
          problems.push(`${file.name}: too large to keep in the planner (the limit is ${MAX_STORED_MATERIAL_CHARS.toLocaleString()} characters in total). Attach a smaller file or only the relevant part.`);
        } else {
          stored += text.trim().length;
          added.push({ id: `d_${Date.now().toString(36)}_${added.length}_${Math.random().toString(36).slice(2, 6)}`, name: file.name, text });
        }
      } catch {
        problems.push(`${file.name}: couldn't be read.`);
      }
    }
    if (added.length) onChange({ documents: [...state.documents, ...added] });
    setFileNotice(problems.length ? problems.join(' ') : null);
    if (fileInput.current) fileInput.current.value = '';
  };

  return (
    <section className="todo-glass flex flex-col gap-[1.25rem] p-[1.25rem] sm:p-[1.5rem]" aria-labelledby="planner-brief-title">
      <div>
        <h3 id="planner-brief-title" className="font-heading text-base font-semibold text-foreground">What are you planning?</h3>
        <p className="mt-1 text-sm text-muted-foreground">
          Paste the requirements, goals and constraints, or attach a document. The AI reads all of it, asks what is still unclear, and then
          writes the plan with you.
        </p>
      </div>

      <div>
        <label htmlFor="planner-context" className="mb-1.5 block text-xs font-semibold text-foreground">Requirements and context</label>
        <textarea
          id="planner-context"
          value={state.context}
          onChange={(e) => onChange({ context: e.target.value })}
          rows={9}
          placeholder={'e.g. We are rolling out a new onboarding flow to 3 regional offices.\nMust-haves: SSO, a training course for managers, a pilot in one office first.\nConstraints: 2 engineers, a fixed budget, the go-live can’t clash with year-end.'}
          className="todo-input min-h-[10rem] resize-y px-3 py-2.5 text-sm leading-relaxed"
        />
        {projectDescription?.trim() && (
          <p className="mt-1.5 text-xs text-muted-foreground">
            The AI already sees this project&apos;s name and description, so you don&apos;t need to repeat them.
          </p>
        )}
      </div>

      <div>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="text-xs font-semibold text-foreground">Documents</span>
          <button type="button" onClick={() => fileInput.current?.click()} className="todo-btn todo-btn-secondary">
            <Icon name="PaperClipIcon" size={14} /> Attach documents
          </button>
          <input
            ref={fileInput}
            type="file"
            multiple
            accept={TEXT_EXTENSIONS.join(',')}
            className="sr-only"
            tabIndex={-1}
            aria-label="Attach text documents"
            onChange={(e) => void addFiles(e.target.files)}
          />
        </div>

        {state.documents.length > 0 ? (
          <ul className="mt-2 flex flex-col gap-1.5">
            {state.documents.map((doc) => (
              <li key={doc.id} className="todo-surface flex items-center gap-2.5 px-3 py-2">
                <Icon name="DocumentTextIcon" size={16} className="shrink-0 text-muted-foreground" />
                <span className="min-w-0 flex-1 truncate text-sm text-foreground" title={doc.name}>{doc.name}</span>
                <span className="shrink-0 text-xs text-muted-foreground">{doc.text.trim().length.toLocaleString()} characters</span>
                <button
                  type="button"
                  onClick={() => onChange({ documents: state.documents.filter((d) => d.id !== doc.id) })}
                  className="todo-btn todo-btn-ghost px-1.5 py-1"
                  aria-label={`Remove ${doc.name}`}
                >
                  <Icon name="XMarkIcon" size={14} />
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-1.5 text-xs text-muted-foreground">Optional. Plain-text files only (.txt, .md, .csv, .json); for anything else, paste the text above.</p>
        )}

        {fileNotice && (
          <div role="alert" className="todo-alert todo-alert-warning mt-2">
            <Icon name="ExclamationTriangleIcon" size={14} className="mt-px shrink-0" />
            <p className="flex-1 leading-relaxed">{fileNotice}</p>
          </div>
        )}
      </div>

      <div className="flex flex-col gap-3 border-t border-border pt-4 sm:flex-row sm:items-center sm:justify-between">
        <p className={`text-xs ${overLimit ? 'font-semibold text-warning' : 'text-muted-foreground'}`}>
          {total.toLocaleString()} / {MAX_MATERIAL_CHARS.toLocaleString()} characters
          {overLimit && ' — the AI reads your notes first, then the documents in order, and stops at the limit.'}
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" onClick={onSkip} disabled={busy} className="todo-btn todo-btn-ghost px-3 py-2">
            Skip questions
          </button>
          <button type="button" onClick={onAskQuestions} disabled={busy || !hasMaterial} className="todo-btn todo-btn-primary px-4 py-2">
            {busy ? (
              <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent" aria-hidden="true" />
            ) : (
              <Icon name="SparklesIcon" size={14} variant="solid" />
            )}
            {busy ? 'Reading…' : 'Ask me questions'}
          </button>
        </div>
      </div>
    </section>
  );
}
