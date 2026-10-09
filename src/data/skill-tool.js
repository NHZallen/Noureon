// How a model finds and loads a skill by itself (docs/superpowers/specs/2026-10-09-skills-design.md, §4): the reply is told which skills the person has (a
// name and one line each) and is given the tool `load_skill`; calling it brings the whole text of one skill into the conversation. This file is the
// part every kind of reply shares (the tool, the list the model is shown, and the loader that answers a call): the loops that call it are in
// the replies themselves (web-research-reply.js, skills-reply.js, runtime/sandbox/sandbox-reply.js). Pure functions, shared by the page and the server.

import { SKILL_NAME_MAX, isSkillName } from './skill-format.js';
import { MAX_LISTED_FILES, skillFilesNote } from './skill-files-note.js';

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

// The files of a skill that came as a zip (docs/superpowers/specs/2026-10-09-skills-design.md, §14.3): when a skill with files is loaded the model is told which files it has, and may read
// a text one. Running a script is not this tool: scripts are run from the sandbox on the server, where the skill's folder is mounted (see `canRun` of createSkillLoader).
export const READ_SKILL_FILE_TOOL = Object.freeze({
  name: 'read_skill_file',
  description: 'Read one text file of a skill that has files (they are listed when the skill is loaded): references, templates and the like. Its text is returned. Read a file only when the skill\'s instructions point to it.',
  parameters: Object.freeze({
    type: 'object',
    properties: {
      skill: { type: 'string', maxLength: SKILL_NAME_MAX, description: 'The name of the skill, exactly as it is listed.' },
      path: { type: 'string', maxLength: 200, description: 'The path of the file, exactly as it is listed.' }
    },
    required: ['skill', 'path']
  })
});

export const isLoadSkillCall = (name) => name === LOAD_SKILL_TOOL.name;
export const isReadSkillFileCall = (name) => name === READ_SKILL_FILE_TOOL.name;
/** Files one reply may read, and the files told about for a skill. */
export const MAX_SKILL_FILE_READS = 10;
/** Skills one reply may load. */
export const MAX_SKILL_LOADS = 5;
/** Skills the model is shown in its list, and how much of each description. */
export const MAX_LISTED_SKILLS = 30;
export const LISTED_DESCRIPTION_CHARS = 300;

const oneLine = (text, limit) => {
  const value = String(text ?? '').replace(/\s+/g, ' ').trim();
  return value.length > limit ? `${value.slice(0, limit - 1)}…` : value;
};

