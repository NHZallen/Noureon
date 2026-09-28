// Font sets for generated documents. Every set names, for each role, a
// Latin face, a Cyrillic face when the Latin one lacks Cyrillic, and an East
// Asian face per CJK script. PPTX and DOCX runs carry separate Latin and East
// Asian typefaces, so Office switches between them per character just like a
// CSS font stack does in the preview.
//
// Latin faces and the Traditional Chinese faces are open-source (SIL OFL)
// files in src/assets/fonts (built by scripts/build-fonts.mjs) and are
// embedded as subsets, so the file opens looking like its preview. Simplified
// Chinese, Japanese and Korean use the fonts Windows and Office install: their
// open-source faces would add about 100 MB and none of them is a UI language.
// The `office` set only uses installed fonts and is never embedded.

const LATIN_AND_CYRILLIC = Object.freeze(['latin', 'cyrillic']);
const variable = (file) => Object.freeze([Object.freeze({ file, variable: true })]);
const statics = (entries) => Object.freeze(entries.map(([file, weight]) => Object.freeze({ file, weight })));
const system = (scripts, generic, extra = {}) => ({ scripts: Object.freeze(scripts), weights: [400, 700], generic, system: true, ...extra });

export const FONT_FAMILIES = Object.freeze({
  Inter: { scripts: LATIN_AND_CYRILLIC, weights: [300, 400, 500, 700, 900], generic: 'sans-serif', files: variable('inter.ttf') },
  'Inter Tight': { scripts: LATIN_AND_CYRILLIC, weights: [300, 400, 500, 700, 900], generic: 'sans-serif', files: variable('inter-tight.ttf') },
  Manrope: { scripts: LATIN_AND_CYRILLIC, weights: [300, 400, 500, 700, 800], generic: 'sans-serif', files: variable('manrope.ttf') },
  Oswald: { scripts: LATIN_AND_CYRILLIC, weights: [300, 400, 500, 700], generic: 'sans-serif', condensed: 0.74, files: variable('oswald.ttf') },
  'Playfair Display': { scripts: LATIN_AND_CYRILLIC, weights: [400, 500, 700, 900], generic: 'serif', files: variable('playfair-display.ttf') },
  'Instrument Serif': { scripts: Object.freeze(['latin']), weights: [400], generic: 'serif', files: statics([['instrument-serif.ttf', 400]]) },
  'Source Serif 4': { scripts: LATIN_AND_CYRILLIC, weights: [300, 400, 500, 700, 900], generic: 'serif', files: variable('source-serif-4.ttf') },
  'Source Sans 3': { scripts: LATIN_AND_CYRILLIC, weights: [300, 400, 500, 700, 900], generic: 'sans-serif', files: variable('source-sans-3.ttf') },
  'Cormorant Garamond': { scripts: LATIN_AND_CYRILLIC, weights: [300, 400, 500, 700], generic: 'serif', files: variable('cormorant-garamond.ttf') },
  Lora: { scripts: LATIN_AND_CYRILLIC, weights: [400, 500, 700], generic: 'serif', files: variable('lora.ttf') },
  Nunito: { scripts: LATIN_AND_CYRILLIC, weights: [300, 400, 700, 900], generic: 'sans-serif', files: variable('nunito.ttf') },
  'IBM Plex Sans': { scripts: LATIN_AND_CYRILLIC, weights: [300, 400, 500, 700], generic: 'sans-serif', files: variable('ibm-plex-sans.ttf') },
  'IBM Plex Mono': { scripts: LATIN_AND_CYRILLIC, weights: [400, 500, 700], generic: 'monospace', files: statics([['ibm-plex-mono-regular.ttf', 400], ['ibm-plex-mono-medium.ttf', 500], ['ibm-plex-mono-bold.ttf', 700]]) },
  'Noto Sans TC': { scripts: Object.freeze(['zh-Hant']), weights: [300, 400, 500, 700, 900], generic: 'sans-serif', files: variable('noto-sans-tc.ttf') },
  'Noto Serif TC': { scripts: Object.freeze(['zh-Hant']), weights: [300, 400, 500, 700, 900], generic: 'serif', files: variable('noto-serif-tc.ttf') },
  'Cactus Classical Serif': { scripts: Object.freeze(['zh-Hant']), weights: [400], generic: 'serif', files: statics([['cactus-classical-serif.ttf', 400]]) },
  'LXGW WenKai TC': { scripts: Object.freeze(['zh-Hant']), weights: [400, 700], generic: 'serif', files: statics([['lxgw-wenkai-tc-regular.ttf', 400], ['lxgw-wenkai-tc-bold.ttf', 700]]) },
  Huninn: { scripts: Object.freeze(['zh-Hant']), weights: [400], generic: 'sans-serif', files: statics([['huninn.ttf', 400]]) },
  // PDF only: a PDF carries every glyph it shows, so the scripts Office
  // draws with installed fonts need files of their own there.
  'Noto Sans SC': { scripts: Object.freeze(['zh-Hans']), weights: [300, 400, 500, 700, 900], generic: 'sans-serif', pdfOnly: true, files: variable('noto-sans-sc.ttf') },
  'Noto Sans JP': { scripts: Object.freeze(['ja']), weights: [300, 400, 500, 700, 900], generic: 'sans-serif', pdfOnly: true, files: variable('noto-sans-jp.ttf') },
  'Noto Sans KR': { scripts: Object.freeze(['ko']), weights: [300, 400, 500, 700, 900], generic: 'sans-serif', pdfOnly: true, files: variable('noto-sans-kr.ttf') },
  'Noto Emoji': { scripts: Object.freeze(['emoji']), weights: [300, 400, 500, 700], generic: 'sans-serif', pdfOnly: true, files: variable('noto-emoji.ttf') },
  // Installed with Windows and Office; never embedded.
  Aptos: system(LATIN_AND_CYRILLIC, 'sans-serif', { fallback: 'Calibri' }),
  'Microsoft JhengHei': system(['zh-Hant'], 'sans-serif'),
  'Microsoft YaHei': system(['zh-Hans'], 'sans-serif'),
  SimSun: system(['zh-Hans'], 'serif'),
  'Yu Gothic': system(['ja'], 'sans-serif'),
  'Yu Mincho': system(['ja'], 'serif'),
  'Malgun Gothic': system(['ko'], 'sans-serif'),
  Batang: system(['ko'], 'serif')
});

