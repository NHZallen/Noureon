// The skills a person added themselves (docs/superpowers/specs/2026-10-09-skills-design.md): their text is kept in the cloud table user_skills (each person reads
// and changes only their own rows, with the signed-in session), and held here so the page can list them and a reply can use them without asking again.
// `getClient()` gives the Supabase client (or null when the cloud is not set up), `getUserId()` the signed-in account's id (or '' when there is none);
// either may answer at once or later (the account library is loaded when first needed). What is held belongs to the account seen at the last call
// that asked (`ensure`, `list`, `add`, `remove`): a reply asks first, so it never uses the skills of an account that has been left.

import { isOfficialSkillName } from '../../../data/skill-catalog.js';
import { MAX_USER_SKILLS, isSkillName, parseSkillMarkdown } from '../../../data/skill-format.js';
import { SKILL_BUNDLE_BUCKET, bundleFileList, readSkillBundle, skillBundlePath } from '../../../data/skill-bundle.js';

const TABLE = 'user_skills';
const COLUMNS = 'name,description,body,created_at,updated_at,file_count,files';

// The files a row lists (path, size, kind); anything that is not that shape is left out.
const listedFiles = (value) => bundleFileList((Array.isArray(value) ? value : []).filter((file) => file && typeof file.path === 'string' && file.path));

const rowToSkill = (row) => ({ name: row.name, description: row.description, body: row.body, source: 'user', createdAt: row.created_at, updatedAt: row.updated_at, files: listedFiles(row.files) });

