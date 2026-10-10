// The draft of a skill a model writes for the person (docs/superpowers/specs/2026-10-09-skills-design.md, §15): the text of a ```skill-draft block. It is either the text of a
// SKILL.md alone, or, when the skill has files, the text of every file, each after a line that names it:
//
//   === SKILL.md ===
//   ---
//   name: sales-report
//   ...
//   === scripts/summary.py ===
//   print("...")
//
// Text before the first such line is the SKILL.md too (a draft with files may leave out the first line). A draft with files is turned into a skill pack and checked as
// an uploaded zip is (skill-bundle.js), so a file the pack would refuse is refused here for the same reason. Nothing is run. Loaded with the first card of a draft.

import { readSkillBundle } from './skill-bundle.js';

const MARKER = /^=== (.+?) ===[ \t]*$/;

/** Whether a draft has files (a line `=== path ===` somewhere in it). */
export const draftHasFiles = (text) => String(text ?? '').split(/\r?\n/).some((line) => MARKER.test(line));

/**
 * The files of a draft: [{ path, text }], SKILL.md first. A file's text has no blank line at its start and ends with one line break. A draft without files is
 * [{ path: 'SKILL.md', text }].
 */
export function splitDraft(text) {
  const lines = String(text ?? '').replace(/\r\n?/g, '\n').split('\n');
  const files = [];
  let current = { path: 'SKILL.md', lines: [] };
  let sawMarker = false;
  for (const line of lines) {
    const match = MARKER.exec(line);
    if (!match) {
      current.lines.push(line);
      continue;
    }
    // Text before the first line is the SKILL.md, if there is any; a first line that names SKILL.md is that same file.
    if (!sawMarker && !current.lines.some((entry) => entry.trim())) current = { path: match[1].trim(), lines: [] };
    else {
      files.push(current);
      current = { path: match[1].trim(), lines: [] };
    }
    sawMarker = true;
  }
  files.push(current);
  return files.map((file) => ({ path: file.path, text: `${file.lines.join('\n').replace(/^\n+/, '').replace(/\n+$/, '')}\n` }));
}

/**
 * Checks a draft with files like an uploaded pack: resolves what readSkillBundle gives ({ ok: true, skill, files, bundle } or { ok: false, error, detail? }), which is what the
 * window that shows a pack takes. `loadZip` is for the tests.
 */
export async function readDraftBundle(text, { loadZip = null } = {}) {
  const files = splitDraft(text);
  const names = files.map((file) => file.path.toLowerCase());
  if (names.filter((name) => name === 'skill.md').length !== 1) return { ok: false, error: names.includes('skill.md') ? 'duplicate_path' : 'skill_md_missing', detail: 'SKILL.md' };
  const JSZip = loadZip ? await loadZip() : (await import('jszip')).default;
  const zip = new JSZip();
  for (const file of files) zip.file(file.path.toLowerCase() === 'skill.md' ? 'SKILL.md' : file.path, file.text);
  return readSkillBundle(await zip.generateAsync({ type: 'uint8array' }), { loadZip });
}
