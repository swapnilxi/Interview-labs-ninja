'use client';

import { useRef, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import Icon from '@/components/ui/AppIcon';
import type { Snippet } from './useSnippets';

const LANGUAGES: Record<string, string> = {
  python: 'Python',
  javascript: 'JavaScript',
  typescript: 'TypeScript',
  java: 'Java',
  cpp: 'C++',
  go: 'Go',
  rust: 'Rust',
  sql: 'SQL',
  other: 'Other',
};

// ── Inline code display ──────────────────────────────────────────────────────

function CodeBody({ code }: { code: string }) {
  return (
    <pre className="max-h-[28rem] overflow-auto border-t px-4 py-3 text-xs leading-relaxed text-foreground whitespace-pre mix-bg-foreground/[0.03]">
      <code className="font-mono">{code}</code>
    </pre>
  );
}

function CopyButton({ code }: { code: string }) {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    try {
      navigator.clipboard.writeText(code).then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      });
    } catch {
      /* insecure context */
    }
  };
  return (
    <button
      type="button"
      onClick={copy}
      title={copied ? 'Copied' : 'Copy code'}
      aria-label={copied ? 'Copied' : 'Copy code'}
      className="todo-focus rounded-md p-1.5 text-muted-foreground transition-colors hover:text-foreground hover:mix-bg-foreground/[0.06]"
    >
      <Icon name={copied ? 'CheckIcon' : 'ClipboardDocumentIcon'} size={14} />
    </button>
  );
}

// ── Add / edit form ───────────────────────────────────────────────────────────

interface FormState {
  title: string;
  language: string;
  code: string;
  shared: boolean;
  busy: boolean;
  error: string | null;
}

