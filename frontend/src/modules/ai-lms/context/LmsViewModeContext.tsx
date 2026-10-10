'use client';

/**
 * Lets an editor/admin/superadmin flip the AI LMS UI into "student preview" —
 * hides the same edit/generate/organize controls a real student would never see,
 * without touching their actual role or any backend permission. Purely a
 * client-side rendering toggle; the API still enforces real permissions.
 */

import { createContext, useContext, useEffect, useState, useCallback } from 'react';

const STORAGE_KEY = 'ailms_view_as_student';

interface LmsViewModeContextValue {
  isPreviewingAsStudent: boolean;
  setPreviewAsStudent: (value: boolean) => void;
  toggle: () => void;
}

const LmsViewModeContext = createContext<LmsViewModeContextValue | null>(null);

export const useLmsViewMode = () => {
  const context = useContext(LmsViewModeContext);
  if (!context) {
    throw new Error('useLmsViewMode must be used within LmsViewModeProvider');
  }
  return context;
};

export const LmsViewModeProvider = ({ children }: { children: React.ReactNode }) => {
  const [isPreviewingAsStudent, setIsPreviewingAsStudent] = useState(false);

  useEffect(() => {
    try {
      setIsPreviewingAsStudent(sessionStorage.getItem(STORAGE_KEY) === '1');
    } catch {
      // sessionStorage unavailable (private browsing, etc.) — default to off
    }
  }, []);

  const setPreviewAsStudent = useCallback((value: boolean) => {
    setIsPreviewingAsStudent(value);
    try {
      sessionStorage.setItem(STORAGE_KEY, value ? '1' : '0');
    } catch {
      // ignore — preview just won't persist across a reload
    }
  }, []);

  const toggle = useCallback(() => {
    setPreviewAsStudent(!isPreviewingAsStudent);
  }, [isPreviewingAsStudent, setPreviewAsStudent]);

  return (
    <LmsViewModeContext.Provider value={{ isPreviewingAsStudent, setPreviewAsStudent, toggle }}>
      {children}
    </LmsViewModeContext.Provider>
  );
};
