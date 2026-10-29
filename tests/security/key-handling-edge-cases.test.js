import assert from 'node:assert/strict';
import test from 'node:test';

import {
  markApiKeyInputCleared,
  markApiKeyInputDirty,
  prepareApiKeyInput,
  readApiKeyInputIntent
} from '../../src/app/runtime/security/api-key-input-intent.js';
import {
  createExportSafeConfig,
  isMaskedApiKeyDisplayValue,
  isSensitiveConfigKey,
  maskApiKeyForDisplay,
  redactApiKey,
  redactApiKeys,
  redactSensitiveConfig,
  removeSensitiveConfig,
  SENSITIVE_API_KEY_FIELDS
} from '../../src/app/runtime/security/sensitive-config-redaction.js';
import {
  createSensitiveConfigPersistence,
  createSensitiveConfigStore,
  normalizeProviderKey
} from '../../src/app/runtime/security/sensitive-config-store.js';

// The rules for keys that the earlier tests left open (found by mutation testing, `npm run test:mutation`).

const MASK = '************';
const input = (value = '', dataset = {}) => ({ value, dataset: { ...dataset } });

// --- what the settings page does with a key field ----------------------------------------------------------------------------------

test('a field is prepared from the stored key: shown masked, marked masked or empty, not changed, for the provider it belongs to', () => {
  const stored = input();
  prepareApiKeyInput(stored, { provider: 'gemini', rawValue: 'gemini-secret-value-1234' });
  assert.match(stored.value, /^gemini-s\*+1234$/);
  assert.deepEqual(stored.dataset, { apiKeyProvider: 'gemini', apiKeyState: 'masked', apiKeyDirty: 'false', apiKeyCleared: 'false' });

  const empty = input('typed');
  prepareApiKeyInput(empty, { rawValue: '' });
  assert.equal(empty.value, '');
  assert.deepEqual(empty.dataset, { apiKeyProvider: '', apiKeyState: 'empty', apiKeyDirty: 'false', apiKeyCleared: 'false' });

  assert.doesNotThrow(() => prepareApiKeyInput(null, { provider: 'x', rawValue: 'y' }));
  assert.doesNotThrow(() => prepareApiKeyInput(input(), undefined));
  assert.doesNotThrow(() => prepareApiKeyInput({ value: '' }, { provider: 'x', rawValue: 'y' }), 'a field without a dataset is left alone');
});

test('typing in a field marks it changed; emptying it marks it cleared', () => {
  const typed = input('new-key');
  markApiKeyInputDirty(typed);
  assert.deepEqual(typed.dataset, { apiKeyState: 'dirty', apiKeyDirty: 'true', apiKeyCleared: 'false' });
  for (const value of ['', '   ', undefined]) {
    const emptied = { value, dataset: {} };
    markApiKeyInputDirty(emptied);
    assert.deepEqual(emptied.dataset, { apiKeyState: 'cleared', apiKeyDirty: 'true', apiKeyCleared: 'true' }, JSON.stringify(value));
  }
  assert.doesNotThrow(() => markApiKeyInputDirty(null));
});

test('clearing a field empties it and marks it cleared', () => {
  const field = input('something', { apiKeyProvider: 'gemini' });
  markApiKeyInputCleared(field);
  assert.equal(field.value, '');
  assert.deepEqual(field.dataset, { apiKeyProvider: 'gemini', apiKeyState: 'cleared', apiKeyDirty: 'true', apiKeyCleared: 'true' });
  assert.doesNotThrow(() => markApiKeyInputCleared(null));
});

