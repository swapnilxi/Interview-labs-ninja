'use client';

/** Small browser helpers for downloading/printing rendered exports. */

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

/**
 * Print an HTML blob via a hidden iframe (the browser's "Save as PDF" path).
 * Kept off-DOM-flow; removed a few seconds after the print dialog is triggered.
 */
export async function printHtmlBlob(blob: Blob): Promise<void> {
  const html = await blob.text();
  const iframe = document.createElement('iframe');
  iframe.style.position = 'fixed';
  iframe.style.right = '0';
  iframe.style.bottom = '0';
  iframe.style.width = '0';
  iframe.style.height = '0';
  iframe.style.border = '0';
  document.body.appendChild(iframe);
  const doc = iframe.contentWindow?.document;
  if (!doc) {
    iframe.remove();
    return;
  }
  doc.open();
  doc.write(html);
  doc.close();
  const trigger = () => {
    iframe.contentWindow?.focus();
    iframe.contentWindow?.print();
    setTimeout(() => iframe.remove(), 60000);
  };
  // Give the iframe a tick to lay out before printing.
  if (doc.readyState === 'complete') setTimeout(trigger, 250);
  else iframe.onload = () => setTimeout(trigger, 250);
}
