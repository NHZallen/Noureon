import { createMemoizedVendorLoader } from './memoized-vendor-loader.js';

// Chart.js (about 190 KB) is loaded the first time a chart is drawn (the dashboard), not with the page.
export const loadChartVendor = createMemoizedVendorLoader(async () => {
  const module = await import('chart.js/auto');
  const Chart = module.default;
  if (typeof Chart !== 'function') throw new TypeError('Chart.js did not expose a usable constructor.');
  return Chart;
});
