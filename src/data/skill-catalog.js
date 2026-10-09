// The official skills (技能): the ones the owner puts in the Extensions page (docs/superpowers/specs/2026-10-09-skills-design.md). They are part of the app (no
// database), so they travel with a release. The list is only what the page needs to show it; the text of each skill is in skill-catalog-bodies.js, which the page
// loads when a skill is used or its details are opened (and which the server reads), so the text of every skill is not in the part of the page every visit loads.
//
// An entry: { name, description, version, author, i18n?: { '<language>': { title, description } } } with the same rules as a pasted skill (skill-format.js):
// name and description are what the model is given, whatever language the page is in; `i18n` is only how the page shows it. An entry may carry its `body` itself
// (the tests do); the ones of the app have it in skill-catalog-bodies.js.

import { SKILL_BODY_MAX, SKILL_DESCRIPTION_MAX, isSkillName } from './skill-format.js';

// A plain list (the tests put an entry in it and take it out again); entries are added here by the owner and not changed while the app runs.
export const OFFICIAL_SKILL_CATALOG = [
  {
    name: 'skill-creator',
    description: 'Helps the user create a new skill for their collection or improve one. Use whenever the user wants to make a skill, turn what they just did or a workflow into a reusable skill, write a SKILL.md, save "this way of doing it" for next time, or fix a skill that does not trigger or does not work well.',
    version: '1',
    author: 'Noureon',
    i18n: {
      'zh-TW': { title: '製作技能', description: '和你一起把做法整理成技能：問清楚用途、寫草稿、試做、修改，最後讓你看過全文再加入。' },
      en: { title: 'Make a skill', description: 'Works with you to turn a way of doing something into a skill: finds out what it is for, drafts it, tries it, improves it, and lets you read it all before you add it.' },
      fr: { title: 'Créer une compétence', description: 'Vous aide à transformer une façon de faire en compétence : comprend à quoi elle sert, rédige un brouillon, l’essaie, l’améliore, et vous laisse tout lire avant de l’ajouter.' },
      ru: { title: 'Создать навык', description: 'Помогает превратить ваш способ работы в навык: выясняет, для чего он нужен, пишет черновик, пробует его, улучшает и даёт прочесть всё перед добавлением.' },
      es: { title: 'Crear una habilidad', description: 'Te ayuda a convertir una forma de hacer algo en una habilidad: averigua para qué sirve, redacta un borrador, lo prueba, lo mejora y te deja leerlo todo antes de añadirlo.' }
    }
  }
];

const byName = () => new Map(OFFICIAL_SKILL_CATALOG.map((skill) => [skill.name, skill]));

export const getOfficialSkill = (name) => byName().get(String(name || '')) || null;
export const isOfficialSkillName = (name) => byName().has(String(name || ''));

/** What the page calls a skill, in a language: the title of the entry when it has one, else its name. */
export const skillTitle = (skill, language) => skill?.i18n?.[language]?.title || skill?.i18n?.en?.title || skill?.name || '';
/** What the page tells about a skill, in a language: the entry's own words for it when it has them, else its description. */
export const skillDescription = (skill, language) => skill?.i18n?.[language]?.description || skill?.i18n?.en?.description || skill?.description || '';

/** The text of an official skill when the entry carries it (the tests); the text of the ones of the app is in skill-catalog-bodies.js. */
export const inlineSkillBody = (skill) => (typeof skill?.body === 'string' && skill.body ? skill.body : '');

/** The text of an official skill, loaded when it is needed (a separate file of the page): the entry's own text, else the one of skill-catalog-bodies.js; '' when there is none. */
export async function loadOfficialSkillBody(name) {
  const entry = getOfficialSkill(name);
  if (!entry) return '';
  if (inlineSkillBody(entry)) return entry.body;
  const { OFFICIAL_SKILL_BODIES } = await import('./skill-catalog-bodies.js');
  return OFFICIAL_SKILL_BODIES[name] || '';
}

/** Whether an entry follows the rules (the tests run every entry through this, with its text from skill-catalog-bodies.js when it has none of its own). */
export function validateSkillEntry(skill) {
  const problems = [];
  if (!skill || typeof skill !== 'object') return ['not an object'];
  if (!isSkillName(skill.name)) problems.push('name');
  if (typeof skill.description !== 'string' || !skill.description.trim() || skill.description.length > SKILL_DESCRIPTION_MAX) problems.push('description');
  if (typeof skill.body !== 'string' || !skill.body.trim() || skill.body.length > SKILL_BODY_MAX) problems.push('body');
  if (typeof skill.version !== 'string' || !skill.version) problems.push('version');
  return problems;
}
