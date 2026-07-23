'use client';

export interface UserSettings {
  textGenerationModel: string;
  answerModel: string;
  openaiKey: string;
  geminiKey: string;
  anthropicKey: string;
  deepseekKey: string;
  groqKey: string;
  ollamaUrl: string;
  ollamaModel: string;
}

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

export const settingsService = {
  async getSettings(): Promise<UserSettings | null> {
    try {
      const res = await fetch(`${API_BASE_URL}/settings`);
      if (!res.ok) {
        throw new Error(`HTTP error! status: ${res.status}`);
      }
      return await res.json();
    } catch (error) {
      console.error('Failed to get settings:', error);
      return null;
    }
  },

  async saveSettings(settings: UserSettings): Promise<void> {
    try {
      const res = await fetch(`${API_BASE_URL}/settings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(settings),
      });
      if (!res.ok) {
        throw new Error(`HTTP error! status: ${res.status}`);
      }
    } catch (error) {
      console.error('Failed to save settings:', error);
      throw error;
    }
  },

  async getOllamaModels(url: string): Promise<string[]> {
    const res = await fetch(`${API_BASE_URL}/settings/ollama-models?url=${encodeURIComponent(url)}`);
    if (!res.ok) {
      const data = await res.json().catch(() => null);
      throw new Error(data?.detail || `HTTP error! status: ${res.status}`);
    }
    const data = await res.json();
    return data.models || [];
  },
};
