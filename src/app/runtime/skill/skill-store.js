// The skills a person added themselves (docs/superpowers/specs/2026-10-09-skills-design.md): their text is kept in the cloud table user_skills (each person reads
// and changes only their own rows, with the signed-in session), and held here so the page can list them and a reply can use them without asking again.
// `getClient()` gives the Supabase client (or null when the cloud is not set up), `getUserId()` the signed-in account's id (or '' when there is none);
// either may answer at once or later (the account library is loaded when first needed). What is held belongs to the account seen at the last call
// that asked (`ensure`, `list`, `add`, `remove`): a reply asks first, so it never uses the skills of an account that has been left.

import { isOfficialSkillName } from '../../../data/skill-catalog.js';
import { MAX_USER_SKILLS, isSkillName, parseSkillMarkdown } from '../../../data/skill-format.js';

const TABLE = 'user_skills';
const COLUMNS = 'name,description,body,created_at,updated_at';

const rowToSkill = (row) => ({ name: row.name, description: row.description, body: row.body, source: 'user', createdAt: row.created_at, updatedAt: row.updated_at });

export function createSkillStore({ getClient, getUserId, onChange = () => {}, isOfficial = isOfficialSkillName }) {
  let owner = '';
  let skills = [];
  let loaded = false;

  const forget = () => {
    owner = '';
    skills = [];
    loaded = false;
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
      const exists = skills.some((entry) => entry.name === skill.name);
      if (exists && !replace) return { ok: false, error: 'name_taken' };
      if (!exists && skills.length >= MAX_USER_SKILLS) return { ok: false, error: 'too_many' };
      const row = { user_id: handle.userId, name: skill.name, description: skill.description, body: skill.body, updated_at: new Date().toISOString() };
      const { error } = exists
        ? await handle.supabase.from(TABLE).update({ description: row.description, body: row.body, updated_at: row.updated_at }).eq('user_id', handle.userId).eq('name', skill.name)
        : await handle.supabase.from(TABLE).insert(row);
      if (error) return { ok: false, error: /skill_limit/.test(String(error.message || '')) ? 'too_many' : 'failed' };
      const saved = { name: skill.name, description: skill.description, body: skill.body, source: 'user', createdAt: row.updated_at, updatedAt: row.updated_at };
      skills = [...skills.filter((entry) => entry.name !== skill.name), saved].sort((a, b) => a.name.localeCompare(b.name));
      onChange();
      return { ok: true, skill: saved };
    },
    async remove(name) {
      const handle = await resolve();
      if (!handle) return { ok: false, error: 'signed_out' };
      if (!isSkillName(name)) return { ok: false, error: 'name_invalid' };
      const { error } = await handle.supabase.from(TABLE).delete().eq('user_id', handle.userId).eq('name', name);
      if (error) return { ok: false, error: 'failed' };
      skills = skills.filter((entry) => entry.name !== name);
      onChange();
      return { ok: true };
    }
  };
}
