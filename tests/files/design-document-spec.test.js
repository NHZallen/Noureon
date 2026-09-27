import assert from 'node:assert/strict';
import test from 'node:test';

import { normalizeDocumentSpec, parseDocumentSpec, SLIDE_LAYOUTS, SPEC_LIMITS } from '../../src/app/ui/files/design/document-spec.js';
import { parseMarkdownDeck } from '../../src/app/ui/files/design/markdown-deck.js';
import { checkDeckStructure, checkElements, checkPaletteContrast, summarizeIssues } from '../../src/app/ui/files/design/quality-checks.js';
import { parseRelaxedJson, RelaxedJsonError } from '../../src/app/ui/files/design/relaxed-json.js';
import { buildPalette } from '../../src/app/ui/files/design/palette.js';
import { normalizeIconName } from '../../src/app/ui/files/design/icons.js';
import { DESIGN_PRESET_IDS, DESIGN_PRESETS } from '../../src/app/ui/files/design/design-presets.js';

const codes = (issues) => issues.map((issue) => issue.code);

test('relaxed JSON accepts the mistakes models make', () => {
  const source = `{
    // the deck
    title: 'Q3 報告',
    \u201Cdesign\u201D: { accent: #1F4E9A, preset: consulting, },
    slides: [
      { "layout": "cover", "title": "第一行
第二行" }, /* trailing comma next */
    ],
    ok: True, missing: None, __proto__: { polluted: true }
  }`;
  const { value, repairs } = parseRelaxedJson(source);
  assert.equal(value.title, 'Q3 報告');
  assert.equal(value.design.accent, '#1F4E9A');
  assert.equal(value.design.preset, 'consulting');
  assert.equal(value.slides[0].title, '第一行\n第二行');
  assert.equal(value.ok, true);
  assert.equal(value.missing, null);
  assert.equal(Object.getPrototypeOf(value), Object.prototype);
  assert.equal({}.polluted, undefined);
  for (const repair of ['comments', 'single-quotes', 'smart-quotes', 'unquoted-keys', 'unquoted-value', 'trailing-commas', 'raw-newline', 'literals']) {
    assert.ok(repairs.includes(repair), repair);
  }
});

test('relaxed JSON closes a reply cut off by the token limit', () => {
  const { value, repairs } = parseRelaxedJson('{"slides": [{"layout": "cover", "title": "亞太市場帶動第三季成長"}, {"layout": "bullets", "bullets": ["一", "二');
  assert.equal(value.slides.length, 2);
  assert.deepEqual(value.slides[1].bullets, ['一', '二']);
  assert.ok(repairs.includes('truncated'));
  assert.throws(() => parseRelaxedJson('{"a": @}'), RelaxedJsonError);
});

test('layouts are resolved from aliases or inferred from the fields', () => {
  const { slides, issues } = normalizeDocumentSpec({
    slides: [
      { layout: 'Title Slide', title: '封面' },
      { title: '重點數字', stats: [{ value: '2,630', label: '營收' }, { value: '91%', label: '續約率' }] },
      { layout: 'image-left', title: '圖文', body: '說明', image: 'upload:1' },
      { layout: 'KPI', title: '單一數字', stats: [{ value: '21%', label: '成長' }] },
      { title: '時程', steps: [{ date: '5 月', title: '調查' }, { date: '6 月', title: '試點' }] },
      { title: '方案', columns: [{ heading: 'A', items: ['x'] }, { heading: 'B', items: ['y'], recommended: true }] },
      { layout: 'mystery', title: '一般內容', points: ['第一點', '第二點'] },
      { layout: 'thank-you', title: '謝謝', next: ['下一步'] }
    ]
  });
  assert.deepEqual(slides.map((slide) => slide.layout), ['cover', 'stats', 'split', 'bigNumber', 'timeline', 'comparison', 'bullets', 'closing']);
  assert.equal(slides[2].imageSide, 'left');
  assert.equal(slides[3].value, '21%');
  assert.equal(slides[5].columns[1].highlight, true);
  assert.deepEqual(codes(issues).filter((code) => code !== 'layout-changed'), ['unknown-layout']);
  assert.ok(SLIDE_LAYOUTS.every((layout) => typeof layout === 'string') && SLIDE_LAYOUTS.length === 17);
});

