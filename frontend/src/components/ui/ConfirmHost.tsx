'use client';

import React, { useEffect, useId, useSyncExternalStore } from 'react';
import Modal from '@/components/ui/Modal';
import {
  attachConfirmHost,
  getPendingConfirm,
  resolveConfirm,
  subscribeConfirm,
} from '@/lib/ui/confirm';

/**
 * Renders the pending `confirmDialog()` request (`lib/ui/confirm.ts`). Mount it once per page that
 * asks questions. Esc and a click on the backdrop mean "no", like Cancel.
 *
 * It is an `alertdialog`: initial focus is on the safe answer — Cancel for a destructive question,
 * the confirm button otherwise — so Enter does what you would expect and a stray Enter can't delete.
 */
export default function ConfirmHost({ panelClassName = '' }: { panelClassName?: string } = {}) {
  const request = useSyncExternalStore(subscribeConfirm, getPendingConfirm, () => null);
  const headingId = useId();
  const messageId = useId();

  useEffect(() => attachConfirmHost(), []);

  const danger = request?.tone === 'danger';
  const answer = (confirmed: boolean) => {
    if (request) resolveConfirm(request.id, confirmed);
  };

  return (
    <Modal
      // The request id as key: a second question reuses the same host, but must not inherit the
      // first one's focus.
      key={request?.id ?? 'none'}
      isOpen={!!request}
      onClose={() => answer(false)}
      role="alertdialog"
      labelledBy={headingId}
      describedBy={request?.message || request?.note ? messageId : undefined}
      // `panelClassName` lets a module style its questions like itself (the dialog portals to <body>, outside the module's own
      // root classes): the DSA lab passes `dsa-type`.
      className={`bg-card border border-border shadow-2xl rounded-2xl w-full max-w-sm ${panelClassName}`}
    >
      {request && (
        <div className="p-5">
          <h2 id={headingId} className="font-heading text-base font-semibold text-foreground">
            {request.title}
          </h2>
          {(request.message || request.note) && (
            <div
              id={messageId}
              className="mt-2 space-y-2 text-sm leading-relaxed text-muted-foreground"
            >
              {request.message && <p>{request.message}</p>}
              {request.note && (
                <p className="rounded-lg bg-amber-500/10 px-3 py-2 text-amber-700 dark:text-amber-300">
                  {request.note}
                </p>
              )}
            </div>
          )}
          <div className="mt-5 flex justify-end gap-2">
            <button
              type="button"
              data-autofocus={danger ? '' : undefined}
              onClick={() => answer(false)}
              className="todo-focus rounded-lg px-4 py-2 text-sm font-semibold text-muted-foreground transition-smooth hover:bg-muted hover:text-foreground"
            >
              {request.cancelLabel ?? 'Cancel'}
            </button>
            <button
              type="button"
              data-autofocus={danger ? undefined : ''}
              onClick={() => answer(true)}
              className={`todo-focus rounded-lg px-4 py-2 text-sm font-semibold transition-smooth hover:opacity-90 ${
                danger ? 'bg-red-600 text-white' : 'bg-primary text-primary-foreground'
              }`}
            >
              {request.confirmLabel ?? 'Continue'}
            </button>
          </div>
        </div>
      )}
    </Modal>
  );
}