test('what a field means when the page is saved: nothing, a new key, or no key', () => {
  assert.deepEqual(readApiKeyInputIntent(null), { action: 'unchanged', provider: '' });
  assert.deepEqual(readApiKeyInputIntent(undefined), { action: 'unchanged', provider: '' });

  // A field the page never prepared: a key in it is a new key; an empty one is nothing.
  assert.deepEqual(readApiKeyInputIntent({ value: '  sk-new  ' }), { action: 'set', provider: '', value: 'sk-new' });
  assert.deepEqual(readApiKeyInputIntent({ value: undefined }), { action: 'unchanged', provider: '' });
  assert.deepEqual(readApiKeyInputIntent(input('sk-new')), { action: 'set', provider: '', value: 'sk-new' });
  assert.deepEqual(readApiKeyInputIntent(input(`abc${MASK}xyz`)), { action: 'unchanged', provider: '' }, 'a masked display is not a key');

  // A prepared field.
  assert.deepEqual(readApiKeyInputIntent(input(`abc${MASK}xyz`, { apiKeyState: 'masked', apiKeyDirty: 'false', apiKeyProvider: 'gemini' })), { action: 'unchanged', provider: 'gemini' });
  assert.deepEqual(readApiKeyInputIntent(input('', { apiKeyState: 'empty', apiKeyDirty: 'false' })), { action: 'unchanged', provider: '' });
  assert.deepEqual(readApiKeyInputIntent(input('typed', { apiKeyState: 'empty', apiKeyDirty: 'false' })), { action: 'unchanged', provider: '' }, 'text that was not marked as typed is not taken');
  assert.deepEqual(readApiKeyInputIntent(input(' sk-typed ', { apiKeyState: 'dirty', apiKeyDirty: 'true', apiKeyProvider: 'openrouter' })), { action: 'set', provider: 'openrouter', value: 'sk-typed' });
  assert.deepEqual(readApiKeyInputIntent(input(`abc${MASK}xyz`, { apiKeyState: 'dirty', apiKeyDirty: 'true' })), { action: 'unchanged', provider: '' }, 'a masked display typed over is still not a key');
});

test('a key is cleared when the field was cleared by the button, by state, by flag, or typed empty', () => {
  assert.deepEqual(readApiKeyInputIntent(input('', { apiKeyState: 'cleared', apiKeyProvider: 'tavily' })), { action: 'clear', provider: 'tavily' });
  assert.deepEqual(readApiKeyInputIntent(input('', { apiKeyState: 'masked', apiKeyCleared: 'true' })), { action: 'clear', provider: '' }, 'the flag alone is enough');
  assert.deepEqual(readApiKeyInputIntent(input('', { apiKeyState: 'cleared', apiKeyCleared: 'false' })), { action: 'clear', provider: '' }, 'the state alone is enough');
  assert.deepEqual(readApiKeyInputIntent(input('', { apiKeyState: 'dirty', apiKeyDirty: 'true' })), { action: 'clear', provider: '' }, 'typed empty');
  assert.deepEqual(readApiKeyInputIntent(input('   ', { apiKeyState: 'dirty', apiKeyDirty: 'true' })), { action: 'clear', provider: '' });
  assert.deepEqual(readApiKeyInputIntent(input('sk-x', { apiKeyState: 'cleared' })), { action: 'clear', provider: '' }, 'cleared wins over text left in the field');
  assert.deepEqual(readApiKeyInputIntent({ value: '', dataset: { apiKeyDirty: 'true' } }), { action: 'clear', provider: '' });
  assert.deepEqual(readApiKeyInputIntent({ value: '' }), { action: 'unchanged', provider: '' }, 'no marks at all is no change');
});

// --- showing and hiding keys -------------------------------------------------------------------------------------------------------

test('redacting a key keeps the last four characters and hides the rest; what is kept can be chosen', () => {
  assert.equal(redactApiKey(null), '');
  assert.equal(redactApiKey(undefined), '');
  assert.equal(redactApiKey(''), '');
  assert.equal(redactApiKey('abcdefgh1234'), '********1234');
  assert.equal(redactApiKey(12345678), '********5678', 'a number is read as text');
  assert.equal(redactApiKey('abcdefgh1234', { visiblePrefix: 3 }), 'abc********1234');
  assert.equal(redactApiKey('abcdefgh1234', { visiblePrefix: 0 }), '********1234');
  assert.equal(redactApiKey('abcdefgh1234', { visiblePrefix: -2 }), '********1234');
  assert.equal(redactApiKey('abcdefgh1234', { visibleSuffix: 0 }), '********');
  assert.equal(redactApiKey('abcdefgh1234', { visibleSuffix: -1 }), '********');
  assert.equal(redactApiKey('abcdefgh1234', { visibleSuffix: 2, visiblePrefix: 1, mask: '#' }), 'a#34');
});

