// The format of a skill (技能, docs/superpowers/specs/2026-10-09-skills-design.md): the public SKILL.md form, so a skill made elsewhere can be used as it
// is. A file starts with a header between two lines of "---" (a few "key: value" lines: `name` and `description` are the ones that count), and the rest is
// the text of the skill. Shared by the page (the window that takes a pasted skill) and the server (what it will give a model), so both judge the same way.
// Pure functions.

export const SKILL_NAME_MAX = 64;
export const SKILL_DESCRIPTION_MAX = 1024;
export const SKILL_BODY_MAX = 20_000;
/** The text pasted as a whole: a limit that only keeps a runaway paste out; the parts have their own limits. */
export const SKILL_TEXT_MAX = 60_000;
export const MAX_USER_SKILLS = 50;

/** A name: lower-case letters and digits in words joined by single hyphens (it is also what "/" is followed by). */
export const SKILL_NAME_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
export const isSkillName = (value) => typeof value === 'string' && value.length > 0 && value.length <= SKILL_NAME_MAX && SKILL_NAME_PATTERN.test(value);

const unquote = (value) => {
  const text = value.trim();
  if (text.length >= 2 && text.startsWith('"') && text.endsWith('"')) {
    try {
      return JSON.parse(text);
    } catch {
      return text.slice(1, -1).replace(/\\"/g, '"').replace(/\\\\/g, '\\');
    }
  }
  if (text.length >= 2 && text.startsWith("'") && text.endsWith("'")) return text.slice(1, -1).replace(/''/g, "'");
  // A comment after a plain value ("name: a # note") is not part of it.
  return text.replace(/\s+#.*$/, '');
};

/**
 * The top-level keys of a header, each as a string: a plain or quoted value, a folded (">") or literal ("|") block, or a value carried on
 * indented lines. A key whose value is a list or a map (`metadata:`) is read as the text of its lines and is not used. Returns null when a line is
 * neither a key nor a continuation (the header is not a header).
 */
function readHeader(lines) {
  const found = {};
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    if (!line.trim() || /^\s*#/.test(line)) continue;
    const match = /^([A-Za-z][A-Za-z0-9_-]*):(?:[ \t]+(.*))?$/.exec(line);
    if (!match) return null;
    const [, key, rest = ''] = match;
    const block = [];
    while (index + 1 < lines.length && (/^[ \t]+\S/.test(lines[index + 1]) || !lines[index + 1].trim())) {
      block.push(lines[index + 1]);
      index += 1;
    }
    while (block.length && !block[block.length - 1].trim()) block.pop();
    const indented = block.map((entry) => entry.trim());
    const style = /^([>|])[+-]?$/.exec(rest.trim());
    if (style) found[key] = style[1] === '|' ? indented.join('\n') : indented.join(' ').replace(/\s+/g, ' ');
    else if (rest.trim()) found[key] = [unquote(rest), ...indented].join(' ').replace(/\s+/g, ' ').trim();
    else found[key] = indented.join('\n');
  }
  return found;
}

const fail = (error) => ({ ok: false, error });

/**
 * Reads the text of a skill. Returns { ok: true, skill: { name, description, body, license?, compatibility? } }, or { ok: false, error } with one of:
 * empty, text_too_long, no_header, header_unclosed, header_invalid, name_missing, name_invalid, description_missing, description_too_long,
 * body_empty, body_too_long.
 */
export function parseSkillMarkdown(input) {
  const text = String(input ?? '').replace(/^﻿/, '').replace(/\r\n?/g, '\n');
  if (!text.trim()) return fail('empty');
  if (text.length > SKILL_TEXT_MAX) return fail('text_too_long');
  const lines = text.replace(/^\s*\n/, '').split('\n');
  if (lines[0].trim() !== '---') return fail('no_header');
  const end = lines.findIndex((line, index) => index > 0 && line.trim() === '---');
  if (end < 0) return fail('header_unclosed');
  const header = readHeader(lines.slice(1, end));
  if (!header) return fail('header_invalid');
  const name = String(header.name ?? '').trim();
  if (!name) return fail('name_missing');
  if (!isSkillName(name)) return fail('name_invalid');
  const description = String(header.description ?? '').replace(/\s+/g, ' ').trim();
  if (!description) return fail('description_missing');
  if (description.length > SKILL_DESCRIPTION_MAX) return fail('description_too_long');
  const body = lines.slice(end + 1).join('\n').replace(/^\s*\n/, '').trimEnd();
  if (!body.trim()) return fail('body_empty');
  if (body.length > SKILL_BODY_MAX) return fail('body_too_long');
  const skill = { name, description, body };
  for (const key of ['license', 'compatibility']) {
    const value = typeof header[key] === 'string' ? header[key].trim() : '';
    if (value && value.length <= 500) skill[key] = value;
  }
  return { ok: true, skill };
}

/** The text of a skill in the public form (what "details" shows, and what can be copied out again). */
export function serializeSkillMarkdown({ name, description, body }) {
  return `---\nname: ${name}\ndescription: ${JSON.stringify(String(description ?? '').replace(/\s+/g, ' ').trim())}\n---\n\n${String(body ?? '').trimEnd()}\n`;
}
