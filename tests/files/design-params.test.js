import assert from 'node:assert/strict';
import test from 'node:test';

import { DESIGN_PARAM_KEYS, designDiff, describeDesignParameters, normalizeDesign } from '../../src/app/ui/files/design/design-params.js';
import { DEFAULT_PRESET_ID, DESIGN_PRESETS, DESIGN_PRESET_IDS, getPresetText } from '../../src/app/ui/files/design/design-presets.js';
import { cssFontStack, FONT_FAMILIES, FONT_SETS, fontSource, officeFace, resolveFontRoles } from '../../src/app/ui/files/design/fonts.js';
import { buildDesignTokens, buildTypeScale } from '../../src/app/ui/files/design/design-tokens.js';

const LANGUAGES = ['zh-TW', 'en', 'fr', 'ru', 'es'];

test('a design always has all 25 parameters', () => {
  assert.equal(DESIGN_PARAM_KEYS.length, 25);
  const { design, preset, issues } = normalizeDesign(undefined);
  assert.deepEqual(Object.keys(design).sort(), [...DESIGN_PARAM_KEYS].sort());
  assert.equal(preset, null);
  assert.deepEqual(issues, []);
  assert.equal(design.fonts, DESIGN_PRESETS[DEFAULT_PRESET_ID].params.fonts);
});

test('there are 20 presets and each is a valid, complete design', () => {
  assert.equal(DESIGN_PRESET_IDS.length, 20);
  for (const id of DESIGN_PRESET_IDS) {
    const { design, issues } = normalizeDesign(DESIGN_PRESETS[id].params);
    assert.deepEqual(issues, [], `${id} has no corrections`);
    assert.deepEqual(Object.keys(DESIGN_PRESETS[id].params).sort(), [...DESIGN_PARAM_KEYS].sort(), `${id} sets every parameter`);
    assert.deepEqual(design, { ...DESIGN_PRESETS[id].params, motifs: [...DESIGN_PRESETS[id].params.motifs] });
  }
});

test('preset texts exist in all five UI languages and names avoid brand names', () => {
  for (const id of DESIGN_PRESET_IDS) {
    for (const language of LANGUAGES) {
      const text = getPresetText(id, language);
      assert.ok(text.name && text.feature && text.fit, `${id} ${language}`);
      assert.doesNotMatch(text.name, /Apple|Google|Microsoft|Pitch|Figma|Canva|IBM|McKinsey|BCG|Keynote|Office|Material|Carbon/i, `${id} ${language} name`);
    }
    assert.ok(DESIGN_PRESETS[id].reference, `${id} records its reference`);
  }
  assert.equal(getPresetText('office', 'zh-TW').name, '通用相容');
  assert.equal(getPresetText('missing', 'en'), null);
});

test('a preset is a starting point that explicit parameters override', () => {
  const { design, preset, issues } = normalizeDesign({ preset: 'consulting', accent: '#ff0000', density: 'airy' });
  assert.equal(preset, 'consulting');
  assert.equal(design.accent, '#FF0000');
  assert.equal(design.density, 'airy');
  assert.equal(design.fonts, 'consulting', 'the rest comes from the preset');
  assert.deepEqual(issues, []);
});

test('synonyms, wrong types and alternative keys are mapped to valid values', () => {
  const { design, preset, issues } = normalizeDesign({
    Template: 'Swiss', colour: '#abc', Background: 'paper', boldness: 'bold', font: 'grotesk', weight: 'semibold',
    case: 'ALL CAPS', scale: '1.3x', corners: 'round', decorations: 'lines, glow, grid', alignment: 'centre',
    coverStyle: 'photo', numbering: 'leading zero', cardStyle: 'frosted', images: 'lots', chartColors: 'highlight', label: 'Bold swiss'
  });
  assert.equal(preset, 'swiss');
  assert.deepEqual(
    [design.accent, design.background, design.colorUse, design.fonts, design.headingWeight, design.headingCase, design.typeScale, design.radius, design.align, design.cover, design.numbers, design.cards, design.imagery, design.chart],
    ['#AABBCC', 'warm', 'vivid', 'tight', 700, 'upper', 1.3, 16, 'center', 'bleed', 'padded', 'glass', 'rich', 'duo']
  );
  assert.deepEqual(design.motifs, ['rules', 'glow'], 'at most two motifs, first ones win');
  assert.ok(issues.some((issue) => issue.code === 'corrected-value' && issue.key === 'motifs'));
  assert.equal(normalizeDesign({ label: '  Bold swiss ' }).label, 'Bold swiss');
});

test('invalid values fall back and are reported; numbers are clamped', () => {
  const { design, issues } = normalizeDesign({ preset: 'noir', accent: 'navy blue', mode: 'purple', typeScale: 3, radius: -4, headingWeight: 650, vibes: 'good' });
  assert.equal(design.accent, DESIGN_PRESETS.noir.params.accent);
  assert.equal(design.mode, 'dark');
  assert.equal(design.typeScale, 1.6);
  assert.equal(design.radius, 0);
  assert.equal(design.headingWeight, 700);
  assert.deepEqual(issues.map((issue) => issue.code).sort(), ['corrected-value', 'corrected-value', 'corrected-value', 'invalid-value', 'invalid-value', 'unknown-parameter']);
  assert.equal(normalizeDesign({ accent2: 'none' }).design.accent2, null, 'the second accent is optional');
  assert.ok(normalizeDesign({ preset: 'corporate' }).issues.some((issue) => issue.code === 'unknown-preset'));
});