test('a key shown on the settings page: long keys show the start and the end; short ones keep a mask between what they show', () => {
  assert.equal(maskApiKeyForDisplay(null), '');
  assert.equal(maskApiKeyForDisplay(''), '');
  assert.equal(maskApiKeyForDisplay('sk-or-v1-abcdefghijklmnop1234'), `sk-or-v1${MASK}1234`);
  assert.equal(maskApiKeyForDisplay('123456789012'), `1234${MASK}2`, 'twelve characters is already "short"');
  assert.equal(maskApiKeyForDisplay('1234567890123'), `12345678${MASK}0123`, 'thirteen is long');
  assert.equal(maskApiKeyForDisplay('a'), `a${MASK}`);
  assert.equal(maskApiKeyForDisplay('ab'), `a${MASK}b`);
  assert.equal(maskApiKeyForDisplay('abc'), `ab${MASK}c`);
  assert.equal(maskApiKeyForDisplay('abcd'), `abc${MASK}d`);
  assert.equal(maskApiKeyForDisplay('abcdef'), `abcd${MASK}f`);
  assert.equal(maskApiKeyForDisplay('abcdefghij'), `abcd${MASK}j`);
  assert.equal(maskApiKeyForDisplay('abcd', { mask: '#', visiblePrefix: 2, visibleSuffix: 2 }), 'abc#d');
  assert.equal(maskApiKeyForDisplay('abcde', { mask: '#', visiblePrefix: 2, visibleSuffix: 2 }), 'ab#de');
  assert.equal(maskApiKeyForDisplay('abcdefghijkl', { mask: '#', visiblePrefix: 2, visibleSuffix: 2 }), 'ab#kl');
  for (const key of ['a', 'ab', 'abc', 'abcdef', '123456789012', 'sk-or-v1-abcdefghijklmnop1234']) assert.ok(maskApiKeyForDisplay(key).includes(MASK), `${key} is never shown without the mask`);
});

test('a masked display is recognised by its mask, and nothing else is', () => {
  assert.equal(isMaskedApiKeyDisplayValue(null), false);
  assert.equal(isMaskedApiKeyDisplayValue(undefined), false);
  assert.equal(isMaskedApiKeyDisplayValue(''), false);
  assert.equal(isMaskedApiKeyDisplayValue('sk-real-key'), false);
  assert.equal(isMaskedApiKeyDisplayValue(`sk-${MASK}-1234`), true);
  assert.equal(isMaskedApiKeyDisplayValue('sk-#-1234', { mask: '#' }), true);
});

test('keys are listed by the providers the page knows, and "apiKeys" is sensitive too', () => {
  assert.deepEqual([...SENSITIVE_API_KEY_FIELDS], ['gemini', 'openrouter', 'nvidia', 'opencode-go', 'openai', 'tavily', 'tinyfish']);
  assert.equal(isSensitiveConfigKey('apiKeys'), true);
  for (const field of SENSITIVE_API_KEY_FIELDS) assert.equal(isSensitiveConfigKey(field), true, field);
  assert.equal(isSensitiveConfigKey('theme'), false);
  assert.equal(isSensitiveConfigKey(undefined), false);
});

