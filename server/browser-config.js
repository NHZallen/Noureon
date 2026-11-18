// The settings of the browser agent on the main server (docs/superpowers/specs/2026-11-16-browser-agent-design.md, §2.5, §9; Linear NOU-205, contract of P2):
//   BROWSER_ENABLED      `false` switches the whole thing off (the one-key stop); otherwise it is on when the two settings below are there.
//   BROWSER_HOSTS        where browser-host listens (http://172.29.0.1:40010), several separated by commas; only the first is used for now.
//   BROWSER_HOST_SECRET  the secret the requests to browser-host are signed with (32 characters or more; the first of a list, as on the host).
//   BROWSER_ALLOWED      who may use it: emails and/or account ids, separated by commas. NOT set means NOBODY (unlike the Google connector, where not set means everyone):
//                        this reaches out to any website on behalf of a person. Later the invite codes of the design take its place.
//   BROWSER_ADMINS       the accounts that run it (account ids or emails): they may use it, make invite codes and stop all the browsers. They count as allowed.
//   BROWSER_MAX_ACTIONS  a limit of actions for one reply; 0 or not set means no limit (Allen, 2026-11-16).
//   BROWSER_AUTO_LOOK    `off`: an action does not answer with the look at the page after it (the model calls browser_snapshot itself, as before 2026-11-18); anything else: it does. For measuring one against the other.

const EMAIL = /^[^\s<>,;"]{1,64}@[^\s<>,;"]{1,255}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const list = (text) => String(text || '').split(/[\s,;]+/).map((item) => item.trim()).filter(Boolean);

/** Reads the environment; adds a plain sentence to `problems` for each setting that is wrong. Never keeps the secret anywhere but in the returned object. */
export function readBrowserConfig(env = {}, problems = []) {
  const hosts = [];
  for (const entry of list(env.BROWSER_HOSTS)) {
    try {
      const url = new URL(entry);
      if (url.protocol !== 'http:' && url.protocol !== 'https:') throw new Error('protocol');
      hosts.push(url.origin);
    } catch {
      problems.push(`BROWSER_HOSTS has something that is not an address (http://… or https://…): ${entry.slice(0, 40)}`);
    }
  }
  const secret = String(env.BROWSER_HOST_SECRET || '').split(',')[0].trim();
  if (secret && secret.length < 32) problems.push('BROWSER_HOST_SECRET must be at least 32 characters');
  const allowed = new Set();
  for (const entry of list(env.BROWSER_ALLOWED).map((item) => item.toLowerCase())) {
    if (EMAIL.test(entry) || UUID.test(entry)) allowed.add(entry);
    else problems.push(`BROWSER_ALLOWED has something that is neither an email address nor an account id: ${entry.slice(0, 40)}`);
  }
  const admins = new Set();
  for (const entry of list(env.BROWSER_ADMINS).map((item) => item.toLowerCase())) {
    if (EMAIL.test(entry) || UUID.test(entry)) { admins.add(entry); allowed.add(entry); } else problems.push(`BROWSER_ADMINS has something that is neither an email address nor an account id: ${entry.slice(0, 40)}`);
  }
  const maxActions = Number(env.BROWSER_MAX_ACTIONS || 0);
  if (!Number.isInteger(maxActions) || maxActions < 0 || maxActions > 100000) problems.push('BROWSER_MAX_ACTIONS must be a whole number (0 for no limit)');
  const switchedOff = String(env.BROWSER_ENABLED || '').trim().toLowerCase() === 'false';
  return Object.freeze({
    enabled: !switchedOff && hosts.length > 0 && secret.length >= 32 && allowed.size > 0,
    switchedOff,
    hosts: Object.freeze(hosts),
    secret,
    allowed: Object.freeze(allowed),
    admins: Object.freeze(admins),
    maxActions: Number.isInteger(maxActions) && maxActions > 0 ? maxActions : 0,
    autoLook: String(env.BROWSER_AUTO_LOOK || '').trim().toLowerCase() !== 'off'
  });
}

/** Whether this account may use the browser: on the list by account id or by email. Only the sign "yes" ever comes out; the list itself is not shown anywhere. */
export function browserAllows(config, { userId = '', email = '' } = {}) {
  if (!config?.enabled) return false;
  return config.allowed.has(String(userId).toLowerCase()) || (Boolean(email) && config.allowed.has(String(email).toLowerCase()));
}

/**
 * The email of an account, for BROWSER_ALLOWED (the replies know only the account id): asked of the auth service with the service key, kept for a few minutes.
 * Only asked when the list has an email in it and the id alone did not decide.
 */
export function createEmailLookup({ url, serviceKey, fetchImpl = fetch, now = Date.now, ttlMs = 5 * 60_000, timeoutMs = 8000 }) {
  const cache = new Map();
  return async function emailOf(userId) {
    const known = cache.get(userId);
    if (known && known.until > now()) return known.email;
    let email = '';
    try {
      const response = await fetchImpl(`${url}/auth/v1/admin/users/${encodeURIComponent(userId)}`, { headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` }, signal: AbortSignal.timeout(timeoutMs) });
      if (response.ok) email = String((await response.json())?.email || '').toLowerCase();
    } catch {
      email = '';
    }
    if (cache.size > 500) cache.clear();
    cache.set(userId, { email, until: now() + ttlMs });
    return email;
  };
}

/** Whether this account runs the browser agent (BROWSER_ADMINS), by account id or by email. */
export function browserAdmin(config, { userId = '', email = '' } = {}) {
  if (!config?.enabled) return false;
  return config.admins.has(String(userId).toLowerCase()) || (Boolean(email) && config.admins.has(String(email).toLowerCase()));
}

/** `mayUse(userId)` for the replies: by account id at once, by email when the list has emails, else by an invite code that was redeemed (asked of `invites`, kept a minute). */
export function createBrowserAccess({ config, emailOf = null, invites = null, now = Date.now }) {
  const known = new Map();
  const hasEmails = [...config.allowed].some((entry) => entry.includes('@'));
  const mayUse = async function mayUse(userId) {
    if (!config.enabled || !userId) return false;
    if (browserAllows(config, { userId })) return true;
    if (hasEmails && emailOf && browserAllows(config, { userId, email: await emailOf(userId) })) return true;
    if (!invites) return false;
    const cached = known.get(userId);
    if (cached && cached.until > now()) return cached.yes;
    let yes = false;
    try { yes = await invites.hasAccess(userId); } catch { yes = false; }
    if (known.size > 500) known.clear();
    known.set(userId, { yes, until: now() + 60_000 });
    return yes;
  };
  // A person who has just redeemed a code is let in at once, not a minute later.
  mayUse.forget = (userId) => { known.delete(userId); };
  return mayUse;
}
