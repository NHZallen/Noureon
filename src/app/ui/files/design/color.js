// Colour maths for the design system. Palettes are derived in OKLCH, where
// equal steps in lightness look equal to the eye, and every text/background
// pair is checked with the WCAG 2 contrast ratio. Only lightness (and, when
// the result falls outside sRGB, chroma) is ever adjusted, so a colour keeps
// the hue the model or the user asked for.

const HEX_COLOR = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i;

const clamp01 = (value) => Math.min(1, Math.max(0, value));

export function parseHexColor(value) {
  const match = HEX_COLOR.exec(String(value ?? '').trim());
  if (!match) return null;
  const digits = match[1].length === 3 ? match[1].split('').map((digit) => digit + digit).join('') : match[1];
  return `#${digits.toUpperCase()}`;
}

const hexToRgb = (hex) => {
  const value = Number.parseInt(hex.slice(1), 16);
  return [(value >> 16) & 255, (value >> 8) & 255, value & 255].map((channel) => channel / 255);
};

const toLinear = (channel) => (channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4);
const toGamma = (channel) => (channel <= 0.0031308 ? 12.92 * channel : 1.055 * channel ** (1 / 2.4) - 0.055);

// Björn Ottosson's OKLab matrices.
const linearToOklab = ([r, g, b]) => {
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s
  ];
};

const oklabToLinear = ([lightness, a, b]) => {
  const l = (lightness + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (lightness - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (lightness - 0.0894841775 * a - 1.291485548 * b) ** 3;
  return [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s
  ];
};

const labToLch = ([l, a, b]) => ({ l, c: Math.hypot(a, b), h: ((Math.atan2(b, a) * 180) / Math.PI + 360) % 360 });
const lchToLab = ({ l, c, h }) => {
  const radians = (h * Math.PI) / 180;
  return [l, c * Math.cos(radians), c * Math.sin(radians)];
};

export function hexToOklch(hex) {
  const parsed = parseHexColor(hex);
  if (!parsed) throw new TypeError(`not a hex colour: ${hex}`);
  return labToLch(linearToOklab(hexToRgb(parsed).map(toLinear)));
}

const inGamut = (linear) => linear.every((channel) => channel >= -1e-4 && channel <= 1 + 1e-4);

// Reduce chroma (binary search) until the colour fits in sRGB.
export function clampToGamut(color) {
  const base = { l: clamp01(color.l), c: Math.max(0, color.c), h: color.h };
  if (inGamut(oklabToLinear(lchToLab(base)))) return base;
  let low = 0;
  let high = base.c;
  for (let step = 0; step < 24; step += 1) {
    const middle = (low + high) / 2;
    if (inGamut(oklabToLinear(lchToLab({ ...base, c: middle })))) low = middle;
    else high = middle;
  }
  return { ...base, c: low };
}

export function oklchToHex(color) {
  const linear = oklabToLinear(lchToLab(clampToGamut(color)));
  return `#${linear.map((channel) => Math.round(toGamma(clamp01(channel)) * 255).toString(16).padStart(2, '0')).join('').toUpperCase()}`;
}

export function relativeLuminance(hex) {
  const [r, g, b] = hexToRgb(parseHexColor(hex)).map(toLinear);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrastRatio(first, second) {
  const a = relativeLuminance(first);
  const b = relativeLuminance(second);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

export const isDarkColor = (hex) => relativeLuminance(hex) < 0.18;

/**
 * Moves the colour's lightness away from the backgrounds until it reaches the
 * target ratio against every one of them. `direction` is -1 (darker) or +1
 * (lighter); when omitted it is taken from the first background.
 */
export function adjustForContrast(color, backgrounds, target, direction) {
  const list = [].concat(backgrounds);
  const step = direction ?? (isDarkColor(list[0]) ? 1 : -1);
  const adjusted = { ...color };
  for (let index = 0; index < 101; index += 1) {
    const worst = Math.min(...list.map((background) => contrastRatio(oklchToHex(adjusted), background)));
    if (worst >= target) break;
    adjusted.l = clamp01(adjusted.l + step * 0.01);
  }
  return adjusted;
}

/** Mixes two colours in OKLab; `amount` 0 returns the first, 1 the second. */
export function mixColors(first, second, amount) {
  const a = linearToOklab(hexToRgb(parseHexColor(first)).map(toLinear));
  const b = linearToOklab(hexToRgb(parseHexColor(second)).map(toLinear));
  return labToLch(a.map((value, index) => value + (b[index] - value) * amount));
}