test('redacting all keys, and a whole configuration', () => {
  for (const bad of [null, undefined, 'text', 0]) assert.deepEqual(redactApiKeys(bad), {}, String(bad));
  assert.deepEqual(redactApiKeys({ gemini: 'abcdefgh1234', other: 'zzzzzzzz9999', empty: '' }), { gemini: '********1234', other: '********9999', empty: '' });
  assert.deepEqual(redactApiKeys({ gemini: 'abcdefgh1234' }, { visiblePrefix: 2 }), { gemini: 'ab********1234' });

  for (const bad of [null, undefined, 'text']) assert.deepEqual(removeSensitiveConfig(bad), {}, String(bad));
  const config = { uiLanguage: 'en', apiKeys: { gemini: 'secret' }, theme: 'old' };
  assert.deepEqual(removeSensitiveConfig(config), { uiLanguage: 'en' });
  assert.ok('apiKeys' in config, 'the original is not changed');

  for (const bad of [null, undefined, 'text']) assert.deepEqual(redactSensitiveConfig(bad), {}, String(bad));
  assert.deepEqual(redactSensitiveConfig({ uiLanguage: 'en' }), { uiLanguage: 'en' });
  assert.deepEqual(redactSensitiveConfig({ uiLanguage: 'en', apiKeys: null }), { uiLanguage: 'en' });
  assert.deepEqual(redactSensitiveConfig({ uiLanguage: 'en', apiKeys: 'secret' }), { uiLanguage: 'en' });
  assert.deepEqual(redactSensitiveConfig({ uiLanguage: 'en', apiKeys: { gemini: 'abcdefgh1234' } }), { uiLanguage: 'en', apiKeys: { gemini: '********1234' } });
  assert.deepEqual(redactSensitiveConfig({ apiKeys: { gemini: 'abcdefgh1234' } }, { visiblePrefix: 1 }), { apiKeys: { gemini: 'a********1234' } });
});

test('what leaves in an export: the keys only when asked for, redacted when asked for', () => {
  const config = { uiLanguage: 'en', apiKeys: { gemini: 'abcdefgh1234' }, theme: 'old' };
  assert.deepEqual(createExportSafeConfig(config), { uiLanguage: 'en' });
  assert.deepEqual(createExportSafeConfig(config, { redact: true }), { uiLanguage: 'en', apiKeys: { gemini: '********1234' } });
  const withSecrets = createExportSafeConfig(config, { includeSecrets: true });
  assert.deepEqual(withSecrets, config);
  assert.notEqual(withSecrets.apiKeys, config.apiKeys, 'the keys are a copy');
  assert.equal(createExportSafeConfig({ apiKeys: null }, { includeSecrets: true }).apiKeys, null);
  assert.equal(createExportSafeConfig({ apiKeys: 'text' }, { includeSecrets: true }).apiKeys, 'text');
  for (const bad of [null, undefined, 'text']) assert.deepEqual(createExportSafeConfig(bad, { includeSecrets: true }), {}, String(bad));
});

// --- the keys in memory and on the device ------------------------------------------------------------------------------------------

test('a provider is known by its own name; a name that is not a provider stays as it is', () => {
  for (const provider of SENSITIVE_API_KEY_FIELDS) assert.equal(normalizeProviderKey(provider), provider);
  assert.equal(normalizeProviderKey('something-else'), 'something-else');
  assert.equal(normalizeProviderKey(undefined), undefined);
});

test('the store starts with every provider empty whatever it is given, and keeps what it is given by provider', () => {
  for (const initial of [undefined, null, 'text', 5]) {
    const store = createSensitiveConfigStore({ initialApiKeys: initial });
    assert.deepEqual(store.getApiKeys(), Object.fromEntries(SENSITIVE_API_KEY_FIELDS.map((field) => [field, ''])), String(initial));
  }
  const store = createSensitiveConfigStore({ initialApiKeys: { gemini: '  g-key ', tavily: { a: 't-key' } } });
  assert.equal(store.getApiKey('gemini'), 'g-key');
  assert.equal(store.getApiKey('tavily'), 't-key');
  assert.equal(store.getApiKey('nvidia'), '');
  assert.equal(store.getApiKey('nobody'), '');
});

test('keys are merged, set, replaced and cleared; bad input changes nothing; what is handed out is a copy', () => {
  const store = createSensitiveConfigStore({ initialApiKeys: { gemini: 'g' } });
  for (const bad of [null, 'text', undefined]) {
    assert.doesNotThrow(() => store.mergeApiKeys(bad));
    assert.equal(store.getApiKey('gemini'), 'g');
  }
  store.mergeApiKeys({ openrouter: ' o ', gemini: '' });
  assert.equal(store.getApiKey('openrouter'), 'o');
  assert.equal(store.getApiKey('gemini'), '');
  store.setApiKey('nvidia', ' n ');
  assert.equal(store.getApiKey('nvidia'), 'n');
  const copy = store.getApiKeys();
  copy.nvidia = 'changed';
  assert.equal(store.getApiKey('nvidia'), 'n');
  store.replaceApiKeys({ tavily: 't' });
  assert.deepEqual(store.getApiKeys(), { ...Object.fromEntries(SENSITIVE_API_KEY_FIELDS.map((field) => [field, ''])), tavily: 't' });
  store.clearApiKeys();
  assert.ok(Object.values(store.getApiKeys()).every((value) => value === ''));
});

