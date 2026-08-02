'use client';

import { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { apiFetch } from '@/lib/http/apiClient';
import { getToken, setToken, clearToken, isLoggedIn, onAuthChange } from '@/lib/auth/tokenStore';
import { importGuestDataIntoAccount, type MigrationResult } from '@/lib/services/migration';
import { pullServerSettingsIfLoggedIn } from '@/lib/services/settingsService';

export interface AuthUser {
  id: number;
  email: string;
  display_name: string | null;
}

interface AuthContextValue {
  user: AuthUser | null;
  isGuest: boolean;
  loading: boolean;
  login: (email: string, password: string) => Promise<{ ok: true } | { ok: false; error: string }>;
  signup: (email: string, password: string, displayName?: string) => Promise<{ ok: true } | { ok: false; error: string }>;
  logout: () => void;
  lastMigration: MigrationResult | null;
  dismissMigrationNotice: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return context;
};

async function extractError(res: Response): Promise<string> {
  try {
    const data = await res.json();
    if (data?.detail) return typeof data.detail === 'string' ? data.detail : 'Request failed';
  } catch {
    // not JSON
  }
  return `Request failed (HTTP ${res.status})`;
}

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [lastMigration, setLastMigration] = useState<MigrationResult | null>(null);

  const loadCurrentUser = useCallback(async () => {
    if (!isLoggedIn()) {
      setUser(null);
      setLoading(false);
      return;
    }
    try {
      const res = await apiFetch('/auth/me');
      if (!res.ok) {
        clearToken();
        setUser(null);
      } else {
        setUser(await res.json());
      }
    } catch {
      // Network error (e.g. backend down) — keep the token, don't drop to guest.
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadCurrentUser();
    return onAuthChange(() => loadCurrentUser());
  }, [loadCurrentUser]);

  const runPostLoginSync = useCallback(async () => {
    const migration = await importGuestDataIntoAccount();
    setLastMigration(migration);
    await pullServerSettingsIfLoggedIn();
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const res = await apiFetch('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });
    if (!res.ok) return { ok: false as const, error: await extractError(res) };
    const data = await res.json();
    setToken(data.access_token);
    setUser(data.user);
    await runPostLoginSync();
    return { ok: true as const };
  }, [runPostLoginSync]);

  const signup = useCallback(async (email: string, password: string, displayName?: string) => {
    const res = await apiFetch('/auth/signup', {
      method: 'POST',
      body: JSON.stringify({ email, password, display_name: displayName || null }),
    });
    if (!res.ok) return { ok: false as const, error: await extractError(res) };
    const data = await res.json();
    setToken(data.access_token);
    setUser(data.user);
    await runPostLoginSync();
    return { ok: true as const };
  }, [runPostLoginSync]);

  const logout = useCallback(() => {
    apiFetch('/auth/logout', { method: 'POST' }).catch(() => {});
    clearToken();
    setUser(null);
    setLastMigration(null);
  }, []);

  const dismissMigrationNotice = useCallback(() => setLastMigration(null), []);

  const value: AuthContextValue = {
    user,
    isGuest: !user,
    loading,
    login,
    signup,
    logout,
    lastMigration,
    dismissMigrationNotice,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};
