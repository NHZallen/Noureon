import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { CLI_MERGED_FIELDS, MAX_STAMPS, changedCliFields, mergeCliSettings, normalizeStamps, stampItem } from '../../src/data/cli-settings-merge.js';
import { addCli, removeCli, setCliModelUse } from '../../src/app/runtime/cli/cli-state.js';
import { removeNetSite, setNetRule } from '../../src/app/runtime/cli/net-state.js';
import { normalizeLoadedLegacyConfig } from '../../src/app/runtime/kernel/config-normalization.js';

const cfg = (extra = {}) => ({ cliEnabledIds: [], cliModelUseIds: [], cliVersions: {}, netRules: {}, cliStamps: {}, cliUseStamps: {}, netStamps: {}, ...extra });

test('a device that has not heard of a tool added elsewhere does not wipe it out: the lists are merged, not replaced', () => {
  // The cloud has five tools (added on the computer); the phone still has two, and has just changed something.
  const cloud = cfg({ cliEnabledIds: ['ffmpeg', 'officecli', 'yt-dlp', 'twitter-cli', 'rdt-cli'], cliStamps: { ffmpeg: 100, officecli: 110, 'rdt-cli': 120 }, cliVersions: { ffmpeg: '1', officecli: '2', 'yt-dlp': '3', 'twitter-cli': '4', 'rdt-cli': '5' } });
  const phone = cfg({ cliEnabledIds: ['twitter-cli', 'yt-dlp'], cliModelUseIds: ['yt-dlp', 'twitter-cli'], cliVersions: { 'yt-dlp': '3', 'twitter-cli': '4' } });
  const merged = mergeCliSettings(phone, cloud);
  assert.deepEqual([...merged.cliEnabledIds].sort(), ['ffmpeg', 'officecli', 'rdt-cli', 'twitter-cli', 'yt-dlp']);
  assert.deepEqual(merged.cliModelUseIds, ['yt-dlp', 'twitter-cli'], 'the phone\'s own choices stay');
  assert.equal(merged.cliVersions.ffmpeg, '1', 'a tool the phone did not have comes with the cloud\'s version');
  assert.deepEqual(changedCliFields(phone, merged).includes('cliEnabledIds'), true, 'the phone is told it was given something');
  assert.deepEqual(changedCliFields(merged, mergeCliSettings(merged, cloud)), [], 'merging again changes nothing');
});

test('a removal is kept, and adding the tool again later brings it back: the later stamp of each item wins', () => {
  const computer = cfg({ cliEnabledIds: ['ffmpeg'], cliStamps: { ffmpeg: 100, 'yt-dlp': 200 } });
  const phone = cfg({ cliEnabledIds: ['ffmpeg', 'yt-dlp'], cliStamps: { ffmpeg: 100, 'yt-dlp': 50 } });
  assert.deepEqual(mergeCliSettings(phone, computer).cliEnabledIds, ['ffmpeg'], 'removed on the computer after the phone added it');
  assert.deepEqual(mergeCliSettings(computer, phone).cliEnabledIds, ['ffmpeg'], 'the same from the other side');
  const phoneAgain = cfg({ cliEnabledIds: ['ffmpeg', 'yt-dlp'], cliStamps: { ffmpeg: 100, 'yt-dlp': 300 } });
  assert.deepEqual(mergeCliSettings(computer, phoneAgain).cliEnabledIds.sort(), ['ffmpeg', 'yt-dlp'], 'added again after the removal');
  assert.equal(mergeCliSettings(computer, phone).cliStamps['yt-dlp'], 200, 'the removal leaves its stamp');
});

test('items with no stamp (made before stamps existed) are kept if either side has them; a tool the model may use needs the tool', () => {
  const merged = mergeCliSettings(cfg({ cliEnabledIds: ['a-tool'], cliModelUseIds: ['a-tool'] }), cfg({ cliEnabledIds: ['b-tool'], cliModelUseIds: ['b-tool'] }));
  assert.deepEqual(merged.cliEnabledIds.sort(), ['a-tool', 'b-tool']);
  assert.deepEqual(merged.cliModelUseIds.sort(), ['a-tool', 'b-tool']);
  const removed = mergeCliSettings(cfg({ cliEnabledIds: [], cliStamps: { 'a-tool': 10 } }), cfg({ cliEnabledIds: ['a-tool'], cliModelUseIds: ['a-tool'] }));
  assert.deepEqual(removed.cliEnabledIds, []);
  assert.deepEqual(removed.cliModelUseIds, [], 'not for a tool that is gone');
  assert.deepEqual(mergeCliSettings(null, undefined).cliEnabledIds, []);
  assert.deepEqual(mergeCliSettings({ cliEnabledIds: 'oops', netRules: 3 }, 7).netRules, {});
});

