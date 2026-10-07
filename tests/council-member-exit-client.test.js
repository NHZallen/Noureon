import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { runCouncilResponseRenderLifecycle } from '../src/app/legacy-runtime/features/council-response-render-lifecycle.js';
import { confirmCouncilExit, councilExitTexts } from '../src/app/legacy-runtime/features/council-exit-dialog.js';
import { createResponseProgressRenderers } from '../src/app/legacy-runtime/features/response-progress-renderers.js';
import { createServerCouncil } from '../src/app/runtime/server-reply/server-council.js';
import { createServerReply } from '../src/app/runtime/server-reply/server-reply.js';
import { getCouncilRuntimeTexts } from '../src/app/runtime/legacy-core/council-runtime-texts.js';

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const escapeHTML = (value = '') => String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
const LANGUAGES = ['zh-TW', 'en', 'fr', 'ru', 'es'];

const panel = (language = 'en') => createResponseProgressRenderers({ escapeHTML, getUiLanguage: () => language, getCouncilRuntimeTexts: () => getCouncilRuntimeTexts(language) }).renderCouncilProgress;
const states = [
  { modelId: 'alpha', modelName: 'Alpha', status: 'running', detail: 'Thinking', canExit: true },
  { modelId: 'beta', modelName: 'Beta', status: 'done', detail: 'Done', canExit: false },
  { modelId: 'gamma', modelName: 'Gamma', status: 'exited', detail: 'Left', canExit: false }
];

test('the panel puts a button to leave only on a model that may leave, and says which model has left', () => {
  const html = panel()({ stage: 'firstRound', message: 'm', modelStates: states, exit: () => true, elapsedMs: 1000, activeParticipants: 3, totalParticipants: 3 });
  assert.equal((html.match(/data-council-exit=/g) || []).length, 1);
  assert.match(html, /data-council-exit="alpha"[^>]*>Leave</);
  assert.match(html, /council-progress-model exited/);
  assert.match(html, /<span class="council-progress-model-status">Left<\/span>/);
  const without = panel()({ stage: 'firstRound', message: 'm', modelStates: states, elapsedMs: 1000, activeParticipants: 3, totalParticipants: 3 });
  assert.doesNotMatch(without, /data-council-exit/, 'a council that cannot let a model leave has no button');
});

test('the words of the button and of the state exist in every language the app speaks', () => {
  for (const language of LANGUAGES) {
    const texts = getCouncilRuntimeTexts(language);
    assert.ok(texts.exitModel && texts.exited, `${language} has the button and the state`);
    const dialog = councilExitTexts(language);
    for (const key of ['title', 'message', 'cancel', 'leave']) assert.ok(dialog[key], `${language} has ${key}`);
    assert.match(dialog.message, /\{name\}/);
  }
  assert.equal(new Set(LANGUAGES.map((language) => getCouncilRuntimeTexts(language).exitModel)).size, 5, 'each in its own words');
});

// ----- the panel on the page

const pageHarness = ({ confirm }) => {
  const exits = [];
  const asked = [];
  let click;
  const contentDiv = { dataset: {}, innerHTML: '', addEventListener: (type, listener) => { if (type === 'click') click = listener; } };
  let finish;
  const waiting = new Promise((resolve) => { finish = resolve; });
  const run = runCouncilResponseRenderLifecycle({
    contentDiv,
    userParts: [{ text: 'q' }],
    signal: new AbortController().signal,
    getOutputMode: () => 'realtime',
    runModelCouncil: async (parts, signal, onProgress) => {
      onProgress({ stage: 'firstRound', startedAt: 1, elapsedMs: 0, modelStates: states, exit: (id) => { exits.push(id); return true; } });
      await waiting;
      return { text: 'done', metadata: null };
    },
    renderCouncilProgress: () => 'panel',
    createStreamingMarkdownRenderer: () => ({ appendText() {}, finish() {}, getText: () => '' }),
    appendRendererTextGradually: async () => {},
    startProgressTicker: () => 1,
    stopProgressTicker: () => {},
    setCouncilRunning: () => {},
    renderCouncilControls: () => {},
    renderInputIndicators: () => {},
    requestFrame: (callback) => callback(),
    confirmExit: async (info) => { asked.push(info); return confirm; }
  });
  const press = (id) => click({ target: { closest: () => (id ? { dataset: { councilExit: id } } : null) } });
  return { exits, asked, press, finish: async () => { finish(); return run; } };
};