test('slides without the content their layout needs fall back to bullets', () => {
  const { slides, issues } = normalizeDocumentSpec({
    slides: [
      { layout: 'cover', title: '封面' },
      { layout: 'chart', title: '壞圖表', chart: { type: 'pie?' }, takeaway: '重點在此' },
      { layout: 'timeline', title: '只有一步', steps: [{ title: '開始' }] },
      { layout: 'twoColumn', title: '三欄', columns: [{ heading: 'A' }, { heading: 'B' }, { heading: 'C' }] },
      { layout: 'table', title: '沒有資料', table: { columns: ['a'] } }
    ]
  });
  assert.deepEqual(slides.map((slide) => slide.layout), ['cover', 'bullets', 'bullets', 'cards', 'bullets']);
  assert.deepEqual(slides[1].bullets, [{ text: '重點在此', children: [] }]);
  assert.equal(slides[1].body, '', 'the takeaway is not repeated as body text');
  assert.equal(slides[3].cards.length, 3);
  const changed = issues.filter((issue) => issue.code === 'layout-changed').map((issue) => `${issue.from}->${issue.to}`);
  assert.deepEqual(changed, ['chart->bullets', 'timeline->bullets', 'twoColumn->cards', 'table->bullets']);
  assert.ok(codes(issues).includes('invalid-chart'));
});

test('bullets, cards, tables and charts are normalised', () => {
  const { slides, issues } = normalizeDocumentSpec({
    slides: [
      { layout: 'cover', title: '封面' },
      { layout: 'bullets', title: '清單', bullets: ['一', { text: '二', children: ['二之一', '二之二'] }, '', 3], callout: '結論' },
      { layout: 'bullets', title: '字串清單', bullets: '- 甲\n- 乙\n3. 丙' },
      { layout: 'cards', title: '卡片', cards: [{ icon: 'growth', label: '市場', title: 'A', body: 'a' }, { icon: 'unicorn', title: 'B' }] },
      { layout: 'table', title: '表格', table: '| 市場 | 營收 |\n| :--- | ---: |\n| 台灣 | 1,200 |\n| 日本 | 980 |' },
      { layout: 'table', title: '陣列表格', table: [['市場', '成長'], ['台灣', '+12.5%'], ['日本', '-3.2%']] },
      { layout: 'chart', title: '圖表', chart: { type: 'bar', title: '成長率', data: [{ label: '台灣', value: 12.5 }] } }
    ]
  });
  assert.deepEqual(slides[1].bullets, [{ text: '一', children: [] }, { text: '二', children: [{ text: '二之一', children: [] }, { text: '二之二', children: [] }] }, { text: '3', children: [] }]);
  assert.equal(slides[1].callout, '結論');
  assert.deepEqual(slides[2].bullets.map((item) => item.text), ['甲', '乙', '丙']);
  assert.deepEqual(slides[3].cards.map((card) => card.icon), ['trending-up', null]);
  assert.ok(issues.some((issue) => issue.code === 'unknown-icon' && issue.icon === 'unicorn'));
  assert.deepEqual(slides[4].table, { columns: ['市場', '營收'], rows: [['台灣', '1,200'], ['日本', '980']], align: ['left', 'right'], highlightRow: null });
  assert.deepEqual(slides[5].table.align, ['left', 'right'], 'numeric columns align right');
  assert.equal(slides[6].chart.type, 'bar');
  assert.equal(normalizeIconName('Chart Bar'), 'chart-bar');
});

test('images are uploads, plan B assets or placeholders, never web fetches', () => {
  const { slides, issues } = normalizeDocumentSpec({
    slides: [
      { layout: 'cover', title: '封面', image: 'upload:2' },
      { layout: 'image', title: '滿版', image: { src: 'asset:chart 1.png', fit: 'contain', focus: 'top' } },
      { layout: 'image', title: '外部', image: 'https://example.com/a.jpg' },
      { layout: 'image', title: '生成', image: { generate: '晨光中的城市天際線' } },
      { layout: 'gallery', title: '照片牆', images: [{ placeholder: '開幕剪綵', caption: '8 月 12 日' }, '團隊合照'] },
      { layout: 'quote', quote: '報表從兩天縮短到兩小時。', name: '林雅婷', image: { upload: 3 } }
    ]
  });
  assert.equal(slides[5].image.index, 3, '{ upload: 3 } is the third uploaded image');
  assert.deepEqual([slides[5].attribution, slides[5].title], ['林雅婷', ''], 'a speaker name is not a slide title');
  assert.deepEqual(slides[0].image, { kind: 'upload', index: 2, alt: '', fit: 'cover', focus: 'center' });
  assert.deepEqual(slides[1].image, { kind: 'asset', name: 'chart 1.png', alt: '', fit: 'contain', focus: 'top' });
  assert.equal(slides[2].image.kind, 'placeholder');
  assert.deepEqual(slides[3].image, { kind: 'placeholder', text: '晨光中的城市天際線', alt: '晨光中的城市天際線', fit: 'cover', focus: 'center' });
  assert.deepEqual(slides[4].images.map((entry) => [entry.image.text, entry.caption]), [['開幕剪綵', '8 月 12 日'], ['團隊合照', '']]);
  assert.ok(codes(issues).includes('external-image'));
  assert.ok(codes(issues).includes('image-generation-not-supported'));
});