export function createSkillStore({ getClient, getUserId, onChange = () => {}, isOfficial = isOfficialSkillName }) {
  let owner = '';
  let skills = [];
  let loaded = false;
  // The files of skills opened from their zips (openBundle), until the skill changes.
  const opened = new Map();

  const forget = () => {
    owner = '';
    skills = [];
    loaded = false;
    opened.clear();
  };
  // The stored zip of a skill goes (a failure is not told: a copy left behind is only unused space, and the row is what the person sees).
  const dropBundle = async (handle, name) => {
    try {
      await handle.supabase.storage.from(SKILL_BUNDLE_BUCKET).remove([skillBundlePath(handle.userId, name)]);
    } catch {
      // Nothing to do.
    }
  };
  const resolve = async () => {
    const userId = typeof getUserId === 'function' ? String((await getUserId()) || '') : '';
    const supabase = userId && typeof getClient === 'function' ? await getClient() : null;
    if (userId !== owner) forget();
    if (!userId || !supabase) return null;
    return { userId, supabase };
  };

  return {
    /** Looks at who is signed in now (what is held is dropped when it is not the same account). Returns whether someone is, with the cloud. */
    async ensure() {
      return Boolean(await resolve());
    },
    /** The skills held now (the ones last read or changed), in name order. Empty before the first `list`, and after the account changes. */
    cached() {
      return [...skills];
    },
    get loaded() {
      return loaded;
    },
    /** Reads the person's skills from the cloud (once per account, again when `force`). A failure keeps what was held and says so. */
    async list({ force = false } = {}) {
      const handle = await resolve();
      if (!handle) return { ok: false, error: 'signed_out', skills: [] };
      if (loaded && !force) return { ok: true, skills: [...skills] };
      const { data, error } = await handle.supabase.from(TABLE).select(COLUMNS).eq('user_id', handle.userId).order('name', { ascending: true }).limit(MAX_USER_SKILLS + 10);
      if (error) return { ok: false, error: 'failed', skills: [...skills] };
      owner = handle.userId;
      skills = (Array.isArray(data) ? data : []).filter((row) => isSkillName(row?.name)).map(rowToSkill);
      opened.clear();
      loaded = true;
      onChange();
      return { ok: true, skills: [...skills] };
    },
    /**
     * Adds the skill written in `text` (the SKILL.md form), or with `replace` changes the skill of that name. Returns { ok: true, skill } or
     * { ok: false, error } with the errors of parseSkillMarkdown, or signed_out, name_taken (an official skill's name, or one the person has),
     * too_many, failed.
     */
    async add(text, { replace = false } = {}) {
      const handle = await resolve();
      if (!handle) return { ok: false, error: 'signed_out' };
      const parsed = parseSkillMarkdown(text);
      if (!parsed.ok) return parsed;
      const { skill } = parsed;
      if (isOfficial(skill.name)) return { ok: false, error: 'name_taken' };
      const listed = await this.list();
      if (!listed.ok) return { ok: false, error: listed.error };
      const previous = skills.find((entry) => entry.name === skill.name);
      const exists = Boolean(previous);
      if (exists && !replace) return { ok: false, error: 'name_taken' };
      if (!exists && skills.length >= MAX_USER_SKILLS) return { ok: false, error: 'too_many' };
      const row = { user_id: handle.userId, name: skill.name, description: skill.description, body: skill.body, updated_at: new Date().toISOString() };
      // A text that takes the place of a skill with files leaves it without them (the zip goes too).
      const hadFiles = Boolean(previous?.files?.length);
      const { error } = exists
        ? await handle.supabase.from(TABLE).update({ description: row.description, body: row.body, updated_at: row.updated_at, ...(hadFiles ? { file_count: 0, files: [] } : {}) }).eq('user_id', handle.userId).eq('name', skill.name)
        : await handle.supabase.from(TABLE).insert(row);
      if (error) return { ok: false, error: /skill_limit/.test(String(error.message || '')) ? 'too_many' : 'failed' };
      if (hadFiles) await dropBundle(handle, skill.name);
      const saved = { name: skill.name, description: skill.description, body: skill.body, source: 'user', createdAt: row.updated_at, updatedAt: row.updated_at, files: [] };
      skills = [...skills.filter((entry) => entry.name !== skill.name), saved].sort((a, b) => a.name.localeCompare(b.name));
      opened.delete(skill.name);
      onChange();
      return { ok: true, skill: saved };
    },
    /**
     * Adds a skill from a zip (docs/superpowers/specs/2026-10-09-skills-design.md, §14): `input` is the bytes of the zip, or what readSkillBundle already gave for them
     * (the window that shows the files reads them first). The clean copy goes to the bucket of bundles, then the row (with the list of files) is written; a row that
     * cannot be written takes the copy back. Returns { ok: true, skill } or { ok: false, error, detail? } with the errors of readSkillBundle and of `add`.
     */
    async addBundle(input, { replace = false } = {}) {
      const handle = await resolve();
      if (!handle) return { ok: false, error: 'signed_out' };
      const read = input && typeof input === 'object' && 'ok' in input && !(input instanceof Uint8Array) ? input : await readSkillBundle(input);
      if (!read.ok) return read;
      if (!read.bundle) return { ok: false, error: 'not_a_zip' };
      const { skill } = read;
      if (isOfficial(skill.name)) return { ok: false, error: 'name_taken' };
      const listed = await this.list();
      if (!listed.ok) return { ok: false, error: listed.error };
      const previous = skills.find((entry) => entry.name === skill.name);
      if (previous && !replace) return { ok: false, error: 'name_taken' };
      if (!previous && skills.length >= MAX_USER_SKILLS) return { ok: false, error: 'too_many' };
      const path = skillBundlePath(handle.userId, skill.name);
      const uploaded = await handle.supabase.storage.from(SKILL_BUNDLE_BUCKET).upload(path, read.bundle, { upsert: true, contentType: 'application/zip' });
      if (uploaded?.error) return { ok: false, error: 'failed' };
      const files = bundleFileList(read.files);
      const stamp = new Date().toISOString();
      const fields = { description: skill.description, body: skill.body, file_count: files.length, files, updated_at: stamp };
      const { error } = previous
        ? await handle.supabase.from(TABLE).update(fields).eq('user_id', handle.userId).eq('name', skill.name)
        : await handle.supabase.from(TABLE).insert({ user_id: handle.userId, name: skill.name, ...fields });
      if (error) {
        if (!previous) await dropBundle(handle, skill.name);
        return { ok: false, error: /skill_limit/.test(String(error.message || '')) ? 'too_many' : 'failed' };
      }
      const saved = { name: skill.name, description: skill.description, body: skill.body, source: 'user', createdAt: previous?.createdAt || stamp, updatedAt: stamp, files };
      skills = [...skills.filter((entry) => entry.name !== skill.name), saved].sort((a, b) => a.name.localeCompare(b.name));
      opened.delete(skill.name);
      onChange();
      return { ok: true, skill: saved };
    },
    /**
     * The files of a skill with files, opened from the stored copy: { ok: true, skill, files } (each file with its bytes) as readSkillBundle gives them, or
     * { ok: false, error } with signed_out, no_files (the skill has none, or is not one of the person's), failed. Held until the skill changes.
     */
    async openBundle(name) {
      const handle = await resolve();
      if (!handle) return { ok: false, error: 'signed_out' };
      if (!isSkillName(name)) return { ok: false, error: 'name_invalid' };
      if (opened.has(name)) return opened.get(name);
      const listed = await this.list();
      if (!listed.ok) return { ok: false, error: listed.error };
      if (!skills.find((entry) => entry.name === name)?.files?.length) return { ok: false, error: 'no_files' };
      const downloaded = await handle.supabase.storage.from(SKILL_BUNDLE_BUCKET).download(skillBundlePath(handle.userId, name));
      if (downloaded?.error || !downloaded?.data) return { ok: false, error: 'failed' };
      const read = await readSkillBundle(new Uint8Array(await downloaded.data.arrayBuffer()), { buildBundle: false });
      if (!read.ok) return { ok: false, error: 'failed' };
      const result = { ok: true, skill: read.skill, files: read.files };
      opened.set(name, result);
      return result;
    },
    async remove(name) {
      const handle = await resolve();
      if (!handle) return { ok: false, error: 'signed_out' };
      if (!isSkillName(name)) return { ok: false, error: 'name_invalid' };
      const hadFiles = Boolean(skills.find((entry) => entry.name === name)?.files?.length);
      const { error } = await handle.supabase.from(TABLE).delete().eq('user_id', handle.userId).eq('name', name);
      if (error) return { ok: false, error: 'failed' };
      if (hadFiles) await dropBundle(handle, name);
      opened.delete(name);
      skills = skills.filter((entry) => entry.name !== name);
      onChange();
      return { ok: true };
    }
  };
}