test('a model leaves when the person presses its button and says yes', async () => {
  const h = pageHarness({ confirm: true });
  await new Promise((resolve) => setTimeout(resolve, 0));
  await h.press('alpha');
  assert.deepEqual(h.asked, [{ modelName: 'Alpha' }], 'asked, by the name of the model');
  assert.deepEqual(h.exits, ['alpha']);
  await h.finish();
});

test('nothing happens when the person says no, or presses where there is no button', async () => {
  const no = pageHarness({ confirm: false });
  await new Promise((resolve) => setTimeout(resolve, 0));
  await no.press('alpha');
  assert.deepEqual(no.asked.length, 1);
  assert.deepEqual(no.exits, [], 'the model stays');
  await no.press(null);
  assert.equal(no.asked.length, 1, 'a press elsewhere on the panel asks nothing');
  await no.finish();
});

test('the question is put with the page\'s dialog: cancel keeps the model, leave lets it go', async () => {
  const seen = [];
  const showCustomDialog = (options) => { seen.push(options); return Promise.resolve(options.buttons[1].value()); };
  assert.equal(await confirmCouncilExit({ showCustomDialog, language: 'en', modelName: 'Alpha <b>' }), true);
  const [options] = seen;
  assert.match(options.message, /"Alpha <b>" will leave this council/);
  assert.equal(options.buttons[0].value(), false);
  assert.equal(options.buttons[0].text, 'Cancel');
  assert.equal(options.buttons[1].text, 'Leave');
  seen.length = 0;
  await confirmCouncilExit({ showCustomDialog, language: 'zh-TW', modelName: 'Alpha' });
  assert.match(seen[0].message, /「Alpha」會退出這場會議/);
  assert.equal(seen[0].title, '讓這個模型退出？');
});

// ----- a council the server holds

test('on a council the server holds, leaving is asked of the server, and the page sees the state the server reports', async () => {
  const exited = [];
  const progress = [];
  const hold = createServerCouncil({
    plan: () => ({ ok: true }),
    start: async () => ({ ok: true, run: {
      exitMember: async (modelId) => { exited.push(modelId); },
      follow: async ({ onCouncil }) => { onCouncil({ stage: 'firstRound', elapsedMs: 3000, modelStates: states }); return { text: 'x', run: null, rewritten: false }; }
    } }),
    notify: () => {},
    getCouncilSelectedModels: () => ({ council: {}, participants: [], synthesizer: {} }),
    now: () => 10_000
  });
  await hold({ args: [[{ text: 'q' }], undefined, (state) => progress.push(state), () => {}], local: async () => ({}), conversation: { id: 'c1', council: {} }, assistantMessageId: 'm1' });
  assert.equal(progress[0].modelStates[0].canExit, true, 'what the server says about who may leave');
  await progress[0].exit('alpha');
  assert.deepEqual(exited, ['alpha']);
});

test('the request to let a model leave goes to the council on the server', async () => {
  const calls = [];
  const reply = createServerReply({
    getAccessToken: async () => 'token-123',
    getApiKeyForProvider: () => 'k',
    getModelApiId: (model) => model.id,
    getDefaultGenConfig: () => ({}),
    describeRequest: async () => ({ systemInstructionText: '' }),
    flushSync: async () => {},
    readMessage: async () => null,
    findLiveRun: async () => ({ id: 'run-9', message_id: 'm9', kind: 'council' }),
    fetchImpl: async (url, options) => { calls.push({ url: String(url), options }); return new Response('{"ok":true}', { status: 200 }); },
    clientVersion: '17.12.0',
    wait: async () => {}
  });
  const run = await reply.find('c1');
  await run.exitMember('alpha');
  assert.equal(calls[0].url, 'https://api.noureon.com/v1/runs/run-9/member');
  assert.equal(calls[0].options.method, 'POST');
  assert.deepEqual(JSON.parse(calls[0].options.body), { modelId: 'alpha' });
  assert.equal(calls[0].options.headers.Authorization, 'Bearer token-123');
});

test('the page asks the question when the person presses the button (source of the wiring and the style)', () => {
  const lifecycle = read('src/app/runtime/legacy-core/submit-input-council-lifecycle.js');
  assert.match(lifecycle, /confirmExit:\s*\(\{ modelName \}\)\s*=>\s*import\('\.\.\/\.\.\/legacy-runtime\/features\/council-exit-dialog\.js'\)/);
  const css = read('src/styles/model-council.css');
  assert.match(css, /\.council-progress-exit\s*\{/);
  assert.match(css, /\.council-progress-dot\.exited/);
});
