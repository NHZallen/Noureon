// The files that come with an official skill (src/data/official-skills/<name>/), for the page: the Extensions page shows them, the model may read them, and a
// reply with the browser's Python puts them in its /skills folder. The build makes each one a file of its own, loaded only when a skill's files are needed.
// Official skills carry text files only (scripts and notes), so they are kept as text. The server reads the same files from its disk (server/official-skill-files.js).

import { getOfficialSkill } from '../../../data/skill-catalog.js';

// Called only on the page: the build turns this into a table of loaders (Node, in the tests, has no such thing and gets nothing).
const sources = () => import.meta.glob(['../../../data/official-skills/**/*', '!**/__pycache__/**'], { query: '?raw', import: 'default' });

/** The files of an official skill: [{ path, size, kind, bytes }], or null when it has none or they cannot be loaded. */
export async function loadOfficialSkillFiles(name, { table = null } = {}) {
  const entry = getOfficialSkill(name);
  const listed = Array.isArray(entry?.files) ? entry.files : [];
  if (!listed.length) return null;
  try {
    const loaders = table || sources();
    const encoder = new TextEncoder();
    return await Promise.all(listed.map(async (file) => {
      const load = loaders[`../../../data/official-skills/${entry.name}/${file.path}`];
      if (typeof load !== 'function') throw new Error(`Missing file of the skill: ${file.path}`);
      const bytes = encoder.encode(String(await load()));
      return { path: file.path, size: bytes.byteLength, kind: file.kind === 'script' ? 'script' : 'text', bytes };
    }));
  } catch {
    return null;
  }
}
