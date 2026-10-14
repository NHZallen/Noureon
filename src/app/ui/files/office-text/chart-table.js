// A chart of a Word or PowerPoint file as the numbers behind it, in a table (the model reads data better than a picture of it): the title, then one column
// for each series and one row for each category. Pies, bars, lines, areas and scatter charts are read the same way.

import { descendants, find, findAll, kids, markdownTable, parseXml } from './xml-tools.js';

const textIn = (node) => descendants(node, 't').map((item) => item.textContent).join('');
const points = (cache) => {
  const out = [];
  for (const point of descendants(cache, 'pt')) out[Number(point.getAttribute('idx'))] = point.textContent;
  return out;
};
/** The values a reference holds (`strRef`, `numRef`, a literal list): the first level of a category with several. */
const valuesOf = (node) => {
  if (!node) return [];
  const cache = descendants(node, 'strCache')[0] || descendants(node, 'numCache')[0] || descendants(node, 'multiLvlStrCache')[0]?.firstElementChild
    || descendants(node, 'strLit')[0] || descendants(node, 'numLit')[0];
  return cache ? points(cache) : [];
};

/** { title, type, table } for the chart in `xml`, or null when it holds no series. */
export function readChartTable(DOMParser, xml) {
  const root = parseXml(DOMParser, xml);
  const plot = descendants(root, 'plotArea')[0];
  if (!plot) return null;
  const title = textIn(find(root, 'chart') ? find(find(root, 'chart'), 'title') : null);
  const series = [];
  let type = '';
  for (const group of kids(plot).filter((item) => /Chart$/.test(item.localName || ''))) {
    type ||= group.localName.replace(/Chart$/, '');
    for (const item of findAll(group, 'ser')) {
      const name = textIn(find(item, 'tx')) || valuesOf(find(item, 'tx'))[0] || `Series ${series.length + 1}`;
      const categories = valuesOf(find(item, 'cat') || find(item, 'xVal'));
      const values = valuesOf(find(item, 'val') || find(item, 'yVal'));
      if (values.length) series.push({ name, categories, values });
    }
  }
  if (!series.length) return null;
  const longest = Math.max(...series.map((item) => item.values.length));
  const labels = series.find((item) => item.categories.length)?.categories || [];
  const rows = [['', ...series.map((item) => item.name)]];
  for (let index = 0; index < longest; index += 1) rows.push([labels[index] ?? String(index + 1), ...series.map((item) => item.values[index] ?? '')]);
  return { title, type, table: markdownTable(rows) };
}

/** The chart as the lines to put in the text of the file. */
export const chartBlock = (number, chart) => `[Chart ${number}${chart.type ? `, ${chart.type}` : ''}${chart.title ? `: ${chart.title}` : ''}]\n${chart.table}`;
