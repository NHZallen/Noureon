import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import test from 'node:test';
import { promisify } from 'node:util';

const run = promisify(execFile);
const root = new URL('..', import.meta.url).pathname;

// The chat page as a whole: shell.js makes every part of the page and wires them together, and nothing else loads it, so a part that no longer
// fits (a name that was renamed, a service nobody provides, a button with no handler) shows only when the page is opened. Here the page is
// started in Node with its real markup and a browser's globals (tests/helpers/page-runtime/), once for each scenario.

const boot = async (scenario) => {
  const { stdout } = await run(process.execPath, ['--import', './tests/helpers/page-runtime/register.mjs', './tests/helpers/page-runtime/boot-page.mjs'], {
    cwd: root, env: { PATH: process.env.PATH, BOOT_SCENARIO: JSON.stringify(scenario) }, timeout: 60_000, maxBuffer: 8 * 1024 * 1024
  });
  const line = stdout.split('\n').find((entry) => entry.startsWith('REPORT '));
  assert.ok(line, `the page printed no report: ${stdout.slice(0, 500)}`);
  return JSON.parse(line.slice('REPORT '.length));
};

const localUser = { chat_lastUser: 'demo', chatUser_demo: { username: 'demo' } };

test('the page starts for someone signed out: the sign-in page is shown, the chat is not, and nothing is logged as wrong', async () => {
  const report = await boot({ read: ['auth-container', 'app-container'] });
  assert.equal(report.started, 'started');
  assert.deepEqual(report.logged, []);
  assert.match(report.elements['auth-container'].className, /\bvisible\b/);
  assert.match(report.elements['app-container'].className, /\bhidden\b/);
});

test('the page starts for a person who has an account on this device: the chat is shown with their greeting, and nothing is logged as wrong', async () => {
  const report = await boot({ seed: localUser, read: ['auth-container', 'app-container', 'chat-container', 'message-input'] });
  assert.equal(report.started, 'started');
  assert.deepEqual(report.logged, []);
  assert.match(report.elements['app-container'].className, /\bvisible\b/);
  assert.doesNotMatch(report.elements['auth-container'].className, /\bvisible\b/);
  assert.match(report.elements['chat-container'].text, /demo/);
  assert.equal(report.elements['message-input'].disabled, true, 'without a key for a model nothing can be sent');
});

test('the services the rest of the page waits for are provided once it has started', async () => {
  const report = await boot({ seed: localUser });
  assert.ok(report.provided.includes('cloudRuntimeReady'));
  assert.ok(report.provided.includes('showUpdateDialog'));
});

test('the settings button opens the settings dialog and its close button closes it again', async () => {
  const opened = await boot({ seed: localUser, steps: [{ click: 'settings-btn', wait: 300 }], read: ['settings-modal'] });
  assert.deepEqual(opened.logged, []);
  assert.match(opened.elements['settings-modal'].className, /\bvisible\b/);
  const closed = await boot({ seed: localUser, steps: [{ click: 'settings-btn', wait: 300 }, { click: 'close-settings-btn', wait: 300 }], read: ['settings-modal'] });
  assert.deepEqual(closed.logged, []);
  assert.match(closed.elements['settings-modal'].className, /\bhidden\b/);
});

test('the page starts in each language of the app, greets in that language, and logs nothing as wrong', async () => {
  const greetings = new Set();
  for (const lang of ['en', 'zh-TW', 'fr', 'ru', 'es']) {
    const report = await boot({ lang, seed: { ...localUser, 'chatConfig_v_v8.6_demo': { uiLanguage: lang } }, read: ['chat-container'] });
    assert.equal(report.started, 'started', lang);
    assert.deepEqual(report.logged, [], lang);
    greetings.add(report.elements['chat-container'].text);
  }
  assert.equal(greetings.size, 5, `five languages, five greetings: ${[...greetings].join(' | ')}`);
});
