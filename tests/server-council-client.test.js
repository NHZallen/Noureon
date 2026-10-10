import assert from 'node:assert/strict';
import test from 'node:test';

import { createServerCouncil } from '../src/app/runtime/server-reply/server-council.js';
import { createServerReplyReattach } from '../src/app/runtime/server-reply/reattach.js';
import { createServerReply, LOCAL_REASONS, planServerCouncil } from '../src/app/runtime/server-reply/server-reply.js';
import { NOURAS_REQUEST_PURPOSE } from '../src/app/runtime/nouras/nouras-policy.js';

const KEYS = { openrouter: 'sk-or-key-value', nvidia: 'nv-key-value', gemini: 'gm-key-value', tavily: 'tvly-key', tinyfish: 'tf-key' };
const MESSAGE_ID = '223e4567-e89b-12d3-a456-426614174001';
const MEMBER_A = { provider: 'openrouter', id: 'anthropic/claude-haiku-5.5', name: 'Haiku' };
const MEMBER_B = { provider: 'nvidia', id: 'nvidia/deepseek', name: 'DeepSeek' };
const SYNTH = { provider: 'openrouter', id: 'anthropic/claude-sonnet-5.5', name: 'Sonnet' };
const GEMINI = { provider: 'gemini', id: 'gemini-2.5-flash', name: 'Gemini' };
const CONVERSATION = {
  id: '323e4567-e89b-12d3-a456-426614174002',
  messages: [
    { role: 'user', parts: [{ text: 'earlier' }], createdAt: 'x' },
    { role: 'model', parts: [{ text: 'answer' }], createdAt: 'y' },
    { role: 'user', parts: [{ text: 'compare plans' }], createdAt: 'z' }
  ]
};
const COUNCIL = { enabled: true, mode: 'deliberation', participantModelIds: [MEMBER_A.id, MEMBER_B.id], synthesizerModelId: SYNTH.id, showRawResponses: true, showComparisonTable: false };

function harness(overrides = {}) {
  const calls = [];
  const described = [];
  const reply = createServerReply({
    getAccessToken: async () => 'token-123',
    getApiKeyForProvider: (name) => overrides.keys?.[name] ?? KEYS[name] ?? '',
    getModelApiId: (model) => model.id,
    getDefaultGenConfig: () => ({ temperature: 0.7 }),
    describeRequest: async (parts, options) => {
      described.push(options);
      if (options.requestPurpose === NOURAS_REQUEST_PURPOSE.COUNCIL_SYNTHESIS) options.onMemoryContextResolved?.({ marker: 'memory' });
      return { systemInstructionText: `SYS for ${options.requestPurpose}` };
    },
    flushSync: async () => {},
    readMessage: async () => null,
    fetchImpl: overrides.fetchImpl || (async (url, options) => { calls.push({ url, options }); return new Response(JSON.stringify({ runId: 'run-1' }), { status: 202 }); }),
    clientVersion: '17.11.0',
    wait: async () => {},
    ...overrides.deps
  });
  return { reply, calls, described };
}
const startArgs = (extra = {}) => ({
  conversation: CONVERSATION,
  council: COUNCIL,
  participants: [MEMBER_A, MEMBER_B],
  synthesizer: SYNTH,
  userParts: [{ text: 'compare plans' }],
  webSearch: 'off',
  config: {},
  assistantMessageId: MESSAGE_ID,
  sequence: 3,
  uiLanguage: 'en',
  ...extra
});

test('a council is held by the server unless the person chose this device, there is no account, or the chat is temporary', () => {
  assert.deepEqual(planServerCouncil({ config: {} }), { ok: true });
  assert.equal(planServerCouncil({ config: { replyRunLocation: 'local' } }).reason, LOCAL_REASONS.setting);
  assert.equal(planServerCouncil({ config: {}, hasAccount: false }).reason, LOCAL_REASONS.noAccount);
  assert.equal(planServerCouncil({ config: {}, conversation: { isTemporary: true } }).reason, LOCAL_REASONS.notSynced);
});

