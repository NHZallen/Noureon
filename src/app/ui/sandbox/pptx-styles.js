// Colours, fills and text properties of a .pptx, read from DrawingML nodes
// (pptx-reader.js). Colours resolve through the file's theme and the
// master's colour map, with the usual modifiers (lumMod, lumOff, tint,
// shade, alpha).

const COLOR_TAGS = new Set(['srgbClr', 'schemeClr', 'sysClr', 'prstClr']);
const PRESET_COLORS = Object.freeze({
  black: '000000', white: 'FFFFFF', red: 'FF0000', green: '008000', blue: '0000FF', yellow: 'FFFF00', gray: '808080', grey: '808080',
  orange: 'FFA500', purple: '800080', cyan: '00FFFF', magenta: 'FF00FF', darkBlue: '00008B', darkRed: '8B0000', darkGreen: '006400',
  lightGray: 'D3D3D3', lightGrey: 'D3D3D3', darkGray: 'A9A9A9', darkGrey: 'A9A9A9', silver: 'C0C0C0', navy: '000080'
});

const child = (node, name) => [...(node?.children || [])].find((item) => item.localName === name) || null;
const children = (node, name) => [...(node?.children || [])].filter((item) => item.localName === name);
const int = (node, fallback = 0) => {
  const value = Number(node?.getAttribute?.('val'));
  return Number.isFinite(value) ? value : fallback;
};

const toRgb = (hex) => {
  const value = Number.parseInt(hex.replace('#', '').slice(0, 6), 16);
  return [(value >> 16) & 255, (value >> 8) & 255, value & 255];
};
const toHex = (rgb) => `#${rgb.map((channel) => Math.max(0, Math.min(255, Math.round(channel))).toString(16).padStart(2, '0')).join('').toUpperCase()}`;

function rgbToHsl([red, green, blue]) {
  const r = red / 255;
  const g = green / 255;
  const b = blue / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const lightness = (max + min) / 2;
  if (max === min) return [0, 0, lightness];
  const d = max - min;
  const saturation = lightness > 0.5 ? d / (2 - max - min) : d / (max + min);
  const hue = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [hue / 6, saturation, lightness];
}

function hslToRgb([hue, saturation, lightness]) {
  if (saturation === 0) return [lightness * 255, lightness * 255, lightness * 255];
  const q = lightness < 0.5 ? lightness * (1 + saturation) : lightness + saturation - lightness * saturation;
  const p = 2 * lightness - q;
  const channel = (t) => {
    let value = t;
    if (value < 0) value += 1;
    if (value > 1) value -= 1;
    if (value < 1 / 6) return p + (q - p) * 6 * value;
    if (value < 1 / 2) return q;
    if (value < 2 / 3) return p + (q - p) * (2 / 3 - value) * 6;
    return p;
  };
  return [channel(hue + 1 / 3) * 255, channel(hue) * 255, channel(hue - 1 / 3) * 255];
}

/** A scheme colour ("accent1", "tx1", "bg1"…) as { color, alpha }. */
export function schemeColor(name, { theme, clrMap = {} }) {
  const mapped = clrMap[name] || name;
  const value = theme?.colors?.[mapped];
  return value ? { color: `#${value.toUpperCase()}`, alpha: 1 } : null;
}

/** The colour inside `node` (a fill, or a style reference), or null. */
export function readColor(node, context) {
  const source = [...(node?.children || [])].find((item) => COLOR_TAGS.has(item.localName));
  if (!source) return null;
  let base = null;
  const value = source.getAttribute('val');
  if (source.localName === 'srgbClr' && /^[0-9a-f]{6}$/i.test(value || '')) base = `#${value.toUpperCase()}`;
  else if (source.localName === 'sysClr') base = source.getAttribute('lastClr') ? `#${source.getAttribute('lastClr').toUpperCase()}` : null;
  else if (source.localName === 'prstClr') base = PRESET_COLORS[value] ? `#${PRESET_COLORS[value]}` : '#000000';
  else if (source.localName === 'schemeClr') {
    base = value === 'phClr' ? context.phClr?.color || null : schemeColor(value, context)?.color || null;
  }
  if (!base) return null;
  let rgb = toRgb(base);
  let alpha = 1;
  for (const modifier of source.children) {
    const amount = int(modifier) / 100000;
    switch (modifier.localName) {
      case 'lumMod': { const hsl = rgbToHsl(rgb); rgb = hslToRgb([hsl[0], hsl[1], Math.min(1, hsl[2] * amount)]); break; }
      case 'lumOff': { const hsl = rgbToHsl(rgb); rgb = hslToRgb([hsl[0], hsl[1], Math.max(0, Math.min(1, hsl[2] + amount))]); break; }
      case 'satMod': { const hsl = rgbToHsl(rgb); rgb = hslToRgb([hsl[0], Math.min(1, hsl[1] * amount), hsl[2]]); break; }
      case 'tint': rgb = rgb.map((channel) => channel * amount + 255 * (1 - amount)); break;
      case 'shade': rgb = rgb.map((channel) => channel * amount); break;
      case 'alpha': alpha = amount; break;
      default: break;
    }
  }
  return { color: toHex(rgb), alpha };
}

