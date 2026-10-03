import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

import { executeVisionCheck, remoteProgress, visionFiles } from '../../server/vision-check.js';
import { getFontKit } from '../../server/slides/font-kit.js';

const KEY = 'gemini-secret-value';
const USER = '323e4567-e89b-12d3-a456-426614174002';
const deckBytes = new Uint8Array(readFileSync(join(process.cwd(), 'tests', 'fixtures', 'free-deck.pptx')));
const modelInfo = { id: 'gemini-test', apiId: 'gemini-test', name: 'Gemini test', provider: 'gemini' };
const chunk = (text) => `data: ${JSON.stringify({ candidates: [{ content: { role: 'model', parts: [{ text }] }, finishReason: 'STOP' }] })}\r\n\r\n`;
const call = (name, args) => `data: ${JSON.stringify({ candidates: [{ content: { role: 'model', parts: [{ functionCall: { name, args } }] }, finishReason: 'STOP' }] })}\r\n\r\n`;
const streamResponse = (body) => new Response(body, { status: 200, headers: { 'Content-Type': 'text/event-stream' } });

const DESIGNED = JSON.stringify({
  design: { preset: 'office' },
  meta: { language: 'en', title: 'Report' },
  slides: [
    { layout: 'cover', title: 'Annual report', subtitle: 'Operations review' },
    { layout: 'bullets', title: 'Three points', bullets: ['Revenue grew 23 percent', 'Margin improved', 'Support got faster'] }
  ]
});

const specFor = ({ visionCheck = { deckDesign: 'auto', advanced: false }, history = [] } = {}) => ({
  protocol: 1,
  clientVersion: '17.5.0',
  conversationId: '123e4567-e89b-12d3-a456-426614174000',
  assistantMessageId: '223e4567-e89b-12d3-a456-426614174001',
  sequence: 4,
  model: { provider: 'gemini', id: 'gemini-test', info: modelInfo },
  request: { history, currentMessage: { parts: [{ text: 'Make me a deck.' }] }, systemInstruction: 'Be helpful.', language: 'en' },
  tools: { webSearch: 'off', searchProvider: 'tavily', advanced: false, visionCheck },
  secrets: { providerKey: KEY }
});

const designedSource = { text: `Here it is.\n\n\`\`\`\`file deck.pptx\n${DESIGNED}\n\`\`\`\``, parts: [] };
const freeSource = { text: 'Made it.', parts: [{ sandboxFile: { id: 'deck-1', name: 'deck.pptx', mimeType: 'application/vnd.openxmlformats-officedocument.presentationml.presentation', size: deckBytes.length, data: { __astraCloudAsset: { path: `${USER}/abc`, mimeType: 'x', encoding: 'base64' } } } }] };

function harness({ answers, spec = specFor(), source, decks = new Map(), sandboxHost = null, files = null, signal }) {
  const live = [];
  const written = [];
  const requests = [];
  let index = 0;
  const run = () => executeVisionCheck({
    spec: { ...spec, source },
    secrets: { providerKey: KEY },
    signal,
    userId: USER,
    files,
    sandboxHost,
    decks,
    onLive: (event) => live.push(event.vc),
    writeMessage: async (message) => { written.push(message); },
    getKit: getFontKit,
    fetchImpl: async (url, options) => {
      requests.push({ url: String(url), body: JSON.parse(options.body) });
      const answer = answers[Math.min(index, answers.length - 1)];
      index += 1;
      return streamResponse(typeof answer === 'function' ? answer(requests.at(-1)) : answer);
    }
  });
  return { run, live, written, requests };
}
const methods = (live) => live.map((event) => event.m);

test('which files of a reply are checked: designed decks and decks Python drew, only when asked and for a model that can see', () => {
  assert.equal(visionFiles({ spec: specFor(), ...designedSource }).length, 1);
  assert.equal(visionFiles({ spec: specFor(), ...freeSource }).length, 1);
  assert.equal(visionFiles({ spec: specFor(), text: 'Just words.', parts: [] }).length, 0);
  assert.equal(visionFiles({ spec: specFor({ visionCheck: null }), ...designedSource }).length, 0, 'not asked');
  const blind = { ...specFor(), model: { provider: 'openrouter', id: 'x', info: { provider: 'openrouter', id: 'x' } } };
  assert.equal(visionFiles({ spec: blind, ...designedSource }).length, 0, 'a model that cannot see images');
});