test('designDiff lists changed parameters and the prompt text covers every key', () => {
  const before = normalizeDesign({ preset: 'whitespace' }).design;
  const after = normalizeDesign({ preset: 'whitespace', mode: 'dark', motifs: ['glow'] }).design;
  assert.deepEqual(designDiff(before, after), ['mode', 'motifs']);
  const description = describeDesignParameters();
  for (const key of DESIGN_PARAM_KEYS) assert.match(description, new RegExp(`^- ${key}:`, 'm'));
});

test('every font set covers Latin, Cyrillic and all CJK scripts', () => {
  for (const [id, set] of Object.entries(FONT_SETS)) {
    for (const role of ['heading', 'body', 'label']) {
      const definition = set[role];
      assert.ok(FONT_FAMILIES[definition.latin]?.scripts.includes('latin'), `${id} ${role} latin`);
      assert.ok(FONT_FAMILIES[definition.cyrillic]?.scripts.includes('cyrillic'), `${id} ${role} cyrillic`);
      for (const language of ['zh-TW', 'zh-CN', 'ja', 'ko']) {
        const resolved = resolveFontRoles(id, { language })[role];
        assert.ok(FONT_FAMILIES[resolved.eastAsian], `${id} ${role} ${language}`);
      }
    }
  }
});

test('fonts resolve per document language and snap to real weights', () => {
  assert.equal(resolveFontRoles('modernSerif', { language: 'en' }).heading.latin, 'Instrument Serif');
  assert.equal(resolveFontRoles('modernSerif', { language: 'ru' }).heading.latin, 'Playfair Display', 'Russian needs Cyrillic glyphs');
  assert.equal(resolveFontRoles('kai', { language: 'zh-TW' }).heading.eastAsian, 'LXGW WenKai TC');
  assert.equal(resolveFontRoles('kai', { language: 'ja' }).heading.eastAsian, 'Yu Mincho', 'Japanese uses the installed serif');
  const condensed = resolveFontRoles('condensed', { headingWeight: 900 }).heading;
  assert.deepEqual([condensed.latin, condensed.latinWeight, condensed.eastAsian, condensed.eastAsianWeight], ['Oswald', 700, 'Noto Sans TC', 900]);
  assert.equal(resolveFontRoles('rounded', { headingWeight: 700 }).heading.eastAsianWeight, 400, 'no faux bold for single-weight faces');
  assert.equal(resolveFontRoles('office').embedded, false);
  assert.equal(resolveFontRoles('modern').embedded, true);
  assert.equal(cssFontStack(resolveFontRoles('modernSerif', { language: 'fr' }).heading, FONT_SETS.modernSerif), '"Instrument Serif", "Playfair Display", "Noto Serif TC", serif');
});

test('type scale and tokens follow density, ratio and title size', () => {
  const huge = buildTypeScale({ density: 'airy', typeScale: 1.5, titleSize: 'huge' });
  assert.equal(huge.body, 20);
  assert.equal(huge.title, 46, 'content titles are capped');
  assert.equal(huge.cover, 96);
  const compact = buildTypeScale({ density: 'compact', typeScale: 1.2, titleSize: 'regular' });
  assert.ok(compact.title < huge.title && compact.body === 16);
  const tokens = buildDesignTokens(normalizeDesign({ preset: 'poster' }).design, { language: 'ru' });
  assert.equal(tokens.uppercaseHeadings, true);
  assert.equal(tokens.lineHeight.heading, 1.12, 'Latin-script leading for Russian');
  assert.deepEqual([...tokens.inverseLayouts], ['bigNumber', 'quote', 'closing']);
  assert.equal(buildDesignTokens(normalizeDesign({}).design, { language: 'zh-TW' }).lineHeight.heading, 1.22);
});

test('Office face names give every weight outside regular and bold its own family', () => {
  assert.deepEqual(officeFace('Inter', 400), { family: 'Inter', typeface: 'Inter', slot: 'regular', weight: 400 });
  assert.deepEqual(officeFace('Inter', 700), { family: 'Inter', typeface: 'Inter', slot: 'bold', weight: 700 });
  assert.equal(officeFace('Inter', 300).typeface, 'Inter Light');
  assert.equal(officeFace('Manrope', 900).typeface, 'Manrope ExtraBold', 'snaps to the weights the family has');
  assert.deepEqual(officeFace('Microsoft JhengHei', 700), { family: 'Microsoft JhengHei', typeface: 'Microsoft JhengHei', slot: 'bold', weight: 700 });
  assert.deepEqual(fontSource('Inter', 500), { file: 'inter.ttf', weight: 500, variable: true, variations: { wght: 500 } });
  assert.deepEqual(fontSource('LXGW WenKai TC', 900), { file: 'lxgw-wenkai-tc-bold.ttf', weight: 700, variable: false, variations: {} });
  assert.equal(fontSource('Aptos', 400), null);
  for (const [name, family] of Object.entries(FONT_FAMILIES)) {
    assert.ok(family.system || family.files?.length, `${name} has files or is installed`);
  }
});
