const hexToRgb = (hex) => {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return result ? {
        r: parseInt(result[1], 16),
        g: parseInt(result[2], 16),
        b: parseInt(result[3], 16)
    } : null;
};

export function getTextColorForBackground(hexColor) {
    const rgb = hexToRgb(hexColor);
    if (!rgb) return '#000000';
    const luminance = (0.299 * rgb.r + 0.587 * rgb.g + 0.114 * rgb.b) / 255;
    return luminance > 0.5 ? '#000000' : '#ffffff';
}

const channel = (value) => {
    const v = value / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
};
const luminanceOf = ({ r, g, b }) => 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
const toHex = ({ r, g, b }) => `#${[r, g, b].map((c) => Math.round(c).toString(16).padStart(2, '0')).join('')}`;

const DARK_PAGE_LUMINANCE = luminanceOf({ r: 0x21, g: 0x21, b: 0x21 });
const MIN_ACCENT_CONTRAST = 3;

/**
 * The accent as the dark theme shows it. A colour that is hard to see on the dark page (black above all, but also a dark navy a person
 * picked) is lightened until it reaches a contrast of 3 with the page; black becomes the light grey of the black-and-white main button.
 * A colour that is already light is returned unchanged.
 */
export function accentForDarkTheme(hexColor) {
    const rgb = hexToRgb(hexColor);
    if (!rgb) return hexColor;
    if (luminanceOf(rgb) < 0.03) return '#ececec';
    let current = rgb;
    for (let step = 0; step < 20; step += 1) {
        if ((luminanceOf(current) + 0.05) / (DARK_PAGE_LUMINANCE + 0.05) >= MIN_ACCENT_CONTRAST) return toHex(current);
        current = { r: current.r + (255 - current.r) * 0.1, g: current.g + (255 - current.g) * 0.1, b: current.b + (255 - current.b) * 0.1 };
    }
    return toHex(current);
}
