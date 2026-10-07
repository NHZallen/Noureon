// Opening the settings page: the page is built first (setup), then shown. The first open builds a part of it only after a module has
// loaded; the opener waits for that a moment, so the page is not rebuilt while it slides in (which made it flicker), and no longer than
// `waitMs` so a slow network never leaves a tap with nothing happening.

/**
 * Builds the page ahead, when the page is idle a few seconds after it opened, so the first open finds it built (on a phone the module of
 * the account part may take longer than the opener is willing to wait, and what is built while the page is on screen shows as a white flash).
 */
export function prepareWhenIdle({ setup, delayMs = 4000, schedule = (callback, ms) => setTimeout(callback, ms), requestIdle = globalThis.requestIdleCallback?.bind(globalThis) }) {
  schedule(() => {
    const run = () => {
      try {
        Promise.resolve(setup()).catch(() => {});
      } catch {
        // The page is built when it is opened, as before.
      }
    };
    if (typeof requestIdle === 'function') requestIdle(run, { timeout: 8000 });
    else run();
  }, delayMs);
}

export async function openWhenBuilt({ setup, show, waitMs = 500, schedule = (callback, ms) => setTimeout(callback, ms) }) {
  const built = setup();
  if (built && typeof built.then === 'function') {
    await Promise.race([built, new Promise((resolve) => schedule(resolve, waitMs))]);
  }
  show();
}
