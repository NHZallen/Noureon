// Turns a normalised design into concrete tokens: palette, resolved fonts,
// font sizes, spacing and slide-level rules. The PPTX generator and the slide
// preview both read these, so a design looks the same in both.
//
// Units are points on a 16:9 slide of 960 × 540 pt (13.333 × 7.5 in).

import { isCjkLanguage } from './language.js';
import { buildPalette } from './palette.js';
import { resolveFontRoles } from './fonts.js';

export const SLIDE_WIDTH = 960;
export const SLIDE_HEIGHT = 540;

export const DENSITY_TOKENS = Object.freeze({
  compact: Object.freeze({ body: 16, marginX: 44, marginTop: 38, marginBottom: 32, gap: 18, lineHeight: 1.45, itemGap: 0.45 }),
  balanced: Object.freeze({ body: 18, marginX: 60, marginTop: 48, marginBottom: 38, gap: 26, lineHeight: 1.5, itemGap: 0.7 }),
  airy: Object.freeze({ body: 20, marginX: 80, marginTop: 58, marginBottom: 46, gap: 34, lineHeight: 1.55, itemGap: 0.9 })
});

// Upper bounds per title size; the engine still shrinks text that does not fit.
const TITLE_CAPS = Object.freeze({
  regular: Object.freeze({ title: 30, cover: 54, section: 48 }),
  large: Object.freeze({ title: 38, cover: 72, section: 62 }),
  huge: Object.freeze({ title: 46, cover: 96, section: 80 })
});

export const MIN_FONT_SIZE = Object.freeze({ body: 14, caption: 11, title: 22, cover: 30, section: 28, value: 22 });
const TRACKING_EM = Object.freeze({ tight: -0.02, normal: 0, wide: 0.06 });

// Which layouts become colour-block (inverse) slides at each colour intensity.
const INVERSE_LAYOUTS = Object.freeze({
  restrained: Object.freeze([]),
  balanced: Object.freeze(['closing']),
  vivid: Object.freeze(['bigNumber', 'quote', 'closing'])
});

const half = (value) => Math.round(value * 2) / 2;

export function buildTypeScale(design) {
  const density = DENSITY_TOKENS[design.density] || DENSITY_TOKENS.balanced;
  const ratio = design.typeScale;
  const body = density.body;
  const caps = TITLE_CAPS[design.titleSize] || TITLE_CAPS.large;
  return Object.freeze({
    caption: Math.max(12, half(body * 0.78)),
    label: Math.max(12, Math.round(body * 0.74)),
    body,
    h3: half(body * ratio),
    h2: half(body * ratio ** 2),
    title: half(Math.min(body * ratio ** 3, caps.title)),
    cover: half(Math.min(body * ratio ** 4.2, caps.cover)),
    section: half(Math.min(body * ratio ** 3.8, caps.section)),
    display: half(Math.min(body * ratio ** 4.6, 84)),
    hero: half(Math.min(body * ratio ** 7, 170))
  });
}

/** All tokens for one design in one document language. */
export function buildDesignTokens(design, { language = 'zh-TW' } = {}) {
  const density = DENSITY_TOKENS[design.density] || DENSITY_TOKENS.balanced;
  const cjk = isCjkLanguage(language);
  return Object.freeze({
    design,
    language,
    palette: buildPalette(design),
    fonts: resolveFontRoles(design.fonts, { language, headingWeight: design.headingWeight }),
    type: buildTypeScale(design),
    spacing: density,
    lineHeight: Object.freeze({
      body: density.lineHeight,
      // CJK glyphs fill the em box; tight Latin leading would make them touch.
      heading: cjk ? 1.22 : 1.12
    }),
    tracking: TRACKING_EM[design.tracking] ?? 0,
    // Uppercase only changes Latin and Cyrillic; CJK has no case.
    uppercaseHeadings: design.headingCase === 'upper',
    radius: design.radius,
    motifs: Object.freeze([...(design.motifs || [])]),
    inverseLayouts: INVERSE_LAYOUTS[design.colorUse] || INVERSE_LAYOUTS.restrained
  });
}
