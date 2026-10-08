// The colours of the theme in use, for the places that need a real colour value instead of a CSS name (Chart.js draws on a canvas).
// Read when a chart is made, so a chart made after a change of theme has the new colours.

export const readThemeColor = (name, fallback = '') => {
  try {
    const value = globalThis.getComputedStyle?.(globalThis.document?.documentElement)?.getPropertyValue(name)?.trim();
    return value || fallback;
  } catch {
    return fallback;
  }
};

/** Makes the text and the lines Chart.js draws by default follow the theme (the labels of axes and the legend, the grid). */
export function applyChartThemeDefaults(Chart) {
  if (!Chart?.defaults) return;
  Chart.defaults.color = readThemeColor('--text-secondary', '#666666');
  Chart.defaults.borderColor = readThemeColor('--border-color', 'rgba(0, 0, 0, 0.1)');
}
