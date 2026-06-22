const CSS_COLOR_VALUE_PATTERN = /^(#(?:[\da-f]{3,4}|[\da-f]{6}|[\da-f]{8})|rgba?\(|hsla?\(|color\(|color-mix\(|var\(--|[a-z]+$)/i;

export function resolveFolderColor(value, palette = {}, fallback = '#808080') {
    const color = String(value || '').trim();
    if (!color) return fallback;

    if (palette[color]) return palette[color];

    const matchedValue = Object.values(palette).find(
        paletteColor => String(paletteColor).toLowerCase() === color.toLowerCase()
    );
    if (matchedValue) return matchedValue;

    return CSS_COLOR_VALUE_PATTERN.test(color) ? color : fallback;
}

export function normalizeFolderColorSelection(value, palette = {}) {
    const color = String(value || '').trim();
    if (!color) return '';
    if (palette[color]) return color;

    const matchedEntry = Object.entries(palette).find(
        ([, paletteColor]) => String(paletteColor).toLowerCase() === color.toLowerCase()
    );

    return matchedEntry ? matchedEntry[0] : color;
}
