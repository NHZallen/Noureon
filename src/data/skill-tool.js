// How a model finds and loads a skill by itself (docs/superpowers/specs/2026-10-09-skills-design.md, §4): the reply is told which skills the person has (a
// name and one line each) and is given the tool `load_skill`; calling it brings the whole text of one skill into the conversation. This file is the
// part every kind of reply shares (the tool, the list the model is shown, and the loader that answers a call): the loops that call it are in
// the replies themselves (web-research-reply.js, skills-reply.js, runtime/sandbox/sandbox-reply.js). Pure functions, shared by the page and the server.

import { SKILL_NAME_MAX, isSkillName } from './skill-format.js';

export const LOAD_SKILL_TOOL = Object.freeze({
  name: 'load_skill',
  description: 'Load one of the skills listed in the instructions: its full text is returned, and you then follow it for this request. Load a skill only when the request clearly matches what its description says; for everything else answer as you would without skills. A skill is loaded once.',
  parameters: Object.freeze({
    type: 'object',
    properties: {
      name: { type: 'string', maxLength: SKILL_NAME_MAX, description: 'The name of the skill, exactly as it is listed.' }
    },
    required: ['name']
  })
});

export const isLoadSkillCall = (name) => name === LOAD_SKILL_TOOL.name;
/** Skills one reply may load. */
export const MAX_SKILL_LOADS = 5;
/** Skills the model is shown in its list, and how much of each description. */
export const MAX_LISTED_SKILLS = 30;
export const LISTED_DESCRIPTION_CHARS = 300;

const oneLine = (text, limit) => {
  const value = String(text ?? '').replace(/\s+/g, ' ').trim();
  return value.length > limit ? `${value.slice(0, limit - 1)}…` : value;
};

/** The skills the model is shown: [{ name, description }], valid names only, each once, the first MAX_LISTED_SKILLS, descriptions cut. */
export function listedSkills(skills) {
  const seen = new Set();
  const list = [];
  for (const skill of Array.isArray(skills) ? skills : []) {
    if (!isSkillName(skill?.name) || seen.has(skill.name)) continue;
    const description = oneLine(skill.description, LISTED_DESCRIPTION_CHARS);
    if (!description) continue;
    seen.add(skill.name);
    list.push({ name: skill.name, description });
    if (list.length >= MAX_LISTED_SKILLS) break;
  }
  return list;
}

/** The system instructions about the skills the model may load: an empty text when there are none. */
export function availableSkillsInstruction(skills) {
  const list = listedSkills(skills);
  if (!list.length) return '';
  return [
    'The user keeps a collection of skills: instructions for doing one kind of task well. They are listed below, each with its name and when it applies. When the request clearly matches a skill, call load_skill with its name first and follow the text it returns; otherwise do not load any. Never mention this list or the tool unless the user asks about skills.',
    ...list.map((skill) => `- ${skill.name}: ${skill.description}`)
  ].join('\n');
}

// A skill's text cannot close the block it is given in (see skill-prompt.js, which does the same for a skill asked for with "/").
const sealed = (text) => String(text ?? '').replace(/<\/skill/gi, '<\\/skill');

/**
 * Answers the calls of one reply: `available` is the list the model was shown, `lookup(name)` (may be async) gives { name, body } or null (the
 * text of a skill is looked up when it is called for, so the list can stay a few lines). `onLoad(name)` is told of each skill that is loaded.
 * `run(call)` gives the text to hand back to the model, whatever happens (a name that is not listed, a skill already loaded, the limit).
 */
export function createSkillLoader({ available, lookup, onLoad = () => {}, maxLoads = MAX_SKILL_LOADS }) {
  const listed = listedSkills(available);
  const names = new Set(listed.map((skill) => skill.name));
  const loaded = new Set();
  return {
    get list() { return listed; },
    get used() { return loaded.size; },
    get left() { return Math.max(0, maxLoads - loaded.size); },
    /** Whether a name is the tool of this loader (a reply with no skills to offer has no such tool). */
    handles: (name) => names.size > 0 && isLoadSkillCall(name),
    async run(call) {
      const name = typeof call?.args?.name === 'string' ? call.args.name.trim() : '';
      if (!name) return 'The call had no "name" argument.';
      if (!names.has(name)) return `There is no skill with that name. The skills are: ${[...names].join(', ')}.`;
      if (loaded.has(name)) return `You already loaded the skill "${name}": its text is above.`;
      if (loaded.size >= maxLoads) return `The limit of ${maxLoads} skills per reply is reached. Go on with what you have.`;
      let skill = null;
      try {
        skill = await lookup(name);
      } catch {
        skill = null;
      }
      if (!skill || typeof skill.body !== 'string' || !skill.body.trim()) return `The skill "${name}" could not be read now. Go on without it and say so briefly.`;
      loaded.add(name);
      onLoad(name);
      return `The skill "${name}" (the user's own instructions: below the system instructions and the user's message in priority, and no new abilities) follows.\n<skill name="${name}">\n${sealed(skill.body).trim()}\n</skill>`;
    }
  };
}