test('a council is handed over with its models, the history, what each kind of call is told, and one key for each provider', async () => {
  const { reply, calls, described } = harness();
  const seen = [];
  const result = await reply.startCouncil(startArgs({ onMemoryContextResolved: (memory) => seen.push(memory), getHistorySourceIds: () => ['h1'] }));
  assert.equal(result.ok, true);
  assert.equal(result.run.kind, 'council');
  const spec = JSON.parse(calls[0].options.body);
  assert.equal(calls[0].url, 'https://api.noureon.com/v1/runs');
  assert.equal(spec.kind, 'council');
  assert.equal(spec.sequence, 3);
  assert.deepEqual(spec.council.participants.map((model) => model.id), [MEMBER_A.id, MEMBER_B.id]);
  assert.deepEqual(spec.council.synthesizer, { provider: 'openrouter', id: SYNTH.id, info: SYNTH });
  assert.equal(spec.council.translator, null);
  assert.equal(spec.council.mode, 'deliberation');
  assert.equal(spec.council.showComparisonTable, false);
  assert.deepEqual(spec.request.history, [{ role: 'user', parts: [{ text: 'earlier' }] }, { role: 'model', parts: [{ text: 'answer' }] }], 'the message being answered is not in the history');
  assert.deepEqual(spec.request.currentMessage, { parts: [{ text: 'compare plans' }] });
  assert.equal(spec.request.systemInstructions.participant, `SYS for ${NOURAS_REQUEST_PURPOSE.COUNCIL_PARTICIPANT}`);
  assert.equal(spec.request.systemInstructions.deliberation, spec.request.systemInstructions.participant);
  assert.equal(spec.request.systemInstructions.synthesis, `SYS for ${NOURAS_REQUEST_PURPOSE.COUNCIL_SYNTHESIS}`);
  assert.deepEqual(spec.request.messageMetadata, { historySourceConversationIds: ['h1'] });
  assert.deepEqual(spec.secrets, { keys: { openrouter: KEYS.openrouter, nvidia: KEYS.nvidia } }, 'only the providers the models use');
  assert.deepEqual(spec.tools, { webSearch: 'off' });
  assert.deepEqual(seen, [{ marker: 'memory' }], 'the memory the answer drew on is reported once, by the synthesis');
  assert.ok(described.every((options) => options.modelInfo === SYNTH));
  assert.deepEqual(described.find((options) => options.requestPurpose === NOURAS_REQUEST_PURPOSE.COUNCIL_SYNTHESIS).historyForApi, []);
});

test('a council that searches sends both search keys and the depth; one with a Gemini synthesizer searches by itself', async () => {
  const one = harness();
  await one.reply.startCouncil(startArgs({ webSearch: 'on', config: { searchProvider: 'tinyfish', tavilySearchDepth: 'advanced' } }));
  const spec = JSON.parse(one.calls[0].options.body);
  assert.deepEqual(spec.tools, { webSearch: 'on', searchProvider: 'tinyfish', searchDepth: 'advanced' });
  assert.equal(spec.secrets.searchKey, KEYS.tinyfish);
  assert.equal(spec.secrets.searchKeyAlt, KEYS.tavily);

  const gemini = harness();
  await gemini.reply.startCouncil(startArgs({ participants: [MEMBER_A, GEMINI], synthesizer: GEMINI, webSearch: 'on' }));
  const geminiSpec = JSON.parse(gemini.calls[0].options.body);
  assert.deepEqual(geminiSpec.tools, { webSearch: 'on' });
  assert.equal('searchKey' in geminiSpec.secrets, false);
  assert.deepEqual(Object.keys(geminiSpec.secrets.keys).sort(), ['gemini', 'openrouter']);

  const noKey = harness({ keys: { tavily: '', tinyfish: '' } });
  const refused = await noKey.reply.startCouncil(startArgs({ webSearch: 'on' }));
  assert.deepEqual(refused, { ok: false, reason: LOCAL_REASONS.packetSearch, notify: false });
  assert.equal(noKey.calls.length, 0, 'no search key: the council is held here, where the missing key is told');
});

