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
  model: { provider: 'openrouter', id: 'some/model', info: { name: 'Some model' } },
  request: {
    history: [{ role: 'user', parts: [{ text: 'hi' }] }, { role: 'model', parts: [{ text: 'hello' }] }],
    currentMessage: { parts: [{ text: 'what is new?' }] },
    systemInstruction: 'Answer in English.',
    generation: { temperature: 0.7 },
    language: 'en'
  },
  tools: { webSearch: 'auto', searchProvider: 'tinyfish', advanced: false },
  secrets: { providerKey: 'sk-provider-secret-value', searchKey: 'search-secret-value' }
});

test('a well-formed request is accepted and only its known fields are kept', () => {
  const result = validateRunSpec(good());
  assert.equal(result.ok, true);
  assert.equal(result.spec.model.id, 'some/model');
  assert.equal(result.spec.tools.searchProvider, 'tinyfish');
  assert.equal(result.spec.secrets.providerKey, 'sk-provider-secret-value');
  const minimal = good();
  delete minimal.model.info;
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
  broken.tools.webSearch = 'sometimes';
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
