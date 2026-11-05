// The start page (the cover) of the app stays until the rail of icons is up, on a computer that has one, so the first thing that is seen is the workspace as it is (the rail, its panel, the page beside them)
// and not the workspace without them for a moment (docs/superpowers/specs/2026-11-05-desktop-rail-sidebar-design.md). The rail starts when the account is known; it says it is there with `data-rail-layout` on <html>.
// A phone, a browser where the rail is turned off (`data-rail-early` is not on <html>) and a rail that does not come within the time given do not wait.

export const RAIL_WAIT_MS = 1500;

/** deps: document, setTimeout (a test gives its own). Resolves when the rail is up, at once when it is not to be waited for. */
export function waitForRail(document, { ms = RAIL_WAIT_MS, setTimeout: later } = {}) {
  const root = document?.documentElement;
  const win = document?.defaultView;
  if (!root || !win) return Promise.resolve(false);
  const up = () => root.hasAttribute('data-rail-layout');
  if (up()) return Promise.resolve(true);
  if (!root.hasAttribute('data-rail-early') || !(win.innerWidth >= 768)) return Promise.resolve(false);
  if (typeof win.MutationObserver !== 'function') return Promise.resolve(false);
  return new Promise((resolve) => {
    let done = false;
    let watch = null;
    const finish = (value) => {
      if (done) return;
      done = true;
      watch?.disconnect();
      resolve(value);
    };
    watch = new win.MutationObserver(() => { if (up()) finish(true); });
    watch.observe(root, { attributes: true, attributeFilter: ['data-rail-layout'] });
    (later || win.setTimeout.bind(win))(() => finish(false), ms);
  });
}

/**
 * Starts fetching the files of the rail (its script and its styles) when the page starts, in step with the rest, so they are there by the time the workspace is: nothing is built here (rail.js does that, when
 * the shell has started it). Nothing is fetched where the rail is turned off or the window is a phone.
 */
export function preloadRail(document) {
  const root = document?.documentElement;
  const width = document?.defaultView?.innerWidth;
  if (!root?.hasAttribute('data-rail-early') || !(width >= 768)) return;
  import('../../../styles/rail.css').catch(() => {});
  import('./rail.js').catch(() => {});
}
