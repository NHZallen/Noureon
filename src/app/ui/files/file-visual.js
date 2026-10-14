// How a file looks wherever the app shows one (the card in the message box, the row in a message, the row of a file the model made): its kind, the name of the kind
// ("Word 文件（DOCX）") and its icon. One place, so the three look like one family. Only the page uses it (it draws with `document`).

import { getFileExtension, resolveFileType } from './file-type-registry.js';
import { getFileText } from './file-texts.js';

const SVG_NS = 'http://www.w3.org/2000/svg';

export const FAMILY_LABEL_KEYS = Object.freeze({
  word: 'familyWord',
  excel: 'familyExcel',
  powerpoint: 'familyPowerpoint',
  pdf: 'familyPdf',
  csv: 'familyCsv',
  text: 'familyText',
  markdown: 'familyMarkdown',
  code: 'familyCode',
  data: 'familyData',
  web: 'familyWeb',
  calendar: 'familyCalendar',
  contact: 'familyContact',
  subtitle: 'familySubtitle',
  image: 'familyImage',
  video: 'familyVideo',
  audio: 'familyAudio',
  archive: 'familyArchive',
  blocked: 'familyBlocked'
});

/** { family, extension } of a file by its type and its name. */
export function describeAttachment({ name = '', mimeType = '' } = {}) {
  const extension = getFileExtension(name);
  if (/^image\//.test(mimeType)) return { family: 'image', extension };
  if (/^video\//.test(mimeType)) return { family: 'video', extension };
  if (/^audio\//.test(mimeType)) return { family: 'audio', extension };
  if (mimeType === 'application/pdf') return { family: 'pdf', extension: extension || 'pdf' };
  const { family } = resolveFileType(name);
  return { family, extension };
}

/** The name of the kind, with the extension after it: "Word 文件（DOCX）", "Word document (DOCX)". */
export function fileKindLabel(language, { family, extension = '' }) {
  const label = getFileText(language, FAMILY_LABEL_KEYS[family] || 'familyText');
  if (!extension) return label;
  const shown = String(extension).slice(0, 5).toUpperCase();
  return language === 'zh-TW' ? `${label}（${shown}）` : `${label} (${shown})`;
}

// Simple line icons (24 x 24, drawn with the colour of the kind).
const ICONS = Object.freeze({
  document: [['path', { d: 'M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z' }], ['path', { d: 'M14 3v5h5' }], ['path', { d: 'M9 13h6M9 17h6' }]],
  sheet: [['rect', { x: '3.5', y: '4', width: '17', height: '16', rx: '2' }], ['path', { d: 'M3.5 10h17M3.5 15h17M9.5 4v16' }]],
  slides: [['path', { d: 'M3 4h18' }], ['path', { d: 'M5 4v11a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V4' }], ['path', { d: 'M12 16v4M8.5 20h7' }], ['path', { d: 'm9 12 2.2-2.4 1.6 1.4L15 8.6' }]],
  code: [['path', { d: 'm8.5 8-4 4 4 4M15.5 8l4 4-4 4' }]],
  data: [['path', { d: 'M8 4C6.5 4 6 5 6 6.5V9c0 1-.6 2-2 3 1.4 1 2 2 2 3v2.5C6 19 6.5 20 8 20M16 4c1.5 0 2 1 2 2.5V9c0 1 .6 2 2 3-1.4 1-2 2-2 3v2.5c0 1.5-.5 2.5-2 2.5' }]],
  image: [['rect', { x: '3.5', y: '4.5', width: '17', height: '15', rx: '2' }], ['circle', { cx: '9', cy: '10', r: '1.6' }], ['path', { d: 'm4 18 5-5 3.5 3.5L16 13l4 4' }]],
  video: [['rect', { x: '3.5', y: '5', width: '17', height: '14', rx: '2' }], ['path', { d: 'm10.5 9.5 4 2.5-4 2.5z' }]],
  audio: [['path', { d: 'M9 18V6l10-2v12' }], ['circle', { cx: '6.5', cy: '18', r: '2.5' }], ['circle', { cx: '16.5', cy: '16', r: '2.5' }]],
  web: [['circle', { cx: '12', cy: '12', r: '8.5' }], ['path', { d: 'M3.5 12h17M12 3.5c2.4 2.4 3.4 5.2 3.4 8.5s-1 6.1-3.4 8.5c-2.4-2.4-3.4-5.2-3.4-8.5s1-6.1 3.4-8.5z' }]],
  calendar: [['rect', { x: '4', y: '5.5', width: '16', height: '14.5', rx: '2' }], ['path', { d: 'M4 10h16M8.5 3.5v4M15.5 3.5v4' }]],
  contact: [['circle', { cx: '12', cy: '9', r: '3.4' }], ['path', { d: 'M5.5 19.5c.8-3.4 3.2-5 6.5-5s5.7 1.6 6.5 5' }]],
  archive: [['rect', { x: '3.5', y: '4', width: '17', height: '4.5', rx: '1' }], ['path', { d: 'M5 8.5V19a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V8.5M10 12.5h4' }]],
  blocked: [['path', { d: 'M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z' }], ['path', { d: 'M14 3v5h5M9.5 12.5l5 5m0-5-5 5' }]]
});
const ICON_OF_FAMILY = Object.freeze({
  word: 'document', pdf: 'document', text: 'document', markdown: 'document', subtitle: 'document',
  excel: 'sheet', csv: 'sheet', powerpoint: 'slides', code: 'code', data: 'data',
  image: 'image', video: 'video', audio: 'audio', web: 'web', calendar: 'calendar', contact: 'contact', archive: 'archive', blocked: 'blocked'
});

/** The icon of a family, coloured by `.ac-kind-<family>` (src/styles/file-visual.css). */
export function createFileKindIcon(document, family) {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '1.7');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('class', `ac-kind-icon ac-kind-${family}`);
  for (const [tag, attributes] of ICONS[ICON_OF_FAMILY[family] || 'document']) {
    const node = document.createElementNS(SVG_NS, tag);
    for (const [name, value] of Object.entries(attributes)) node.setAttribute(name, value);
    svg.appendChild(node);
  }
  return svg;
}

/** The families that get a picture of their first page or their text (a program's source does not, and a file of another kind has none to show). */
export const THUMBNAIL_FAMILIES = Object.freeze(['image', 'video', 'pdf', 'word', 'powerpoint', 'excel', 'text', 'markdown', 'csv']);
/** A file bigger than this has no picture made of it (it would take too long to read). */
export const THUMBNAIL_MAX_BYTES = 15 * 1024 * 1024;

const escapeAttribute = (value) => String(value).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');

/** The same icon as markup, for the places that build a message as text. */
export function fileKindIconHTML(family) {
  const shapes = ICONS[ICON_OF_FAMILY[family] || 'document'].map(([tag, attributes]) => `<${tag} ${Object.entries(attributes).map(([name, value]) => `${name}="${escapeAttribute(value)}"`).join(' ')}/>`).join('');
  return `<svg class="ac-kind-icon ac-kind-${family}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${shapes}</svg>`;
}

/** Only the name of the kind: "Word 文件", without the extension (the name of the file has it). */
export const fileFamilyLabel = (language, family) => getFileText(language, FAMILY_LABEL_KEYS[family] || 'familyText');
