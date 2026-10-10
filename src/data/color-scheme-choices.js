// The choices of the colour theme ("light", "dark", "system") as plain data: the settings keep one of them. The code that shows the
// theme in the page is src/app/runtime/features/color-scheme.js. (Plain data only: the server reads the settings through this too.)

export const COLOR_SCHEMES = Object.freeze(['light', 'dark', 'system']);

export const normalizeColorScheme = (value) => (COLOR_SCHEMES.includes(value) ? value : 'light');
