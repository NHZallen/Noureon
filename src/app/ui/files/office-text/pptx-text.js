// The text of a PowerPoint file (.pptx) for a model that cannot read the file itself: for each slide its title, its text, its tables, `[Image N: slide M]`
// where a picture is, the numbers of its charts as tables and the speaker's notes, in the order of the file. Nothing of the file is executed.

import { chartBlock, readChartTable } from './chart-table.js';
import { attribute, descendants, find, findAll, kids, markdownTable, parseXml, readPicture, readRelationships, relationshipId } from './xml-tools.js';

const MAX_SLIDES = 300;
const SKIPPED_PLACEHOLDERS = new Set(['sldNum', 'ftr', 'dt', 'hdr']);

const placeholderType = (shape) => {
  const holder = descendants(shape, 'ph')[0];
  return holder ? attribute(holder, 'type') || 'body' : '';
};
const paragraphs = (shape) => descendants(find(shape, 'txBody'), 'p').map((paragraph) => {
  let text = '';
  for (const item of kids(paragraph)) {
    if (item.localName === 'br') text += '\n';
    else if (['r', 'fld'].includes(item.localName)) text += descendants(item, 't').map((part) => part.textContent).join('');
  }
  return { text: text.trim(), level: Number(attribute(find(paragraph, 'pPr'), 'lvl')) || 0 };
}).filter((paragraph) => paragraph.text);

/** { text, images, imageTotal, charts, slides } of the presentation. */
export async function readPptxText(zip, { DOMParser }) {
  const presentation = zip.file('ppt/presentation.xml');
  if (!presentation) throw new Error('not a PowerPoint file');
  const rels = await readRelationships(zip, 'ppt/presentation.xml', DOMParser);
  const slideIds = descendants(parseXml(DOMParser, await presentation.async('string')), 'sldId').map(relationshipId).filter(Boolean);
  const slidePaths = slideIds.map((id) => rels.get(id)?.path).filter(Boolean).slice(0, MAX_SLIDES);

  const pictureNumber = new Map();
  const images = [];
  let imageTotal = 0;
  let chartTotal = 0;
  const sections = [];

  for (const [slideIndex, path] of slidePaths.entries()) {
    const slideNumber = slideIndex + 1;
    const file = zip.file(path);
    if (!file) continue;
    const root = parseXml(DOMParser, await file.async('string'));
    const slideRels = await readRelationships(zip, path, DOMParser);
    let title = '';
    const lines = [];
    const charts = [];
    const register = (id) => {
      const target = slideRels.get(id)?.path;
      if (!target) return;
      if (!pictureNumber.has(target)) {
        imageTotal += 1;
        pictureNumber.set(target, imageTotal);
        images.push({ number: imageTotal, path: target, label: `slide ${slideNumber}` });
      }
      lines.push(`[Image ${pictureNumber.get(target)}: slide ${slideNumber}]`);
    };
    const walk = (parent) => {
      for (const shape of kids(parent)) {
        const name = shape.localName;
        if (name === 'sp') {
          const type = placeholderType(shape);
          if (SKIPPED_PLACEHOLDERS.has(type)) continue;
          const texts = paragraphs(shape);
          if (type === 'title' || type === 'ctrTitle') title ||= texts.map((item) => item.text).join(' ');
          else texts.forEach((item) => lines.push(type ? `${'  '.repeat(item.level)}- ${item.text}` : item.text));
        } else if (name === 'graphicFrame') {
          const table = descendants(shape, 'tbl')[0];
          if (table) {
            const rows = findAll(table, 'tr').map((row) => findAll(row, 'tc').map((cell) => descendants(cell, 'p').map((paragraph) => descendants(paragraph, 't').map((part) => part.textContent).join('')).filter(Boolean).join(' ')));
            const text = markdownTable(rows.filter((row) => row.some(Boolean)));
            if (text) lines.push(text);
          }
          const chart = descendants(shape, 'chart')[0];
          const chartPath = chart ? slideRels.get(relationshipId(chart))?.path : '';
          if (chartPath) {
            chartTotal += 1;
            charts.push({ number: chartTotal, path: chartPath });
            lines.push(`[Chart ${chartTotal}]`);
          }
        } else if (name === 'pic') {
          for (const blip of descendants(shape, 'blip')) register(attribute(blip, 'embed'));
        } else if (name === 'grpSp') walk(shape);
      }
    };
    walk(find(find(root, 'cSld'), 'spTree'));

    const chartTexts = [];
    for (const chart of charts) {
      const chartFile = zip.file(chart.path);
      const read = chartFile ? readChartTable(DOMParser, await chartFile.async('string')) : null;
      if (read) chartTexts.push(chartBlock(chart.number, read));
    }
    let notes = '';
    const notesPath = [...slideRels.values()].find((relation) => relation.type === 'notesSlide')?.path;
    const notesFile = notesPath ? zip.file(notesPath) : null;
    if (notesFile) {
      const notesRoot = parseXml(DOMParser, await notesFile.async('string'));
      notes = descendants(notesRoot, 'sp').filter((shape) => placeholderType(shape) === 'body').flatMap(paragraphs).map((item) => item.text).join(' ');
    }
    const all = [`## Slide ${slideNumber}${title ? `: ${title}` : ''}`, ...lines, ...chartTexts, ...(notes ? [`Notes: ${notes}`] : [])];
    // The lines of one list stay together; everything else has a blank line between.
    sections.push(all.reduce((text, line, index) => (index === 0 ? line : `${text}${/^\s*- /.test(line) && /^\s*- /.test(all[index - 1]) ? '\n' : '\n\n'}${line}`), ''));
  }

  const ready = [];
  for (const picture of images) {
    const read = await readPicture(zip, picture.path);
    if (read) ready.push({ number: picture.number, label: picture.label, ...read });
  }
  return { text: sections.join('\n\n'), images: ready, imageTotal, charts: chartTotal, slides: slidePaths.length };
}
