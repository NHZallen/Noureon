// The design parameters shared by templates, the model and the user. A
// design is always a complete set of these 25 values (the second accent may
// be null); presets are named
// sets, and anything the model writes is normalised into this shape.
//
// Normalisation is forgiving on purpose: models write synonyms ("bold",
// "centre", "grotesk"), wrong types ("500", "1.3x") and unknown keys. Each is
// mapped to the nearest valid value or dropped, and every correction is
// reported as an issue so the quality report can mention it.

import { parseHexColor } from './color.js';
import { DEFAULT_PRESET_ID, DESIGN_PRESET_IDS, DESIGN_PRESETS } from './design-presets.js';
import { FONT_SET_IDS } from './fonts.js';

const enumParam = (key, values, aliases = {}) => ({ key, type: 'enum', values: Object.freeze(values), aliases: Object.freeze(aliases) });

export const DESIGN_PARAMS = Object.freeze([
  enumParam('mode', ['light', 'dark'], { day: 'light', white: 'light', night: 'dark', black: 'dark' }),
  { key: 'accent', type: 'color' },
  { key: 'accent2', type: 'color', optional: true },
  enumParam('background', ['neutral', 'warm', 'cool', 'tinted', 'accent'], { plain: 'neutral', white: 'neutral', black: 'neutral', paper: 'warm', cream: 'warm', beige: 'warm', gray: 'cool', grey: 'cool', slate: 'cool', tint: 'tinted', soft: 'tinted', color: 'accent', colour: 'accent', solid: 'accent', brand: 'accent', full: 'accent' }),
  enumParam('colorUse', ['restrained', 'balanced', 'vivid'], { minimal: 'restrained', subtle: 'restrained', low: 'restrained', calm: 'restrained', medium: 'balanced', moderate: 'balanced', normal: 'balanced', bold: 'vivid', strong: 'vivid', high: 'vivid', loud: 'vivid' }),
  enumParam('fonts', FONT_SET_IDS, { sans: 'modern', default: 'modern', inter: 'modern', grotesk: 'tight', grotesque: 'tight', swiss: 'tight', helvetica: 'tight', geometric: 'geometric', rounded: 'rounded', round: 'rounded', condensed: 'condensed', poster: 'condensed', impact: 'condensed', serif: 'editorial', magazine: 'editorial', playfair: 'editorial', modernserif: 'modernSerif', elegant: 'modernSerif', consulting: 'consulting', report: 'consulting', academic: 'consulting', classic: 'classical', classical: 'classical', garamond: 'classical', kai: 'kai', handwriting: 'kai', script: 'kai', warm: 'kai', mono: 'plex', monospace: 'plex', tech: 'plex', technical: 'plex', plex: 'plex', office: 'office', system: 'office', safe: 'office', compatible: 'office', calibri: 'office', aptos: 'office' }),
  { key: 'headingWeight', type: 'weight', values: Object.freeze([300, 400, 500, 700, 800, 900]), aliases: Object.freeze({ thin: 300, light: 300, regular: 400, normal: 400, book: 400, medium: 500, semibold: 700, bold: 700, extrabold: 800, heavy: 900, black: 900 }) },
  enumParam('headingCase', ['normal', 'upper'], { none: 'normal', sentence: 'normal', title: 'normal', uppercase: 'upper', caps: 'upper', allcaps: 'upper' }),
  enumParam('tracking', ['tight', 'normal', 'wide'], { condensed: 'tight', negative: 'tight', default: 'normal', loose: 'wide', spaced: 'wide', open: 'wide' }),
  { key: 'typeScale', type: 'number', min: 1.15, max: 1.6, fallback: 1.3, aliases: Object.freeze({ subtle: 1.2, minor: 1.2, standard: 1.25, major: 1.333, dramatic: 1.5, bold: 1.5 }) },
  enumParam('titleSize', ['regular', 'large', 'huge'], { small: 'regular', normal: 'regular', medium: 'regular', big: 'large', xl: 'huge', xxl: 'huge', giant: 'huge', display: 'huge', massive: 'huge' }),
  enumParam('density', ['compact', 'balanced', 'airy'], { dense: 'compact', tight: 'compact', normal: 'balanced', medium: 'balanced', comfortable: 'balanced', loose: 'airy', spacious: 'airy', relaxed: 'airy' }),
  enumParam('align', ['left', 'center'], { start: 'left', centre: 'center', middle: 'center', centered: 'center', centred: 'center' }),
  enumParam('cover', ['type', 'split', 'bleed', 'band', 'frame'], { text: 'type', typographic: 'type', typography: 'type', minimal: 'type', half: 'split', side: 'split', image: 'bleed', photo: 'bleed', fullbleed: 'bleed', full: 'bleed', stripe: 'band', block: 'band', border: 'frame', framed: 'frame' }),
  enumParam('section', ['number', 'field', 'split', 'rule'], { numeral: 'number', bignumber: 'number', color: 'field', colour: 'field', fill: 'field', solid: 'field', half: 'split', line: 'rule', minimal: 'rule', simple: 'rule' }),
  enumParam('imageShape', ['bleed', 'inset', 'rounded', 'arch', 'circle'], { full: 'bleed', edge: 'bleed', square: 'inset', framed: 'inset', rect: 'inset', round: 'rounded', soft: 'rounded', arched: 'arch', oval: 'circle', round2: 'circle' }),
  { key: 'motifs', type: 'set', max: 2, values: Object.freeze(['rules', 'meta', 'grid', 'shapes', 'glow', 'frame', 'blob']), aliases: Object.freeze({ lines: 'rules', line: 'rules', hairlines: 'rules', divider: 'rules', corners: 'meta', cornermeta: 'meta', labels: 'meta', tracker: 'meta', dots: 'grid', dotgrid: 'grid', geometric: 'shapes', geometry: 'shapes', circles: 'shapes', blocks: 'shapes', gradient: 'glow', gradients: 'glow', aura: 'glow', orbs: 'glow', border: 'frame', inset: 'frame', organic: 'blob', blobs: 'blob', none: null }) },
  enumParam('labels', ['text', 'pill', 'tag', 'bracket'], { plain: 'text', chip: 'pill', capsule: 'pill', badge: 'tag', block: 'tag', filled: 'tag', brackets: 'bracket', code: 'bracket', mono: 'bracket' }),
  enumParam('numbers', ['plain', 'padded', 'outline', 'circle'], { simple: 'plain', zero: 'padded', leading: 'padded', leadingzero: 'padded', outlined: 'outline', stroke: 'outline', hollow: 'outline', circled: 'circle', badge: 'circle' }),
  enumParam('bullets', ['dot', 'square', 'dash', 'arrow', 'number'], { disc: 'dot', circle: 'dot', round: 'dot', block: 'square', line: 'dash', emdash: 'dash', chevron: 'arrow', numbered: 'number', numeric: 'number' }),
  enumParam('cards', ['flat', 'outline', 'line', 'shadow', 'glass'], { fill: 'flat', filled: 'flat', solid: 'flat', tonal: 'flat', border: 'outline', bordered: 'outline', stroke: 'outline', rule: 'line', top: 'line', elevated: 'shadow', raised: 'shadow', frosted: 'glass', translucent: 'glass', blur: 'glass' }),
  { key: 'radius', type: 'number', min: 0, max: 28, step: 1, fallback: 8, aliases: Object.freeze({ none: 0, square: 0, sharp: 0, small: 4, soft: 6, medium: 12, round: 16, rounded: 16, large: 24, pill: 28 }) },
  enumParam('icons', ['none', 'line', 'badge'], { off: 'none', no: 'none', outline: 'line', stroke: 'line', filled: 'badge', circle: 'badge', solid: 'badge' }),
  enumParam('chart', ['accent', 'duo', 'categorical'], { mono: 'accent', monochrome: 'accent', tonal: 'accent', shades: 'accent', highlight: 'duo', gray: 'duo', grey: 'duo', focus: 'duo', multi: 'categorical', colorful: 'categorical', colourful: 'categorical', palette: 'categorical', rainbow: 'categorical' }),
  enumParam('imagery', ['none', 'some', 'rich'], { no: 'none', off: 'none', few: 'some', low: 'some', medium: 'some', many: 'rich', high: 'rich', lots: 'rich', heavy: 'rich' })
]);

