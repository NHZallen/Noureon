// The message bubble goes with the accent: each choice of the menu has the bubble of its own, in the light and in the dark theme (a pale tint of the
// colour with dark letters, a deep shade of it with light letters). A colour a person made themselves gets a bubble worked out from these: between the
// two choices whose colours are on either side of it on the colour wheel, so its bubble keeps the same proportions of light, depth and tint.

export const ACCENT_BUBBLES = Object.freeze({
    default: { light: { bg: '#ecf2fe', text: '#0e39ab' }, dark: { bg: '#020462', text: '#e6f2ff' } },
    cyan: { light: { bg: '#e8f8fe', text: '#066995' }, dark: { bg: '#00283e', text: '#bdefff' } },
    green: { light: { bg: '#d4fef4', text: '#004836' }, dark: { bg: '#002c22', text: '#adf9e6' } },
    lime: { light: { bg: '#f0fed0', text: '#0a1f00' }, dark: { bg: '#222e00', text: '#ebfdb7' } },
    yellow: { light: { bg: '#fef6dc', text: '#541d00' }, dark: { bg: '#ca7600', text: '#fff1a8' } },
    orange: { light: { bg: '#fef0ee', text: '#88120a' }, dark: { bg: '#580004', text: '#ffddd7' } },
    pink: { light: { bg: '#fef0f4', text: '#73113f' }, dark: { bg: '#4a0024', text: '#ffd7ee' } },
    magenta: { light: { bg: '#feeefe', text: '#5f175b' }, dark: { bg: '#40003c', text: '#ffd0ff' } },
    purple: { light: { bg: '#f4f0fe', text: '#3b0e65' }, dark: { bg: '#2c024c', text: '#f1d7ff' } },
    black: { light: { bg: '#f2f2f2', text: '#0d0d0d' }, dark: { bg: '#404040', text: '#ffffff' } }
});

const parseHex = (hex) => {
    const match = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(String(hex || '').trim());
    return match ? [1, 2, 3].map((index) => parseInt(match[index], 16)) : null;
};
const toHex = (rgb) => `#${rgb.map((value) => Math.round(Math.min(255, Math.max(0, value))).toString(16).padStart(2, '0')).join('')}`;

const toHsl = ([r, g, b]) => {
    const [x, y, z] = [r, g, b].map((value) => value / 255);
    const max = Math.max(x, y, z);
    const min = Math.min(x, y, z);
    const l = (max + min) / 2;
    if (max === min) return { h: 0, s: 0, l };
    const d = max - min;
    const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    let h;
    if (max === x) h = (y - z) / d + (y < z ? 6 : 0);
    else if (max === y) h = (z - x) / d + 2;
    else h = (x - y) / d + 4;
    return { h: h * 60, s, l };
};
const fromHsl = ({ h, s, l }) => {
    const a = s * Math.min(l, 1 - l);
    const channel = (n) => {
        const k = (n + h / 30) % 12;
        return (l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1))) * 255;
    };
    return [channel(0), channel(8), channel(4)];
};

const wrap = (degrees) => ((degrees % 360) + 360) % 360;
const mixHsl = (from, to, t) => {
    const turn = ((to.h - from.h + 540) % 360) - 180;
    return { h: wrap(from.h + turn * t), s: from.s + (to.s - from.s) * t, l: from.l + (to.l - from.l) * t };
};
const mixRgb = (from, to, t) => from.map((value, index) => value + (to[index] - value) * t);

/**
 * The bubble (`{ bg, text }`) for an accent colour in the 'light' or 'dark' theme. `accents` is the menu of accents ({ id: '#rrggbb' }).
 * A colour of the menu gets its own bubble; any other colour gets one between its two neighbours on the colour wheel, and the less colourful it
 * is the nearer the grey bubble of the black choice. A value that is not a colour gets the bubble of the default blue.
 */
export function bubbleColorsFor(accentHex, theme, accents) {
    const side = theme === 'dark' ? 'dark' : 'light';
    const rgb = parseHex(accentHex);
    const named = Object.keys(ACCENT_BUBBLES).find((id) => String(accents?.[id] || '').toLowerCase() === String(accentHex || '').trim().toLowerCase());
    if (named) return { ...ACCENT_BUBBLES[named][side] };
    if (!rgb) return { ...ACCENT_BUBBLES.default[side] };

    const anchors = Object.keys(ACCENT_BUBBLES)
        .filter((id) => id !== 'black' && parseHex(accents?.[id]))
        .map((id) => ({
            hue: toHsl(parseHex(accents[id])).h,
            bg: toHsl(parseHex(ACCENT_BUBBLES[id][side].bg)),
            text: toHsl(parseHex(ACCENT_BUBBLES[id][side].text))
        }))
        .sort((a, b) => a.hue - b.hue);
    const { h, s } = toHsl(rgb);
    let low = anchors[anchors.length - 1];
    let high = anchors[0];
    for (let index = 0; index < anchors.length; index += 1) {
        if (anchors[index].hue <= h) {
            low = anchors[index];
            high = anchors[(index + 1) % anchors.length];
        }
    }
    const span = wrap(high.hue - low.hue) || 360;
    const t = wrap(h - low.hue) / span;
    const grey = ACCENT_BUBBLES.black[side];
    const colourful = Math.min(1, Math.max(0, (s - 0.08) / 0.3));
    const shade = (key) => toHex(mixRgb(parseHex(grey[key]), fromHsl(mixHsl(low[key], high[key], t)), colourful));
    return { bg: shade('bg'), text: shade('text') };
}
