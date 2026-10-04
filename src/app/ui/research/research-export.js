// What a finished research is turned into when it is downloaded (never before: nothing is prepared ahead). The report is Markdown; the Markdown
// file is that text with the list of its sources added at the end.

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

/** Saves text as a file through the browser (the same way the app's other downloads are given). */
export function downloadText({ text, name, mimeType = 'text/markdown;charset=utf-8', document = globalThis.document }) {
  const blob = new Blob([text], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  link.style.display = 'none';
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
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

/** Saves the report as a Markdown file. */
export function exportReportMarkdown(report, language = 'en', document = globalThis.document) {
  downloadText({ text: reportMarkdown(report, language), name: reportFileName(report, 'md'), document });
}