export const DESIGN_PARAM_KEYS = Object.freeze(DESIGN_PARAMS.map((param) => param.key));
const PARAMS_BY_KEY = new Map(DESIGN_PARAMS.map((param) => [param.key, param]));

// Keys the model may use instead of ours, compared without case or separators.
const KEY_ALIASES = Object.freeze({
  primary: 'accent', primarycolor: 'accent', color: 'accent', colour: 'accent', brandcolor: 'accent', accentcolor: 'accent', maincolor: 'accent',
  secondary: 'accent2', secondarycolor: 'accent2', secondaccent: 'accent2', accentsecondary: 'accent2',
  bg: 'background', backgroundtone: 'background', backgroundstyle: 'background', surface: 'background',
  colorusage: 'colorUse', colouruse: 'colorUse', boldness: 'colorUse', colorintensity: 'colorUse', saturation: 'colorUse',
  font: 'fonts', fontset: 'fonts', fontpair: 'fonts', fontpairing: 'fonts', typeface: 'fonts', typography: 'fonts',
  weight: 'headingWeight', titleweight: 'headingWeight', headlineweight: 'headingWeight',
  case: 'headingCase', textcase: 'headingCase', titlecase: 'headingCase', letterspacing: 'tracking', headingtracking: 'tracking',
  scale: 'typeScale', ratio: 'typeScale', typeratio: 'typeScale', fontscale: 'typeScale',
  headlinesize: 'titleSize', headingsize: 'titleSize',
  spacing: 'density', whitespace: 'density', alignment: 'align', titlealign: 'align',
  coverlayout: 'cover', coverstyle: 'cover', sectionlayout: 'section', sectionstyle: 'section',
  imagestyle: 'imageShape', imagemask: 'imageShape', photoshape: 'imageShape',
  motif: 'motifs', decoration: 'motifs', decorations: 'motifs', ornaments: 'motifs',
  labelstyle: 'labels', kickerstyle: 'labels', tagstyle: 'labels',
  numberstyle: 'numbers', numbering: 'numbers', bulletstyle: 'bullets', markers: 'bullets',
  cardstyle: 'cards', card: 'cards', corners: 'radius', cornerradius: 'radius', borderradius: 'radius', rounding: 'radius',
  iconstyle: 'icons', icon: 'icons', chartstyle: 'chart', chartcolors: 'chart', chartcolours: 'chart', charts: 'chart',
  images: 'imagery', imageamount: 'imagery', photos: 'imagery', pictures: 'imagery'
});

