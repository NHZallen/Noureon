// Where the zips of the skills with files are kept (docs/superpowers/specs/2026-10-09-skills-design.md, §14.2): the private bucket `user-skill-bundles`, one file for each
// skill of a person at `<person>/<skill name>.zip`. The server reads them with its service role, only for the person the reply is for.

import { SKILL_BUNDLE_BUCKET, SKILL_BUNDLE_LIMITS, skillBundlePath } from '../src/data/skill-bundle.js';
import { isSkillName } from '../src/data/skill-format.js';

const USER_ID = /^[0-9a-f-]{36}$/i;
const SAFE_STORED = /^[0-9a-f-]{36}\/.{1,300}$/i;
const encodePath = (path) => path.split('/').map((segment) => encodeURIComponent(segment)).join('/');

export function createSkillBundleStore({ url, serviceKey, fetchImpl = fetch, timeoutMs = 60_000 }) {
  return {
    /**
     * Removes files of the bucket through the storage API (which also frees their space): paths like `<person>/<name>`, nothing else (a person's folder and one name, or a
     * folder in it; never a path that goes up, has a backslash or starts anywhere but a person's folder). Resolves how many it was asked to remove.
     */
    async removeAll(paths) {
      const prefixes = (Array.isArray(paths) ? paths : []).map(String).filter((path) => SAFE_STORED.test(path) && !path.includes('..') && !path.includes('\\'));
      if (!prefixes.length) return 0;
      const response = await fetchImpl(`${url}/storage/v1/object/${SKILL_BUNDLE_BUCKET}`, {
        method: 'DELETE',
        headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ prefixes }),
        signal: AbortSignal.timeout(timeoutMs)
      });
      if (!response.ok) throw Object.assign(new Error(`The files could not be removed (${response.status}).`), { status: response.status });
      return prefixes.length;
    },
    /** The bytes of the zip of one skill of one person, or null when there is none or it cannot be read now. */
    async download(userId, name) {
      if (!USER_ID.test(String(userId || '')) || !isSkillName(name)) return null;
      let response;
      try {
        response = await fetchImpl(`${url}/storage/v1/object/${SKILL_BUNDLE_BUCKET}/${encodePath(skillBundlePath(userId, name))}`, {
          headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` },
          signal: AbortSignal.timeout(timeoutMs)
        });
      } catch {
        return null;
      }
      if (!response.ok) return null;
      const bytes = new Uint8Array(await response.arrayBuffer());
      // What is larger than any zip the app keeps is not read further (the bucket has the same limit).
      return bytes.byteLength > SKILL_BUNDLE_LIMITS.zipBytes ? null : bytes;
    }
  };
}
