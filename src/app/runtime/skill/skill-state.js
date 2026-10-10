// Which skills the person has: the ones added (skillEnabledIds) and the ones the model may use by itself (skillModelUseIds). They live in the settings, so
// they follow the account; every function changes the settings object it is given and returns whether anything changed (the caller saves). The text of
// a skill the person pasted is in the cloud table user_skills (skill-store.js); the official ones are in the app (data/skill-catalog.js).
// A skill the person adds is, from the start, one the model may use by itself (they read it all before adding it), and they may turn that off.

import { getOfficialSkill } from '../../../data/skill-catalog.js';
import { normalizeSkillIds, stampSkill } from '../../../data/skill-settings-merge.js';

export const enabledSkillIds = (config) => normalizeSkillIds(config?.skillEnabledIds);
export const isSkillEnabled = (config, name) => enabledSkillIds(config).includes(name);
export const canModelUseSkill = (config, name) => isSkillEnabled(config, name) && normalizeSkillIds(config?.skillModelUseIds).includes(name);

/** Adds a skill to the person's list (an official one, or one just saved to the cloud). */
export function addSkill(config, name) {
  if (!name || isSkillEnabled(config, name)) return false;
  config.skillEnabledIds = [...enabledSkillIds(config), name];
  config.skillModelUseIds = [...normalizeSkillIds(config.skillModelUseIds).filter((entry) => entry !== name), name];
  stampSkill(config, 'skillStamps', name);
  stampSkill(config, 'skillUseStamps', name);
  return true;
}

export function removeSkill(config, name) {
  if (!isSkillEnabled(config, name)) return false;
  config.skillEnabledIds = enabledSkillIds(config).filter((entry) => entry !== name);
  config.skillModelUseIds = normalizeSkillIds(config.skillModelUseIds).filter((entry) => entry !== name);
  stampSkill(config, 'skillStamps', name);
  stampSkill(config, 'skillUseStamps', name);
  return true;
}

export function setSkillModelUse(config, name, allowed) {
  if (!isSkillEnabled(config, name)) return false;
  const others = normalizeSkillIds(config.skillModelUseIds).filter((entry) => entry !== name);
  config.skillModelUseIds = allowed ? [...others, name] : others;
  stampSkill(config, 'skillUseStamps', name);
  return true;
}

/**
 * The skills the person has now, official first and then their own, each { name, description, body, source, ... }: the official ones that are added, and
 * the ones in `userSkills` (what skill-store.js holds) that are added. A name that is in the list but nowhere (a skill removed from the cloud on another
 * device, an official one that left the app) is not there.
 */
export function activeSkills(config, userSkills = []) {
  const names = new Set(enabledSkillIds(config));
  const official = enabledSkillIds(config).map((name) => getOfficialSkill(name)).filter(Boolean).map((skill) => ({ ...skill, source: 'official' }));
  const own = (Array.isArray(userSkills) ? userSkills : []).filter((skill) => names.has(skill.name)).map((skill) => ({ ...skill, source: 'user' }));
  return [...official, ...own];
}

/** The skills named, as [{ name, body, files? }] (`files` for a skill that came as a zip), for the ones the person has now (a name that is not among them is left out). Order of `names`. */
export function resolveSkillBodies(config, userSkills, names) {
  const have = new Map(activeSkills(config, userSkills).map((skill) => [skill.name, skill]));
  return [...new Set(Array.isArray(names) ? names : [])].map((name) => have.get(name)).filter(Boolean).map((skill) => ({ name: skill.name, body: skill.body, ...(skill.files?.length ? { files: skill.files } : {}) }));
}