// CJK families by style. Only Traditional Chinese has styled open-source
// faces; the other scripts use the installed sans or serif face.
const INSTALLED_SANS = Object.freeze({ 'zh-Hans': 'Microsoft YaHei', ja: 'Yu Gothic', ko: 'Malgun Gothic' });
const INSTALLED_SERIF = Object.freeze({ 'zh-Hans': 'SimSun', ja: 'Yu Mincho', ko: 'Batang' });
const CJK = Object.freeze({
  sans: { 'zh-Hant': 'Noto Sans TC', ...INSTALLED_SANS },
  serif: { 'zh-Hant': 'Noto Serif TC', ...INSTALLED_SERIF },
  classical: { 'zh-Hant': 'Cactus Classical Serif', ...INSTALLED_SERIF },
  kai: { 'zh-Hant': 'LXGW WenKai TC', ...INSTALLED_SERIF },
  rounded: { 'zh-Hant': 'Huninn', ...INSTALLED_SANS },
  office: { 'zh-Hant': 'Microsoft JhengHei', ...INSTALLED_SANS }
});

const role = (latin, cjk, cyrillic) => Object.freeze({ latin, cjk, cyrillic: cyrillic || latin });

export const FONT_SETS = Object.freeze({
  modern: { heading: role('Inter', 'sans'), body: role('Inter', 'sans'), label: role('Inter', 'sans') },
  tight: { heading: role('Inter Tight', 'sans'), body: role('Inter', 'sans'), label: role('IBM Plex Mono', 'sans') },
  geometric: { heading: role('Manrope', 'sans'), body: role('Manrope', 'sans'), label: role('Manrope', 'sans') },
  condensed: { heading: role('Oswald', 'sans'), body: role('Inter', 'sans'), label: role('Inter', 'sans') },
  editorial: { heading: role('Playfair Display', 'serif'), body: role('Inter', 'sans'), label: role('Inter', 'sans') },
  modernSerif: { heading: role('Instrument Serif', 'serif', 'Playfair Display'), body: role('Inter', 'sans'), label: role('Inter', 'sans') },
  consulting: { heading: role('Source Serif 4', 'serif'), body: role('Source Sans 3', 'sans'), label: role('Source Sans 3', 'sans') },
  classical: { heading: role('Cormorant Garamond', 'classical'), body: role('Inter', 'sans'), label: role('Inter', 'sans') },
  kai: { heading: role('Lora', 'kai'), body: role('Lora', 'kai'), label: role('Lora', 'kai') },
  rounded: { heading: role('Nunito', 'rounded'), body: role('Nunito', 'rounded'), label: role('Nunito', 'rounded') },
  plex: { heading: role('IBM Plex Sans', 'sans'), body: role('IBM Plex Sans', 'sans'), label: role('IBM Plex Mono', 'sans') },
  // Serif body text, for documents read on paper (Word templates).
  book: { heading: role('Source Serif 4', 'serif'), body: role('Source Serif 4', 'serif'), label: role('Source Sans 3', 'sans') },
  garamond: { heading: role('Cormorant Garamond', 'classical'), body: role('Source Serif 4', 'serif'), label: role('Source Sans 3', 'sans') },
  office: { heading: role('Aptos', 'office'), body: role('Aptos', 'office'), label: role('Aptos', 'office'), system: true }
});

