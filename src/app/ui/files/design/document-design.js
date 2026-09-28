// Design of Word documents: the parameters a template or the model sets, how
// they are read from the document's front matter, and the concrete theme
// (fonts, colours, sizes, spacing) the Word generator renders with.
//
// Documents share fonts and colour rules with presentations (fonts.js,
// palette.js) but have their own parameters: covers, heading treatments,
// body size and line spacing mean something else on a page than on a slide.
// A document whose front matter names no design keeps the look it had before
// the design system (`legacyDocumentTheme`).

import { parseHexColor } from './color.js';
import { DOCUMENT_PRESET_IDS, DOCUMENT_PRESETS } from './document-presets.js';
import { cjkScriptFor, FONT_SET_IDS, resolveFontRoles } from './fonts.js';
import { detectDocumentLanguage } from './language.js';
import { buildPalette } from './palette.js';

const enumParam = (key, values, aliases = {}) => ({ key, type: 'enum', values: Object.freeze(values), aliases: Object.freeze(aliases) });
const numberParam = (key, min, max, fallback, aliases = {}) => ({ key, type: 'number', min, max, fallback, aliases: Object.freeze(aliases) });

export const DOCUMENT_DESIGN_PARAMS = Object.freeze([
  { key: 'accent', type: 'color' },
  { key: 'accent2', type: 'color', optional: true },
  enumParam('fonts', FONT_SET_IDS, { sans: 'modern', default: 'modern', inter: 'modern', grotesk: 'tight', swiss: 'tight', helvetica: 'tight', serif: 'book', times: 'book', book: 'book', classic: 'garamond', classical: 'garamond', garamond: 'garamond', elegant: 'garamond', magazine: 'editorial', report: 'consulting', mono: 'plex', technical: 'plex', tech: 'plex', system: 'office', safe: 'office', compatible: 'office', calibri: 'office', aptos: 'office', handwriting: 'kai', round: 'rounded' }),
  { key: 'headingWeight', type: 'weight', values: Object.freeze([300, 400, 500, 700, 800, 900]), aliases: Object.freeze({ thin: 300, light: 300, regular: 400, normal: 400, medium: 500, semibold: 700, bold: 700, extrabold: 800, heavy: 900, black: 900 }) },
  enumParam('headingCase', ['normal', 'upper', 'smallcaps'], { none: 'normal', sentence: 'normal', title: 'normal', uppercase: 'upper', caps: 'upper', allcaps: 'upper', small: 'smallcaps', smallcapitals: 'smallcaps' }),
  enumParam('tracking', ['tight', 'normal', 'wide'], { condensed: 'tight', default: 'normal', loose: 'wide', spaced: 'wide', open: 'wide' }),
  enumParam('headingColor', ['accent', 'text'], { color: 'accent', colour: 'accent', brand: 'accent', black: 'text', dark: 'text', ink: 'text', plain: 'text' }),
  enumParam('headings', ['plain', 'rule', 'bar', 'shaded', 'centered'], { none: 'plain', simple: 'plain', line: 'rule', lines: 'rule', underline: 'rule', border: 'rule', sidebar: 'bar', leftbar: 'bar', stripe: 'bar', band: 'shaded', fill: 'shaded', filled: 'shaded', block: 'shaded', center: 'centered', centred: 'centered', apa: 'centered', academic: 'centered' }),
  enumParam('titleAlign', ['left', 'center'], { start: 'left', centre: 'center', middle: 'center', centered: 'center', centred: 'center' }),
  enumParam('cover', ['none', 'block', 'page', 'band', 'shapes', 'title'], { no: 'none', off: 'none', header: 'block', titleblock: 'block', side: 'block', sideline: 'block', full: 'page', fullpage: 'page', coverpage: 'page', typographic: 'page', stripe: 'band', color: 'band', colour: 'band', block2: 'band', geometric: 'shapes', shape: 'shapes', mosaic: 'shapes', apa: 'title', titlepage: 'title', academic: 'title' }),
  numberParam('bodySize', 9, 14, 11, { small: 10, normal: 11, medium: 11, large: 12 }),
  numberParam('lineSpacing', 1, 2.5, 1.3, { single: 1, tight: 1.15, normal: 1.3, relaxed: 1.5, double: 2 }),
  numberParam('paragraphSpacing', 0, 18, 8, { none: 0, small: 4, normal: 8, large: 12 }),
  enumParam('paragraphs', ['spaced', 'indented'], { space: 'spaced', blank: 'spaced', block: 'spaced', indent: 'indented', firstline: 'indented', firstlineindent: 'indented', book: 'indented' }),
  numberParam('typeScale', 1, 1.6, 1.25, { flat: 1, same: 1, subtle: 1.15, minor: 1.2, standard: 1.25, major: 1.333, dramatic: 1.5 }),
  enumParam('tables', ['grid', 'lines', 'shaded'], { borders: 'grid', bordered: 'grid', box: 'grid', rules: 'lines', minimal: 'lines', booktabs: 'lines', apa: 'lines', striped: 'shaded', zebra: 'shaded', filled: 'shaded', fill: 'shaded' }),
  enumParam('margins', ['narrow', 'normal', 'wide'], { small: 'narrow', tight: 'narrow', default: 'normal', medium: 'normal', large: 'wide', generous: 'wide' }),
  enumParam('pageNumber', ['footer', 'header'], { bottom: 'footer', top: 'header', topright: 'header', headerright: 'header' })
]);