/**
 * The fill inside a shape, line or background properties node:
 * { none } | { color, alpha } | { gradient } | undefined when it sets none.
 */
export function readFill(node, context) {
  for (const item of node?.children || []) {
    if (item.localName === 'noFill') return { none: true };
    if (item.localName === 'solidFill') return readColor(item, context) || undefined;
    if (item.localName === 'pattFill') return readColor(child(item, 'fgClr'), context) || undefined;
    if (item.localName === 'gradFill') {
      const stops = children(child(item, 'gsLst'), 'gs').map((stop) => ({ color: readColor(stop, context) })).filter((stop) => stop.color);
      if (!stops.length) return undefined;
      const first = stops[0].color;
      const last = stops[stops.length - 1].color;
      const angle = Number(child(item, 'lin')?.getAttribute('ang') || 0) / 60000;
      return { color: first.color, alpha: first.alpha, gradient: stops.length > 1 ? { angle, from: first, to: last } : undefined };
    }
  }
  return undefined;
}

/** Text run properties (a:rPr, a:defRPr): size, bold, italic, underline, colour, typefaces. */
export function readRun(node, context) {
  if (!node) return {};
  const flag = (name) => (node.getAttribute(name) === null ? undefined : node.getAttribute(name) === '1' || node.getAttribute(name) === 'true');
  const fill = readFill(node, context);
  return {
    sz: node.getAttribute('sz') ? Number(node.getAttribute('sz')) : undefined,
    b: flag('b'),
    i: flag('i'),
    u: node.getAttribute('u') ? node.getAttribute('u') !== 'none' : undefined,
    color: fill?.color,
    latin: child(node, 'latin')?.getAttribute('typeface') || undefined,
    ea: child(node, 'ea')?.getAttribute('typeface') || undefined
  };
}

const spacing = (node, context) => {
  if (!node) return undefined;
  const percent = child(node, 'spcPct');
  const points = child(node, 'spcPts');
  if (percent) return { pct: int(percent) / 100000 };
  if (points) return { px: (int(points) / 100) * context.pt };
  return undefined;
};

/** Paragraph properties (a:pPr, a:lvlNpPr): margins, alignment, spacing, bullet, default run. */
export function readLevel(node, context) {
  if (!node) return {};
  const attribute = (name) => (node.getAttribute(name) === null ? undefined : Number(node.getAttribute(name)));
  let bullet;
  for (const item of node.children) {
    if (item.localName === 'buNone') { bullet = { kind: 'none' }; break; }
    if (item.localName === 'buChar') { bullet = { kind: 'char', char: item.getAttribute('char') || '•' }; break; }
    if (item.localName === 'buAutoNum') { bullet = { kind: 'auto', type: item.getAttribute('type') || 'arabicPeriod', startAt: Number(item.getAttribute('startAt') || 1) }; break; }
  }
  if (bullet) {
    const bulletFont = child(node, 'buFont')?.getAttribute('typeface');
    if (bulletFont && !bulletFont.startsWith('+')) bullet.font = bulletFont;
    bullet.color = readColor(child(node, 'buClr'), context)?.color;
  }
  return {
    marL: attribute('marL'),
    indent: attribute('indent'),
    algn: node.getAttribute('algn') || undefined,
    lnSpc: spacing(child(node, 'lnSpc'), context),
    spcBef: spacing(child(node, 'spcBef'), context),
    spcAft: spacing(child(node, 'spcAft'), context),
    bullet,
    def: readRun(child(node, 'defRPr'), context)
  };
}

/** Later objects win, key by key (undefined values do not overwrite). */
export function mergeProps(...objects) {
  const result = {};
  for (const object of objects) {
    for (const [key, value] of Object.entries(object || {})) {
      if (value === undefined) continue;
      result[key] = key === 'def' ? mergeProps(result.def, value) : value;
    }
  }
  return result;
}