export const FONT_SET_IDS = Object.freeze(Object.keys(FONT_SETS));
export const MONO_FAMILY = 'IBM Plex Mono';

const CJK_SCRIPTS = new Set(['zh-Hant', 'zh-Hans', 'ja', 'ko']);

/** Maps a BCP 47 language tag to the CJK script its East Asian font must cover. */
export function cjkScriptFor(language = '') {
  const tag = String(language).toLowerCase();
  if (/^zh-(?:hans|cn|sg|my)\b/.test(tag)) return 'zh-Hans';
  if (/^ja\b/.test(tag)) return 'ja';
  if (/^ko\b/.test(tag)) return 'ko';
  // Traditional Chinese is the default: it is Noureon's primary language and
  // the East Asian slot is still used for stray CJK in other languages.
  return 'zh-Hant';
}

export const nearestWeight = (weights, wanted) => weights.reduce(
  (best, weight) => (Math.abs(weight - wanted) < Math.abs(best - wanted) ? weight : best),
  weights[0]
);

function resolveRole(definition, { script, weight, cyrillic }) {
  const eastAsian = CJK[definition.cjk][script] || CJK[definition.cjk]['zh-Hant'];
  const latin = cyrillic ? definition.cyrillic : definition.latin;
  const latinFamily = FONT_FAMILIES[latin];
  const eastAsianFamily = FONT_FAMILIES[eastAsian];
  return {
    latin,
    eastAsian,
    // Latin and CJK faces snap to their own nearest weight; a heading asking
    // for 800 gets Manrope 800 next to Noto Sans TC 900, never a faux bold.
    latinWeight: nearestWeight(latinFamily.weights, weight),
    eastAsianWeight: nearestWeight(eastAsianFamily.weights, weight),
    condensed: latinFamily.condensed || 1,
    generic: latinFamily.generic,
    embedded: !latinFamily.system || !eastAsianFamily.system
  };
}

/**
 * The concrete faces for a design and document language. `cyrillic` switches
 * the Latin slot to a face that has Cyrillic glyphs (Russian documents).
 */
export function resolveFontRoles(fontSetId, { language = 'zh-TW', headingWeight = 700 } = {}) {
  const set = FONT_SETS[fontSetId] || FONT_SETS.modern;
  const script = cjkScriptFor(language);
  const cyrillic = /^(?:ru|uk|be|bg|sr|mk|kk|ky|mn)\b/i.test(language);
  return {
    heading: resolveRole(set.heading, { script, weight: headingWeight, cyrillic }),
    body: resolveRole(set.body, { script, weight: 400, cyrillic }),
    bodyStrong: resolveRole(set.body, { script, weight: 700, cyrillic }),
    label: resolveRole(set.label, { script, weight: 500, cyrillic }),
    embedded: !set.system
  };
}

/**
 * CSS font-family for the preview: Latin, Cyrillic fallback, CJK, generic.
 * `alias` renames families whose files the preview loads itself, so they
 * never replace a font of the same name used by the page.
 */
