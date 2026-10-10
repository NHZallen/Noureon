// The text of the skills (技能) a reply on the server may load (docs/superpowers/specs/2026-10-09-skills-design.md, §4): the page tells the server only the names and
// descriptions of the person's skills; when the model calls for one, its text is read here, from the app's official skills or from the person's own rows of the
// table user_skills (only the rows of that person; the server reads them with its service role). A skill that came as a zip also has files: the list is in its
// row, and a text file is read from the stored zip, which is opened again with the checks of src/data/skill-bundle.js (what is stored is not trusted).

import { getOfficialSkill, loadOfficialSkillBody } from '../src/data/skill-catalog.js';
import { isSkillName } from '../src/data/skill-format.js';
import { SKILL_BUNDLE_LIMITS, bundleFileList, bundleFileText, readSkillBundle } from '../src/data/skill-bundle.js';

// A zip opened for a reply is kept a little while: the model may read several files of it one after the other.
const OPEN_KEEP_MS = 60_000;
const OPEN_KEEP_COUNT = 12;

export function createServerSkills({ db, bundles = null, now = Date.now }) {
  const opened = new Map();

  async function open(userId, name) {
    const key = `${userId}/${name}`;
    const kept = opened.get(key);
    if (kept && now() - kept.at < OPEN_KEEP_MS) return kept.result;
    opened.delete(key);
    let result = null;
    try {
      const bytes = bundles ? await bundles.download(userId, name) : null;
      const read = bytes ? await readSkillBundle(bytes, { buildBundle: false }) : null;
      result = read?.ok ? read.files : null;
    } catch {
      result = null;
    }
    if (result) {
      opened.set(key, { at: now(), result });
      while (opened.size > OPEN_KEEP_COUNT) opened.delete(opened.keys().next().value);
    }
    return result;
  }

  return {
    /** The text of one skill for a person: { name, body, files? } or null (`files`: [{ path, size, kind }] of a skill that came as a zip). */
    async body(userId, name) {
      if (!isSkillName(name)) return null;
      const official = getOfficialSkill(name);
      if (official) {
        const body = await loadOfficialSkillBody(name);
        return body ? { name: official.name, body } : null;
      }
      if (!userId) return null;
      const rows = await db.select('user_skills', { filters: { user_id: `eq.${userId}`, name: `eq.${name}` }, select: 'name,body,files', limit: 1 });
      const row = Array.isArray(rows) ? rows[0] : null;
      if (!row || typeof row.body !== 'string') return null;
      const files = Array.isArray(row.files) ? bundleFileList(row.files.filter((file) => file && typeof file.path === 'string' && file.path)) : [];
      return { name: row.name, body: row.body, ...(files.length ? { files } : {}) };
    },
    /** All the files of a skill of the person's, with their bytes, for the sandbox: [{ path, size, kind, bytes }] or null (no zip, or a zip that does not pass the checks). */
    async files(userId, name) {
      if (!userId || !isSkillName(name)) return null;
      return open(userId, name);
    },
    /** The text of one file of a skill of the person's: { ok: true, text, cut } or { ok: false, reason } ('not_found', 'binary', 'failed'). */
    async readFile(userId, name, path) {
      if (!userId || !isSkillName(name) || typeof path !== 'string' || !path) return { ok: false, reason: 'not_found' };
      const files = await open(userId, name);
      if (!files) return { ok: false, reason: 'failed' };
      if (!files.some((file) => file.path === path)) return { ok: false, reason: 'not_found' };
      const text = bundleFileText(files, path, SKILL_BUNDLE_LIMITS.readChars);
      return text ? { ok: true, text: text.text, cut: text.cut } : { ok: false, reason: 'binary' };
    }
  };
}
