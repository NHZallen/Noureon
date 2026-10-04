import assert from 'node:assert/strict';
import test from 'node:test';

import { PROTOCOL_VERSION } from '../../server/protocol.js';
import { validateRunSpec } from '../../server/run-spec.js';

const ID_A = '123e4567-e89b-12d3-a456-426614174000';
const ID_B = '223e4567-e89b-12d3-a456-426614174001';

const good = () => ({
  protocol: PROTOCOL_VERSION,
  clientVersion: '17.4.0',
  conversationId: ID_A,
  assistantMessageId: ID_B,
  sequence: 4,
  model: { provider: 'openrouter', id: 'some/model', info: { name: 'Some model', provider: 'openrouter' } },
  request: {
    history: [{ role: 'user', parts: [{ text: 'hi' }] }, { role: 'model', parts: [{ text: 'hello' }] }],
    currentMessage: { parts: [{ text: 'what is new?' }] },
    systemInstruction: 'Answer in English.',
    generation: { temperature: 0.7 },
    language: 'en'
  },
  tools: { webSearch: 'research', searchProvider: 'tinyfish', advanced: false },
  secrets: { providerKey: 'sk-provider-secret-value', searchKey: 'search-secret-value' }
});

test('a well-formed request is accepted and only its known fields are kept', () => {
  const result = validateRunSpec(good());
  assert.equal(result.ok, true);
  assert.equal(result.spec.model.id, 'some/model');
  assert.equal(result.spec.tools.searchProvider, 'tinyfish');
  assert.equal(result.spec.secrets.providerKey, 'sk-provider-secret-value');
  const minimal = good();
  delete minimal.request.generation;
  delete minimal.tools.searchProvider;
  delete minimal.secrets.searchKey;
  const small = validateRunSpec(minimal);
  assert.equal(small.ok, true);
  assert.equal(small.spec.tools.searchProvider, 'tavily', 'the usual search service when none is named');
  assert.equal('searchKey' in small.spec.secrets, false);
});

test('a request of another protocol version is told apart from a malformed one', () => {
  const other = validateRunSpec({ ...good(), protocol: PROTOCOL_VERSION + 1 });
  assert.equal(other.ok, false);
  assert.equal(other.unsupportedProtocol, true);
  const malformed = validateRunSpec({ ...good(), clientVersion: '' });
  assert.equal(malformed.ok, false);
  assert.equal(malformed.unsupportedProtocol, undefined);
  assert.equal(validateRunSpec(null).ok, false);
  assert.equal(validateRunSpec([]).ok, false);
});

test('each mistake is named by where it is', () => {
  const broken = good();
  broken.conversationId = 'nope';
  broken.sequence = -1;
  broken.model.provider = '';
  broken.request.history = [{ role: 'robot', parts: [] }];
  broken.request.currentMessage = { parts: [] };
  broken.request.language = 'de';
  broken.tools.webSearch = 'auto';
  broken.tools.advanced = 'yes';
  broken.secrets = { providerKey: '' };
  broken.extra = 1;
  const { ok, errors } = validateRunSpec(broken);
  assert.equal(ok, false);
  const paths = errors.map((error) => error.path);
  for (const path of ['conversationId', 'sequence', 'model.provider', 'request.history[0]', 'request.currentMessage', 'request.language', 'tools.webSearch', 'tools.advanced', 'secrets.providerKey', 'extra']) {
    assert.ok(paths.includes(path), `${path} is named`);
  }
});

test('an error never repeats a value, so a key cannot end up in a message or a log', () => {
  const broken = good();
  broken.secrets = { providerKey: 'sk-provider-secret-value', stolen: 'sk-another-secret' };
  broken.model.id = 'x'.repeat(500);
  const { errors } = validateRunSpec(broken);
  const shown = JSON.stringify(errors);
  assert.doesNotMatch(shown, /sk-provider-secret-value|sk-another-secret/);
  assert.ok(errors.some((error) => error.path === 'secrets.stolen'));
});

test('size limits are kept', () => {
  const tooMany = good();
  tooMany.request.history = Array.from({ length: 2001 }, () => ({ role: 'user', parts: [{ text: 'x' }] }));
  assert.equal(validateRunSpec(tooMany).ok, false);
  const tooLong = good();
  tooLong.request.systemInstruction = 'x'.repeat(400_001);
  assert.equal(validateRunSpec(tooLong).ok, false);
  const longKey = good();
  longKey.secrets.providerKey = 'k'.repeat(601);
  assert.equal(validateRunSpec(longKey).ok, false);
});

test('the Design menu\'s choices and the files of the message are checked, and kept when right', () => {
  const given = good();
  given.tools.advanced = true;
  given.tools.designs = { deck: 'Slate' };
  given.tools.inputs = [{ name: 'a.csv', mimeType: 'text/csv', data: 'YSxi' }];
  const result = validateRunSpec(given);
  assert.equal(result.ok, true);
  assert.deepEqual(result.spec.tools.designs, { deck: 'Slate', document: 'auto' });
  assert.deepEqual(result.spec.tools.inputs, [{ name: 'a.csv', mimeType: 'text/csv', data: 'YSxi' }]);
  assert.equal('designs' in validateRunSpec(good()).spec.tools, false);

  for (const [change, path] of [
    [(spec) => { spec.tools.designs = 'Slate'; }, 'tools.designs'],
    [(spec) => { spec.tools.designs = { deck: 5 }; }, 'tools.designs.deck'],
    [(spec) => { spec.tools.inputs = 'a'; }, 'tools.inputs'],
    [(spec) => { spec.tools.inputs = [{ name: 'a' }]; }, 'tools.inputs[0]']
  ]) {
    const broken = good();
    change(broken);
    const outcome = validateRunSpec(broken);
    assert.equal(outcome.ok, false);
    assert.ok(outcome.errors.some((error) => error.path === path), path);
  }
});

test('a deep research carries its topic, searches with tools, and is not made with Python or with Gemini', () => {
  const research = () => ({ ...good(), kind: 'research', research: { topic: '  Solid-state batteries  ' }, tools: { webSearch: 'research', searchProvider: 'tavily', advanced: false } });
  const ok = validateRunSpec(research());
  assert.equal(ok.ok, true);
  assert.equal(ok.spec.kind, 'research');
  assert.deepEqual(ok.spec.research, { topic: 'Solid-state batteries' });
  assert.equal(validateRunSpec(good()).spec.kind, undefined, 'an ordinary reply has no kind');
  const paths = (input) => validateRunSpec(input).errors.map((error) => error.path);
  assert.deepEqual(paths({ ...research(), research: undefined }), ['research.topic']);
  assert.deepEqual(paths({ ...research(), research: { topic: 'x'.repeat(4001) } }), ['research.topic']);
  assert.deepEqual(paths({ ...research(), research: { topic: 'x', extra: 1 } }), ['research.extra']);
  assert.deepEqual(paths({ ...research(), tools: { ...research().tools, webSearch: 'off' } }), ['tools.webSearch']);
  assert.deepEqual(paths({ ...research(), tools: { ...research().tools, advanced: true } }), ['tools.advanced']);
  assert.deepEqual(paths({ ...research(), model: { ...research().model, provider: 'gemini' } }), ['model.provider']);
  assert.deepEqual(paths({ ...good(), research: { topic: 'x' } }), ['research'], 'a topic is only for a research');
  assert.deepEqual(paths({ ...good(), kind: 'vision' }), ['kind'], 'the visual check is not asked for from outside');
});
