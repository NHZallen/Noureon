import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { NOT_MERGED_SETTINGS, mergeSettings, normalizeSettingsStamps, settingsMergeChanged, stampChangedSettings } from '../src/data/settings-merge.js';
import { createSettingsStamper } from '../src/app/runtime/kernel/settings-stamper.js';
import { createLegacyRuntimeConfigStore } from '../src/app/runtime/kernel/config-store.js';
import { normalizeLoadedLegacyConfig } from '../src/app/runtime/kernel/config-normalization.js';

test('a setting changed on one device is not wiped out by another device saving a different one', () => {
  // Device A set the network mode at 1000; device B (which had not heard of it) changed the theme at 2000 and is about to upload.
  const cloud = { netMode: 'always', uiLanguage: 'en', settingsStamps: { netMode: 1000 } };
  const local = { netMode: 'new', uiLanguage: 'fr', settingsStamps: { uiLanguage: 2000 } };
  const merged = mergeSettings(local, cloud);
  assert.deepEqual(merged.fields, { netMode: 'always' }, 'the network mode comes from the cloud, the language stays this device\'s');
  assert.deepEqual(merged.stamps, { netMode: 1000, uiLanguage: 2000 });
  assert.equal(settingsMergeChanged(local, merged), true);
});

test('the later stamp of a setting wins, either way, and no stamp means the device that sends keeps its own (as it always did)', () => {
  assert.deepEqual(mergeSettings({ netMode: 'new', settingsStamps: { netMode: 5 } }, { netMode: 'always', settingsStamps: { netMode: 9 } }).fields, { netMode: 'always' });
  assert.deepEqual(mergeSettings({ netMode: 'new', settingsStamps: { netMode: 9 } }, { netMode: 'always', settingsStamps: { netMode: 5 } }).fields, {}, 'this device changed it later');
  assert.deepEqual(mergeSettings({ netMode: 'new', settingsStamps: { netMode: 5 } }, { netMode: 'always', settingsStamps: { netMode: 5 } }).fields, {}, 'a tie: this device');
  assert.deepEqual(mergeSettings({ netMode: 'new' }, { netMode: 'always' }).fields, {}, 'before stamps: nothing changes');
  assert.deepEqual(mergeSettings({ netMode: 'new' }, { netMode: 'always', settingsStamps: { netMode: 3 } }).fields, { netMode: 'always' }, 'a stamp on the cloud\'s side only: it is the newer news');
  const same = { uiLanguage: 'en', settingsStamps: { uiLanguage: 7 } };
  assert.equal(settingsMergeChanged(same, mergeSettings(same, same)), false, 'nothing to give');
  assert.deepEqual(mergeSettings(null, null), { fields: {}, stamps: {} });
});

test('objects are taken whole (a setting is one piece), and a setting the cloud does not have is left alone', () => {
  const merged = mergeSettings(
    { uiTheme: { mode: 'default' }, localOnly: 1, settingsStamps: { uiTheme: 1 } },
    { uiTheme: { mode: 'custom', customColor: '#112233' }, settingsStamps: { uiTheme: 2, gone: 5 } }
  );
  assert.deepEqual(merged.fields, { uiTheme: { mode: 'custom', customColor: '#112233' } });
  assert.deepEqual(merged.stamps, { uiTheme: 2, gone: 5 });
  assert.equal('localOnly' in merged.fields, false);
});

test('the CLI lists, the API keys, the memory and the stamps themselves are never merged here', () => {
  for (const key of ['cliEnabledIds', 'cliModelUseIds', 'cliVersions', 'netRules', 'cliStamps', 'cliUseStamps', 'netStamps', 'settingsStamps', 'apiKeys', 'memorySync']) assert.ok(NOT_MERGED_SETTINGS.has(key), key);
  const merged = mergeSettings({ settingsStamps: {} }, { apiKeys: { gemini: 'x' }, memorySync: { a: 1 }, cliEnabledIds: ['ffmpeg'], netRules: { 'a.example': 'allow' }, settingsStamps: { apiKeys: 9, memorySync: 9, cliEnabledIds: 9, netRules: 9, settingsStamps: 9 } });
  assert.deepEqual(merged.fields, {});
  assert.deepEqual(merged.stamps, {}, 'not even a stamp for them');
});

test('stamps are normalized: only settings, real times, no more than the list keeps', () => {
  assert.deepEqual(normalizeSettingsStamps({ netMode: 5.9, 'bad key!': 3, apiKeys: 4, uiLanguage: -1, theme: 'x', ok_1: 7 }), { netMode: 5, ok_1: 7 });
  assert.deepEqual(normalizeSettingsStamps(null), {});
  assert.deepEqual(normalizeSettingsStamps([1, 2]), {});
  const many = Object.fromEntries(Array.from({ length: 700 }, (_, index) => [`setting${index}`, index + 1]));
  assert.equal(Object.keys(normalizeSettingsStamps(many)).length, 600);
});

