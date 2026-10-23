import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import test, { after, before } from 'node:test';

import { launchBrowser } from '../helpers/browser/launch.js';
import { serveDist } from '../helpers/browser/serve-dist.js';

// The built site in a real browser: sign up with a local account, set a key, send a message to a model that answers from a stand-in
// provider, and find the chat again after a reload. Run with `npm run test:browser` (it builds first); it is not part of `npm test`.

const dist = new URL('../../dist/', import.meta.url).pathname;
const KEY = 'sk-or-test-key';

let site;
let browser;

before(async () => {
  assert.ok(existsSync(`${dist}index.html`), 'dist/ is missing: run `npm run build` first');
  site = await serveDist(dist);
  browser = await launchBrowser();
}, { timeout: 60_000 });

after(async () => {
  await browser?.close();
  await site?.close();
});

const sse = (payload) => `data: ${JSON.stringify(payload)}\n\n`;

// A new person in a new browser profile. Everything that is not the site itself is refused, except the provider, which answers as scripted.
const newPerson = async (viewport = { width: 1280, height: 800 }) => {
  const context = await browser.newContext({ viewport });
  const page = await context.newPage();
  const problems = [];
  page.on('pageerror', (error) => problems.push(String(error)));
  const provider = [];
  await context.route((url) => !url.href.startsWith(site.url) && !url.href.startsWith('data:') && !url.href.startsWith('blob:'), (route) => route.abort());
  await context.route('https://openrouter.ai/**', async (route) => {
    const request = route.request();
    if (request.method() === 'OPTIONS') {
      return route.fulfill({ status: 204, headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' } });
    }
    // The judgement model is not there: the app is meant to go on with its word lists.
    if (request.url().includes('/decisions')) {
      return route.fulfill({ status: 503, headers: { 'content-type': 'application/json', 'access-control-allow-origin': '*' }, body: '{"error":"unavailable"}' });
    }
    provider.push({ url: request.url(), authorization: request.headers().authorization, body: request.postData() });
    return route.fulfill({
      status: 200,
      headers: { 'content-type': 'text/event-stream', 'access-control-allow-origin': '*' },
      body: sse({ choices: [{ delta: { content: 'Hello from ' } }] })
        + sse({ choices: [{ delta: { content: 'the fake model.' } }] })
        + sse({ choices: [{ delta: {}, finish_reason: 'stop' }], usage: { prompt_tokens: 3, completion_tokens: 4 } })
        + 'data: [DONE]\n\n'
    });
  });
  return { context, page, problems, provider };
};

const signUp = async (page, username) => {
  await page.goto(site.url, { waitUntil: 'networkidle' });
  await page.fill('#username-input', username);
  await page.fill('#password-input', 'correct horse battery');
  await page.click('#register-btn');
  await page.waitForSelector('#app-container.visible');
  await page.click('#close-latest-update-modal-btn');
};

const saveKey = async (page, openSidebar) => {
  if (openSidebar) {
    await page.click('#menu-toggle-btn');
    await page.waitForTimeout(400);
  }
  await page.click('#settings-btn');
  await page.waitForSelector('#settings-modal.visible');
  await page.locator('#settings-nav [data-section="model-management"]').click();
  const input = page.locator('#openrouter-api-key-input-all');
  await page.waitForFunction(() => document.querySelector('#openrouter-api-key-input-all')?.dataset.apiKeyIntentBound === 'true');
  // Typed at once, while the page is still being prepared (it is prepared again a few seconds after it loaded): the key must stay.
  await input.click();
  await input.pressSequentially(KEY, { delay: 10 });
  await page.waitForFunction(() => document.querySelector('#openrouter-api-key-input-all')?.dataset.apiKeyState === 'masked', null, { timeout: 10_000 });
  assert.equal(await input.getAttribute('data-api-key-state'), 'masked', 'the key was kept and shown masked');
  assert.notEqual(await input.inputValue(), KEY, 'the key is not shown in the clear');
  await page.click('#close-settings-btn');
};

// The key is written to the browser's database a moment after it is accepted: a reload before that would lose it, as it would for anyone.
const waitForStoredKey = (page) => page.waitForFunction(async () => {
  const db = await new Promise((resolve, reject) => {
    const request = indexedDB.open('ChatAppDB');
    request.onsuccess = () => resolve(request.result);
    request.onerror = reject;
  });
  try {
    const store = db.transaction('keyValue').objectStore('keyValue');
    const keys = await new Promise((resolve) => { const all = store.getAllKeys(); all.onsuccess = () => resolve(all.result); });
    const key = keys.find((name) => String(name).startsWith('chatSensitiveConfig_v1_'));
    if (!key) return false;
    const value = await new Promise((resolve) => { const get = store.get(key); get.onsuccess = () => resolve(get.result); });
    return String(value).includes('sk-or-test-key');
  } finally {
    db.close();
  }
}, null, { timeout: 10_000 });

const pickModel = async (page) => {
  await page.click('#model-picker-btn');
  await page.getByText('OpenRouter · Vision', { exact: false }).first().click();
};

test('a new person signs up, sets a key, talks to a model, and finds the chat again after a reload', async () => {
  const { context, page, problems, provider } = await newPerson();
  try {
    await signUp(page, 'tester');
    assert.equal(await page.locator('#message-input').isDisabled(), true, 'nothing can be written without a key');

    await saveKey(page, true);
    await pickModel(page);
    await waitForStoredKey(page);
    // The key is read again when the page loads, as it is every time the person comes back.
    await page.reload({ waitUntil: 'networkidle' });
    await page.waitForSelector('#app-container.visible');
    await page.waitForFunction(() => document.querySelector('#message-input') && !document.querySelector('#message-input').disabled);

    await page.fill('#message-input', 'Say hello');
    await page.click('#submit-btn');
    await page.waitForFunction(() => document.querySelector('#chat-container')?.innerText.includes('Hello from the fake model.'));

    assert.equal(provider.length, 1, 'one chat request to the provider');
    assert.match(provider[0].url, /\/chat\/completions$/);
    assert.equal(provider[0].authorization, `Bearer ${KEY}`, 'the person\'s own key is used');
    assert.match(provider[0].body, /Say hello/);
    assert.match(await page.locator('#chat-container').innerText(), /Say hello/);

    // The page comes back on a new chat; the one that was had is in the list of chats.
    await page.reload({ waitUntil: 'networkidle' });
    await page.waitForSelector('#app-container.visible');
    const saved = page.locator('#history-list').getByText('Say hello');
    await saved.waitFor({ state: 'attached' });
    if (!(await saved.isVisible())) {
      await page.click('#menu-toggle-btn');
      await saved.waitFor({ state: 'visible' });
    }
    await saved.click();
    await page.waitForFunction(() => document.querySelector('#chat-container')?.innerText.includes('Hello from the fake model.'));
    assert.deepEqual(problems, [], 'no error was thrown in the page');
  } finally {
    await context.close();
  }
});

test('on a phone the page opens, the menu opens, and the composer is within the screen', async () => {
  const { context, page, problems } = await newPerson({ width: 390, height: 780 });
  try {
    await signUp(page, 'phone');
    const box = await page.locator('#message-input').boundingBox();
    assert.ok(box && box.x >= 0 && box.x + box.width <= 390 && box.y + box.height <= 780, `the composer is on screen: ${JSON.stringify(box)}`);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    assert.ok(overflow <= 0, `the page does not scroll sideways (${overflow}px)`);
    await page.click('#menu-toggle-btn');
    await page.waitForSelector('#new-chat-btn', { state: 'visible' });
    assert.deepEqual(problems, []);
  } finally {
    await context.close();
  }
});

test('noureonDiagnose() in the console says where replies are made, and why not on the server', async () => {
  const { context, page, problems } = await newPerson();
  try {
    await signUp(page, 'diagnose');
    const report = await page.evaluate(() => window.noureonDiagnose());
    assert.equal(report.account.signedInToCloud, false, 'a local account has no server');
    assert.equal(report.server.reachable, false, 'every connection but the site\'s is refused here');
    assert.ok(report.problems.some((text) => /Not signed in/.test(text)));
    assert.ok(report.plan.every((row) => row.runsOn === 'this device' && row.reason === 'no-account'));
    assert.ok(report.chat === null || typeof report.chat.model === 'string');
    assert.deepEqual(problems, []);
  } finally {
    await context.close();
  }
});