export const DOCUMENT_DESIGN_KEYS = Object.freeze(DOCUMENT_DESIGN_PARAMS.map((param) => param.key));
const PARAMS_BY_KEY = new Map(DOCUMENT_DESIGN_PARAMS.map((param) => [param.key, param]));
const compact = (value) => String(value ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');

const KEY_ALIASES = Object.freeze({
  primary: 'accent', primarycolor: 'accent', color: 'accent', colour: 'accent', accentcolor: 'accent', maincolor: 'accent', brandcolor: 'accent',
  secondary: 'accent2', secondarycolor: 'accent2', secondaccent: 'accent2',
  font: 'fonts', fontset: 'fonts', fontpair: 'fonts', typeface: 'fonts', typography: 'fonts',
  weight: 'headingWeight', titleweight: 'headingWeight', case: 'headingCase', titlecase: 'headingCase', letterspacing: 'tracking',
  headingcolour: 'headingColor', titlecolor: 'headingColor', headingstyle: 'headings', heading: 'headings',
  alignment: 'titleAlign', align: 'titleAlign', coverstyle: 'cover', coverpage: 'cover', titlepage: 'cover',
  fontsize: 'bodySize', textsize: 'bodySize', size: 'bodySize', linespacing: 'lineSpacing', leading: 'lineSpacing', lineheight: 'lineSpacing',
  spacing: 'paragraphSpacing', spaceafter: 'paragraphSpacing', paragraphstyle: 'paragraphs', indent: 'paragraphs',
  scale: 'typeScale', ratio: 'typeScale', tablestyle: 'tables', table: 'tables', margin: 'margins', pagemargins: 'margins',
  pagenumbers: null, pagenumberposition: 'pageNumber', pagenumberplace: 'pageNumber'
});
const PRESET_KEYS = new Set(['template', 'preset', 'style', 'theme', 'design']);

function canonicalKey(key) {
  const folded = compact(key);
  const direct = DOCUMENT_DESIGN_KEYS.find((candidate) => candidate.toLowerCase() === folded);
  if (direct) return direct;
  return Object.hasOwn(KEY_ALIASES, folded) ? KEY_ALIASES[folded] : undefined;
}

function normalizeValue(param, value) {
  if (param.type === 'color') {
    if (value == null || /^(?:none|auto|null|)$/i.test(String(value).trim())) return param.optional ? { value: null } : { invalid: true };
    const hex = parseHexColor(value);
    return hex ? { value: hex } : { invalid: true };
  }
  if (param.type === 'enum') {
    const folded = compact(value);
    const match = param.values.find((candidate) => candidate.toLowerCase() === folded);
    if (match) return { value: match };
    return param.aliases[folded] ? { value: param.aliases[folded] } : { invalid: true };
  }
  const alias = param.aliases[compact(value)];
  const number = alias ?? Number.parseFloat(value);
  if (!Number.isFinite(number)) return { invalid: true };
  if (param.type === 'weight') {
    return { value: param.values.reduce((best, weight) => (Math.abs(weight - number) < Math.abs(best - number) ? weight : best), param.values[0]) };
  }
  return { value: Math.round(Math.min(param.max, Math.max(param.min, number)) * 100) / 100 };
}

export const resolveDocumentPresetId = (value) => {
  const folded = compact(value);
  return DOCUMENT_PRESET_IDS.find((id) => id === folded) || null;
};

/**
 * Normalises design keys (from front matter or the model) into a complete
 * document design. Returns null when `source` names no design at all, so
 * older documents keep their look.
 *
 *   normalizeDocumentDesign({ template: 'lines', accent: '#123456' })
 *     → { design: {…all keys…}, preset: 'lines', issues: [] }
 */
export function normalizeDocumentDesign(source) {
  if (!source || typeof source !== 'object') return null;
  const issues = [];
  let preset = null;
  const values = {};
  for (const [rawKey, value] of Object.entries(source)) {
    if (PRESET_KEYS.has(compact(rawKey))) {
      preset = resolveDocumentPresetId(value) || preset;
      if (!resolveDocumentPresetId(value)) issues.push({ code: 'unknown-template', key: rawKey, value });
      continue;
    }
    const key = canonicalKey(rawKey);
    if (!key) continue;
    const result = normalizeValue(PARAMS_BY_KEY.get(key), value);
    if (result.invalid) issues.push({ code: 'invalid-value', key, value });
    else values[key] = result.value;
  }
  if (!preset && Object.keys(values).length === 0) return null;
  const design = { ...DOCUMENT_PRESETS[preset || 'standard'].params, ...values };
  return { design: Object.freeze(design), preset, issues };
}

/** Compact description of every parameter, for model prompts. */
export function describeDocumentDesignParameters() {
  return DOCUMENT_DESIGN_PARAMS.map((param) => {
    if (param.type === 'color') return `- ${param.key}: "#RRGGBB"${param.optional ? ' or none' : ''}`;
    if (param.type === 'number') return `- ${param.key}: number ${param.min}-${param.max}`;
    if (param.type === 'weight') return `- ${param.key}: ${param.values.join(' | ')}`;
    return `- ${param.key}: ${param.values.join(' | ')}`;
  }).join('\n');
}

// ---------------------------------------------------------------- theme

const hex = (color) => String(color || '').replace('#', '').toUpperCase();
const MARGINS = Object.freeze({ narrow: 1080, normal: 1440, wide: 1800 });
// Heading sizes relative to the body: size × typeScale^exponent.
const LEVEL_EXPONENTS = Object.freeze({ title: 4, h1: 2.3, h2: 1.3, h3: 0.7, h4: 0.3, h5: 0, h6: 0 });
const TRACKING = Object.freeze({ tight: -0.01, normal: 0, wide: 0.08 });
const EAST_ASIAN_TEXT = /[⺀-鿿가-힯豈-﫿＀-￯]/;

// Word's single line differs a lot between families, and East Asian faces
// get extra leading: 1.2 em for Inter but 1.9 em for Noto Sans TC (measured
// in Word for Microsoft 365, 2026-09, 12 pt text with the embedded subsets).
// `lineSpacing` means multiples of a 1.2 em line whatever the font, so the
// multiple Word gets is corrected by the body font's single line. Installed
// fonts count as 1.2, which keeps the Office template's 1.15 what Word uses.
const WORD_SINGLE_LINE = Object.freeze({
  Inter: 1.2, 'Inter Tight': 1.2, Manrope: 1.35, Oswald: 1.5, 'Playfair Display': 1.35, 'Instrument Serif': 1.3,
  'Source Serif 4': 1.35, 'Source Sans 3': 1.4, 'Cormorant Garamond': 1.2, Lora: 1.3, Nunito: 1.35,
  'IBM Plex Sans': 1.3, 'IBM Plex Mono': 1.3, 'Noto Sans TC': 1.9, 'Noto Serif TC': 1.85,
  'Cactus Classical Serif': 1.6, 'LXGW WenKai TC': 1.7, Huninn: 1.45
});
const singleLine = (family) => WORD_SINGLE_LINE[family] ?? 1.2;

/** East Asian font and language Word needs for CJK text in this content. */
export function resolveScriptSettings(text) {
  if (/[぀-ヿ]/.test(text)) return { eastAsiaFont: 'Yu Gothic', eastAsiaLanguage: 'ja-JP', language: 'ja' };
  if (/[가-힯]/.test(text)) return { eastAsiaFont: 'Malgun Gothic', eastAsiaLanguage: 'ko-KR', language: 'ko' };
  return { eastAsiaFont: 'Microsoft JhengHei', eastAsiaLanguage: 'zh-TW', language: 'zh-TW' };
}

/** The look every document had before the design system; kept for them. */
export function legacyDocumentTheme(content = '') {
  const scripts = resolveScriptSettings(content);
  const font = { latin: 'Calibri', eastAsian: scripts.eastAsiaFont, bold: true };
  const plain = { latin: 'Calibri', eastAsian: scripts.eastAsiaFont, bold: false };
  return Object.freeze({
    legacy: true,
    embedded: false,
    eastAsiaLanguage: scripts.eastAsiaLanguage,
    fonts: { heading: font, title: font, body: plain, bodyBold: font, code: { latin: 'Consolas', eastAsian: scripts.eastAsiaFont, bold: false } },
    colors: {
      text: '1F2937', title: '111827', heading: '17365D', subheading: '2B579A', minor: '1F2937', muted: '6B7280', border: 'D1D5DB',
      headerFill: 'EEF2F7', headerText: null, stripeFill: 'F8FAFC', codeFill: 'F6F8FA', codeBorder: 'E5E7EB', inlineCodeFill: 'EEF1F4',
      quote: '4B5563', quoteBar: 'B6C2D1', link: '1D4ED8', accent: '2B579A', accent2: '2B579A', fill: '2B579A', onFill: 'FFFFFF', onFillMuted: 'FFFFFF', soft: 'EEF2F7', rule: 'D1D5DB'
    },
    sizes: { body: 22, title: 44, subtitle: 28, byline: 20, h1: 32, h2: 28, h3: 24, h4: 22, h5: 22, h6: 20, small: 18, code: 19, caption: 19, toc: 28, coverTitle: 44 },
    spacing: { line: 300, after: 140, headingBefore: [360, 300, 240, 240, 240, 240], headingAfter: 120, firstLine: 0 },
    headingCase: 'normal',
    headingTracking: 0,
    headings: 'plain',
    titleAlign: 'left',
    cover: 'none',
    tables: 'grid',
    margin: 1440,
    pageNumber: 'footer'
  });
}

/**
 * The theme a designed document renders with: resolved fonts for the document
 * language, colours from the shared palette, sizes in half points and
 * spacing in twips (Word's units).
 */
export function buildDocumentTheme(design, { content = '', language = 'zh-TW' } = {}) {
  const scripts = resolveScriptSettings(content);
  const documentLanguage = detectDocumentLanguage(content, language);
  const roles = resolveFontRoles(design.fonts, { language: documentLanguage, headingWeight: design.headingWeight });
  const palette = buildPalette({ mode: 'light', background: 'neutral', colorUse: 'balanced', chart: 'categorical', accent: design.accent, accent2: design.accent2 });
  const body = design.bodySize;
  const size = (level) => Math.round(body * design.typeScale ** LEVEL_EXPONENTS[level] * 2);
  const headingColor = design.headingColor === 'accent' ? hex(palette.accentText) : hex(palette.text);
  // In a CJK document the East Asian face sets the height of most lines.
  const natural = Math.max(singleLine(roles.body.latin), EAST_ASIAN_TEXT.test(content) ? singleLine(roles.body.eastAsian) : 0);
  const line = Math.round((design.lineSpacing * 1.2 / natural) * 240);
  const sizes = {
    body: Math.round(body * 2),
    title: size('title'),
    subtitle: Math.round(Math.max(body * 1.25, size('h2') * 0.85)),
    byline: Math.round((body - 1) * 2),
    h1: size('h1'),
    h2: size('h2'),
    h3: size('h3'),
    h4: size('h4'),
    h5: size('h5'),
    h6: Math.round(body * 2),
    small: Math.max(16, Math.round((body - 2) * 2)),
    code: Math.max(16, Math.round((body - 1.5) * 2)),
    caption: Math.max(16, Math.round((body - 1.5) * 2)),
    toc: size('h2'),
    // Cover titles are set larger than the running title, except on an
    // academic title page, which keeps the body size by convention.
    coverTitle: design.cover === 'title' ? size('title') : Math.round(Math.max(size('title') * 1.35, body * 5.2))
  };
  return Object.freeze({
    legacy: false,
    embedded: roles.embedded,
    roles,
    script: cjkScriptFor(documentLanguage),
    eastAsiaLanguage: scripts.eastAsiaLanguage,
    design,
    colors: {
      text: hex(palette.text), title: hex(palette.text), heading: headingColor, subheading: headingColor,
      minor: hex(palette.text), muted: hex(palette.muted), border: hex(palette.line),
      headerFill: hex(design.tables === 'grid' ? palette.surface : palette.soft), headerText: null,
      stripeFill: hex(palette.surface), codeFill: hex(palette.surface), codeBorder: hex(palette.line), inlineCodeFill: hex(palette.surface2),
      quote: hex(palette.muted), quoteBar: hex(palette.accent), link: hex(palette.accentText),
      accent: hex(palette.accent), accent2: hex(palette.accent2), fill: hex(palette.fill), onFill: hex(palette.onFill), onFillMuted: hex(palette.onFillMuted),
      soft: hex(palette.soft), accent2Soft: hex(palette.accent2Soft), rule: hex(design.headingColor === 'accent' ? palette.accent : palette.text)
    },
    series: palette.series,
    sizes,
    spacing: {
      line,
      after: Math.round(design.paragraphSpacing * 20),
      // Space above a heading grows with its size; academic documents keep
      // the double-spaced rhythm instead.
      headingBefore: ['h1', 'h2', 'h3', 'h4', 'h5', 'h6'].map((level, index) => (design.paragraphs === 'indented'
        ? (index === 0 ? 240 : 120)
        : Math.round(sizes[level] * 10 * (index < 2 ? 1.1 : 0.8)))),
      headingAfter: design.paragraphs === 'indented' ? 0 : Math.round(sizes.h3 * 4),
      firstLine: design.paragraphs === 'indented' ? 720 : 0
    },
    headingCase: design.headingCase,
    headingTracking: TRACKING[design.tracking] ?? 0,
    headings: design.headings,
    titleAlign: design.titleAlign,
    cover: design.cover,
    tables: design.tables,
    margin: MARGINS[design.margins] || MARGINS.normal,
    pageNumber: design.pageNumber
  });
}
