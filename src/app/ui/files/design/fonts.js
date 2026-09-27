// Font sets for generated documents. Every set names, for each role, a
// Latin face, a Cyrillic face when the Latin one lacks Cyrillic, and an East
// Asian face per CJK script. PPTX and DOCX runs carry separate Latin and East
// Asian typefaces, so Office switches between them per character just like a
// CSS font stack does in the preview.
//
// All faces except the `office` set are open-source (SIL OFL) and are meant
// to be embedded as subsets, so the file opens looking like its preview. The
// `office` set only uses fonts that ship with Windows and Office and is never
// embedded.

const LATIN_AND_CYRILLIC = Object.freeze(['latin', 'cyrillic']);

export const FONT_FAMILIES = Object.freeze({
  Inter: { scripts: LATIN_AND_CYRILLIC, weights: [300, 400, 500, 700, 900], generic: 'sans-serif' },
  'Inter Tight': { scripts: LATIN_AND_CYRILLIC, weights: [300, 400, 500, 700, 900], generic: 'sans-serif' },
  Manrope: { scripts: LATIN_AND_CYRILLIC, weights: [300, 400, 500, 700, 800], generic: 'sans-serif' },
  Oswald: { scripts: LATIN_AND_CYRILLIC, weights: [300, 400, 500, 700], generic: 'sans-serif', condensed: 0.74 },
  'Playfair Display': { scripts: LATIN_AND_CYRILLIC, weights: [400, 500, 700, 900], generic: 'serif' },
  'Instrument Serif': { scripts: Object.freeze(['latin']), weights: [400], generic: 'serif' },
  'Source Serif 4': { scripts: LATIN_AND_CYRILLIC, weights: [300, 400, 500, 700, 900], generic: 'serif' },
  'Source Sans 3': { scripts: LATIN_AND_CYRILLIC, weights: [300, 400, 500, 700, 900], generic: 'sans-serif' },
  'Cormorant Garamond': { scripts: LATIN_AND_CYRILLIC, weights: [300, 400, 500, 700], generic: 'serif' },
  Lora: { scripts: LATIN_AND_CYRILLIC, weights: [400, 500, 700], generic: 'serif' },
  Nunito: { scripts: LATIN_AND_CYRILLIC, weights: [300, 400, 700, 900], generic: 'sans-serif' },
  'IBM Plex Sans': { scripts: LATIN_AND_CYRILLIC, weights: [300, 400, 500, 700], generic: 'sans-serif' },
  'IBM Plex Mono': { scripts: LATIN_AND_CYRILLIC, weights: [400, 500, 700], generic: 'monospace' },
  'Noto Sans TC': { scripts: Object.freeze(['zh-Hant']), weights: [300, 400, 500, 700, 900], generic: 'sans-serif' },
  'Noto Sans SC': { scripts: Object.freeze(['zh-Hans']), weights: [300, 400, 500, 700, 900], generic: 'sans-serif' },
  'Noto Sans JP': { scripts: Object.freeze(['ja']), weights: [300, 400, 500, 700, 900], generic: 'sans-serif' },
  'Noto Sans KR': { scripts: Object.freeze(['ko']), weights: [300, 400, 500, 700, 900], generic: 'sans-serif' },
  'Noto Serif TC': { scripts: Object.freeze(['zh-Hant']), weights: [300, 400, 500, 700, 900], generic: 'serif' },
  'Noto Serif SC': { scripts: Object.freeze(['zh-Hans']), weights: [300, 400, 500, 700, 900], generic: 'serif' },
  'Noto Serif JP': { scripts: Object.freeze(['ja']), weights: [300, 400, 500, 700, 900], generic: 'serif' },
  'Noto Serif KR': { scripts: Object.freeze(['ko']), weights: [300, 400, 500, 700, 900], generic: 'serif' },
  'Cactus Classical Serif': { scripts: Object.freeze(['zh-Hant']), weights: [400], generic: 'serif' },
  'LXGW WenKai TC': { scripts: Object.freeze(['zh-Hant']), weights: [300, 400, 700], generic: 'serif' },
  Huninn: { scripts: Object.freeze(['zh-Hant']), weights: [400], generic: 'sans-serif' },
  // Office faces: installed with Windows and Office, never embedded.
  Aptos: { scripts: LATIN_AND_CYRILLIC, weights: [400, 700], generic: 'sans-serif', system: true, fallback: 'Calibri' },
  'Microsoft JhengHei': { scripts: Object.freeze(['zh-Hant']), weights: [400, 700], generic: 'sans-serif', system: true },
  'Microsoft YaHei': { scripts: Object.freeze(['zh-Hans']), weights: [400, 700], generic: 'sans-serif', system: true },
  'Yu Gothic': { scripts: Object.freeze(['ja']), weights: [400, 700], generic: 'sans-serif', system: true },
  'Malgun Gothic': { scripts: Object.freeze(['ko']), weights: [400, 700], generic: 'sans-serif', system: true }
});

// CJK families by style; scripts without a dedicated face in that style use
// the closest Noto face.
const CJK = Object.freeze({
  sans: { 'zh-Hant': 'Noto Sans TC', 'zh-Hans': 'Noto Sans SC', ja: 'Noto Sans JP', ko: 'Noto Sans KR' },
  serif: { 'zh-Hant': 'Noto Serif TC', 'zh-Hans': 'Noto Serif SC', ja: 'Noto Serif JP', ko: 'Noto Serif KR' },
  classical: { 'zh-Hant': 'Cactus Classical Serif', 'zh-Hans': 'Noto Serif SC', ja: 'Noto Serif JP', ko: 'Noto Serif KR' },
  kai: { 'zh-Hant': 'LXGW WenKai TC', 'zh-Hans': 'Noto Serif SC', ja: 'Noto Serif JP', ko: 'Noto Serif KR' },
  rounded: { 'zh-Hant': 'Huninn', 'zh-Hans': 'Noto Sans SC', ja: 'Noto Sans JP', ko: 'Noto Sans KR' },
  office: { 'zh-Hant': 'Microsoft JhengHei', 'zh-Hans': 'Microsoft YaHei', ja: 'Yu Gothic', ko: 'Malgun Gothic' }
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

/** CSS font-family for the preview: Latin, Cyrillic fallback, CJK, generic. */
export function cssFontStack(resolvedRole, set = FONT_SETS.modern, roleName = 'heading') {
  const families = [resolvedRole.latin];
  const definition = set[roleName];
  if (definition && definition.cyrillic !== definition.latin) families.push(definition.cyrillic);
  if (FONT_FAMILIES[resolvedRole.latin]?.fallback) families.push(FONT_FAMILIES[resolvedRole.latin].fallback);
  families.push(resolvedRole.eastAsian);
  return `${families.map((family) => `"${family}"`).join(', ')}, ${resolvedRole.generic}`;
}

export const isCjkScript = (script) => CJK_SCRIPTS.has(script);
