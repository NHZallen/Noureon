// The chart stylesheet (src/styles/charts.css) is not in the startup styles: it loads with the first chart drawn on the page
// (chart-renderer.js) or turned into a picture (files/generators/chart-image-export.js). Until it is there, the charts stay hidden
// (`html:not(.ac-chart-styles-ready) .ac-chart` in styles/chat-reply-layout.css), so an unstyled chart is never seen.
// Browser only: it is not one of the modules the server shares (scripts/server-shared-modules.json).

export const CHART_STYLES_READY_CLASS = 'ac-chart-styles-ready';

let loading = null;
let ready = false;
// The documents waiting for it: a reply's markdown is drawn in a document of its own before it moves into the page.
const waiting = new Set();

export function loadChartStyles(document, load = () => import('../../../styles/charts.css')) {
  const roots = [document?.documentElement, globalThis.document?.documentElement].filter((root) => root?.classList);
  if (!roots.length) return Promise.resolve();
  if (ready) {
    roots.forEach((root) => root.classList.add(CHART_STYLES_READY_CLASS));
    return Promise.resolve();
  }
  roots.forEach((root) => waiting.add(root));
  loading ||= Promise.resolve()
    .then(load)
    // The charts show plain rather than not at all.
    .catch((error) => console.warn('Loading the chart styles failed.', error))
    .then(() => {
      ready = true;
      waiting.forEach((root) => root.classList.add(CHART_STYLES_READY_CLASS));
      waiting.clear();
    });
  return loading;
}
