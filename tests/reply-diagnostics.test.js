import assert from 'node:assert/strict';
import test, { beforeEach } from 'node:test';

import { clearReplyDecisions, recordReplyDecision, replyDecisions } from '../src/app/runtime/diagnostics/reply-decision-log.js';
import { explainReason, formatReport, installReplyDiagnostics, REASONS, runDiagnostics, SCENARIOS } from '../src/app/runtime/diagnostics/reply-diagnostics.js';
import { createBrowserServerReply } from '../src/app/runtime/server-reply/server-reply-runtime.js';
import { planServerReply } from '../src/app/runtime/server-reply/server-reply.js';

beforeEach(() => clearReplyDecisions());

const healthy = { ok: true, protocol: 2, build: 'abc123', runs: true, sandbox: 'ok', uptimeSeconds: 7200 };
const respond = (data, status = 200) => async () => ({ ok: status < 400, status, json: async () => data });

// The parts the diagnostics read, as the page has them (the plan is the real one).
const make = ({ config = { replyRunLocation: 'server' }, account = true, conversation = { id: 'c1', model: 'm', isWebSearchEnabled: false }, health = respond(healthy), whoami = { ok: true, status: 200 }, keys = { openrouter: true }, researches = true, model = { id: 'm', provider: 'openrouter' } } = {}) => {
  const serverReply = {
    hasAccount: () => account,
    request: async () => whoami,
    plan: (context) => planServerReply({ config, ...context, hasAccount: account })
  };
  return {
    serverReply, baseUrl: 'https://api.example.test', version: '9.9.9', getConfig: () => config, getConversation: () => conversation, resolveModel: () => model,
    hasKey: (provider) => Boolean(keys[provider]), canResearch: () => researches, fetchImpl: health, online: () => true
  };
};
const runsOn = (report, name) => report.plan.find((row) => row.scenario === name);

test('a healthy page and server: every kind of reply the server can make goes to the server, and no problem is found', async () => {
  const report = await runDiagnostics(make());
  assert.deepEqual(report.problems, []);
  assert.equal(report.server.reachable, true);
  assert.equal(report.server.sandbox, 'ok');
  assert.equal(report.server.signIn.accepted, true);
  assert.equal(runsOn(report, 'plain reply').runsOn, 'server');
  assert.equal(runsOn(report, 'Python (file or data task)').runsOn, 'server');
  assert.equal(runsOn(report, 'Python + web search by the model').runsOn, 'server');
  assert.equal(report.plan.length, SCENARIOS.length);
});

test('Python with a web search packet is the one combination the server does not take, and the report says why and what to do', async () => {
  const report = await runDiagnostics(make());
  const row = runsOn(report, 'Python + web search as a packet');
  assert.equal(row.runsOn, 'this device');
  assert.equal(row.reason, 'packet-search');
  assert.match(row.meaning, /no search tool of its own/);
  assert.match(row.fix, /search key|Gemini/);
});

test('the setting "on this device" sends every reply to the device and is reported as a problem', async () => {
  const report = await runDiagnostics(make({ config: { replyRunLocation: 'local' } }));
  assert.ok(report.plan.every((row) => row.runsOn === 'this device' && row.reason === 'setting'));
  assert.ok(report.problems.some((text) => /Privacy/.test(text)));
});

test('no cloud account, a temporary chat, a missing key', async () => {
  const noAccount = await runDiagnostics(make({ account: false }));
  assert.ok(noAccount.problems.some((text) => /Not signed in/.test(text)));
  assert.ok(noAccount.plan.every((row) => row.reason === 'no-account'));
  assert.equal(noAccount.server.signIn, undefined, 'the sign-in is not asked when there is no account');

  const temporary = await runDiagnostics(make({ conversation: { id: 't', model: 'm', retentionMode: 'ephemeral' } }));
  assert.ok(temporary.plan.every((row) => row.reason === 'not-synced'));
  assert.ok(temporary.problems.some((text) => /temporary/.test(text)));

  const noKey = await runDiagnostics(make({ keys: {} }));
  assert.ok(noKey.problems.some((text) => /No API key/.test(text) && /openrouter/.test(text)));
});

test('a new empty chat (flagged isTemporary until its first message) is not a temporary chat: it is planned as the chat it becomes', async () => {
  const draft = await runDiagnostics(make({ conversation: { id: 'd', model: 'm', isTemporary: true, messages: [] } }));
  assert.equal(draft.chat.draft, true);
  assert.equal(draft.chat.temporary, false);
  assert.deepEqual(draft.problems, []);
  assert.equal(runsOn(draft, 'Python (file or data task)').runsOn, 'server');
  assert.match(formatReport(draft), /chat: new \(empty\)/);
  assert.ok(draft.notes.some((text) => /new empty chat/.test(text)));
  // The same flag on a chat that has messages is a real "temporary" state.
  const odd = await runDiagnostics(make({ conversation: { id: 'x', model: 'm', isTemporary: true, messages: [{ role: 'user' }] } }));
  assert.equal(odd.chat.temporary, true);
});

test('a server that does not answer, answers an error, or is half configured', async () => {
  const down = await runDiagnostics(make({ health: async () => { throw new Error('Failed to fetch'); } }));
  assert.equal(down.server.reachable, false);
  assert.ok(down.problems.some((text) => /did not answer \/healthz \(Failed to fetch\)/.test(text)));
  assert.equal(down.server.signIn, undefined);

  const bad = await runDiagnostics(make({ health: respond({}, 502) }));
  assert.equal(bad.server.reachable, false);
  assert.equal(bad.server.status, 502);

  const noRuns = await runDiagnostics(make({ health: respond({ ...healthy, runs: false }) }));
  assert.ok(noRuns.problems.some((text) => /switched off/.test(text)));

  const sandboxDown = await runDiagnostics(make({ health: respond({ ...healthy, sandbox: 'down' }) }));
  assert.ok(sandboxDown.problems.some((text) => /Python sandbox is down/.test(text)));

  const restarted = await runDiagnostics(make({ health: respond({ ...healthy, uptimeSeconds: 30 }) }));
  assert.ok(restarted.notes.some((text) => /redeploy/.test(text)));
});

