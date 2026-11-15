'use client';

import { createContext, useContext } from 'react';
import type { OllamaStatus, UserSettings } from '@/lib/services/settingsService';
import type { AiDefaultState, KeyField } from './catalog';

export type SectionId =
  'model' | 'keys' | 'appearance' | 'prompts' | 'memory' | 'install' | 'advanced';

export interface KeyTest {
  loading: boolean;
  ok?: boolean;
  message?: string;
}

export interface OllamaState {
  status: OllamaStatus | null;
  detecting: boolean;
  /** Model names pulled into the local Ollama (from /settings/ollama-models). */
  models: string[];
  modelsLoading: boolean;
  modelsError: string;
  refresh: () => void;
}

/** Everything the Settings sections share, so each section file only takes what it renders. */
export interface ConfigContextValue {
  settings: UserSettings;
  /** Every user edit goes through here: state updates at once and auto-save is scheduled. */
  edit: (patch: Partial<UserSettings>) => void;
  aiDefault: AiDefaultState;
  ollama: OllamaState;
  keyTests: Partial<Record<KeyField, KeyTest>>;
  testKey: (field: KeyField) => void;
  /** Score answers with the main model (answerModel follows textGenerationModel). */
  sameModel: boolean;
  setSameModel: (same: boolean) => void;
  /** Switch section and, once it renders, focus the element with this id. */
  goTo: (section: SectionId, focusId?: string) => void;
  /** The element `goTo` asked to focus (a section opens the matching row on mount). */
  focusTarget: string | null;
}

export const ConfigContext = createContext<ConfigContextValue | null>(null);

export function useConfig(): ConfigContextValue {
  const ctx = useContext(ConfigContext);
  if (!ctx) throw new Error('useConfig must be used inside the Settings page');
  return ctx;
}