test('hard limits bound slides, images and text', () => {
  const many = Array.from({ length: 70 }, (_, index) => ({ layout: 'image', title: `第 ${index + 1} 頁`, image: 'upload:1' }));
  const { slides, issues } = normalizeDocumentSpec({ slides: many });
  assert.equal(slides.length, SPEC_LIMITS.slides);
  assert.equal(slides.filter((slide) => slide.image).length, SPEC_LIMITS.images);
  assert.ok(codes(issues).includes('too-many-slides'));
  assert.ok(codes(issues).includes('too-many-images'));
  const long = normalizeDocumentSpec({ slides: [{ layout: 'bullets', title: '長', bullets: ['字'.repeat(1500)] }] });
  assert.equal(long.slides[0].bullets[0].text.length, SPEC_LIMITS.text);
  assert.ok(codes(long.issues).includes('text-truncated'));
  const control = normalizeDocumentSpec({ slides: [{ layout: 'cover', title: 'A\u0001B￾C' }] });
  assert.equal(control.slides[0].title, 'ABC', 'characters Office rejects are removed');
});

test('meta, section numbers, language and designs are normalised', () => {
  const spec = normalizeDocumentSpec({
    title: 'Q3 Review', author: 'Noureon', date: '2026-10-05', pageNumbers: false,
    design: { preset: 'swiss', accent: '#ff4d2e' },
    designs: [{ preset: 'neon' }, { preset: 'classic', mode: 'light' }, { preset: 'poster' }, { preset: 'noir' }],
    slides: [
      { layout: 'cover', title: 'Asia-Pacific drove our Q3 growth' },
      { layout: 'section', title: 'Markets' },
      { layout: 'bullets', title: 'Growth', bullets: ['Business customers up 18%'] },
      { layout: 'section', title: 'Next', number: 5 },
      { layout: 'bullets', title: 'Plan', bullets: ['Direct sales in Japan'] },
      { layout: 'section', title: 'Appendix' }
    ]
  }, { uiLanguage: 'fr' });
  assert.equal(spec.meta.slideNumbers, false);
  assert.equal(spec.meta.language, 'fr', 'Latin text follows the UI language');
  assert.equal(spec.preset, 'swiss');
  assert.equal(spec.design.accent, '#FF4D2E');
  assert.deepEqual(spec.designs.map((entry) => entry.preset), ['neon', 'classic', 'poster'], 'at most three alternatives');
  assert.equal(spec.designs[1].design.mode, 'light');
  assert.deepEqual(spec.slides.filter((slide) => slide.layout === 'section').map((slide) => slide.number), [1, 5, 6]);
  assert.equal(normalizeDocumentSpec({ language: 'ru', slides: [{ title: 'x' }] }).meta.language, 'ru');
  assert.equal(normalizeDocumentSpec({ slides: [{ title: '營收報告' }] }).meta.language, 'zh-TW');
  assert.equal(normalizeDocumentSpec({ style: 'poster', slides: [{ title: 'x' }] }).preset, 'poster', 'a top-level style names a preset');
});

test('parseDocumentSpec reads fenced JSON and falls back to Markdown', () => {
  const json = parseDocumentSpec('```json\n{"slides": [{"layout": "cover", "title": "封面",}]}\n```');
  assert.equal(json.ok, true);
  assert.equal(json.format, 'json');
  assert.ok(json.repairs.includes('trailing-commas'));
  const markdown = parseDocumentSpec('# 封面\n副標題\n\n## 第一頁\n- 一\n- 二');
  assert.equal(markdown.ok, true);
  assert.equal(markdown.format, 'markdown');
  assert.deepEqual(markdown.spec.slides.map((slide) => slide.layout), ['cover', 'bullets']);
  assert.equal(parseDocumentSpec('{"slides": [}').reason, 'no-slides');
  assert.equal(parseDocumentSpec('{"a": @}').reason, 'invalid-json');
  assert.equal(parseDocumentSpec('   ').reason, 'empty');
});