test('rules for sites merge by site: the later change of each site wins, a rule taken away stays away', () => {
  const computer = cfg({ netRules: { 'x.com': 'allow', 'api.x.com': 'allow' }, netStamps: { 'x.com': 100, 'api.x.com': 100 } });
  const phone = cfg({ netRules: { 'x.com': 'deny', 'new.example': 'allow' }, netStamps: { 'x.com': 200, 'new.example': 150 } });
  const merged = mergeCliSettings(phone, computer);
  assert.deepEqual(merged.netRules, { 'x.com': 'deny', 'api.x.com': 'allow', 'new.example': 'allow' });
  const taken = mergeCliSettings(cfg({ netRules: {}, netStamps: { 'x.com': 300 } }), computer);
  assert.deepEqual(taken.netRules, { 'api.x.com': 'allow' });
  assert.equal(taken.netStamps['x.com'], 300);
  assert.deepEqual(Object.keys(mergeCliSettings(cfg({ netRules: { 'bad host!': 'allow', 'ok.com': 'maybe' } }), null).netRules), [], 'only valid sites and words');
});

test('changing the lists leaves a stamp for the item, and the settings keep them tidy', () => {
  const config = cfg();
  assert.equal(addCli(config, 'ffmpeg'), true);
  assert.ok(config.cliStamps.ffmpeg > 0);
  assert.equal(setCliModelUse(config, 'ffmpeg', true), true);
  assert.ok(config.cliUseStamps.ffmpeg > 0);
  const added = config.cliStamps.ffmpeg;
  assert.equal(removeCli(config, 'ffmpeg'), true);
  assert.ok(config.cliStamps.ffmpeg >= added);
  assert.deepEqual(config.cliEnabledIds, []);
  assert.equal(setNetRule(config, 'x.com', 'allow'), true);
  assert.ok(config.netStamps['x.com'] > 0);
  assert.equal(removeNetSite(config, 'x.com'), true);
  assert.deepEqual(config.netRules, {});
  assert.ok(config.netStamps['x.com'] > 0);
  stampItem(config, 'cliStamps', 'bad id!');
  assert.equal(Object.keys(config.cliStamps).includes('bad id!'), false);
  const many = Object.fromEntries(Array.from({ length: MAX_STAMPS + 50 }, (_, index) => [`tool-${index}`, index + 1]));
  const kept = normalizeStamps(many);
  assert.equal(Object.keys(kept).length, MAX_STAMPS);
  assert.ok(!('tool-0' in kept), 'the oldest go first');
  assert.deepEqual(normalizeStamps({ a1: -3, b2: 'x', c3: 5.9 }), { c3: 5 });
});

test('the settings carry the stamps, and a config loaded without them gets empty ones', () => {
  assert.ok(CLI_MERGED_FIELDS.includes('cliStamps') && CLI_MERGED_FIELDS.includes('netStamps'));
  const loaded = normalizeLoadedLegacyConfig({ currentConfig: { uiTheme: {}, apiKeys: {} }, savedConfig: { cliEnabledIds: ['ffmpeg'], cliStamps: { ffmpeg: 12, 'bad id!': 3 } } });
  assert.deepEqual(loaded.cliStamps, { ffmpeg: 12 });
  assert.deepEqual(loaded.cliUseStamps, {});
  assert.deepEqual(loaded.netStamps, {});
});

test('the sync merges the CLI lists with the cloud\'s before it uploads the settings, keeps the result on this device, and tells the page', async () => {
  const source = await readFile(new URL('../../src/app/sync/cloud-workspace-sync.js', import.meta.url), 'utf8');
  const mergeAt = source.indexOf('async function mergeConfigWithCloud(');
  const merge = source.slice(mergeAt, source.indexOf('async function prepareUpload(', mergeAt));
  assert.ok(mergeAt >= 0);
  // The cloud is read again first, so the merge is with what is there now and not with what was fetched long ago.
  assert.ok(merge.indexOf('await fetchRemote()') < merge.indexOf('mergeCliSettings('));
  assert.match(merge, /withWorkspaceStorageExclusive[\s\S]*storage\.setItem\(keys\.config/);
  assert.match(merge, /astra:cloud-cli-merge/);
  assert.match(source, /kind === 'config'\) return value \? assets\.externalize\(await mergeConfigWithCloud\(value\)\) : null/);
  const live = await readFile(new URL('../../src/app/runtime/features/cloud-workspace-live-lifecycle.js', import.meta.url), 'utf8');
  assert.match(live, /astra:cloud-cli-merge[\s\S]*configAccess\.replaceConfig\(\{ \.\.\.configAccess\.getConfig\(\), \.\.\.fields \}\)/);
});
