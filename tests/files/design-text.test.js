import assert from 'node:assert/strict';
import test from 'node:test';

import {
  applyTypography,
  characterBudgetFactor,
  detectDocumentLanguage,
  formatDocumentDate,
  formatPercent,
  generatedText,
  GENERATED_TEXT_KEYS,
  normalizeLanguage,
  quoteMarks
} from '../../src/app/ui/files/design/language.js';
import {
  balanceLines,
  breakLines,
  createCanvasMeasurer,
  createEstimatingMeasurer,
  fitText,
  hasOrphanLine,
  SAFETY_FACTOR
} from '../../src/app/ui/files/design/text-layout.js';

const NNBSP = String.fromCharCode(0x202F);
const measure = createEstimatingMeasurer();
const font = (size) => ({ size });

test('document languages are normalised from tags and names', () => {
  assert.equal(normalizeLanguage('zh-Hant'), 'zh-TW');
  assert.equal(normalizeLanguage('zh_CN'), 'zh-CN');
  assert.equal(normalizeLanguage('fr-CA'), 'fr');
  assert.equal(normalizeLanguage('Русский'), 'ru');
  assert.equal(normalizeLanguage('Spanish'), 'es');
  assert.equal(normalizeLanguage('de'), 'de', 'other languages are kept');
  assert.equal(normalizeLanguage('not a language!'), null);
});

test('the document language is detected from its script', () => {
  assert.equal(detectDocumentLanguage('亞太市場帶動第三季成長，這是我們的報告'), 'zh-TW');
  assert.equal(detectDocumentLanguage('亚太市场带动第三季成长，这是我们的报告'), 'zh-CN');
  assert.equal(detectDocumentLanguage('第三四半期のレビューです'), 'ja');
  assert.equal(detectDocumentLanguage('3분기 실적 보고서입니다'), 'ko');
  assert.equal(detectDocumentLanguage('Рост выручки в третьем квартале'), 'ru');
  assert.equal(detectDocumentLanguage('Resultados del trimestre', 'es'), 'es');
  assert.equal(detectDocumentLanguage('Quarterly results', 'zh-TW'), 'en', 'Latin text with a Chinese UI is English');
});

test('French typography inserts narrow no-break spaces; other languages are untouched', () => {
  assert.equal(applyTypography('Source : Noureon, 7,3 % ; vraiment ? \u00AB Oui \u00BB', 'fr'), `Source${NNBSP}: Noureon, 7,3${NNBSP}% ; vraiment${NNBSP}? \u00AB${NNBSP}Oui${NNBSP}\u00BB`.replace(' ;', `${NNBSP};`));
  assert.equal(applyTypography('Pourquoi?', 'fr'), `Pourquoi${NNBSP}?`);
  assert.equal(applyTypography('Source: Noureon, 7.3%?', 'en'), 'Source: Noureon, 7.3%?');
});

test('quote marks, numbers and dates follow the document language', () => {
  assert.deepEqual(quoteMarks('zh-TW'), ['\u300C', '\u300D']);
  assert.deepEqual(quoteMarks('fr'), ['\u00AB', '\u00BB']);
  assert.deepEqual(quoteMarks('de'), ['\u201C', '\u201D']);
  assert.equal(formatPercent(21, 'en', { signed: true }), '+21%');
  assert.match(formatPercent(21, 'fr', { signed: true }), /^\+21\s%$/u);
  assert.match(formatPercent(-3.2, 'ru'), /^-3,2\s%$/u);
  assert.equal(formatDocumentDate('2026-10-05', 'zh-TW'), '2026年10月5日');
  assert.equal(formatDocumentDate('2026-10-05', 'fr'), '5 octobre 2026');
  assert.equal(formatDocumentDate('2026-10-05', 'es'), '5 de octubre de 2026');
  assert.equal(formatDocumentDate('Q3 2026', 'en'), 'Q3 2026', 'free text dates stay as written');
});

test('generated strings exist for all five languages and fall back to English', () => {
  for (const language of ['zh-TW', 'en', 'fr', 'ru', 'es']) {
    for (const key of GENERATED_TEXT_KEYS) assert.ok(generatedText(language, key), `${language} ${key}`);
  }
  assert.equal(generatedText('zh-TW', 'continued'), '（續）');
  assert.equal(generatedText('de', 'agenda'), 'Agenda');
  assert.equal(generatedText('en', 'pageOf', { page: 3, total: 19 }), '3 / 19');
  assert.ok(characterBudgetFactor('fr') > characterBudgetFactor('en') && characterBudgetFactor('en') > characterBudgetFactor('zh-TW'));
});

