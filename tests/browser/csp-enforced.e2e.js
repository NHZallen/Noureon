import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test, { after, before } from 'node:test';

import { launchBrowser } from '../helpers/browser/launch.js';
import { serveDist } from '../helpers/browser/serve-dist.js';

// The content security policy that staging enforces (vercel.json), in a real browser: the page is served with exactly that header, a person
// goes through the main flow (sign up, key, settings, a reply with formulas, code and a file, a PowerPoint download that embeds fonts with
// WebAssembly) and nothing may be blocked. The same run without 'wasm-unsafe-eval' must be caught, or "nothing was blocked" would prove nothing.

const dist = new URL('../../dist/', import.meta.url).pathname;
const vercel = JSON.parse(readFileSync(new URL('../../vercel.json', import.meta.url), 'utf8'));
const enforced = vercel.headers.find((rule) => rule.has?.some((condition) => condition.value === 'staging.noureon.com'))
  .headers.find((header) => header.key === 'Content-Security-Policy').value;

let browser;
before(async () => { browser = await launchBrowser(); }, { timeout: 60_000 });
after(async () => { await browser?.close(); });

const sse = (payload) => `data: ${JSON.stringify(payload)}\n\n`;
const REPLY = 'Here is **bold**, math $x^2$, a file and code:\n\n````file deck.pptx\n# 標題\n\n- 項目一\n- Item two\n\n---\n\n# 第二頁\n\n你好世界\n````\n\n```js\nlet a = 1;\n```';

// Runs the flow under `policy` and returns what the browser blocked.
const blockedUnder = async (policy) => {
  const site = await serveDist(dist, { headers: { 'Content-Security-Policy': policy } });
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  try {
    await context.addInitScript(() => {
      window.__blocked = [];
      document.addEventListener('securitypolicyviolation', (event) => window.__blocked.push(`${event.effectiveDirective} ${event.blockedURI}`));
    });
    await context.route((url) => !url.href.startsWith(site.url) && !url.href.startsWith('data:') && !url.href.startsWith('blob:'), (route) => route.abort());
    await context.route('https://openrouter.ai/**', async (route) => {
      const request = route.request();
      if (request.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' } });
      if (request.url().includes('/decisions')) return route.fulfill({ status: 503, headers: { 'access-control-allow-origin': '*' }, body: '{}' });
      return route.fulfill({
        status: 200,
        headers: { 'content-type': 'text/event-stream', 'access-control-allow-origin': '*' },
        body: sse({ choices: [{ delta: { content: REPLY } }] }) + sse({ choices: [{ delta: {}, finish_reason: 'stop' }] }) + 'data: [DONE]\n\n'
      });
    });
    const page = await context.newPage();
    await page.goto(site.url, { waitUntil: 'networkidle' });
    await page.fill('#username-input', 'tester');
    await page.fill('#password-input', 'correct horse battery');
    await page.click('#register-btn');
    await page.waitForSelector('#app-container.visible');
    await page.click('#close-latest-update-modal-btn');

    await page.click('#menu-toggle-btn');
    await page.waitForTimeout(400);
    await page.click('#settings-btn');
    await page.waitForSelector('#settings-modal.visible');
    for (const section of ['model-management', 'user', 'memory']) {
      await page.locator(`#settings-nav [data-section="${section}"]`).click().catch(() => {});
    }
    await page.locator('#settings-nav [data-section="model-management"]').click();
    const key = page.locator('#openrouter-api-key-input-all');
    await key.click();
    await key.pressSequentially('sk-or-test-key', { delay: 10 });
    await page.waitForFunction(() => document.querySelector('#openrouter-api-key-input-all')?.dataset.apiKeyState === 'masked', null, { timeout: 10_000 });
    await page.click('#close-settings-btn');
    await page.click('#model-picker-btn');
    await page.getByText('OpenRouter · Vision', { exact: false }).first().click();
    await page.reload({ waitUntil: 'networkidle' });
    await page.waitForSelector('#app-container.visible');
    await page.waitForFunction(() => document.querySelector('#message-input') && !document.querySelector('#message-input').disabled);

    await page.fill('#message-input', 'make a deck');
    await page.click('#submit-btn');
    await page.locator('[data-file-action="download"]').first().waitFor({ timeout: 20_000 });
    await page.locator('[data-file-action="preview"]').first().click();
    await page.locator('[class*="ac-file-preview"]').first().waitFor();
    await page.locator('[class*="ac-file-preview-close"]').first().click();
    const download = page.waitForEvent('download', { timeout: 30_000 });
    await page.locator('[data-file-action="download"]').first().click();
    assert.equal((await download).suggestedFilename(), 'deck.pptx');
    await page.waitForTimeout(1000);
    return await page.evaluate(() => window.__blocked);
  } finally {
    await context.close();
    await site.close();
  }
};

test('the policy staging enforces blocks nothing in the main flow, including a PowerPoint download that uses WebAssembly', async () => {
  assert.deepEqual(await blockedUnder(enforced), []);
});

test('the same flow is caught when the policy lacks what the page needs (the check can fail)', async () => {
  const blocked = await blockedUnder(enforced.replace("'wasm-unsafe-eval' ", ''));
  assert.ok(blocked.some((entry) => entry.startsWith('script-src wasm-eval')), `expected a wasm-eval violation, got ${JSON.stringify(blocked)}`);
});
