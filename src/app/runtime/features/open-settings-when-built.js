// Opening the settings page: the page is built first (setup), then shown. The first open builds a part of it only after a module has
// loaded; the opener waits for that a moment, so the page is not rebuilt while it slides in (which made it flicker), and no longer than
// `waitMs` so a slow network never leaves a tap with nothing happening.

export async function openWhenBuilt({ setup, show, waitMs = 250, schedule = (callback, ms) => setTimeout(callback, ms) }) {
  const built = setup();
  if (built && typeof built.then === 'function') {
    await Promise.race([built, new Promise((resolve) => schedule(resolve, waitMs))]);
  }
  show();
}
