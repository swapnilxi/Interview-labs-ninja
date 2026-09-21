export interface PdfDocument {
  id: string;
  name: string;
  type?: 'pdf' | 'paste';
  sourceType: 'pdf' | 'paste';
  totalPages?: number;
  totalChunks: number;
  extractedText: string;
  chunks: DocumentChunk[];
  createdAt: string;
  updatedAt?: string;
  lastOpenedAt?: string;
}

export interface DocumentChunk {
  id: string;
  documentId: string;
  documentTitle: string;
  chunkIndex: number;
  totalChunks: number;
  pageNumber?: number;
  title: string;
  content: string;
  text?: string;
  keyTakeaway?: string;
  highlightTerms?: string[];
}

export interface ProcessingState {
  status: 'idle' | 'uploading' | 'processing' | 'success' | 'error';
  progress: number; // 0 to 100
  message?: string;
  document?: PdfDocument;
  error?: string;
}

// Bookmark is defined and owned by readerDb — re-exported here for
// components that import from types.ts for convenience.
export type { Bookmark } from './utils/readerDb';