test('a deck Python drew that looks fine: it is drawn, shown to the model, and the result is written into the chat as a note', async () => {
  const { run, live, written, requests } = harness({ answers: [chunk('{"issues":[],"summary":""}')], source: freeSource, decks: new Map([['deck-1', deckBytes]]) });
  const result = await run();
  assert.deepEqual(result, { checked: 1, written: [], outcomes: ['clean'], details: [{ outcome: 'clean', name: 'deck.pptx' }] });
  assert.equal(written.length, 1, 'the result is a message of its own, so it is there on every page and after a reload');
  assert.match(written[0].parts[0].text, /nothing needs fixing/);
  assert.deepEqual(written[0].metadata.visionCheck, { note: 'clean' });
  const order = methods(live);
  assert.equal(order[0], 'begin');
  assert.ok(order.indexOf('slide') > order.indexOf('set') && order.indexOf('sheet') > order.indexOf('slide'));
  assert.equal(live.filter((event) => event.m === 'slide').length, 4);
  assert.deepEqual(live.filter((event) => event.m === 'set').map((event) => event.a[0]), ['rendering', 'reviewing']);
  assert.deepEqual(live.at(-1), { m: 'file-end', a: [{ outcome: 'clean', messageId: written[0].id }] });
  const images = requests[0].body.contents[0].parts.filter((part) => part.inlineData);
  assert.equal(images.length, 1, 'one contact sheet of four slides');
  assert.equal(images[0].inlineData.mimeType, 'image/jpeg');
  assert.match(JSON.stringify(requests[0].body.contents), /2026 年度營運報告/, 'the text of the slides is told to the model');
});

