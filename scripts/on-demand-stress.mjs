// Startup, memory, open-a-chat and search with a lot of history, with on-demand loading off (?ws3=0) and on (?ws3=1).
// docs/superpowers/specs/2026-11-12-on-demand-loading-design.md §13.7 has the numbers made with it and what they do not say.
//
//   npm run build && npx vite preview --host 127.0.0.1 --port 4173 &
//   PLAYWRIGHT_MODULE=/path/to/playwright/index.mjs node scripts/on-demand-stress.mjs [conversations=700] [imageEvery=5] [imageKB=400]
//
// It makes a backup file of N chats (20 messages each, a picture in every imageEvery-th), imports it into a fresh local account of a Chromium
// profile (once), then loads the page three times and measures what a person sees: the time until the history list is drawn, the heap when the
// page has settled, the time to open an older chat, and a full-text search (its number of results must be the same in both modes).
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { existsSync, statSync, writeFileSync } from 'node:fs';

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const N = Number(process.argv[2]) || 700;
const EVERY = Number(process.argv[3]) || 5;
const KB = Number(process.argv[4]) || 400;
const BASE = process.env.APP_URL || 'http://127.0.0.1:4173/';
const tag = createHash('sha1').update(`${N}-${EVERY}-${KB}`).digest('hex').slice(0, 8);
const file = `/tmp/on-demand-stress-${tag}.json`;
const profile = `/tmp/on-demand-stress-profile-${tag}`;
const marker = `${profile}.imported`;

const words = 'lorem ipsum dolor sit amet consectetur adipiscing elit sed do eiusmod tempor incididunt ut labore'.split(' ');
const paragraph = (count) => Array.from({ length: count }, () => words[Math.floor(Math.random() * words.length)]).join(' ');
const start = new Date('2026-09-01T00:00:00Z').getTime();

if (!existsSync(marker)) {
  const conversations = Array.from({ length: N }, (_, index) => {
    const at = new Date(start + index * 3600e3).toISOString();
    const messages = Array.from({ length: 20 }, (__, at20) => {
      const parts = [{ text: paragraph(at20 % 2 ? 300 : 40) }];
      if (at20 === 0 && index % EVERY === 0) parts.push({ inlineData: { mimeType: 'image/jpeg', data: randomBytes(KB * 1024).toString('base64') } });
      return { role: at20 % 2 ? 'model' : 'user', parts, createdAt: new Date(start + index * 3600e3 + at20 * 1000).toISOString() };
    });
    return { id: randomUUID(), title: `Stress ${index} ${paragraph(3)}`, model: 'gemini-2.5-flash', createdAt: at, lastUpdatedAt: at, messages };
  });
  writeFileSync(file, JSON.stringify({ conversations, folders: [], astras: [] }));
  console.log('backup file', (statSync(file).size / 1048576).toFixed(1), 'MB');
}

const withBrowser = async (action) => {
  const context = await chromium.launchPersistentContext(profile, { viewport: { width: 1280, height: 800 }, args: ['--enable-precise-memory-info'] });
  try { return await action(context); } finally { await context.close(); }
};

if (!existsSync(marker)) {
  await withBrowser(async (context) => {
    const page = context.pages()[0] || await context.newPage();
    await page.goto(`${BASE}?ws3=0`);
    await page.waitForTimeout(4000);
    await page.getByText('Login', { exact: true }).first().click();
    await page.fill('#username-input', `stress${Date.now()}`);
    await page.fill('#password-input', 'passw0rd-passw0rd');
    await page.click('#register-btn');
    await page.waitForTimeout(7000);
    await page.evaluate(() => document.getElementById('close-latest-update-modal-btn')?.click());
    await page.evaluate(() => document.getElementById('settings-btn').click());
    await page.waitForTimeout(1500);
    await page.evaluate(() => [...document.querySelectorAll('#settings-modal button')].find((button) => button.dataset.section === 'data-management')?.click());
    await page.waitForTimeout(500);
    await page.evaluate(() => document.getElementById('import-data-btn').click());
    await page.waitForTimeout(500);
    await page.setInputFiles('#import-file-input', file);
    await page.waitForTimeout(500);
    await page.evaluate(() => document.getElementById('confirm-import-btn').click());
    await page.waitForTimeout(3000);
    await page.evaluate(() => { const buttons = [...document.getElementById('custom-dialog-modal').querySelectorAll('button')]; buttons[buttons.length - 1]?.click(); });
    await page.waitForTimeout(20000);
  });
  writeFileSync(marker, '1');
}

for (const flag of ['0', '1', '1']) {
  await withBrowser(async (context) => {
    const page = context.pages()[0] || await context.newPage();
    const session = await context.newCDPSession(page);
    await session.send('Performance.enable');
    const heap = async () => Math.round((await session.send('Performance.getMetrics')).metrics.find((metric) => metric.name === 'JSHeapUsedSize').value / 1048576);
    const t0 = Date.now();
    await page.goto(`${BASE}?ws3=${flag}`);
    await page.waitForFunction(() => document.querySelectorAll('#history-list [data-id]').length > 0, null, { timeout: 60000 });
    const listReadyMs = Date.now() - t0;
    await page.waitForTimeout(8000);
    const idleMB = await heap();
    const rows = await page.$$('#history-list [data-id]');
    const t1 = Date.now();
    await rows[4].click();
    await page.waitForFunction(() => document.querySelectorAll('#chat-container .message-bubble').length > 0, null, { timeout: 30000 });
    const openOldChatMs = Date.now() - t1;
    await page.waitForTimeout(1500);
    const afterOpenMB = await heap();
    await page.click('#open-search-btn');
    await page.waitForTimeout(800);
    const t2 = Date.now();
    await page.fill('#modal-search-input', 'tempor');
    let last = -1;
    let lastChange = Date.now();
    for (let i = 0; i < 100 && Date.now() - lastChange <= 1500; i += 1) {
      const signature = await page.evaluate(() => { const box = document.getElementById('search-results-container'); return box ? box.querySelectorAll('[data-id], button, a').length * 1000 + box.innerText.length : 0; });
      if (signature !== last) { last = signature; lastChange = Date.now(); }
      await page.waitForTimeout(100);
    }
    const results = await page.evaluate(() => document.querySelectorAll('#search-results-container [data-id], #search-results-container button').length);
    console.log(`ws3=${flag}`, JSON.stringify({ listReadyMs, idleMB, openOldChatMs, afterOpenMB, searchMs: lastChange - t2, results, afterSearchMB: await heap() }));
  });
}