test('a server that refuses the sign-in is reported with its code', async () => {
  const report = await runDiagnostics(make({ whoami: { ok: false, status: 401, code: 'unauthorized' } }));
  assert.equal(report.server.signIn.accepted, false);
  assert.ok(report.problems.some((text) => /did not accept this sign-in \(unauthorized\)/.test(text)));
});

test('web search on for a model that does not search by itself is explained', async () => {
  const report = await runDiagnostics(make({ conversation: { id: 'c', model: 'm', isWebSearchEnabled: true }, researches: false }));
  assert.ok(report.notes.some((text) => /does not search by itself/.test(text)));
  assert.equal(report.chat.modelSearchesByItself, false);
});

test('with no chat open the plan is for a new chat', async () => {
  const report = await runDiagnostics(make({ conversation: null, model: null }));
  assert.equal(report.chat, null);
  assert.ok(report.notes.some((text) => /No chat is open/.test(text)));
  assert.equal(runsOn(report, 'plain reply').runsOn, 'server');
});

test('the report holds no secret: no key, no token, no message text', async () => {
  const deps = make({ keys: { openrouter: true } });
  deps.getConversation = () => ({ id: 'c1', model: 'm', messages: [{ parts: [{ text: 'my secret message' }] }], isWebSearchEnabled: false });
  recordReplyDecision({ kind: 'plan', ok: true, webSearch: 'off', advanced: true, provider: 'openrouter' });
  const text = JSON.stringify(await runDiagnostics(deps)) + formatReport(await runDiagnostics(deps));
  assert.doesNotMatch(text, /my secret message|sk-|Bearer/);
});

test('every reason the page or the server can give has a meaning and a way out', () => {
  for (const reason of Object.keys(REASONS)) {
    const { meaning, fix } = explainReason(reason);
    assert.ok(meaning.length > 20 && fix.length > 5, reason);
  }
  assert.match(explainReason('something-new').meaning, /Unknown reason "something-new"/);
});

test('the text report names what runs where and the problems; the log of decisions shows the last ones', async () => {
  recordReplyDecision({ kind: 'plan', ok: false, reason: 'packet-search', advanced: true, provider: 'openrouter' });
  recordReplyDecision({ kind: 'start', ok: false, reason: 'unsupported_mode' });
  const report = await runDiagnostics(make({ config: { replyRunLocation: 'local' } }));
  const text = formatReport(report);
  assert.match(text, /Noureon diagnostics/);
  assert.match(text, /version 9\.9\.9/);
  assert.match(text, /plain reply: this device — Settings → Privacy/);
  assert.match(text, /plan: device — packet-search: Python together with a web search made as a packet/);
  assert.match(text, /start: device — unsupported_mode: The server refuses/);
  assert.match(text, /Problems:\n  - Settings → Privacy/);
  const clean = formatReport(await runDiagnostics(make()));
  assert.match(clean, /No problem found\./);
  assert.match(clean, /server: https:\/\/api\.example\.test — reachable/);
});

test('the decision log keeps the latest dozen and can be cleared', () => {
  for (let index = 0; index < 20; index += 1) recordReplyDecision({ kind: 'plan', ok: true, n: index });
  assert.equal(replyDecisions().length, 12);
  assert.equal(replyDecisions().at(-1).n, 19);
  assert.equal(replyDecisions()[0].n, 8);
  clearReplyDecisions();
  assert.deepEqual(replyDecisions(), []);
});

test('noureonDiagnose() prints the report, copies it, and returns it', async () => {
  const printed = [];
  const copied = [];
  const target = { navigator: { clipboard: { writeText: async (text) => { copied.push(text); } } } };
  const diagnose = installReplyDiagnostics(make(), { target, log: { log: (text) => printed.push(text), table: (rows) => printed.push(rows) } });
  assert.equal(target.noureonDiagnose, diagnose);
  const report = await diagnose();
  assert.equal(report.problems.length, 0);
  assert.match(printed[0], /Noureon diagnostics/);
  assert.equal(printed[1].length, SCENARIOS.length);
  assert.equal(copied[0], printed[0]);
  const refused = installReplyDiagnostics(make(), { target: { navigator: { clipboard: { writeText: async () => { throw new Error('denied'); } } } }, log: { log() {} } });
  await assert.doesNotReject(refused());
});

test('the page records where each reply was planned and what the server answered; the diagnostics\' own checks are not recorded', async () => {
  const wiring = createBrowserServerReply({
    getConfig: () => ({ replyRunLocation: 'local' }), getApiKeyForProvider: () => '', getModelApiId: () => '', getDefaultGenConfig: () => ({}), describeRequest: async () => ({}),
    getSync: () => ({ getStatus: () => ({ enabled: true }) }), getClient: async () => null, document: null
  });
  wiring.plan({ conversation: { id: 'c' }, advanced: true, provider: 'openrouter' });
  wiring.plan({ conversation: { id: 'c' }, diagnostic: true });
  const [entry, ...rest] = replyDecisions();
  assert.deepEqual(rest, []);
  assert.equal(entry.kind, 'plan');
  assert.equal(entry.ok, false);
  assert.equal(entry.reason, 'setting');
  assert.equal(entry.advanced, true);
  assert.equal(entry.provider, 'openrouter');
});
