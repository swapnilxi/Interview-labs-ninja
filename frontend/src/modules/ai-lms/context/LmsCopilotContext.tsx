'use client';

/**
 * What the AI LMS Copilot is looking at. The page that is open publishes its context with
 * `useLmsCopilotContext`; the dock in app/ai-lms/layout.tsx reads it, so answers are scoped to
 * the open class / subject / project / module / lesson. Cleared automatically on unmount.
 */

import { createContext, useContext, useEffect, useMemo, useState } from 'react';

export type CopilotScope = 'home' | 'class' | 'subject' | 'project' | 'module' | 'lesson';

export interface LmsCopilotPageContext {
  /** Stable identity of the open item (resets the conversation when it changes). */
  key: string;
  scope: CopilotScope;
  title: string;
  breadcrumb: string;
  /** Excerpt of the open item's content the AI answers from. */
  text: string;
}

interface Value {
  context: LmsCopilotPageContext | null;
  setContext: (ctx: LmsCopilotPageContext | null) => void;
}

const LmsCopilotContext = createContext<Value | null>(null);

export function LmsCopilotProvider({ children }: { children: React.ReactNode }) {
  const [context, setContext] = useState<LmsCopilotPageContext | null>(null);
  const value = useMemo(() => ({ context, setContext }), [context]);
  return <LmsCopilotContext.Provider value={value}>{children}</LmsCopilotContext.Provider>;
}

export function useLmsCopilotValue(): Value {
  const v = useContext(LmsCopilotContext);
  if (!v) throw new Error('useLmsCopilotValue must be used within LmsCopilotProvider');
  return v;
}

/** Publish the open item's context. Pass null while data is still loading. */
export function useLmsCopilotContext(ctx: LmsCopilotPageContext | null) {
  const { setContext } = useLmsCopilotValue();
  const key = ctx?.key;
  const scope = ctx?.scope;
  const title = ctx?.title;
  const breadcrumb = ctx?.breadcrumb;
  const text = ctx?.text;
  useEffect(() => {
    if (key === undefined || !scope) return;
    setContext({ key, scope, title: title ?? '', breadcrumb: breadcrumb ?? '', text: text ?? '' });
    return () => setContext(null);
  }, [key, scope, title, breadcrumb, text, setContext]);
}
