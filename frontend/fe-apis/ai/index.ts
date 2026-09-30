/**
 * fe-apis/ai/index.ts
 *
 * Barrel export for the shared multi-provider AI client -- import everything from
 * 'fe-apis/ai'. Any frontend module that needs to call an LLM should use this entry
 * point rather than reaching into client.ts, providers.ts, or utils.ts directly.
 */

export { callAIText, embedTexts, NoEmbeddingProviderError } from './client';
export type { AISettingsPayload } from './client';
export { resolveModel, aiDefaultInfo } from './defaults';
export type { AIDefaultInfo } from './defaults';
export { cleanHtmlOutput, extractJsonObject } from './utils';