test('attachments go as they are, with the model that writes them down; a missing key, a request too large, or an older server hold the council here', async () => {
  const translator = { provider: 'gemini', id: 'gemini-2.5-flash', name: 'T' };
  const { reply, calls } = harness();
  const parts = [{ text: 'read this' }, { inlineData: { mimeType: 'application/pdf', data: 'AAAA', name: 'a.pdf' } }];
  await reply.startCouncil(startArgs({ userParts: parts, translator }));
  const spec = JSON.parse(calls[0].options.body);
  assert.deepEqual(spec.request.currentMessage.parts, parts);
  assert.equal(spec.council.translator.id, translator.id);
  assert.equal(spec.secrets.keys.gemini, KEYS.gemini, 'the translator\'s provider needs its key too');

  const missing = harness({ keys: { nvidia: '' } });
  assert.deepEqual(await missing.reply.startCouncil(startArgs()), { ok: false, reason: 'no-key', notify: false });
  assert.equal(missing.calls.length, 0);

  const huge = harness();
  assert.deepEqual(await huge.reply.startCouncil(startArgs({ userParts: [{ text: 'x'.repeat(21 * 1024 * 1024) }] })), { ok: false, reason: LOCAL_REASONS.tooLarge, notify: false });

  const old = harness({ fetchImpl: async () => new Response(JSON.stringify({ error: { code: 'invalid_run_spec' } }), { status: 400 }) });
  assert.deepEqual(await old.reply.startCouncil(startArgs()), { ok: false, reason: 'invalid_run_spec', notify: false });
  const busy = harness({ fetchImpl: async () => new Response(JSON.stringify({ error: { code: 'too_many_runs' } }), { status: 429 }) });
  assert.equal((await busy.reply.startCouncil(startArgs())).notify, 'busy');
});

// ----- the call the page makes

const holdHarness = ({ plan = { ok: true }, started, follow } = {}) => {
  const record = { starts: [], notices: [], local: [] };
  const hold = createServerCouncil({
    plan: () => plan,
    start: async (args) => { record.starts.push(args); return started ?? { ok: true, run: { follow } }; },
    notify: (kind, language) => record.notices.push([kind, language]),
    getCouncilSelectedModels: () => ({ council: COUNCIL, participants: [MEMBER_A, MEMBER_B], synthesizer: SYNTH }),
    getCouncilTranslatorModel: () => ({ provider: 'gemini', id: 'translator' }),
    getConfig: () => ({ searchProvider: 'tavily' }),
    getUiLanguage: () => 'fr',
    now: () => 10_000
  });
  const local = async (...args) => { record.local.push(args); return { text: 'LOCAL', metadata: { local: true } }; };
  return { hold, record, local };
};
const call = ({ hold, local }, extra = {}) => {
  const progress = [];
  const chunks = [];
  const promise = hold({
    args: [[{ text: 'q' }], undefined, (state) => progress.push(state), (chunk) => chunks.push(chunk)],
    local,
    webSearchEnabled: true,
    conversation: { ...CONVERSATION, council: COUNCIL },
    assistantMessageId: MESSAGE_ID,
    sequence: 3,
    ...extra
  });
  return { promise, progress, chunks };
};

test('a council the server holds: its panel and the words of the synthesis reach the page as the page\'s own council would give them', async () => {
  const h = holdHarness({
    follow: async ({ onText, onCouncil }) => {
      onCouncil({ stage: 'firstRound', elapsedMs: 4000, modelStates: [{ modelId: 'a', status: 'running' }] });
      onCouncil({ stage: 'synthesis', elapsedMs: 9000, modelStates: [{ modelId: 'a', status: 'done' }] });
      onText('Hel');
      onText('lo');
      return { text: 'Hello', run: null, rewritten: false };
    }
  });
  const { promise, progress, chunks } = call(h);
  const result = await promise;
  assert.equal(result.text, 'Hello');
  assert.deepEqual(chunks, ['Hel', 'lo']);
  assert.deepEqual(progress.map((state) => [state.stage, state.tick]), [['firstRound', 1], ['synthesis', 2]]);
  assert.equal(progress[0].startedAt, 6000, 'the page counts the seconds on from the server\'s');
  assert.deepEqual(result.metadata.participantModelIds, COUNCIL.participantModelIds, 'the page can tell that this was a council');
  assert.equal(h.record.local.length, 0);
  assert.equal(h.record.starts[0].webSearch, 'on');
  assert.equal(h.record.starts[0].translator, null, 'no attachments: no translator');
  assert.equal(h.record.starts[0].assistantMessageId, MESSAGE_ID);
  assert.equal(h.record.starts[0].uiLanguage, 'fr');
});

test('a council with attachments names the model that writes them down', async () => {
  const h = holdHarness({ follow: async () => ({ text: 'x', run: null, rewritten: false }) });
  await call(h, { args: [[{ text: 'q' }, { inlineData: { mimeType: 'image/png', data: 'AAAA' } }], undefined, () => {}, () => {}] }).promise;
  assert.equal(h.record.starts[0].translator.id, 'translator');
});

