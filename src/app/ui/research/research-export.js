// What a finished research is turned into when it is downloaded (never before: nothing is prepared ahead). The report is Markdown; the Markdown
// file is that text with the list of its sources added at the end; the PDF and the Word file are made from it with the one fixed template of
// research-document.js, by the app's own generators, in the page.

import { researchText } from '../../runtime/research/research-texts.js';

/** The report as a Markdown file's text: its `[n]` citations stay, and a list of the sources ends it. */
export function reportMarkdown(report, language = 'en') {
  const text = String(report?.text || '').trimEnd();
  const sources = (Array.isArray(report?.sources) ? report.sources : []).filter((source) => source?.url && Number(source.n) > 0);
  if (!sources.length) return `${text}\n`;
  const list = sources.map((source) => `[${source.n}] ${source.title || source.site || source.url} — ${source.url}`).join('\n\n');
  return `${text}\n\n## ${researchText(language, 'references')}\n\n${list}\n`;
}

export const reportFileName = (report, extension = 'md') => {
  const safe = String(report?.title || 'report').replace(/[\\/:*?"<>|\u0000-\u001f]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 80);
  return `${safe || 'report'}.${extension}`;
};

let logoRequest = null;

/** The mark of the PDF's first page as a data address (or null: the name is there without it). */
async function loadLogo(window) {
  logoRequest ||= (async () => {
    try {
      const response = await window.fetch('/icon-192.png');
      if (!response.ok) return null;
      const blob = await response.blob();
      return await new Promise((resolve) => {
        const reader = new window.FileReader();
        reader.onload = () => resolve(String(reader.result || '') || null);
        reader.onerror = () => resolve(null);
        reader.readAsDataURL(blob);
      });
    } catch {
      return null;
    }
  })();
  const logo = await logoRequest;
  if (!logo) logoRequest = null;
  return logo;
}

// A file made for a phone's share sheet that needed one more tap: kept for that tap.
let waiting = null;

/**
 * Makes the file of the report when it is asked for and hands it to the person: kind 'md', 'docx' or 'pdf'. Resolves 'downloaded', 'shared',
 * 'cancelled' or 'needs-tap' (the phone wants one more tap: the next call for the same file gives it at once). Throws when it cannot be made.
 */
export async function exportReport(kind, report, { language = 'en', document = globalThis.document, window = document?.defaultView } = {}) {
  const name = reportFileName(report, kind);
  const key = `${kind}:${name}:${(report?.text || '').length}`;
  let blob = waiting?.key === key ? waiting.blob : null;
  if (!blob) {
    if (kind === 'md') {
      blob = new Blob([reportMarkdown(report, language)], { type: 'text/markdown;charset=utf-8' });
    } else {
      const { reportDescriptor, reportGeneratorOptions } = await import('./research-document.js');
      const logo = kind === 'pdf' ? await loadLogo(window) : null;
      const generate = kind === 'pdf'
        ? (await import('../files/generators/pdf-file.js')).generatePdfFile
        : (await import('../files/generators/docx-file.js')).generateDocxFile;
      blob = await generate(reportDescriptor(report, { language, target: kind, name }), {
        language,
        document,
        window,
        report: reportGeneratorOptions(kind, { logo }),
        loadChartImageRenderer: () => import('../files/generators/chart-image-export.js')
      });
    }
  }
  const { deliverFile } = await import('../files/file-card-interactions.js');
  const result = await deliverFile({ window, document, blob, fileName: name });
  waiting = result === 'needs-tap' ? { key, blob } : null;
  return result;
}

/** Copies the report (with its sources) to the clipboard. Resolves whether it worked. */
export async function copyReport(report, language = 'en') {
  try {
    await navigator.clipboard.writeText(reportMarkdown(report, language));
    return true;
  } catch {
    return false;
  }
}

/** `exportReport` with what the person sees: a busy label while it is made (`onBusy(kind)` then `onBusy(null)`), and a notice when it fails or wants a tap. */
export async function exportWithNotice(kind, report, { language, document, showNotification = () => {}, onBusy = () => {} }) {
  onBusy(kind);
  try {
    const result = await exportReport(kind, report, { language, document });
    if (result === 'needs-tap') {
      const { getFileText } = await import('../files/file-texts.js');
      showNotification(getFileText(language, 'tapAgainToSave', { name: reportFileName(report, kind) }), 'success');
    }
    return result;
  } catch (error) {
    console.error('Exporting the research failed:', error);
    const reason = String(error?.message || error?.name || 'unknown error').slice(0, 160);
    showNotification(researchText(language, 'exportFailed', { reason }), 'error');
    return 'failed';
  } finally {
    onBusy(null);
  }
}
