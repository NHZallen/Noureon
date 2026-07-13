import * as pdfjs from 'pdfjs-dist/build/pdf.mjs';
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import { reconstructPdfReadingOrder, shouldFallbackPdfPageToOcr } from './pdf-reading-order.js';

pdfjs.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

export async function extractPdfDocument({
  bytes,
  name = 'document.pdf',
  ocrPage = null,
  signal,
  resumeState = null,
  onCheckpoint = null
} = {}) {
  const loadingTask = pdfjs.getDocument({ data: bytes });
  const pdf = await loadingTask.promise;
  const totalPages = pdf.numPages;
  const sections = [...(resumeState?.sections || [])];
  const pages = [...(resumeState?.pages || [])];
  const warnings = [...(resumeState?.warnings || [])];
  const completedPages = new Set(pages.map(page => page.page));
  try {
    for (let pageNumber = 1; pageNumber <= totalPages; pageNumber += 1) {
      if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
      if (completedPages.has(pageNumber)) continue;
      const page = await pdf.getPage(pageNumber);
      const textContent = await page.getTextContent();
      const reconstructed = reconstructPdfReadingOrder(textContent.items || []);
      let text = reconstructed.text;
      let extractionMethod = 'pdf-text';
      let extractionConfidence = shouldFallbackPdfPageToOcr(text) ? 0.35 : 0.9;
      let confidenceSource = 'heuristic';
      const warningCodes = [];
      if (shouldFallbackPdfPageToOcr(text)) {
        warningCodes.push('pdf-text-insufficient');
        if (typeof ocrPage === 'function') {
          const ocr = await ocrPage({ page, pageNumber, name, signal });
          if (String(ocr?.text || '').trim()) {
            text = String(ocr.text).trim();
            extractionMethod = reconstructed.text.trim() ? 'hybrid' : 'ocr';
            extractionConfidence = Number.isFinite(ocr.confidence) ? ocr.confidence : null;
            confidenceSource = ocr.confidenceSource || (Number.isFinite(ocr.confidence) ? 'engine' : 'unavailable');
            warningCodes.push(...(ocr.warningCodes || []));
          } else {
            text = reconstructed.text.trim() || '[UNREADABLE]';
            warningCodes.push('ocr-unavailable');
          }
        } else {
          text = reconstructed.text.trim() || '[UNREADABLE]';
          warningCodes.push('ocr-required');
        }
      }
      const status = text === '[UNREADABLE]' ? 'failed' : extractionMethod === 'ocr' ? 'ocr' : 'extracted';
      const pageRecord = {
        page: pageNumber,
        status,
        extractionMethod,
        extractionConfidence,
        confidenceSource,
        warningCodes,
        rawText: reconstructed.rawText,
        spans: reconstructed.spans,
        columnsDetected: reconstructed.columnsDetected
      };
      pages.push(pageRecord);
      sections.push({
        chunkType: 'prose',
        text,
        sourceLocator: { type: 'pdf', page: pageNumber },
        extraction: pageRecord
      });
      warnings.push(...warningCodes.map(code => `page-${pageNumber}:${code}`));
      if (typeof onCheckpoint === 'function') {
        await onCheckpoint({
          pages: [...pages],
          sections: [...sections],
          warnings: [...warnings],
          processedPages: pages.length,
          totalPages
        });
      }
      page.cleanup?.();
    }
  } finally {
    await pdf.destroy();
  }
  return {
    supported: true,
    name,
    mimeType: 'application/pdf',
    method: pages.some(page => page.extractionMethod !== 'pdf-text') ? 'pdf-hybrid' : 'pdfjs',
    totalPages,
    processedPages: pages.length,
    partial: pages.length !== totalPages || pages.some(page => page.status === 'failed'),
    pages,
    sections,
    warnings
  };
}
