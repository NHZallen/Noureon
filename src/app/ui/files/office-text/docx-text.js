// The text of a Word file (.docx) for a model that cannot read the file itself: the headings, the paragraphs, the lists and the tables in the order of the
// file, with `[Image N]` where a picture is and the numbers of a chart as a table. Nothing of the file is executed.

import { chartBlock, readChartTable } from './chart-table.js';
import { attribute, descendants, find, findAll, kids, markdownTable, parseXml, readPicture, readRelationships, relationshipId } from './xml-tools.js';

const headingLevel = (paragraph) => {
  const style = attribute(find(find(paragraph, 'pPr'), 'pStyle'), 'val');
  if (/^title$/i.test(style)) return 1;
  const match = /^heading\s*([1-9])$/i.exec(style);
  return match ? Number(match[1]) : 0;
};

/** { blocks, images, imageTotal, charts } of the document. `images` are the pictures in order (each once). */
export async function readDocxText(zip, { DOMParser }) {
  const file = zip.file('word/document.xml');
  if (!file) throw new Error('not a Word file');
  const body = find(parseXml(DOMParser, await file.async('string')), 'body');
  const rels = await readRelationships(zip, 'word/document.xml', DOMParser);
  const pictureNumber = new Map();
  const images = [];
  let imageTotal = 0;
  let charts = 0;
  const pending = [];

  // A picture the first time gets the next number; the same picture again keeps its number.
  const registerPicture = (id) => {
    const target = rels.get(id)?.path;
    if (!target) return '';
    if (!pictureNumber.has(target)) {
      imageTotal += 1;
      pictureNumber.set(target, imageTotal);
      pending.push({ number: imageTotal, path: target });
    }
    return `[Image ${pictureNumber.get(target)}]`;
  };
  const chartMarks = [];
  const drawing = (node) => {
    const parts = [];
    for (const blip of descendants(node, 'blip')) parts.push(registerPicture(attribute(blip, 'embed')));
    for (const chart of descendants(node, 'chart')) {
      const path = rels.get(relationshipId(chart))?.path;
      if (path) {
        charts += 1;
        parts.push(`[Chart ${charts}]`);
        chartMarks.push({ number: charts, path });
      }
    }
    for (const data of descendants(node, 'imagedata')) parts.push(registerPicture(relationshipId(data)));
    return parts.join(' ');
  };
  const runs = (node) => {
    let text = '';
    for (const item of kids(node)) {
      const name = item.localName;
      if (name === 'r') {
        for (const part of kids(item)) {
          if (part.localName === 't') text += part.textContent;
          else if (part.localName === 'tab') text += '\t';
          else if (part.localName === 'br' || part.localName === 'cr') text += '\n';
          else if (part.localName === 'drawing' || part.localName === 'pict') text += ` ${drawing(part)} `;
        }
      } else if (['hyperlink', 'ins', 'smartTag', 'fldSimple', 'sdt', 'sdtContent'].includes(name)) text += runs(item);
    }
    return text;
  };
  const paragraphText = (paragraph) => runs(paragraph).replace(/[ \t]+\n/g, '\n').trim();

  const blocks = [];
  const table = (node) => {
    const rows = findAll(node, 'tr').map((row) => findAll(row, 'tc').map((cell) => findAll(cell, 'p').map(paragraphText).filter(Boolean).join(' ')));
    const text = markdownTable(rows.filter((row) => row.some(Boolean)));
    if (text) blocks.push({ text });
  };
  const walk = (parent) => {
    for (const item of kids(parent)) {
      if (item.localName === 'p') {
        const text = paragraphText(item);
        if (!text) continue;
        const level = headingLevel(item);
        const list = find(find(item, 'pPr'), 'numPr') || (/^list/i.test(attribute(find(find(item, 'pPr'), 'pStyle'), 'val')) ? find(item, 'pPr') : null);
        if (level) blocks.push({ text: `${'#'.repeat(Math.min(level, 6))} ${text}` });
        else if (list) blocks.push({ text: `${'  '.repeat(Number(attribute(find(list, 'ilvl'), 'val')) || 0)}- ${text}`, list: true });
        else blocks.push({ text });
      } else if (item.localName === 'tbl') table(item);
      else if (item.localName === 'sdt') walk(find(item, 'sdtContent'));
    }
  };
  walk(body);

  for (const picture of pending) {
    const read = await readPicture(zip, picture.path);
    if (read) images.push({ number: picture.number, ...read, label: '' });
  }
  const chartTexts = new Map();
  for (const mark of chartMarks) {
    const chartFile = zip.file(mark.path);
    const chart = chartFile ? readChartTable(DOMParser, await chartFile.async('string')) : null;
    if (chart) chartTexts.set(mark.number, chartBlock(mark.number, chart));
  }
  return { blocks, images, imageTotal, charts, chartTexts };
}

/** The blocks as the text of the file: a blank line between blocks, none between the lines of one list. */
export function joinBlocks(blocks) {
  let text = '';
  blocks.forEach((block, index) => {
    if (index) text += block.list && blocks[index - 1].list ? '\n' : '\n\n';
    text += block.text;
  });
  return text;
}
