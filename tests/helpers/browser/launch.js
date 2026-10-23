import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { chromium } from 'playwright-core';

// The Chromium to drive: CHROMIUM_PATH, else one found under PLAYWRIGHT_BROWSERS_PATH (the revision may differ from the one
// playwright-core expects), else the one playwright-core would install itself (`npx playwright install chromium`).
const findChromium = () => {
  if (process.env.CHROMIUM_PATH) return process.env.CHROMIUM_PATH;
  const base = process.env.PLAYWRIGHT_BROWSERS_PATH;
  if (base && existsSync(base)) {
    for (const name of readdirSync(base).filter((entry) => /^chromium-\d+$/.test(entry)).sort().reverse()) {
      for (const relative of ['chrome-linux/chrome', 'chrome-linux64/chrome']) {
        const file = join(base, name, relative);
        if (existsSync(file)) return file;
      }
    }
  }
  return chromium.executablePath();
};

export const launchBrowser = () => chromium.launch({ executablePath: findChromium(), args: ['--no-sandbox'] });
