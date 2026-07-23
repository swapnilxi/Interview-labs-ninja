'use client';

export interface UserSettings {
  questionModel: string;
  answerModel: string;
  openaiKey: string;
  geminiKey: string;
  anthropicKey: string;
  deepseekKey: string;
  groqKey: string;
  ollamaUrl: string;
  ollamaModel: string;
}

export interface OllamaModel {
  name: string;
  size_gb: number | null;
  modified: string;
}

export interface OllamaStatus {
  running: boolean;
  url: string;
  models: OllamaModel[];
  error: string | null;
}

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

export const settingsService = {
  async getSettings(): Promise<UserSettings | null> {
    try {
      const res = await fetch(`${API_BASE_URL}/config/settings`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } catch (error) {
      // Fallback to legacy endpoint
      try {
        const res = await fetch(`${API_BASE_URL}/settings`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return await res.json();
      } catch {
        console.error('Failed to get settings:', error);
        return null;
      }
    }
  },

  async saveSettings(settings: UserSettings): Promise<void> {
    try {
      const res = await fetch(`${API_BASE_URL}/config/settings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(settings),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
    } catch (error) {
      // Fallback to legacy endpoint
      try {
        const res = await fetch(`${API_BASE_URL}/settings`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(settings),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
      } catch {
        console.error('Failed to save settings:', error);
        throw error;
      }
    }
  },

  /** Probe the Ollama server and return running status + pulled model list. */
  async getOllamaStatus(url?: string): Promise<OllamaStatus> {
    const params = url ? `?url=${encodeURIComponent(url)}` : '';
    const res = await fetch(`${API_BASE_URL}/config/ollama-status${params}`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  },
};
