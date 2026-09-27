// Derives every colour a document uses from the accent (and optional second
// accent) plus the mode and background tone. Text colours are pushed until
// they meet WCAG contrast on every surface they can sit on, so no parameter
// combination can produce unreadable text.

import {
  adjustForContrast,
  clampToGamut,
  contrastRatio,
  hexToOklch,
  isDarkColor,
  mixColors,
  oklchToHex
} from './color.js';

export const TEXT_CONTRAST = 4.5;
export const GRAPHIC_CONTRAST = 3;
const STRONG_TEXT_CONTRAST = 7;

const clamp01 = (value) => Math.min(1, Math.max(0, value));
const WHITE = '#FFFFFF';

function backgroundColor(accent, mode, tone) {
  const dark = mode === 'dark';
  if (tone === 'accent') {
    // The whole deck is the accent colour (a neon or orange poster deck). In
    // dark mode the accent is deepened so it can carry light text.
    return {
      color: dark ? { l: Math.min(accent.l, 0.3), c: Math.min(accent.c, 0.1), h: accent.h } : { ...accent },
      neutralHue: accent.h,
      neutralChroma: Math.min(accent.c * 0.2, 0.03)
    };
  }
  const neutralHue = tone === 'warm' ? 75 : tone === 'cool' ? 255 : accent.h;
  const neutralChroma = tone === 'warm' || tone === 'cool' ? 0.014 : tone === 'tinted' ? Math.min(accent.c * 0.3, 0.045) : 0;
  const color = dark
    ? { l: { tinted: 0.23, warm: 0.2, cool: 0.18 }[tone] ?? 0.16, c: tone === 'tinted' ? Math.min(accent.c * 0.45, 0.07) : neutralChroma * 1.3, h: neutralHue }
    : { l: { tinted: 0.955, warm: 0.97, cool: 0.972 }[tone] ?? 1, c: neutralChroma, h: neutralHue };
  return { color, neutralHue, neutralChroma };
}

function chartSeries(design, { accent, accent2, background, gray, accentGraphic, accent2Graphic }) {
  const dark = isDarkColor(background);
  const direction = dark ? 1 : -1;
  if (design.chart === 'duo') return [accentGraphic, gray, gray, gray, gray, gray];
  if (design.chart === 'accent') {
    return [0, 1, 2, 3, 4, 5].map((step) => oklchToHex(adjustForContrast(
      clampToGamut({ l: dark ? 0.82 - step * 0.08 : 0.42 + step * 0.08, c: accent.c * (1 - step * 0.08), h: accent.h }),
      [background], step < 3 ? GRAPHIC_CONTRAST : 1.5, direction
    )));
  }
  const chroma = Math.max(0.09, Math.min(accent.c, 0.16));
  const extra = [65, 215, 290, 110].map((offset, index) => oklchToHex(adjustForContrast(
    clampToGamut({ l: (dark ? 0.76 : 0.58) + (index % 2 ? (dark ? -0.07 : 0.07) : 0), c: chroma, h: (accent.h + offset) % 360 }),
    [background], GRAPHIC_CONTRAST, direction
  )));
  return [accentGraphic, accent2Graphic, ...extra];
}

/**
 * Returns the palette for a normalised design. Colour roles:
 *   background, surface (cards), surface2, soft (tinted callouts), line,
 *   text, muted, accent (graphics, ≥3:1), accentText (≥4.5:1), accent2,
 *   fill / onFill (inverse slides and colour blocks) with fill2, onFillMuted
 *   and onFillLine, mark (highlighter emphasis), frame, glow1/glow2 and the
 *   six chart series colours.
 */
