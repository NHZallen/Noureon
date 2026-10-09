import assert from 'node:assert/strict';
import test from 'node:test';

import { OFFICIAL_SKILL_CATALOG, getOfficialSkill, isOfficialSkillName, skillDescription, skillTitle, validateSkillEntry } from '../src/data/skill-catalog.js';
import { NOT_MERGED_SETTINGS } from '../src/data/settings-merge.js';
import { MAX_SKILL_IDS, SKILL_MERGED_FIELDS, changedSkillFields, mergeSkillSettings, normalizeSkillIds, normalizeSkillStamps, stampSkill } from '../src/data/skill-settings-merge.js';

const cfg = (extra = {}) => ({ skillEnabledIds: [], skillModelUseIds: [], skillStamps: {}, skillUseStamps: {}, ...extra });

test('a skill added on one device and one removed on another both survive a merge, each by the later stamp', () => {
  const local = cfg({ skillEnabledIds: ['notes', 'review'], skillStamps: { notes: 100, review: 90, old: 50 }, skillModelUseIds: ['notes'], skillUseStamps: { notes: 100 } });
  const cloud = cfg({ skillEnabledIds: ['review', 'old', 'fresh'], skillStamps: { review: 95, old: 60, fresh: 120, notes: 80 }, skillModelUseIds: ['fresh', 'old'], skillUseStamps: { fresh: 120, old: 60 } });
  const merged = mergeSkillSettings(local, cloud);
  assert.deepEqual(merged.skillEnabledIds, ['notes', 'review', 'old', 'fresh']);
  assert.deepEqual(merged.skillModelUseIds, ['notes', 'fresh', 'old'], 'this device\'s order first');
  assert.deepEqual(merged.skillStamps, { notes: 100, review: 95, old: 60, fresh: 120 });

  // removed later on the cloud side: it is gone, and so is its permission to be used by the model
  const removed = mergeSkillSettings(local, cfg({ skillEnabledIds: ['review'], skillStamps: { notes: 200, review: 90 } }));
  assert.deepEqual(removed.skillEnabledIds, ['review']);
  assert.deepEqual(removed.skillModelUseIds, []);
});

test('lists with no stamps on either side keep what either has; bad names and doubles are dropped', () => {
  const merged = mergeSkillSettings(cfg({ skillEnabledIds: ['a1', 'Bad Name', 'a1'] }), cfg({ skillEnabledIds: ['b2'] }));
  assert.deepEqual(merged.skillEnabledIds, ['a1', 'b2']);
  assert.deepEqual(mergeSkillSettings(null, undefined), cfg());
  assert.deepEqual(normalizeSkillIds('nope'), []);
  assert.equal(normalizeSkillIds(Array.from({ length: 300 }, (_, i) => `s${i}`)).length, MAX_SKILL_IDS);
  assert.deepEqual(normalizeSkillStamps({ ok: 5, 'Not OK': 6, neg: -1, text: 'x' }), { ok: 5 });
});

test('a change leaves a stamp, and the merge says what it changed', () => {
  const config = cfg({ skillEnabledIds: ['a1'] });
  stampSkill(config, 'skillStamps', 'a1', 777);
  stampSkill(config, 'skillUseStamps', 'a1', 778);
  stampSkill(config, 'nothing', 'a1', 1);
  stampSkill(config, 'skillStamps', 'Bad Name', 1);
  assert.deepEqual(config.skillStamps, { a1: 777 });
  assert.deepEqual(config.skillUseStamps, { a1: 778 });
  assert.deepEqual(changedSkillFields(config, mergeSkillSettings(config, null)), []);
  const merged = mergeSkillSettings(config, cfg({ skillEnabledIds: ['a1', 'b2'], skillStamps: { b2: 5 } }));
  assert.deepEqual(changedSkillFields(config, merged), ['skillEnabledIds', 'skillStamps']);
});

test('the skill lists are not merged as ordinary settings, and the official catalog follows its rules', () => {
  for (const field of SKILL_MERGED_FIELDS) assert.ok(NOT_MERGED_SETTINGS.has(field), field);
  for (const skill of OFFICIAL_SKILL_CATALOG) assert.deepEqual(validateSkillEntry(skill), [], skill.name);
  assert.equal(new Set(OFFICIAL_SKILL_CATALOG.map((skill) => skill.name)).size, OFFICIAL_SKILL_CATALOG.length, 'names are unique');
  assert.equal(getOfficialSkill('nothing'), null);
  assert.equal(isOfficialSkillName('nothing'), false);
  // the checks themselves
  const ok = { name: 'x1', description: 'd', body: 'b', version: '1' };
  assert.deepEqual(validateSkillEntry(ok), []);
  assert.deepEqual(validateSkillEntry({ ...ok, name: 'Bad' }), ['name']);
  assert.deepEqual(validateSkillEntry({ ...ok, body: '', version: '' }), ['body', 'version']);
  assert.deepEqual(validateSkillEntry(null), ['not an object']);
  const entry = { ...ok, i18n: { 'zh-TW': { title: '標題', description: '描述' }, en: { title: 'Title' } } };
  assert.equal(skillTitle(entry, 'zh-TW'), '標題');
  assert.equal(skillTitle(entry, 'fr'), 'Title', 'English when the language has none');
  assert.equal(skillTitle(ok, 'fr'), 'x1', 'the name when there is no title');
  assert.equal(skillDescription(entry, 'zh-TW'), '描述');
  assert.equal(skillDescription(entry, 'fr'), 'd', 'its own description when no language has one');
});
