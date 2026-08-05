'use client';

/** Portfolio API service — wraps /career/portfolios/* (mirrors careerService). */

import { API_BASE_URL, apiFetch, apiJson, parseApiError } from '../http/apiClient';
import { defaultAIRequestFields } from './settingsService';
import type {
  AnalysisRecord,
  Portfolio,
  PortfolioTheme,
  PortfolioVersion,
  PortfolioWidget,
  PublicPortfolio,
  PublishStatus,
} from '@/modules/career/types';

export { parseApiError };

export const portfolioService = {
  listPortfolios(): Promise<Portfolio[]> {
    return apiJson<Portfolio[]>('/career/portfolios');
  },
  createPortfolio(title: string): Promise<Portfolio> {
    return apiJson<Portfolio>('/career/portfolios', { method: 'POST', body: JSON.stringify({ title }) });
  },
  getPortfolio(masterId: string): Promise<Portfolio> {
    return apiJson<Portfolio>(`/career/portfolios/${masterId}`);
  },
  updatePortfolio(masterId: string, fields: { title?: string; theme?: PortfolioTheme }): Promise<Portfolio> {
    return apiJson<Portfolio>(`/career/portfolios/${masterId}`, { method: 'PATCH', body: JSON.stringify(fields) });
  },
  deletePortfolio(masterId: string): Promise<{ status: string }> {
    return apiJson(`/career/portfolios/${masterId}`, { method: 'DELETE' });
  },

  addWidget(masterId: string, widgetType: string, title?: string, content?: any): Promise<PortfolioWidget> {
    return apiJson<PortfolioWidget>(`/career/portfolios/${masterId}/widgets`, {
      method: 'POST',
      body: JSON.stringify({ widget_type: widgetType, title, content }),
    });
  },
  updateWidget(
    masterId: string,
    widgetId: string,
    fields: Partial<Pick<PortfolioWidget, 'title' | 'content' | 'is_hidden' | 'sort_order'>>,
  ): Promise<PortfolioWidget> {
    return apiJson<PortfolioWidget>(`/career/portfolios/${masterId}/widgets/${widgetId}`, { method: 'PATCH', body: JSON.stringify(fields) });
  },
  deleteWidget(masterId: string, widgetId: string): Promise<{ status: string }> {
    return apiJson(`/career/portfolios/${masterId}/widgets/${widgetId}`, { method: 'DELETE' });
  },
  reorderWidgets(masterId: string, orderedIds: string[]): Promise<Portfolio> {
    return apiJson<Portfolio>(`/career/portfolios/${masterId}/widgets/reorder`, { method: 'POST', body: JSON.stringify({ ordered_ids: orderedIds }) });
  },

  listVersions(masterId: string): Promise<PortfolioVersion[]> {
    return apiJson<PortfolioVersion[]>(`/career/portfolios/${masterId}/versions`);
  },
  snapshotVersion(masterId: string, label?: string): Promise<PortfolioVersion> {
    return apiJson<PortfolioVersion>(`/career/portfolios/${masterId}/versions`, { method: 'POST', body: JSON.stringify({ label }) });
  },
  restoreVersion(masterId: string, versionId: string): Promise<Portfolio> {
    return apiJson<Portfolio>(`/career/portfolios/${masterId}/versions/${versionId}/restore`, { method: 'POST' });
  },
  cloneVersion(versionId: string, title?: string): Promise<Portfolio> {
    return apiJson<Portfolio>(`/career/portfolio-versions/${versionId}/clone`, { method: 'POST', body: JSON.stringify({ title }) });
  },

  // ── Publishing / sharing / export ─────────────────────────────────────────
  getPublishStatus(masterId: string): Promise<PublishStatus | Record<string, never>> {
    return apiJson(`/career/portfolios/${masterId}/publish`);
  },
  publish(masterId: string): Promise<PublishStatus> {
    return apiJson<PublishStatus>(`/career/portfolios/${masterId}/publish`, { method: 'POST' });
  },
  unpublish(masterId: string): Promise<{ status: string }> {
    return apiJson(`/career/portfolios/${masterId}/publish`, { method: 'DELETE' });
  },
  async exportBlob(masterId: string, format: 'html' | 'pdf'): Promise<Blob> {
    const res = await apiFetch(`/career/portfolios/${masterId}/export?format=${format}`);
    if (!res.ok) throw new Error(await parseApiError(res));
    return res.blob();
  },
  /** Public, unauthenticated read of a published portfolio by slug. */
  async getPublic(slug: string): Promise<PublicPortfolio> {
    const res = await fetch(`${API_BASE_URL}/career/public/portfolios/${slug}`);
    if (!res.ok) throw new Error(await parseApiError(res));
    return res.json();
  },

  analyzePortfolio(masterId: string): Promise<AnalysisRecord> {
    return apiJson<AnalysisRecord>(`/career/portfolios/${masterId}/analyze`, { method: 'POST', body: JSON.stringify({ ...defaultAIRequestFields() }) });
  },
  getAnalysis(masterId: string): Promise<AnalysisRecord | Record<string, never>> {
    return apiJson(`/career/portfolios/${masterId}/analysis`);
  },
};