const PRESET_KEYS = new Set(['preset', 'template', 'theme', 'style']);
const compact = (value) => String(value ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');

function canonicalKey(key) {
  if (PARAMS_BY_KEY.has(key)) return key;
  const folded = compact(key);
  const direct = DESIGN_PARAM_KEYS.find((candidate) => candidate.toLowerCase() === folded);
  return direct || KEY_ALIASES[folded] || null;
}

function resolvePresetId(value) {
  const folded = compact(value);
  if (!folded) return null;
  return DESIGN_PRESET_IDS.find((id) => id.toLowerCase() === folded) || null;
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
    const alias = param.aliases[folded];
    return alias ? { value: alias, corrected: true } : { invalid: true };
  }
  if (param.type === 'weight') {
    const alias = param.aliases[compact(value)];
    const number = alias ?? Number.parseFloat(value);
    if (!Number.isFinite(number)) return { invalid: true };
    const snapped = param.values.reduce((best, weight) => (Math.abs(weight - number) < Math.abs(best - number) ? weight : best), param.values[0]);
    return { value: snapped, corrected: snapped !== Number(value) };
  }
  if (param.type === 'number') {
    const alias = param.aliases[compact(value)];
    const number = alias ?? Number.parseFloat(value);
    if (!Number.isFinite(number)) return { invalid: true };
    const clamped = Math.min(param.max, Math.max(param.min, number));
    const rounded = param.step ? Math.round(clamped / param.step) * param.step : Math.round(clamped * 1000) / 1000;
    return { value: rounded, corrected: rounded !== Number(value) };
  }
  if (param.type === 'set') {
    const items = Array.isArray(value) ? value : String(value ?? '').split(/[,\s/|+]+/);
    const result = [];
    let corrected = !Array.isArray(value);
    for (const item of items) {
      const folded = compact(item);
      if (!folded) continue;
      const match = param.values.find((candidate) => candidate === folded) ?? param.aliases[folded];
      if (match === null) continue;
      if (!match) { corrected = true; continue; }
      if (match !== folded) corrected = true;
      if (!result.includes(match)) result.push(match);
    }
    if (result.length > param.max) corrected = true;
    return { value: result.slice(0, param.max), corrected };
  }
  return { invalid: true };
}

