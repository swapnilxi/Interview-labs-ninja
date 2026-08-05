'use client';

/**
 * Template Designer & Manager API — user-designed resume/portfolio templates.
 * A template's `spec` is a structured set of visual knobs the backend compiles
 * to CSS (see career_studio/template_presets.py). Listing seeds the built-in
 * presets on first visit, so the manager always shows a full library.
 */

import { apiJson } from '../http/apiClient';
import type { CareerTemplate, ViewKind } from '@/modules/career/types';

export const templatesService = {
  list(kind?: ViewKind): Promise<CareerTemplate[]> {
    return apiJson<CareerTemplate[]>(`/career/templates${kind ? `?kind=${kind}` : ''}`);
  },
  get(id: string): Promise<CareerTemplate> {
    return apiJson<CareerTemplate>(`/career/templates/${id}`);
  },
  create(args: { kind: ViewKind; name: string; spec: any }): Promise<CareerTemplate> {
    return apiJson<CareerTemplate>('/career/templates', { method: 'POST', body: JSON.stringify(args) });
  },
  update(id: string, fields: Partial<{ name: string; spec: any }>): Promise<CareerTemplate> {
    return apiJson<CareerTemplate>(`/career/templates/${id}`, { method: 'PATCH', body: JSON.stringify(fields) });
  },
  remove(id: string): Promise<{ status: string }> {
    return apiJson(`/career/templates/${id}`, { method: 'DELETE' });
  },
  duplicate(id: string, name?: string): Promise<CareerTemplate> {
    return apiJson<CareerTemplate>(`/career/templates/${id}/duplicate`, { method: 'POST', body: JSON.stringify({ name }) });
  },
};