test('Chinese wraps between words, never inside one', () => {
  const lines = breakLines('亞太市場帶動第三季成長', { maxWidth: 5.5 * 40, font: font(40), measure, language: 'zh-TW' });
  assert.ok(lines.length > 1);
  for (let index = 1; index < lines.length; index += 1) {
    const joint = lines[index - 1].slice(-1) + lines[index][0];
    assert.ok(!['帶動', '市場', '成長', '亞太'].includes(joint), `split inside a word at ${joint}`);
  }
  assert.equal(lines.join(''), '亞太市場帶動第三季成長');
});

test('kinsoku: closing marks never start a line, opening marks never end one', () => {
  const text = '新加坡成長最快，日本需要調整。\u300C直接銷售\u300D從第四季開始，我們會持續追蹤。';
  for (let width = 4; width <= 14; width += 1) {
    const lines = breakLines(text, { maxWidth: width * 20, font: font(20), measure, language: 'zh-TW' });
    for (const line of lines) {
      assert.doesNotMatch(line, /^[\uFF0C\u3002\u3001\uFF09\u300D]/, `width ${width}: ${line}`);
      assert.doesNotMatch(line, /\u300C$/, `width ${width}: ${line}`);
    }
    assert.equal(lines.join(''), text);
  }
});

test('Latin text wraps at spaces, keeps French units together and hard-breaks long words', () => {
  const lines = breakLines('Revenue up 7.3% year over year', { maxWidth: 200, font: font(20), measure, language: 'en' });
  assert.ok(lines.every((line) => !line.startsWith(' ') && !line.endsWith(' ')));
  assert.equal(lines.join(' '), 'Revenue up 7.3% year over year');
  const french = applyTypography('Croissance de 7,3 % cette année', 'fr');
  const frenchLines = breakLines(french, { maxWidth: 88, font: font(20), measure, language: 'fr' });
  assert.ok(frenchLines.some((line) => line.includes(`7,3${NNBSP}%`)), 'the number and its sign stay on one line');
  const url = breakLines('https://noureon.com/a/very/long/path/without/spaces', { maxWidth: 120, font: font(20), measure, language: 'en' });
  assert.ok(url.length > 2 && url.every((line) => measure(line, font(20)) <= 120));
  assert.deepEqual(breakLines('第一行\n\n第三行', { maxWidth: 400, font: font(20), measure }), ['第一行', '', '第三行']);
});

test('fitText shrinks to fit and reports overflow when even the minimum is too big', () => {
  const text = '新增營收大多來自可續約的企業合約，成長品質健康，而且續約率持續提升到九成以上。';
  const fitted = fitText(text, { width: 400, height: 90, font: font(28), minSize: 14, lineHeight: 1.4, measure, language: 'zh-TW' });
  assert.equal(fitted.overflow, false);
  assert.ok(fitted.size < 28 && fitted.lines.length * fitted.size * 1.4 <= 90);
  assert.ok(fitted.lines.every((line) => measure(line, font(fitted.size)) <= 400 * SAFETY_FACTOR));
  const impossible = fitText(text.repeat(6), { width: 200, height: 40, font: font(20), minSize: 14, measure });
  assert.equal(impossible.overflow, true);
  assert.equal(impossible.size, 14);
  const untouched = fitText('短標題', { width: 400, font: font(36), maxLines: 2, measure });
  assert.equal(untouched.shrinkRatio, 1);
});

test('balanced headings avoid a lone last line', () => {
  const text = '成長來自企業客戶，而不是降價';
  const greedy = breakLines(text, { maxWidth: 12 * 30, font: font(30), measure, language: 'zh-TW' });
  const balanced = balanceLines(text, { maxWidth: 12 * 30, font: font(30), measure, language: 'zh-TW' });
  assert.equal(balanced.length, greedy.length);
  assert.ok(hasOrphanLine(greedy, 'zh-TW'), 'greedy wrapping leaves a fragment');
  assert.ok(!hasOrphanLine(balanced, 'zh-TW'), 'balanced wrapping does not');
  assert.equal(hasOrphanLine(['Business customers drove growth,', 'not'], 'en'), true);
  assert.equal(hasOrphanLine(['One line only'], 'en'), false);
});

test('the canvas measurer uses the font and caches results', () => {
  let calls = 0;
  const context = { font: '', measureText(value) { calls += 1; return { width: value.length * 10 }; } };
  const canvas = createCanvasMeasurer(context);
  const style = { size: 20, weight: 700, family: '"Inter", "Noto Sans TC", sans-serif', tracking: 0.1 };
  assert.equal(canvas('abcd', style), 40 + 0.1 * 20 * 4);
  assert.equal(context.font, '700 20px "Inter", "Noto Sans TC", sans-serif');
  canvas('abcd', style);
  assert.equal(calls, 1, 'second call is cached');
  assert.equal(canvas('ab', { ...style, uppercase: true, tracking: 0 }), 20);
});