function SnippetForm({
  initial,
  isAdmin,
  onSave,
  onCancel,
}: {
  initial?: Partial<FormState>;
  isAdmin: boolean;
  onSave: (title: string, language: string, code: string, shared: boolean) => Promise<void>;
  onCancel: () => void;
}) {
  const [form, setForm] = useState<FormState>({
    title: initial?.title ?? '',
    language: initial?.language ?? 'python',
    code: initial?.code ?? '',
    shared: initial?.shared ?? false,
    busy: false,
    error: null,
  });
  const codeRef = useRef<HTMLTextAreaElement>(null);

  const save = async () => {
    if (!form.code.trim()) {
      setForm((f) => ({ ...f, error: 'Code is required.' }));
      codeRef.current?.focus();
      return;
    }
    setForm((f) => ({ ...f, busy: true, error: null }));
    try {
      await onSave(form.title.trim(), form.language, form.code, form.shared);
    } catch (err: unknown) {
      setForm((f) => ({
        ...f,
        busy: false,
        error: (err as { message?: string })?.message ?? String(err),
      }));
    }
  };

  return (
    <div className="rounded-xl border border-border mix-bg-foreground/[0.02] p-3 space-y-2.5">
      <div className="flex flex-wrap gap-2">
        <input
          type="text"
          placeholder="Title (optional)"
          value={form.title}
          onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
          maxLength={120}
          className="todo-input flex-1 min-w-[8rem] text-sm"
        />
        <select
          value={form.language}
          onChange={(e) => setForm((f) => ({ ...f, language: e.target.value }))}
          className="todo-input text-sm"
        >
          {Object.entries(LANGUAGES).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </select>
      </div>

      <textarea
        ref={codeRef}
        placeholder="Paste or type your code here…"
        value={form.code}
        onChange={(e) => setForm((f) => ({ ...f, code: e.target.value }))}
        rows={8}
        className="todo-input w-full font-mono text-xs leading-relaxed resize-y"
        spellCheck={false}
      />

      {isAdmin && (
        <label className="flex items-center gap-2 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={form.shared}
            onChange={(e) => setForm((f) => ({ ...f, shared: e.target.checked }))}
            className="rounded"
          />
          <span className="text-xs text-muted-foreground">Share with everyone (admin only)</span>
        </label>
      )}

      {form.error && (
        <p className="text-xs text-error">{form.error}</p>
      )}

      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={save}
          disabled={form.busy}
          className="todo-btn todo-btn-primary text-xs"
        >
          {form.busy ? 'Saving…' : 'Save snippet'}
        </button>
        <button
          type="button"
          onClick={onCancel}
          disabled={form.busy}
          className="todo-btn todo-btn-ghost text-xs"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

// ── Snippet card ──────────────────────────────────────────────────────────────

const CHIP =
  'inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-xs font-semibold mix-bg-foreground/[0.07] text-muted-foreground';

function SnippetRow({
  snippet,
  isAdmin,
  onDelete,
  onEdit,
}: {
  snippet: Snippet;
  isAdmin: boolean;
  onDelete: () => Promise<void>;
  onEdit: () => void;
}) {
  const [deleting, setDeleting] = useState(false);
  const canChange = !snippet.shared || isAdmin;
  const lines = snippet.code.split('\n').length;

  const handleDelete = async () => {
    setDeleting(true);
    try {
      await onDelete();
    } catch {
      setDeleting(false);
    }
  };

  return (
    <article className="lab-edge overflow-hidden rounded-xl border bg-card">
      <header className="flex items-center gap-3 px-3.5 py-2.5">
        <span
          aria-hidden="true"
          className="flex h-[2.25rem] w-[2.25rem] flex-shrink-0 items-center justify-center rounded-lg border bg-card lab-ink"
        >
          <Icon name="CodeBracketIcon" size={16} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="break-words text-sm font-semibold leading-snug text-foreground">
            {snippet.title || 'Untitled snippet'}
          </p>
          <div className="mt-1 flex flex-wrap items-center gap-1.5">
            <span className={CHIP}>{LANGUAGES[snippet.language] ?? snippet.language}</span>
            <span className={CHIP}>
              {lines} {lines === 1 ? 'line' : 'lines'}
            </span>
            {snippet.shared && (
              <span className={`${CHIP} lab-tint lab-ink`}>
                <Icon name="UsersIcon" size={11} />
                Team
              </span>
            )}
          </div>
        </div>
        <div className="flex flex-shrink-0 items-center gap-0.5">
          <CopyButton code={snippet.code} />
          {canChange && (
            <button
              type="button"
              onClick={onEdit}
              title="Edit snippet"
              aria-label="Edit snippet"
              className="todo-focus rounded-md p-1.5 text-muted-foreground transition-colors hover:text-foreground hover:mix-bg-foreground/[0.06]"
            >
              <Icon name="PencilIcon" size={14} />
            </button>
          )}
          {canChange && (
            <button
              type="button"
              onClick={handleDelete}
              disabled={deleting}
              title="Delete snippet"
              aria-label="Delete snippet"
              className="todo-focus rounded-md p-1.5 text-muted-foreground transition-colors hover:text-error hover:mix-bg-foreground/[0.06] disabled:opacity-40"
            >
              <Icon name="TrashIcon" size={14} />
            </button>
          )}
        </div>
      </header>
      <CodeBody code={snippet.code} />
    </article>
  );
}

// ── Main panel ───────────────────────────────────────────────────────────────

interface Props {
  snippets: Snippet[];
  loading: boolean;
  error: string | null;
  onAdd: (title: string, language: string, code: string, shared: boolean) => Promise<void>;
  onDelete: (id: number) => Promise<void>;
  onEdit: (id: number, title: string, language: string, code: string) => Promise<void>;
}

export default function SnippetPanel({ snippets, loading, error, onAdd, onDelete, onEdit }: Props) {
  const { isAdmin } = useAuth();
  const [addOpen, setAddOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);

  const handleAdd = async (title: string, language: string, code: string, shared: boolean) => {
    await onAdd(title, language, code, shared);
    setAddOpen(false);
  };

  const handleEdit = async (id: number, title: string, language: string, code: string) => {
    await onEdit(id, title, language, code);
    setEditingId(null);
  };

  return (
    <div className="border-t border-border px-5 py-4 space-y-3">
      {/* header */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Icon name="CodeBracketIcon" size={14} className="text-muted-foreground flex-shrink-0" />
          <span className="text-xs font-semibold text-foreground">
            Code snippets
            {snippets.length > 0 && (
              <span className="ml-1.5 text-muted-foreground font-normal">({snippets.length})</span>
            )}
          </span>
        </div>
        {!addOpen && (
          <button
            type="button"
            onClick={() => setAddOpen(true)}
            className="todo-focus inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium lab-tint lab-ink hover:mix-bg-primary/[0.18] transition-colors"
          >
            <Icon name="PlusIcon" size={12} />
            Add snippet
          </button>
        )}
      </div>

      {/* loading / error */}
      {loading && <p className="text-xs text-muted-foreground">Loading…</p>}
      {error && <p className="text-xs text-error">{error}</p>}

      {/* add form */}
      {addOpen && (
        <SnippetForm
          isAdmin={isAdmin}
          onSave={handleAdd}
          onCancel={() => setAddOpen(false)}
        />
      )}

      {/* snippet list */}
      {snippets.length > 0 && (
        <div className="space-y-3">
          {snippets.map((s) =>
            editingId === s.id ? (
              <SnippetForm
                key={s.id}
                initial={{ title: s.title, language: s.language, code: s.code, shared: s.shared }}
                isAdmin={isAdmin}
                onSave={async (title, language, code) => handleEdit(s.id, title, language, code)}
                onCancel={() => setEditingId(null)}
              />
            ) : (
              <SnippetRow
                key={s.id}
                snippet={s}
                isAdmin={isAdmin}
                onDelete={() => onDelete(s.id)}
                onEdit={() => setEditingId(s.id)}
              />
            )
          )}
        </div>
      )}

      {!loading && !error && snippets.length === 0 && !addOpen && (
        <p className="text-xs text-muted-foreground">
          No snippets yet. Add your own code to this section.
        </p>
      )}
    </div>
  );
}