export function buildPalette(design) {
  const accent = hexToOklch(design.accent);
  const accent2 = design.accent2 ? hexToOklch(design.accent2) : { l: Math.min(accent.l, 0.7), c: Math.max(accent.c, 0.08), h: (accent.h + 150) % 360 };
  const tone = design.background;
  const { color: backgroundLch, neutralHue, neutralChroma } = backgroundColor(accent, design.mode, tone);
  const background = oklchToHex(backgroundLch);
  const dark = isDarkColor(background);
  const direction = dark ? 1 : -1;
  // Cards and callouts step away from the background towards more contrast.
  // On an accent-coloured deck the background can be mid-grey bright, so
  // surfaces step away from the text instead, never closer to it.
  const surfaceDirection = tone === 'accent' ? -1 : 1;
  const away = (amount) => oklchToHex({ l: clamp01(backgroundLch.l + (dark ? amount : -amount) * surfaceDirection), c: backgroundLch.c, h: backgroundLch.h });

  const surface = away(0.05);
  const surface2 = away(0.1);
  const accentRaw = oklchToHex(accent);
  const accent2Raw = oklchToHex(accent2);
  const soft = tone === 'accent' ? surface : oklchToHex(mixColors(accentRaw, background, dark ? 0.78 : 0.86));
  const surfaces = [background, surface, soft];
  const text = oklchToHex(adjustForContrast({ l: dark ? 0.96 : 0.19, c: Math.min(neutralChroma, 0.02), h: neutralHue }, surfaces, STRONG_TEXT_CONTRAST, direction));
  const muted = oklchToHex(adjustForContrast({ l: dark ? 0.76 : 0.45, c: Math.min(neutralChroma * 1.3, 0.025), h: neutralHue }, surfaces, TEXT_CONTRAST, direction));
  const line = oklchToHex(mixColors(text, background, 0.8));
  // On an accent-coloured deck the accent cannot mark anything; text colour
  // takes its role and emphasis becomes a highlighter mark instead.
  const accentGraphic = tone === 'accent' ? text : oklchToHex(adjustForContrast(accent, [background], GRAPHIC_CONTRAST, direction));
  const accentText = tone === 'accent' ? text : oklchToHex(adjustForContrast(accent, surfaces, TEXT_CONTRAST, direction));
  const accent2Graphic = oklchToHex(adjustForContrast(accent2, [background], GRAPHIC_CONTRAST, direction));

  const ink = oklchToHex({ l: 0.18, c: Math.min(accent.c * 0.1, 0.02), h: accent.h });
  let fill;
  let onFill;
  if (tone === 'accent') {
    fill = dark ? oklchToHex({ l: 0.95, c: 0.02, h: accent.h }) : ink;
    onFill = oklchToHex(adjustForContrast(accent, [fill], TEXT_CONTRAST, dark ? -1 : 1));
  } else {
    onFill = contrastRatio(WHITE, accentRaw) >= contrastRatio(ink, accentRaw) ? WHITE : ink;
    fill = oklchToHex(adjustForContrast(accent, [onFill], TEXT_CONTRAST, onFill === WHITE ? -1 : 1));
  }
  const fillLch = hexToOklch(fill);
  const fillDirection = isDarkColor(onFill) ? 1 : -1;
  const fill2 = oklchToHex(adjustForContrast({ ...fillLch, l: clamp01(fillLch.l + fillDirection * 0.07) }, [onFill], TEXT_CONTRAST, fillDirection));
  const onFillMuted = oklchToHex(adjustForContrast(mixColors(onFill, fill, 0.22), [fill, fill2], TEXT_CONTRAST, -fillDirection));
  const onFillLine = oklchToHex(mixColors(onFill, fill, 0.65));
  const gray = oklchToHex(adjustForContrast({ l: dark ? 0.5 : 0.72, c: 0.01, h: neutralHue }, [background], 1.6, direction));

  const palette = {
    dark,
    background,
    surface,
    surface2,
    soft,
    line,
    text,
    muted,
    accent: accentGraphic,
    accentText,
    accent2: accent2Graphic,
    fill,
    fill2,
    onFill,
    onFillMuted,
    onFillLine,
    mark: tone === 'accent' ? surface2 : oklchToHex(mixColors(accentRaw, background, 0.7)),
    frame: oklchToHex(mixColors(tone === 'accent' ? text : accentText, background, 0.45)),
    glow1: accentRaw,
    glow2: accent2Raw,
    accent2Soft: oklchToHex(mixColors(accent2Raw, background, dark ? 0.7 : 0.72)),
    card: dark ? surface : WHITE,
    gray
  };
  palette.series = chartSeries(design, { accent, accent2, background, gray, accentGraphic, accent2Graphic });
  return Object.freeze(palette);
}

/** The palette an inverse (colour-block) slide uses: roles swap onto fill. */
export function invertPalette(palette) {
  return Object.freeze({
    ...palette,
    dark: isDarkColor(palette.fill),
    background: palette.fill,
    surface: palette.fill2,
    soft: palette.fill2,
    text: palette.onFill,
    muted: palette.onFillMuted,
    line: palette.onFillLine,
    accent: palette.onFill,
    accentText: palette.onFill,
    accent2: palette.onFill,
    fill: palette.onFill,
    onFill: palette.fill,
    card: palette.fill2,
    // Highlighter marks on a colour block use its lighter surface.
    mark: palette.fill2
  });
}

/**
 * Every foreground/background pair the layouts can produce, with its ratio.
 * Used by tests (all must pass for every preset) and by the quality report.
 */
export function contrastReport(palette) {
  const pairs = [
    ['text', 'background', TEXT_CONTRAST], ['muted', 'background', TEXT_CONTRAST], ['accentText', 'background', TEXT_CONTRAST],
    ['text', 'surface', TEXT_CONTRAST], ['muted', 'surface', TEXT_CONTRAST], ['text', 'soft', TEXT_CONTRAST], ['muted', 'soft', TEXT_CONTRAST],
    ['accentText', 'surface', TEXT_CONTRAST], ['onFill', 'fill', TEXT_CONTRAST], ['onFillMuted', 'fill', TEXT_CONTRAST],
    ['onFill', 'fill2', TEXT_CONTRAST], ['accent', 'background', GRAPHIC_CONTRAST], ['accent2', 'background', GRAPHIC_CONTRAST]
  ];
  return pairs.map(([foreground, backgroundRole, target]) => {
    const ratio = contrastRatio(palette[foreground], palette[backgroundRole]);
    return { foreground, background: backgroundRole, ratio, target, pass: ratio >= target - 0.005 };
  });
}