test('a deck Python drew with problems: the model is asked to redo it in the sandbox and the new deck is written as a reply', async () => {
  const issues = '{"issues":[{"slide":4,"category":"layout","problem":"The title runs over two lines","fix":"Shorten the title"}],"summary":"One problem."}';
  const newDeck = new Uint8Array([80, 75, 3, 4, 1, 2, 3]);
  const saved = [];
  const files = { save: async ({ bytes }) => { saved.push(bytes); return { __astraCloudAsset: { path: `${USER}/new`, mimeType: 'x', encoding: 'base64' } }; }, load: async () => deckBytes };
  const sandbox = { configured: true, getSandbox: (options) => ({ prepare: async () => ({}), clear: async () => ({}), mount: async () => ({}), run: async () => { options.onProgress?.({ stage: 'output', stream: 'stdout', text: 'saved\n' }); return { stdout: { text: 'saved\n', dropped: 0 }, stderr: { text: '', dropped: 0 }, error: '', elapsedMs: 5, files: [{ name: 'deck.pptx', size: newDeck.length, bytes: newDeck }], skippedFiles: [] }; }, dispose: async () => {} }) };
  const answers = [chunk(issues), call('run_python', { title: 'Fix the title', code: 'save()' }), chunk('I shortened the title.')];
  const { run, live, written } = harness({ answers, spec: specFor({ visionCheck: { deckDesign: 'auto', advanced: true } }), source: freeSource, decks: new Map([['deck-1', deckBytes]]), sandboxHost: sandbox, files });
  const result = await run();
  assert.equal(result.written.length, 1);
  assert.equal(result.written[0], '223e4567-e89b-12d3-a456-426614174001', 'the first corrected reply is the one the run was made for');
  assert.equal(written.length, 1);
  const [text, file] = written[0].parts;
  assert.match(text.text, /^```noureon-run/);
  assert.match(text.text, /The title runs over two lines/);
  assert.match(text.text, /I shortened the title\./);
  assert.equal(file.sandboxFile.name, 'deck.pptx');
  assert.equal(written[0].metadata.visionCheck.free, true);
  assert.equal(written[0].metadata.visionCheck.issues.length, 1);
  assert.deepEqual(saved[0], newDeck, 'the redone deck is kept in the person\'s storage');
  const names = methods(live);
  assert.ok(names.includes('issues') && names.includes('py') && names.includes('pyEnd'));
  assert.deepEqual(live.at(-1), { m: 'file-end', a: [{ outcome: 'fixed', messageId: result.written[0] }] });
});

test('a deck Python drew with problems, when Python cannot be used here: the deck is left as it is', async () => {
  const issues = '{"issues":[{"slide":1,"category":"text","problem":"Small text","fix":"Make it larger"}],"summary":""}';
  const { run, live, written } = harness({ answers: [chunk(issues)], source: freeSource, decks: new Map([['deck-1', deckBytes]]) });
  assert.deepEqual(await run(), { checked: 0, written: [], outcomes: ['left'], details: [{ outcome: 'left', name: 'deck.pptx', found: 1, reason: 'no_python' }] });
  assert.equal(written.length, 1, 'the person is told in the chat that problems were found and the deck was left');
  assert.match(written[0].parts[0].text, /1 issues found, but they cannot be fixed automatically here/);
  assert.deepEqual(live.at(-1), { m: 'file-end', a: [{ outcome: 'left', found: 1, messageId: written[0].id }] });
});

test('a deck from the design system with problems: the spec is corrected by the model\'s edits and written as a reply with the new file', async () => {
  const answer = '{"issues":[{"slide":2,"category":"text","problem":"The bullets are cramped","fix":"Shorten the first point"}],"edits":[{"op":"setItemText","specSlide":2,"list":"bullets","item":0,"field":"text","value":"Revenue up 23 percent"}],"summary":"Tightened."}';
  const { run, live, written } = harness({ answers: [chunk(answer)], source: designedSource });
  const result = await run();
  assert.equal(result.written.length, 1);
  const [text] = written[0].parts;
  assert.match(text.text, /The bullets are cramped/);
  assert.match(text.text, /````file deck\.pptx/);
  assert.match(text.text, /Revenue up 23 percent/);
  assert.equal(written[0].metadata.visionCheck.applied, 1);
  assert.deepEqual(live.filter((event) => event.m === 'set').map((event) => event.a[0]), ['rendering', 'reviewing', 'applying']);
});

test('an answer that cannot be read, twice: the check says why it did not finish and the deck stays', async () => {
  const { run, live, written } = harness({ answers: [chunk('I think the slides look fine.')], source: designedSource });
  const failedResult = await run();
  assert.deepEqual(failedResult.outcomes, ['failed']);
  assert.equal(failedResult.details[0].code, 'invalid_response', 'the reason is kept with the run, for whoever looks into it');
  assert.ok(failedResult.details[0].reason);
  assert.equal(written.length, 1, 'and says why in the chat');
  assert.match(written[0].parts[0].text, /did not finish/);
  const end = live.at(-1);
  assert.equal(end.m, 'file-end');
  assert.equal(end.a[0].outcome, 'failed');
  assert.equal(end.a[0].code, 'invalid_response');
  assert.equal(JSON.stringify(live).includes(KEY), false);
});

test('a note that cannot be written is told to the log, and the notice remains (the end of the check names no message)', async () => {
  const problems = [];
  const live = [];
  const result = await executeVisionCheck({
    spec: { ...specFor(), source: freeSource }, secrets: { providerKey: KEY }, userId: USER, files: null, sandboxHost: null, decks: new Map([['deck-1', deckBytes]]), getKit: getFontKit,
    onLive: (event) => live.push(event.vc), writeMessage: async () => { throw new Error('database down'); }, onProblem: (what, error) => problems.push([what, error.message]),
    fetchImpl: async () => streamResponse(chunk('{"issues":[],"summary":""}'))
  });
  assert.equal(result.checked, 1);
  assert.deepEqual(problems, [['vision_note_failed', 'database down']]);
  assert.deepEqual(live.at(-1), { m: 'file-end', a: [{ outcome: 'clean' }] });
});

test('a stop ends the check without a word about failure', async () => {
  const controller = new AbortController();
  const { run, live } = harness({
    answers: [() => { controller.abort(); return chunk('{"issues":[],"summary":""}'); }],
    source: designedSource,
    signal: controller.signal
  });
  const result = await run();
  assert.equal(result.checked, 0);
  assert.ok(live.some((event) => event.m === 'file-end' && event.a[0].outcome === 'stopped'));
  assert.equal(live.some((event) => event.a?.[0]?.outcome === 'failed'), false);
});

test('the progress is told as the page\'s own calls, so every page draws the same line', () => {
  const sent = [];
  const progress = remoteProgress((event) => sent.push(event), { language: 'en' });
  progress.set('reviewing', { model: 'M' });
  progress.thinking('hm');
  progress.thinking('');
  progress.showIssues([{ slide: 1 }]);
  const steps = progress.python();
  steps.event({ type: 'step', n: 1 });
  steps.remove();
  progress.remove();
  assert.deepEqual(sent.map((event) => event.m), ['set', 'think', 'issues', 'py', 'pyEnd', 'remove']);
});