export function cssFontStack(resolvedRole, set = FONT_SETS.modern, roleName = 'heading', { alias = (family) => family } = {}) {
  const families = [resolvedRole.latin];
  const definition = set[roleName];
  if (definition && definition.cyrillic !== definition.latin) families.push(definition.cyrillic);
  if (FONT_FAMILIES[resolvedRole.latin]?.fallback) families.push(FONT_FAMILIES[resolvedRole.latin].fallback);
  families.push(resolvedRole.eastAsian);
  const named = families.map((family) => (FONT_FAMILIES[family]?.system ? family : alias(family)));
  return `${named.map((family) => `"${family}"`).join(', ')}, ${resolvedRole.generic}`;
}

const WEIGHT_NAMES = Object.freeze({ 100: 'Thin', 200: 'ExtraLight', 300: 'Light', 500: 'Medium', 600: 'SemiBold', 800: 'ExtraBold', 900: 'Black' });

/**
 * How a family at a weight is named inside an Office file. Office fonts have
 * four slots (regular, bold, italic, bold italic) per typeface name, so 400
 * and 700 use the family name and every other weight becomes its own family,
 * the way static font families name them ("Inter Light").
 */
export function officeFace(family, weight) {
  const definition = FONT_FAMILIES[family];
  const snapped = definition ? nearestWeight(definition.weights, weight) : weight;
  if (definition?.system || snapped === 400 || snapped === 700 || !WEIGHT_NAMES[snapped]) {
    return { family, typeface: family, slot: snapped >= 600 ? 'bold' : 'regular', weight: snapped };
  }
  return { family, typeface: `${family} ${WEIGHT_NAMES[snapped]}`, slot: 'regular', weight: snapped };
}

/**
 * The font file and variation settings that produce a family at a weight, or
 * null for installed fonts. Variable fonts are pinned to the weight.
 */
export function fontSource(family, weight) {
  const definition = FONT_FAMILIES[family];
  if (!definition?.files) return null;
  const snapped = nearestWeight(definition.weights, weight);
  const variableFile = definition.files.find((entry) => entry.variable);
  if (variableFile) return { file: variableFile.file, weight: snapped, variable: true, variations: { wght: snapped } };
  const file = definition.files.reduce((best, entry) => (Math.abs(entry.weight - snapped) < Math.abs(best.weight - snapped) ? entry : best));
  return { file: file.file, weight: file.weight, variable: false, variations: {} };
}

export const isCjkScript = (script) => CJK_SCRIPTS.has(script);

/**
 * Fonts every Office installation has, for text PowerPoint draws without the
 * embedded subsets: chart axis labels ignore embedded fonts (verified in
 * PowerPoint for Microsoft 365, 2026-09), so all chart text uses these.
 */
export function installedFonts(language) {
  const script = cjkScriptFor(language);
  return { latin: 'Arial', eastAsian: script === 'zh-Hant' ? 'Microsoft JhengHei' : INSTALLED_SANS[script] };
}

// A PDF cannot borrow the reader's fonts: installed Office fonts are drawn
// with the closest open-source family the app ships.
const PDF_SUBSTITUTES = Object.freeze({
  Aptos: 'Inter',
  Calibri: 'Inter',
  Arial: 'Inter',
  Consolas: MONO_FAMILY,
  'Microsoft JhengHei': 'Noto Sans TC',
  'Microsoft YaHei': 'Noto Sans SC',
  SimSun: 'Noto Sans SC',
  'Yu Gothic': 'Noto Sans JP',
  'Yu Mincho': 'Noto Sans JP',
  'Malgun Gothic': 'Noto Sans KR',
  Batang: 'Noto Sans KR'
});

/** The shipped family a PDF uses for `family`. */
export const pdfFamily = (family) => PDF_SUBSTITUTES[family] || (FONT_FAMILIES[family]?.files ? family : 'Inter');

// Faces with a narrow no-break space (U+202F), which French typography puts
// before : ; ! ? % and inside guillemets. Others get a regular no-break space:
// a missing glyph would fall back to another font's much wider space.
const NARROW_NO_BREAK_SPACE_FAMILIES = new Set(['Inter', 'Inter Tight', 'IBM Plex Sans', 'Source Sans 3', 'Source Serif 4', 'Cormorant Garamond', 'Cactus Classical Serif', 'Aptos']);
export const hasNarrowNoBreakSpace = (family) => NARROW_NO_BREAK_SPACE_FAMILIES.has(family);
