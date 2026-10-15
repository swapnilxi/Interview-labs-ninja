/** Mirrors backend/modules/daily_session/evaluation.py detect_kind() — keep the two in sync. */
export type QuestionKind = 'dsa' | 'system_design' | 'debugging' | 'behavioral' | 'cv_ml';

export function detectKind(subType?: string, category?: string, questionText = ''): QuestionKind {
  const st = (subType || '').toLowerCase();
  if (st.includes('system design')) return 'system_design';
  if (st.includes('data structure') || st.includes('algorithm') || st === 'dsa') return 'dsa';
  if (st.includes('bug') || st.includes('debug')) return 'debugging';
  if (st.includes('leadership') || st.includes('behav')) return 'behavioral';
  if (['cv_skill', 'cv'].includes((category || '').toLowerCase())) return 'cv_ml';
  const q = questionText.toLowerCase();
  if (['design a', 'design an', 'architecture'].some((w) => q.includes(w))) return 'system_design';
  if (['implement', 'time complexity', 'array', 'string', 'tree', 'graph'].some((w) => q.includes(w))) return 'dsa';
  return 'cv_ml';
}

/** DSA and system-design questions get a dedicated code / sketch space. */
export const wantsCode = (kind: QuestionKind) => kind === 'dsa' || kind === 'system_design';

export const KIND_LABEL: Record<QuestionKind, string> = {
  dsa: 'DSA',
  system_design: 'System Design',
  debugging: 'Debugging',
  behavioral: 'Behavioral',
  cv_ml: 'CV / ML',
};
