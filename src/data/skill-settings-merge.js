// The settings of the skills (技能) are two lists, like the CLI tools': the skills that were added (skillEnabledIds) and the ones the model may use by
// itself (skillModelUseIds). They are merged item by item between devices the same way (see cli-settings-merge.js): every change of an item leaves a
// time stamp (skillStamps, skillUseStamps), and for each item the side with the later stamp wins. The names of skills are what the lists hold (the
// text of a skill pasted by the person is in the cloud table user_skills, not in the settings). Pure functions.

import { MAX_STAMPS, mergeSet, normalizeStamps } from './cli-settings-merge.js';
import { isSkillName } from './skill-format.js';

const STAMP_FIELDS = Object.freeze(['skillStamps', 'skillUseStamps']);
/** The fields this merge owns: what the sync gives back after a merge. */
export const SKILL_MERGED_FIELDS = Object.freeze(['skillEnabledIds', 'skillModelUseIds', ...STAMP_FIELDS]);
/** Most names the lists keep (the person's own skills and the official ones together). */
export const MAX_SKILL_IDS = 120;

const nameKey = (key) => (isSkillName(String(key || '')) ? String(key) : '');

/** A list of skill names: only valid names, each once, in order. */
export function normalizeSkillIds(value) {
  const found = [];
  for (const entry of Array.isArray(value) ? value : []) {
    const name = nameKey(entry);
    if (name && !found.includes(name)) found.push(name);
    if (found.length >= MAX_SKILL_IDS) break;
  }
  return found;
}

export const normalizeSkillStamps = (value) => normalizeStamps(value, nameKey);

/** Leaves a stamp on a skill of a list: the caller changes the list and saves. `field`: 'skillStamps' or 'skillUseStamps'. */
export function stampSkill(config, field, name, now = Date.now()) {
  if (!config || !STAMP_FIELDS.includes(field) || !nameKey(name)) return;
  config[field] = normalizeSkillStamps({ ...(config[field] || {}), [name]: now });
}

/** The settings of the skills when this device's settings (`local`) meet the cloud's (`remote`): the fields of SKILL_MERGED_FIELDS, normalized. */
export function mergeSkillSettings(local, remote) {
  const l = local && typeof local === 'object' ? local : {};
  const r = remote && typeof remote === 'object' ? remote : {};
  const enabled = mergeSet(normalizeSkillIds(l.skillEnabledIds), normalizeSkillStamps(l.skillStamps), normalizeSkillIds(r.skillEnabledIds), normalizeSkillStamps(r.skillStamps));
  const use = mergeSet(normalizeSkillIds(l.skillModelUseIds), normalizeSkillStamps(l.skillUseStamps), normalizeSkillIds(r.skillModelUseIds), normalizeSkillStamps(r.skillUseStamps));
  const skillEnabledIds = normalizeSkillIds(enabled.ids);
  return {
    skillEnabledIds,
    skillModelUseIds: normalizeSkillIds(use.ids).filter((name) => skillEnabledIds.includes(name)),
    skillStamps: normalizeSkillStamps(enabled.stamps),
    skillUseStamps: normalizeSkillStamps(use.stamps)
  };
}

const same = (a, b) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

/** The fields of the skill settings that the merge changed from what `config` holds (what the sync gives to this side). */
export function changedSkillFields(config, merged) {
  const own = mergeSkillSettings(config, null);
  return SKILL_MERGED_FIELDS.filter((field) => !same(own[field], merged[field]));
}

export { MAX_STAMPS };
