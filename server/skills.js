// The text of the skills (技能) a reply on the server may load (docs/superpowers/specs/2026-10-09-skills-design.md, §4): the page tells the server only the names and
// descriptions of the person's skills; when the model calls for one, its text is read here, from the app's official skills or from the person's own rows of the
// table user_skills (only the rows of that person; the server reads them with its service role).

import { getOfficialSkill } from '../src/data/skill-catalog.js';
import { isSkillName } from '../src/data/skill-format.js';

export function createServerSkills({ db }) {
  return {
    /** The text of one skill for a person: { name, body } or null. */
    async body(userId, name) {
      if (!isSkillName(name)) return null;
      const official = getOfficialSkill(name);
      if (official) return { name: official.name, body: official.body };
      if (!userId) return null;
      const rows = await db.select('user_skills', { filters: { user_id: `eq.${userId}`, name: `eq.${name}` }, select: 'name,body', limit: 1 });
      const row = Array.isArray(rows) ? rows[0] : null;
      return row && typeof row.body === 'string' ? { name: row.name, body: row.body } : null;
    }
  };
}