test('a save stamps the settings whose value differs from what was stored, and only those', () => {
  const previous = { netMode: 'new', uiLanguage: 'en', uiTheme: { mode: 'default' }, apiKeys: { gemini: 'a' }, cliEnabledIds: [] };
  const current = { netMode: 'always', uiLanguage: 'en', uiTheme: { mode: 'default' }, apiKeys: { gemini: 'b' }, cliEnabledIds: ['ffmpeg'], settingsStamps: { uiLanguage: 50 } };
  assert.deepEqual(stampChangedSettings(previous, current, 100), { netMode: 100, uiLanguage: 50 });
  assert.deepEqual(stampChangedSettings(null, current, 100), { uiLanguage: 50 }, 'nothing stored before: nothing to compare');
  assert.deepEqual(stampChangedSettings(previous, { ...previous, newSetting: true }, 100), { newSetting: 100 }, 'a setting that did not exist counts');
  assert.deepEqual(stampChangedSettings({ a: 1 }, {}, 100), { a: 100 }, 'one that went away too');
});

test('the stamper stamps what changed since the stored config, keeps the stamps in the config, and tolerates a store that cannot be read', async () => {
  const store = createLegacyRuntimeConfigStore({ defaultModelId: 'm' });
  const config = store.getConfig();
  let stored = { ...config, netMode: 'new', apiKeys: undefined };
  const stamper = createSettingsStamper({ getConfig: store.getConfig, readStoredConfig: async () => stored, now: () => 4242 });
  config.netMode = 'always';
  assert.equal(await stamper.stamp(), true);
  assert.deepEqual(config.settingsStamps, { netMode: 4242 }, 'the page holds them, and saveConfig stores them with the settings');
  stored = { ...stored, netMode: 'always', settingsStamps: { netMode: 4242 } };
  config.uiLanguage = config.uiLanguage === 'fr' ? 'en' : 'fr';
  await createSettingsStamper({ getConfig: store.getConfig, readStoredConfig: async () => stored, now: () => 5000 }).stamp();
  assert.deepEqual(config.settingsStamps, { netMode: 4242, uiLanguage: 5000 }, 'only what changed since is stamped again');

  const untouched = { a: 1, settingsStamps: { a: 1 } };
  assert.equal(await createSettingsStamper({ getConfig: () => untouched, readStoredConfig: async () => null }).stamp(), false, 'nothing stored yet: nothing to compare');
  assert.equal(await createSettingsStamper({ getConfig: () => untouched, readStoredConfig: async () => { throw new Error('unreadable'); } }).stamp(), false);
  assert.equal(await createSettingsStamper({ getConfig: () => untouched, readStoredConfig: async () => 'not an object' }).stamp(), false);
  assert.deepEqual(untouched, { a: 1, settingsStamps: { a: 1 } }, 'and the config is left as it was');
});

test('the settings carry their stamps: an empty default, and a loaded config is normalized', () => {
  assert.deepEqual(createLegacyRuntimeConfigStore({ defaultModelId: 'm' }).getConfig().settingsStamps, {});
  const loaded = normalizeLoadedLegacyConfig({ currentConfig: { uiTheme: {}, apiKeys: {} }, savedConfig: { settingsStamps: { netMode: 12, 'bad key!': 3 } } });
  assert.deepEqual(loaded.settingsStamps, { netMode: 12 });
  assert.deepEqual(normalizeLoadedLegacyConfig({ currentConfig: { uiTheme: {}, apiKeys: {} }, savedConfig: {} }).settingsStamps, {});
});

test('the sync merges the other settings with the cloud\'s too, in the same step as the CLI lists, and tells the page of what came from the cloud', async () => {
  const source = await readFile(new URL('../src/app/sync/cloud-workspace-sync.js', import.meta.url), 'utf8');
  const merge = source.slice(source.indexOf('async function mergeConfigWithCloud('), source.indexOf('async function prepareUpload('));
  assert.ok(merge.indexOf('await fetchRemote()') < merge.indexOf('mergeSettings('), 'the cloud is read again first');
  assert.match(merge, /mergeCliSettings\([\s\S]*mergeSettings\(/);
  assert.match(merge, /storage\.setItem\(keys\.config, JSON\.stringify\(\{ \.\.\.stored, \.\.\.fields \}\)\)/, 'kept on this device');
  assert.match(merge, /astra:cloud-config'[\s\S]*detail: result/, 'a setting from the cloud is applied by the page as in a download');
  const wiring = await readFile(new URL('../src/app/runtime/legacy-core/legacy-core.js', import.meta.url), 'utf8');
  assert.match(wiring, /const saveConfig = async \(\) => \{ await settingsStamper\.stamp\(\); await runtimeConfigPersistence\.saveConfig\(\); \};/, 'every save is stamped first');
  assert.match(wiring, /createSettingsStamper\(\{[\s\S]*readStoredConfig: async \(\) => \(currentUser \? JSON\.parse\(await getItem\(getConfigKey\(\)\)/, 'the page tells it where the stored settings are');
  const persistence = await readFile(new URL('../src/app/runtime/kernel/config-persistence.js', import.meta.url), 'utf8');
  assert.doesNotMatch(persistence, /settings-merge|settingsStamps/, 'the persistence stays the serialized write adapter it is');
});