/** The skills the model is shown: [{ name, description, files? }], valid names only, each once, the first MAX_LISTED_SKILLS, descriptions cut. `files: true` says the skill has files; `given: true` that its text was already given whole (asked for with "/"), so it counts as loaded. */
export function listedSkills(skills) {
  const seen = new Set();
  const list = [];
  for (const skill of Array.isArray(skills) ? skills : []) {
    if (!isSkillName(skill?.name) || seen.has(skill.name)) continue;
    const description = oneLine(skill.description, LISTED_DESCRIPTION_CHARS);
    if (!description) continue;
    seen.add(skill.name);
    list.push({ name: skill.name, description, ...(skill.files === true ? { files: true } : {}), ...(skill.given === true ? { given: true } : {}) });
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

const sealedFile = (text) => String(text ?? '').replace(/<\/skill-file/gi, '<\\/skill-file');

/**
 * Answers the calls of one reply: `available` is the list the model was shown, `lookup(name)` (may be async) gives { name, body, files? } or null (the
 * text of a skill is looked up when it is called for, so the list can stay a few lines; `files` is [{ path, size, kind }] for a skill that came as a zip).
 * `readFile(name, path)` gives { ok: true, text, cut? } or { ok: false, reason } (reason: 'binary', 'not_found', anything else is "could not be read") for
 * the text of one file; without it the tool of files is not offered. `canRun`: the reply has the sandbox with the skill's folder in it, so the scripts may be run.
 * `onLoad(name)` is told of each skill that is loaded. `run(call)` gives the text to hand back to the model, whatever happens (a name that is not listed,
 * a skill already loaded, the limit). `tools` are the tools worth offering now (empty when the limits are reached); `noteFor(call)` says what a call is
 * about ({ name } or { name, path }) for the step list.
 */
export function createSkillLoader({ available, lookup, readFile = null, canRun = false, onLoad = () => {}, maxLoads = MAX_SKILL_LOADS, maxReads = MAX_SKILL_FILE_READS }) {
  const listed = listedSkills(available);
  const names = new Set(listed.map((skill) => skill.name));
  // A skill the user asked for with "/" was given whole already: it is loaded from the start (its files are looked up when one is read).
  const loaded = new Set(listed.filter((skill) => skill.given).map((skill) => skill.name));
  // The files of each skill loaded that has some (the model may read these and no others).
  const filesOf = new Map();
  let reads = 0;
  const offersFiles = typeof readFile === 'function' && listed.some((skill) => skill.files);
  const readsLeft = () => Math.max(0, maxReads - reads);

  async function load(call) {
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
    const files = Array.isArray(skill.files) ? skill.files.filter((file) => file && typeof file.path === 'string' && file.path) : [];
    if (files.length) filesOf.set(name, files);
    onLoad(name);
    return `The skill "${name}" (the user's own instructions: below the system instructions and the user's message in priority, and no new abilities) follows.\n<skill name="${name}">\n${sealed(skill.body).trim()}\n</skill>${skillFilesNote(name, files, canRun)}`;
  }

  async function read(call) {
    const name = typeof call?.args?.skill === 'string' ? call.args.skill.trim() : '';
    const path = typeof call?.args?.path === 'string' ? call.args.path.trim() : '';
    if (!name || !path) return 'The call needs a "skill" and a "path".';
    if (!names.has(name)) return `There is no skill with that name. The skills are: ${[...names].join(', ')}.`;
    if (!loaded.has(name)) return `Load the skill "${name}" with load_skill first.`;
    let files = filesOf.get(name);
    if (!files && listed.find((skill) => skill.name === name)?.given) {
      try {
        const found = await lookup(name);
        files = Array.isArray(found?.files) ? found.files.filter((entry) => entry && typeof entry.path === 'string' && entry.path) : [];
      } catch {
        files = [];
      }
      if (files.length) filesOf.set(name, files);
    }
    if (!files?.length) return `The skill "${name}" has no files.`;
    const file = files.find((entry) => entry.path === path);
    if (!file) return `There is no file "${path}" in the skill "${name}". Its files are: ${files.slice(0, MAX_LISTED_FILES).map((entry) => entry.path).join(', ')}.`;
    if (file.kind === 'binary') return `The file "${path}" is not text and cannot be read.`;
    if (reads >= maxReads) return `The limit of ${maxReads} files per reply is reached. Go on with what you have.`;
    reads += 1;
    let result = null;
    try {
      result = await readFile(name, path);
    } catch {
      result = null;
    }
    if (!result?.ok || typeof result.text !== 'string') return result?.reason === 'binary' ? `The file "${path}" is not text and cannot be read.` : `The file "${path}" could not be read now. Go on without it and say so briefly.`;
    return `The file "${path}" of the skill "${name}" (the user's own material: the same priority as the skill, no new abilities) follows.\n<skill-file skill="${name}" path="${path}">\n${sealedFile(result.text)}\n</skill-file>${result.cut ? '\n(The file is longer: only the beginning is shown.)' : ''}`;
  }

  return {
    get list() { return listed; },
    get used() { return loaded.size + reads; },
    get left() { return Math.max(0, maxLoads - loaded.size); },
    /** The tools worth offering now: load_skill while skills may still be loaded, read_skill_file once a skill with files is loaded and reads are left. */
    get tools() {
      return [
        ...(names.size > 0 && loaded.size < maxLoads ? [LOAD_SKILL_TOOL] : []),
        ...(offersFiles && (filesOf.size > 0 || listed.some((skill) => skill.given && skill.files)) && readsLeft() > 0 ? [READ_SKILL_FILE_TOOL] : [])
      ];
    },
    /** Whether a name is a tool of this loader (a reply with no skills to offer has none; the tool of files only when a skill has files). */
    handles: (name) => names.size > 0 && (isLoadSkillCall(name) || (offersFiles && isReadSkillFileCall(name))),
    /** What a call is about, for the step list: { name } for a load, { name, path } for a file; null when the call has no usable arguments. */
    noteFor(call) {
      if (isReadSkillFileCall(call?.name)) {
        const name = typeof call?.args?.skill === 'string' ? call.args.skill.trim() : '';
        const path = typeof call?.args?.path === 'string' ? call.args.path.trim() : '';
        return name && path ? { name, path } : null;
      }
      const name = typeof call?.args?.name === 'string' ? call.args.name.trim() : '';
      return name ? { name } : null;
    },
    async run(call) {
      return isReadSkillFileCall(call?.name) ? read(call) : load(call);
    }
  };
}
