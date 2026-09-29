import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import JSZip from 'jszip';

import { createEstimatingMeasurer } from '../../src/app/ui/files/design/text-layout.js';
import { renderPresentationSlides } from '../../src/app/ui/files/previews/slide-preview.js';
import { layoutFreePresentation } from '../../src/app/ui/sandbox/free-slide-layout.js';
import { readChartSpace } from '../../src/app/ui/sandbox/pptx-chart-reader.js';
import { readPresentation } from '../../src/app/ui/sandbox/pptx-reader.js';
import { createDom } from '../behaviours/helpers/create-dom.js';

// A deck python-pptx wrote (default template, 4:3): title and content
// placeholders, a free slide with runs, shapes, a connector, a table, a
// picture and a group, and a slide with a column chart and a pie chart.
const deck = new Blob([readFileSync(new URL('./fixtures/free-deck.pptx', import.meta.url))]);

const read = async () => {
  const { window, cleanup } = createDom('');
  try {
    return await readPresentation(deck, { JSZip, DOMParser: window.DOMParser });
  } finally {
    cleanup();
  }
};

test('a python-pptx deck is read slide by slide, sized by the file', async () => {
  const model = await read();
  assert.equal(model.width, 960);
  assert.equal(model.height, 720, '4:3 slides keep their shape');
  assert.equal(model.slides.length, 4);
  assert.deepEqual(model.slides.map((slide) => slide.background), Array(4).fill({ color: '#FFFFFF' }));
});

test('placeholders take their position, size and style from the layout and master', async () => {
  const { slides } = await read();
  const [title, subtitle] = slides[0].elements;
  assert.equal(title.type, 'text');
  assert.equal(title.paragraphs[0].runs[0].text, '第一季營收報告');
  assert.ok(Math.abs(title.paragraphs[0].runs[0].size - 58.67) < 0.1, '44 pt on a 10 inch slide is 58.7 px');
  assert.equal(title.paragraphs[0].align, 'center');
  assert.equal(title.paragraphs[0].runs[0].latin, 'Calibri', 'theme fonts resolve to names');
  assert.ok(title.w > 700 && title.y > 150, 'the box comes from the layout, not from the slide');
  assert.equal(subtitle.paragraphs[0].runs[0].color, '#404040', 'tint of the text colour from the master');

  const bullets = slides[1].elements[1].paragraphs;
  assert.deepEqual(bullets.map((paragraph) => paragraph.bullet?.char), ['•', '–', '•']);
  assert.ok(bullets[1].marL > bullets[0].marL, 'second level is indented');
  assert.ok(bullets[0].indent < 0, 'bullets hang');
});

test('shapes, lines, tables, pictures and groups come with their fills and geometry', async () => {
  const { slides } = await read();
  const free = slides[2].elements;
  const runs = free[0].paragraphs[0].runs;
  assert.deepEqual(runs.map((run) => [run.text, run.bold, run.italic, run.color]), [['自由排版 ', true, false, '#111827'], ['italic', false, true, '#C0392B']]);
  const card = free.find((element) => element.shape === 'rounded');
  assert.equal(card.fill.color, '#1F2937');
  assert.ok(card.radius > 0);
  const cardText = free.find((element) => element.type === 'text' && element.paragraphs[0].runs[0]?.text === '圓角卡片');
  assert.equal(cardText.anchor, 'middle');
  assert.equal(cardText.paragraphs[0].runs[0].color, '#FFFFFF', 'shape text is white through the shape style');
  assert.equal(free.find((element) => element.shape === 'ellipse').type, 'shape');
  assert.equal(free.find((element) => element.shape === 'custom').segments.length, 8, 'the arrow is a polygon');
  const line = free.find((element) => element.type === 'line');
  assert.ok(line.x2 > line.x1 && line.y1 === line.y2);
  const table = free.find((element) => element.type === 'table');
  assert.equal(table.rows.length, 3);
  assert.equal(table.rows[0].cells[0].fill.color, '#4F81BD', 'header row uses the accent');
  assert.equal(table.rows[0].cells[0].paragraphs[0].runs[0].bold, true);
  assert.equal(table.rows[1].cells[1].paragraphs[0].runs[0].text, '1,200');
  assert.match(free.find((element) => element.type === 'image').data, /^data:image\/png;base64,/);
  const grouped = free.find((element) => element.shape === 'rect' && element.y > 500);
  assert.ok(grouped && grouped.w > 90, 'the rectangle inside the group is drawn');
});

