// The password vault of the browser agent (docs/superpowers/specs/2026-11-16-browser-agent-design.md, §7). A login is a name the model can see, the sites it may be used on, and one sealed
// envelope with the user name and the password (the table browser_logins, sealed with the key of the person, bound to the person and the login's id). The model gets names and nothing else:
// the values go from here to the browser host (`fill`), and only when the page is one of the sites of the login. A person looks at their own logins in the settings (`reveal`, which
// the page asks only after the person was confirmed again).

import { randomUUID } from 'node:crypto';

export const MAX_LOGINS_PER_USER = 100;
const ID = /^[0-9a-f-]{36}$/i;
const MAX_NAME = 80;
const MAX_USERNAME = 512;
const MAX_PASSWORD = 1024;

export class LoginError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'LoginError';
    this.code = code;
  }
}

/** `https://Example.com/path?x` -> `https://example.com` ; anything that is not an https address is null. */
export function originOf(text) {
  try {
    const url = new URL(String(text || '').trim());
    if (url.protocol !== 'https:' || !url.hostname || url.username || url.password) return null;
    return url.origin;
  } catch {
    return null;
  }
}

const aadOf = (id) => ({ messageId: `browser-login:${id}` });
const fact = (row) => ({ id: row.id, name: row.name, origins: row.origins, createdAt: row.created_at, lastUsedAt: row.last_used_at });

export function createBrowserLogins({ db, vault, now = () => new Date(), makeId = randomUUID }) {
  const table = 'browser_logins';
  const checkUser = (userId) => { if (!ID.test(String(userId || ''))) throw new LoginError('bad_user', 'That is not a person.'); };
  const checkId = (id) => { if (!ID.test(String(id || ''))) throw new LoginError('bad_id', 'That is not a login.'); };
  const rows = async (userId, extra = {}) => {
    const found = await db.select(table, { filters: { user_id: `eq.${userId}`, ...extra }, select: 'id,name,origins,envelope,key_version,created_at,last_used_at', order: 'name.asc', limit: MAX_LOGINS_PER_USER });
    return Array.isArray(found) ? found : [];
  };
  const open = (row, userId) => vault.open(row.envelope, row.key_version, { userId, ...aadOf(row.id) });

  return {
    /** The names and sites of a person's logins (never a value). */
    async list(userId) {
      checkUser(userId);
      return (await rows(userId)).map(fact);
    },
    /** The logins of a person that are for this page's site, as { id, name } (what the model may be told). */
    async forOrigin(userId, pageOrigin) {
      checkUser(userId);
      const origin = originOf(pageOrigin);
      if (!origin) return [];
      return (await rows(userId)).filter((row) => row.origins.includes(origin)).map((row) => ({ id: row.id, name: row.name }));
    },
    /** Keeps a new login (or replaces the one of the same name). */
    async add(userId, { name, origins, username, password }) {
      checkUser(userId);
      const title = typeof name === 'string' ? name.trim() : '';
      if (!title || title.length > MAX_NAME) throw new LoginError('bad_name', `A name is 1 to ${MAX_NAME} characters.`);
      const sites = [...new Set((Array.isArray(origins) ? origins : []).map(originOf))];
      if (!sites.length || sites.length > 10 || sites.includes(null)) throw new LoginError('bad_origins', 'Give the https address of each site (at most 10).');
      if (typeof username !== 'string' || !username || username.length > MAX_USERNAME) throw new LoginError('bad_username', `A user name is 1 to ${MAX_USERNAME} characters.`);
      if (typeof password !== 'string' || !password || password.length > MAX_PASSWORD) throw new LoginError('bad_password', `A password is 1 to ${MAX_PASSWORD} characters.`);
      const existing = await rows(userId);
      const same = existing.find((row) => row.name === title);
      if (!same && existing.length >= MAX_LOGINS_PER_USER) throw new LoginError('too_many', `At most ${MAX_LOGINS_PER_USER} logins.`);
      const id = same?.id || makeId();
      const { envelope, keyVersion } = vault.seal({ username, password }, { userId, ...aadOf(id) });
      const stamp = now().toISOString();
      if (same) await db.update(table, { user_id: `eq.${userId}`, id: `eq.${id}` }, { origins: sites, envelope, key_version: keyVersion, updated_at: stamp }, { returning: 'id' });
      else await db.insert(table, { id, user_id: userId, name: title, origins: sites, envelope, key_version: keyVersion }, { returning: 'id' });
      return { id, name: title, origins: sites };
    },
    async remove(userId, id) {
      checkUser(userId); checkId(id);
      await db.remove(table, { user_id: `eq.${userId}`, id: `eq.${id}` });
    },
    /** For the person's own settings: the user name and the password of one login. */
    async reveal(userId, id) {
      checkUser(userId); checkId(id);
      const [row] = await rows(userId, { id: `eq.${id}` });
      if (!row) throw new LoginError('not_found', 'There is no such login.');
      try {
        const { username, password } = open(row, userId);
        return { username, password };
      } catch {
        throw new LoginError('unreadable', 'This login cannot be opened any more.');
      }
    },
    /**
     * The values to fill on a page: only when the page's site is one of the login's sites. `name` picks the login; without a name, the only login of the site. Returns
     * { id, name, origins, username, password } or throws LoginError: `none` (no login for this site), `several` (with `names`), `wrong_site`.
     */
    async forFill(userId, { pageOrigin, name }) {
      checkUser(userId);
      const origin = originOf(pageOrigin);
      if (!origin) throw new LoginError('wrong_site', 'This page cannot take a saved login.');
      const all = await rows(userId);
      const here = all.filter((row) => row.origins.includes(origin));
      let row;
      if (name) {
        row = all.find((entry) => entry.name.toLowerCase() === String(name).trim().toLowerCase());
        if (!row) throw new LoginError('none', 'There is no saved login with that name.');
        if (!row.origins.includes(origin)) throw new LoginError('wrong_site', 'That login is not for this site.');
      } else if (here.length === 1) row = here[0];
      else if (here.length === 0) throw new LoginError('none', 'There is no saved login for this site.');
      else { const error = new LoginError('several', 'There is more than one saved login for this site.'); error.names = here.map((entry) => entry.name); throw error; }
      let values;
      try {
        values = open(row, userId);
      } catch {
        throw new LoginError('unreadable', 'This login cannot be opened any more.');
      }
      await db.update(table, { user_id: `eq.${userId}`, id: `eq.${row.id}` }, { last_used_at: now().toISOString() }, { returning: 'id' }).catch(() => {});
      return { id: row.id, name: row.name, origins: row.origins, username: values.username, password: values.password };
    },
    /** Takes away every login of a site (the person logged out and deleted the password on the settings page). */
    async removeForOrigin(userId, pageOrigin) {
      checkUser(userId);
      const origin = originOf(pageOrigin);
      if (!origin) return 0;
      const found = (await rows(userId)).filter((row) => row.origins.includes(origin));
      for (const row of found) await db.remove(table, { user_id: `eq.${userId}`, id: `eq.${row.id}` });
      return found.length;
    }
  };
}