test('a council the server does not take is held here as usual, and the person is told only when it matters', async () => {
  const declined = holdHarness({ started: { ok: false, reason: 'unreachable', notify: 'unreachable' } });
  const result = await call(declined).promise;
  assert.equal(result.text, 'LOCAL');
  assert.deepEqual(declined.record.notices, [['unreachable', 'fr']]);
  const [args] = declined.record.local;
  assert.equal(args.length, 5, 'the page\'s four arguments, then what its own council needs');
  assert.equal(args[4].webSearchEnabled, true);
  assert.equal(args[4].conversation.id, CONVERSATION.id);

  const quiet = holdHarness({ started: { ok: false, reason: 'invalid_run_spec', notify: false } });
  assert.equal((await call(quiet).promise).text, 'LOCAL');
  assert.deepEqual(quiet.record.notices, []);

  const refused = holdHarness({ plan: { ok: false, reason: 'no-account' } });
  assert.equal((await call(refused).promise).text, 'LOCAL');
  assert.equal(refused.record.starts.length, 0, 'the server is not asked');

  const unnamed = holdHarness({ follow: async () => ({ text: 'x' }) });
  assert.equal((await call(unnamed, { assistantMessageId: null }).promise).text, 'LOCAL');
  assert.equal(unnamed.record.starts.length, 0);
});

test('a council the server is still holding (found again after the page was closed) is followed without being started again', async () => {
  const h = holdHarness({ started: { ok: false } });
  const run = { follow: async ({ onText }) => { onText('Back'); return { text: 'Back again', run: null, rewritten: true }; } };
  const { promise, chunks } = call(h, { resumeRun: run, assistantMessageId: 'from-run' });
  const result = await promise;
  assert.equal(result.text, 'Back again');
  assert.deepEqual(chunks, ['Back']);
  assert.equal(h.record.starts.length, 0);
  assert.equal(h.record.local.length, 0);
});

test('an error the server reports is the error of the council', async () => {
  const failing = holdHarness({ follow: async () => { throw Object.assign(new Error('The provider said no'), { serverRun: true }); } });
  await assert.rejects(() => call(failing).promise, (error) => error.serverRun === true && error.message === 'The provider said no');
});

test('a council the server is holding, found when the page opens again, is followed as a council', async () => {
  const conv = { id: 'c1', messages: [{ id: 'u1', role: 'user', parts: [{ text: 'compare' }] }, { id: 'a1', role: 'model', parts: [{ text: 'Part' }] }] };
  const completed = [];
  const lifecycle = createServerReplyReattach({
    getActiveConversation: () => conv,
    getAbortController: () => null,
    setAbortController() {},
    serverReply: { find: async () => ({ kind: 'council', runId: 'r1', assistantMessageId: 'a1', follow: async () => ({}) }) },
    messageList: () => ({ children: [] }),
    setSubmitBusy() {},
    addMessageToUI: () => ({ querySelector: () => ({}), scrollIntoView() {} }),
    completeReply: async (prepared, options) => { completed.push({ prepared, options }); },
    document: null,
    window: null,
    scheduleTimeout: () => null
  });
  assert.equal(await lifecycle.reattachServerReply(), true);
  assert.equal(completed[0].prepared.responseUsesCouncil, true);
  assert.equal(completed[0].options.resumeRun.kind, 'council');
});

