// The one fixed template a research report is downloaded in (PDF and Word): no model takes part. The report's Markdown is turned into the
// document source the app's own generators read (front matter with the design, the title, the sections one level up so they are the headings
// of the file, the [n] citations as links to their sources, the list of sources at the end); the generators draw it with the report options
// (generators/pdf-file.js and docx-file.js, `context.report`). It is made when the person asks for the file, never before.

import { researchText } from '../../runtime/research/research-texts.js';

const AUTHOR = {
  'zh-TW': 'Noureon 深度研究',
  en: 'Noureon Deep Research',
  fr: 'Noureon Recherche approfondie',
  ru: 'Noureon Глубокое исследование',
  es: 'Noureon Investigación profunda'
};

// The page of the PDF follows the sample the design was taken from: A4, 9 pt text on 13.5 pt lines, margins of 78 pt, titles of 18 and
// 13.5 pt, grey links. The Word file has 12 pt text and Word's own heading styles.
const DESIGN = Object.freeze({
  pdf: { accent: '#6B7280', fonts: 'modern', headingWeight: 700, headingCase: 'normal', headingColor: 'text', headings: 'plain', titleAlign: 'left', cover: 'none', bodySize: 9, lineSpacing: 1.25, paragraphSpacing: 6, paragraphs: 'spaced', typeScale: 1.19, tables: 'lines', margins: 'normal', pageNumber: 'footer' },
  docx: { accent: '#6B7280', fonts: 'modern', headingWeight: 700, headingCase: 'normal', headingColor: 'text', headings: 'plain', titleAlign: 'left', cover: 'none', bodySize: 12, lineSpacing: 1.3, paragraphSpacing: 8, paragraphs: 'spaced', typeScale: 1.2, tables: 'lines', margins: 'normal', pageNumber: 'footer' }
});
export const REPORT_PAGE_MARGIN_PT = 78;
export const REPORT_SITE = 'https://noureon.com';
const FENCE = /^\s*(`{3,}|~{3,})/;

/** Applies `change` to the lines of Markdown that are not in a code block, and to the parts of those that are not code spans. */
function outsideCode(markdown, change) {
  let fence = null;
  return String(markdown).split('\n').map((line) => {
    const opens = FENCE.exec(line);
    if (opens) {
      if (!fence) fence = opens[1][0];
      else if (opens[1][0] === fence) fence = null;
      return line;
    }
    if (fence) return line;
    return line.split(/(`[^`\n]*`)/).map((piece, index) => (index % 2 ? piece : change(piece))).join('');
  }).join('\n');
}

/** The report's title (its first "# " heading) and the rest of the text. */
export function splitTitle(markdown, fallback = '') {
  const lines = String(markdown || '').replace(/\r\n?/g, '\n').split('\n');
  const index = lines.findIndex((line) => /^#\s+\S/.test(line));
  if (index < 0) return { title: fallback, body: lines.join('\n') };
  const title = lines[index].replace(/^#\s+/, '').replace(/\s+#*\s*$/, '').trim() || fallback;
  lines.splice(index, 1);
  return { title, body: lines.join('\n') };
}

/** Headings one level up (## becomes #): the sections are the headings of the file, the title is the file's own. */
export const raiseHeadings = (markdown) => outsideCode(markdown, (text) => text.replace(/^(#{2,6})(\s)/, (match, hashes, space) => `${hashes.slice(1)}${space}`));

/** [n] as a link to the n-th source ([[n]](address), which the generators read as a citation); numbers nobody gave are left as they are. */
export function linkCitations(markdown, sources = []) {
  const byNumber = new Map(sources.filter((source) => source?.url && /^https?:\/\//i.test(source.url)).map((source) => [Number(source.n), source.url]));
  return outsideCode(markdown, (text) => text.replace(/\[(\d{1,4})\](?![(:])/g, (match, number) => {
    const url = byNumber.get(Number(number));
    return url ? `[[${number}]](<${url.replace(/>/g, '%3E')}>)` : match;
  }));
}

/** The list of sources that ends a report: a number, the title and the address of each. */
export function sourcesSection(sources = [], language = 'en') {
  const listed = sources.filter((source) => source?.url && Number(source.n) > 0);
  if (!listed.length) return '';
  const items = listed.map((source) => `**[${source.n}]** ${String(source.title || source.site || source.url).replace(/\s+/g, ' ').trim()}  \n<${source.url}>`);
  return `\n\n# ${researchText(language, 'references')}\n\n${items.join('\n\n')}\n`;
}

const dateOf = (report) => {
  const time = Number(report?.finishedAt);
  return Number.isFinite(time) && time > 0 ? new Date(time).toISOString().slice(0, 10) : '';
};

/**
 * The document the generators are given for `target` ('pdf' or 'docx'): front matter (title, author, date, design) and the Markdown.
 */
export function reportDocumentSource(report, { language = 'en', target = 'pdf' } = {}) {
  const { title, body } = splitTitle(report?.text, report?.title || '');
  const design = DESIGN[target] || DESIGN.pdf;
  const front = [
    '---',
    `title: ${String(title || report?.title || '').replace(/\s+/g, ' ').trim()}`,
    `author: ${AUTHOR[language] || AUTHOR.en}`,
    ...(dateOf(report) ? [`date: ${dateOf(report)}`] : []),
    ...Object.entries(design).map(([key, value]) => `${key}: ${value}`),
    '---',
    ''
  ].join('\n');
  const text = `${linkCitations(raiseHeadings(body), report?.sources).trim()}${sourcesSection(report?.sources, language)}`;
  return `${front}\n${text}\n`;
}

const MIME = Object.freeze({
  pdf: 'application/pdf',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
});

/** What the generator is given for the file: its name, the source and the kind. */
export function reportDescriptor(report, { language, target, name }) {
  return { name, content: reportDocumentSource(report, { language, target }), mime: MIME[target], generator: target };
}

/** The report options of the generators (their `context.report`). */
export function reportGeneratorOptions(target, { logo = null } = {}) {
  return target === 'pdf'
    ? { margin: REPORT_PAGE_MARGIN_PT, outlineDepth: 6, brand: { name: 'Noureon', url: REPORT_SITE, logo } }
    : { outlineDepth: 6, brand: null };
}