test('charts are read from the values PowerPoint stored', async () => {
  const { slides } = await read();
  const [column, pie] = slides[3].elements.filter((element) => element.type === 'chart').map((element) => element.native);
  assert.equal(column.type, 'bar');
  assert.deepEqual(column.data.map((series) => [series.name, series.values]), [['2025', [900, 700, 800]], ['2026', [1200, 800, 1000]]]);
  assert.deepEqual(column.data[0].labels, ['北部', '中部', '南部']);
  assert.equal(column.options.showLegend, true);
  assert.equal(column.options.legendPos, 'b');
  assert.equal(pie.type, 'doughnut');
  assert.equal(pie.options.holeSize, 0, 'a pie is a doughnut without a hole');
  assert.deepEqual(pie.data[0].values, [50, 30, 20]);
});

test('an unsupported chart is skipped, not fatal', () => {
  const { window, cleanup } = createDom('');
  try {
    const root = new window.DOMParser().parseFromString('<c:chartSpace xmlns:c="urn:c"><c:chart><c:plotArea><c:surfaceChart/></c:plotArea></c:chart></c:chartSpace>', 'application/xml').documentElement;
    assert.equal(readChartSpace(root, { paint: () => null, scheme: () => '#000000' }), null);
  } finally {
    cleanup();
  }
});

test('a deck is laid out and drawn with the slide preview', async () => {
  const model = await read();
  const presentation = layoutFreePresentation(model, { measure: createEstimatingMeasurer() });
  assert.ok(presentation.fonts.has('Noto Sans TC'), 'Chinese text falls back on a shipped font');
  assert.ok(presentation.fonts.has('Inter'), 'Calibri is drawn with the closest shipped family');
  const { window, cleanup } = createDom('');
  try {
    const container = window.document.createElement('div');
    const { pageCount } = renderPresentationSlides(container, presentation, { document: window.document });
    assert.equal(pageCount, 4);
    const svgs = container.querySelectorAll('svg');
    assert.equal(svgs[0].getAttribute('viewBox'), '0 0 960 720');
    assert.match(svgs[0].getAttribute('style'), /aspect-ratio:960 \/ 720/);
    assert.match(svgs[0].textContent, /第一季營收報告/);
    const bulletText = [...svgs[1].querySelectorAll('text')].map((node) => node.textContent);
    assert.ok(bulletText.includes('•') && bulletText.includes('–'), 'bullets are drawn');
    assert.ok(svgs[2].querySelector('image'), 'the picture is drawn');
    assert.match(svgs[2].textContent, /區域[\s\S]*營收[\s\S]*占比/, 'the table text is drawn');
    assert.ok(svgs[3].querySelectorAll('rect').length > 6, 'the bars are drawn');
    assert.ok(svgs[3].querySelectorAll('path').length >= 3, 'the pie slices are drawn');
    const italic = [...svgs[2].querySelectorAll('tspan')].find((node) => node.textContent === 'italic');
    assert.equal(italic.getAttribute('font-style'), 'italic');
  } finally {
    cleanup();
  }
});

test('a file that is not a presentation is refused', async () => {
  const { window, cleanup } = createDom('');
  try {
    const zip = new JSZip();
    zip.file('hello.txt', 'hi');
    const blob = new Blob([await zip.generateAsync({ type: 'uint8array' })]);
    await assert.rejects(readPresentation(blob, { JSZip, DOMParser: window.DOMParser }), /not a PowerPoint file/);
  } finally {
    cleanup();
  }
});