/**
 * Normalises any design object into a complete, valid design.
 *
 *   normalizeDesign({ preset: 'consulting', accent: 'navy?' })
 *     → { design: { …all 24 keys… }, preset: 'consulting', issues: [...] }
 *
 * Values come from, in order: the object's own keys, its `preset`, then
 * `base` (another design or preset id; defaults to the default preset).
 */
export function normalizeDesign(input, { base = DEFAULT_PRESET_ID } = {}) {
  const issues = [];
  const source = input && typeof input === 'object' && !Array.isArray(input) ? input : {};
  if (input != null && source !== input) issues.push({ code: 'design-not-object' });

  let presetId = null;
  for (const [key, value] of Object.entries(source)) {
    if (!PRESET_KEYS.has(compact(key))) continue;
    presetId = resolvePresetId(value);
    if (!presetId) issues.push({ code: 'unknown-preset', key, value });
    break;
  }
  const baseDesign = typeof base === 'string' ? DESIGN_PRESETS[base]?.params : base;
  const start = { ...(DESIGN_PRESETS[DEFAULT_PRESET_ID].params), ...(baseDesign || {}), ...(presetId ? DESIGN_PRESETS[presetId].params : {}) };
  const design = { ...start, motifs: [...(start.motifs || [])] };

  for (const [rawKey, value] of Object.entries(source)) {
    if (PRESET_KEYS.has(compact(rawKey)) || compact(rawKey) === 'label' || compact(rawKey) === 'reasons') continue;
    const key = canonicalKey(rawKey);
    if (!key) {
      issues.push({ code: 'unknown-parameter', key: rawKey });
      continue;
    }
    const result = normalizeValue(PARAMS_BY_KEY.get(key), value);
    if (result.invalid) {
      issues.push({ code: 'invalid-value', key, value });
      continue;
    }
    if (result.corrected) issues.push({ code: 'corrected-value', key, value, to: result.value });
    design[key] = result.value;
  }
  const label = typeof source.label === 'string' ? source.label.trim().slice(0, 80) : '';
  return { design: Object.freeze(design), preset: presetId, label, issues };
}

/** The keys whose values differ, for "AI changed N parameters" and undo. */
export function designDiff(before, after) {
  return DESIGN_PARAM_KEYS.filter((key) => JSON.stringify(before?.[key] ?? null) !== JSON.stringify(after?.[key] ?? null));
}

/**
 * A compact description of every parameter for model prompts (authoring
 * guidance and AI tuning). Keys and values are English identifiers so the
 * same text works whatever the UI language is.
 */
export function describeDesignParameters() {
  return DESIGN_PARAMS.map((param) => {
    if (param.type === 'color') return `- ${param.key}: "#RRGGBB"${param.optional ? ' or null (derived from accent)' : ''}`;
    if (param.type === 'number') return `- ${param.key}: number ${param.min}-${param.max}`;
    if (param.type === 'weight') return `- ${param.key}: ${param.values.join(' | ')}`;
    if (param.type === 'set') return `- ${param.key}: array of up to ${param.max} of ${param.values.join(' | ')}`;
    return `- ${param.key}: ${param.values.join(' | ')}`;
  }).join('\n');
}