test('Markdown decks map headings, lists, tables, charts, quotes, images and notes', () => {
  const raw = parseMarkdownDeck([
    '---', 'title: 季報', 'preset: consulting', 'accent: "#123C69"', 'motifs: [rules, meta]', 'language: zh-TW', '---',
    '# 亞太市場帶動成長', '營收年增 7.3%', '',
    '# 各市場表現', '台灣穩定、新加坡加速', '',
    '## 成長來自企業客戶', '- 企業客戶 **+18%**', '  - 七成新增營收', '- 客單價持平', '', '備註：先講結論。', '',
    '## 各市場營收', '| 市場 | 營收 |', '| --- | ---: |', '| 台灣 | 1,200 |', '',
    '## 年增率', '```chart', '{ "type": "bar", "title": "年增率", "data": [{ "label": "台灣", "value": 12.5 }] }', '```', '只有日本衰退。', '',
    '## 客戶怎麼說', '> 報表從兩天縮短到兩小時。', '> — 林雅婷，財務長', '',
    '## 新加坡', '![據點外觀](upload:1)', '三個月從試點走到獲利。', '',
    '---', '- 沒有標題的內容'
  ].join('\n'));
  assert.equal(raw.title, '季報');
  assert.equal(raw.design.preset, 'consulting');
  assert.deepEqual(raw.design.motifs, ['rules', 'meta']);
  const spec = normalizeDocumentSpec(raw);
  assert.deepEqual(spec.slides.map((slide) => slide.layout), ['cover', 'section', 'bullets', 'table', 'chart', 'quote', 'split', 'bullets']);
  assert.equal(spec.slides[0].subtitle, '營收年增 7.3%');
  assert.deepEqual(spec.slides[2].bullets[0], { text: '企業客戶 **+18%**', children: [{ text: '七成新增營收', children: [] }] });
  assert.equal(spec.slides[2].notes, '先講結論。');
  assert.equal(spec.slides[4].takeaway, '只有日本衰退。');
  assert.deepEqual([spec.slides[5].quote, spec.slides[5].attribution, spec.slides[5].role], ['報表從兩天縮短到兩小時。', '林雅婷', '財務長']);
  assert.equal(spec.slides[6].image.kind, 'upload');
  assert.equal(spec.slides[6].body, '三個月從試點走到獲利。');
  assert.deepEqual(spec.design.motifs, ['rules', 'meta']);
});

test('deck checks flag repetition, empty sections and dense slides', () => {
  const spec = normalizeDocumentSpec({
    language: 'en',
    slides: [
      { layout: 'cover', title: 'Deck' },
      { layout: 'section', title: 'One' },
      { layout: 'section', title: 'Two' },
      ...Array.from({ length: 4 }, (_, index) => ({ layout: 'bullets', title: `Point ${index}`, bullets: ['Short'] })),
      { layout: 'quote', quote: 'x'.repeat(400), attribution: 'Someone' },
      { layout: 'stats', title: 'Numbers', stats: [{ value: '1' }] }
    ]
  });
  const issues = checkDeckStructure(spec);
  assert.ok(issues.some((issue) => issue.id === 'layout-repetition' && issue.slide === 6));
  assert.ok(issues.some((issue) => issue.id === 'layout-repetition' && issue.detail.share > 0.5));
  assert.ok(issues.some((issue) => issue.id === 'empty-section' && issue.slide === 2));
  assert.ok(issues.some((issue) => issue.id === 'dense-content' && issue.slide === 8));
  assert.ok(issues.some((issue) => issue.id === 'layout-changed' && issue.severity === 'fixed'), 'single stat became a big number');
});

test('palette checks pass for every preset', () => {
  for (const id of DESIGN_PRESET_IDS) assert.deepEqual(checkPaletteContrast(buildPalette(DESIGN_PRESETS[id].params)), [], id);
});

test('element checks catch overflow, bounds, overlap, orphans and low resolution', () => {
  const issues = checkElements([
    { id: 'title', slide: 1, kind: 'text', role: 'title', x: 60, y: 48, w: 840, h: 90, fit: { overflow: false, shrinkRatio: 0.7, lines: ['成長來自企業客戶，而不是降', '價'] } },
    { id: 'body', slide: 1, kind: 'text', x: 60, y: 120, w: 840, h: 300, fit: { overflow: true, shrinkRatio: 0.6, lines: [] } },
    { id: 'off', slide: 1, kind: 'text', x: 900, y: 500, w: 120, h: 60 },
    { id: 'orb', slide: 1, kind: 'shape', x: -200, y: -200, w: 500, h: 500, decorative: true },
    { id: 'photo', slide: 2, kind: 'image', x: 0, y: 0, w: 480, h: 540, pixels: { width: 400, height: 450 } },
    { id: 'sharp', slide: 2, kind: 'image', x: 480, y: 0, w: 480, h: 540, pixels: { width: 1200, height: 1200 } }
  ]);
  const found = issues.map((issue) => `${issue.id}:${issue.element}`);
  assert.ok(found.includes('text-shrunk:title'));
  assert.ok(found.includes('orphan-title:title'));
  assert.ok(found.includes('text-overflow:body'));
  assert.ok(found.includes('overlap:title'));
  assert.ok(found.includes('out-of-bounds:off'));
  assert.ok(found.includes('low-resolution:photo'));
  assert.ok(!found.some((entry) => entry.endsWith(':orb')), 'decorative shapes may bleed off the slide');
  assert.ok(!found.includes('low-resolution:sharp'));
  assert.deepEqual(summarizeIssues(issues), { error: 3, warning: 2, fixed: 1 });
});