test('the live channel tells the page how the council stands, also a page that joins while it goes on', async () => {
  const encoder = new TextEncoder();
  const events = [{ r: { answer: '', thought: { text: '', kind: 'model' }, sources: [], cs: { stage: 'firstRound', elapsedMs: 5000 } } }, { cs: { stage: 'synthesis', elapsedMs: 9000 } }, { a: 'Done' }, { done: 'complete' }];
  const body = new ReadableStream({ start(controller) { for (const event of events) controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`)); controller.close(); } });
  const reply = createServerReply({
    getAccessToken: async () => 'token-123',
    getApiKeyForProvider: () => KEYS.openrouter,
    getModelApiId: (model) => model.id,
    getDefaultGenConfig: () => ({}),
    describeRequest: async () => ({ systemInstructionText: '' }),
    flushSync: async () => {},
    readMessage: async () => ({ parts: [{ text: 'Done' }], status: 'complete', metadata: null }),
    findLiveRun: async () => ({ id: 'run-1', message_id: MESSAGE_ID, kind: 'council' }),
    fetchImpl: async (url) => (String(url).endsWith('/stream') ? new Response(body, { status: 200, headers: { 'Content-Type': 'text/event-stream' } }) : new Response('{}', { status: 200 })),
    clientVersion: '17.11.0',
    wait: async () => {},
    paceMs: 0
  });
  const run = await reply.find(CONVERSATION.id);
  assert.equal(run.kind, 'council');
  const stages = [];
  const result = await run.follow({ onCouncil: (state) => stages.push(state.stage), onText: () => {} });
  assert.deepEqual(stages, ['firstRound', 'synthesis']);
  assert.equal(result.text, 'Done');
});

test('the page asks the server for its council through the same call, and gives the server what it needs (source of the wiring)', async () => {
  const { readFileSync } = await import('node:fs');
  const lifecycle = readFileSync(new URL('../src/app/runtime/legacy-core/submit-input-council-lifecycle.js', import.meta.url), 'utf8');
  assert.match(lifecycle, /runModelCouncil:\s*\(\.\.\.args\)\s*=>\s*serverReply\.council\(\{[^}]*args,\s*local:\s*runModelCouncil,\s*webSearchEnabled,\s*conversation:\s*conv,[^}]*assistantMessageId,\s*sequence:\s*conv\.messages\.length,\s*resumeRun/s);
  assert.match(lifecycle, /createBrowserServerReply\(\{[^]*?getCouncilSelectedModels,\s*getCouncilTranslatorModel,/);
  const core = readFileSync(new URL('../src/app/runtime/legacy-core/legacy-core.js', import.meta.url), 'utf8');
  assert.match(core, /getCouncilTexts,\s*getCouncilTranslatorModel,\s*getCouncilValidation,/, 'the model that writes attachments down is given to the lifecycle');
  const reattach = readFileSync(new URL('../src/app/runtime/server-reply/reattach.js', import.meta.url), 'utf8');
  assert.match(reattach, /responseUsesCouncil:\s*run\.kind === 'council'/);
});

test('what the page sends is what the server accepts (the request of every kind of council passes the server\'s own check)', async () => {
  const { validateRunSpec } = await import('../server/run-spec.js');
  const translator = { provider: 'gemini', id: 'gemini-2.5-flash', name: 'T' };
  const variants = [
    startArgs(),
    startArgs({ webSearch: 'on', config: { searchProvider: 'tavily', tavilySearchDepth: 'advanced' } }),
    startArgs({ participants: [MEMBER_A, GEMINI], synthesizer: GEMINI, webSearch: 'on' }),
    startArgs({ userParts: [{ text: 'read' }, { inlineData: { mimeType: 'application/pdf', data: 'AAAA', name: 'a.pdf' } }], translator }),
    startArgs({ council: { ...COUNCIL, mode: 'consensus', showRawResponses: false }, getHistorySourceIds: () => ['h1', 'h2'] })
  ];
  for (const args of variants) {
    const { reply, calls } = harness();
    await reply.startCouncil(args);
    const checked = validateRunSpec(JSON.parse(calls[0].options.body));
    assert.equal(checked.ok, true, JSON.stringify(checked.errors));
    assert.equal(checked.spec.kind, 'council');
  }
});

test('the skills asked for with "/" in the message are in what every kind of council call is told, and nothing is added when none was asked for', async () => {
  const { registerSkillMode } = await import('../src/app/runtime/skill/skill-bridge.js');
  const { skillIndicatorId } = await import('../src/data/skill-prompt.js');
  registerSkillMode({ resolve: async (names) => names.filter((name) => name === 'meeting-notes').map((name) => ({ name, body: 'List the decisions first.' })) });
  try {
    const asked = harness();
    await asked.reply.startCouncil(startArgs({ userParts: [{ text: 'compare plans', displaySegments: [{ type: 'mode', indicatorId: skillIndicatorId('meeting-notes'), label: 'meeting-notes' }, { type: 'text', text: 'compare plans' }] }] }));
    assert.equal(asked.described.length, 2);
    for (const options of asked.described) assert.match(options.additionalSystemInstruction, /<skill name="meeting-notes">\nList the decisions first\.\n<\/skill>/);
    const plain = harness();
    await plain.reply.startCouncil(startArgs());
    for (const options of plain.described) assert.equal('additionalSystemInstruction' in options, false);
  } finally {
    registerSkillMode(null);
  }
});
