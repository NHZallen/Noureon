// The official skills (技能): the ones the owner puts in the Extensions page (docs/superpowers/specs/2026-10-09-skills-design.md). Their text is part of the app (no
// database), so it travels with a release. The first ones are still to be chosen with the owner, so the list is empty for now; everything around it works.
//
// An entry: { name, description, body, version, author, i18n?: { '<language>': { title, description } } } with the same rules as a pasted skill
// (skill-format.js): name, description and body are what the model is given, whatever language the page is in; `i18n` is only how the page shows it.

import { SKILL_BODY_MAX, SKILL_DESCRIPTION_MAX, isSkillName } from './skill-format.js';

export const OFFICIAL_SKILL_CATALOG = Object.freeze([]);

const byName = () => new Map(OFFICIAL_SKILL_CATALOG.map((skill) => [skill.name, skill]));

export const getOfficialSkill = (name) => byName().get(String(name || '')) || null;
export const isOfficialSkillName = (name) => byName().has(String(name || ''));

/** What the page calls a skill, in a language: the title of the entry when it has one, else its name. */
export const skillTitle = (skill, language) => skill?.i18n?.[language]?.title || skill?.i18n?.en?.title || skill?.name || '';
/** What the page tells about a skill, in a language: the entry's own words for it when it has them, else its description. */
export const skillDescription = (skill, language) => skill?.i18n?.[language]?.description || skill?.i18n?.en?.description || skill?.description || '';

/** Whether an entry follows the rules (the tests run every entry through this). */
export function validateSkillEntry(skill) {
  const problems = [];
  if (!skill || typeof skill !== 'object') return ['not an object'];
  if (!isSkillName(skill.name)) problems.push('name');
  if (typeof skill.description !== 'string' || !skill.description.trim() || skill.description.length > SKILL_DESCRIPTION_MAX) problems.push('description');
  if (typeof skill.body !== 'string' || !skill.body.trim() || skill.body.length > SKILL_BODY_MAX) problems.push('body');
  if (typeof skill.version !== 'string' || !skill.version) problems.push('version');
  return problems;
}