const persistence = (overrides = {}) => {
  const disk = new Map();
  const events = [];
  const store = createSensitiveConfigStore();
  const api = createSensitiveConfigPersistence({
    getCurrentUser: () => ({ username: 'ann' }),
    getItem: async (key) => disk.get(key) ?? null,
    setItem: async (key, value) => { disk.set(key, value); events.push(['set', key]); },
    removeItem: async (key) => { disk.delete(key); events.push(['remove', key]); },
    getApiKeys: store.getApiKeys,
    replaceApiKeys: store.replaceApiKeys,
    onSaved: () => { events.push(['saved']); },
    ...overrides
  });
  return { api, disk, events, store };
};

test('keys are kept on the device under the name of the person, and nowhere without one', async () => {
  const { api, disk, store, events } = persistence();
  store.setApiKey('gemini', 'g-key');
  await api.saveSensitiveConfig();
  assert.deepEqual([...disk.keys()], ['chatSensitiveConfig_v1_ann']);
  assert.deepEqual(JSON.parse(disk.get('chatSensitiveConfig_v1_ann')).apiKeys.gemini, 'g-key');
  assert.deepEqual(events.map((event) => event[0]), ['saved', 'set', 'saved'], 'the cloud is told before and after');

  for (const user of [null, undefined, {}, { username: '' }]) {
    const nobody = persistence({ getCurrentUser: () => user });
    assert.equal(nobody.api.getSensitiveConfigKey(), null);
    assert.equal(await nobody.api.loadSensitiveConfig(), null);
    await nobody.api.saveSensitiveConfig();
    await nobody.api.clearSensitiveConfig();
    assert.deepEqual(nobody.events, []);
  }
  assert.equal(persistence({ getCurrentUser: undefined }).api.getSensitiveConfigKey(), null, 'without a way to know the person there is no key');
});

test('loading puts back the keys that were kept, in either of the two shapes they were kept in; nothing kept means nothing changes', async () => {
  const { api, disk, store } = persistence();
  assert.equal(await api.loadSensitiveConfig(), null);
  disk.set('chatSensitiveConfig_v1_ann', JSON.stringify({ apiKeys: { gemini: 'new-shape' } }));
  assert.equal((await api.loadSensitiveConfig()).gemini, 'new-shape');
  disk.set('chatSensitiveConfig_v1_ann', JSON.stringify({ openrouter: 'old-shape' }));
  assert.equal((await api.loadSensitiveConfig()).openrouter, 'old-shape');
  assert.equal(store.getApiKey('gemini'), '', 'the keys of the earlier load are replaced, not added to');
  disk.set('chatSensitiveConfig_v1_ann', 'null');
  const loaded = await api.loadSensitiveConfig();
  assert.ok(Object.values(loaded).every((value) => value === ''), 'a kept "nothing" is no keys');
});

test('a cloud that cannot be told does not stop keys from being kept, or removed', async () => {
  const failing = persistence({ onSaved: () => { throw new Error('offline'); } });
  failing.store.setApiKey('gemini', 'g');
  await failing.api.saveSensitiveConfig();
  assert.ok(failing.disk.has('chatSensitiveConfig_v1_ann'));
  await failing.api.clearSensitiveConfig();
  assert.equal(failing.disk.has('chatSensitiveConfig_v1_ann'), false);

  const { api, disk, store, events } = persistence();
  store.setApiKey('gemini', 'g');
  await api.saveSensitiveConfig();
  await api.clearSensitiveConfig();
  assert.equal(disk.size, 0);
  assert.ok(Object.values(store.getApiKeys()).every((value) => value === ''), 'the keys in memory go too');
  assert.deepEqual(events.slice(-3).map((event) => event[0]), ['saved', 'remove', 'saved']);
});
