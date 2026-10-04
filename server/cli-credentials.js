// The secure credentials (安全憑證) of the CLI tools: a login a tool needs (an auth token, a cookie). They are kept encrypted for the person
// (the table user_credentials, sealed with the master key like the keys of a reply, bound to the person and the credential's name), shown
// to the person in the settings when they ask, and put in a tool's environment only while a command runs. The model never sees a value:
// what a command prints is scrubbed of them, and a login file a tool needs is written for the time of one command only.
// docs/superpowers/specs/2026-10-04-cli-store-design.md, §2.3 and §10.

import { cliCredentialFiles } from '../src/data/cli-catalog.js';

export const CREDENTIAL_NAME = /^[A-Z][A-Z0-9_]{0,63}$/;
export const MAX_CREDENTIALS_PER_USER = 40;
export const MAX_CREDENTIAL_CHARS = 4000;
const MASK = '••••';
// Shorter than this a value would be found in ordinary words; the tools' tokens and cookies are far longer.
const MIN_SCRUB_CHARS = 6;

export class CredentialError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'CredentialError';
    this.code = code;
  }
}

const aadOf = (name) => ({ messageId: `credential:${name}` });

export function createCredentialStore({ db, vault, now = () => new Date() }) {
  const table = 'user_credentials';
  const open = (row, userId) => vault.open(row.envelope, row.key_version, { userId, ...aadOf(row.name) }).value;

  return {
    /** All of a person's credentials: [{ name, value, updatedAt }] (the person may look at their own). A row that cannot be opened is left out. */
    async list(userId) {
      const rows = await db.select(table, { filters: { user_id: `eq.${userId}` }, select: 'name,envelope,key_version,updated_at', order: 'name.asc', limit: MAX_CREDENTIALS_PER_USER });
      const found = [];
      for (const row of Array.isArray(rows) ? rows : []) {
        try {
          found.push({ name: row.name, value: open(row, userId), updatedAt: row.updated_at });
        } catch {
          // Sealed with a key that is gone: it cannot be shown, and the person may set it again.
        }
      }
      return found;
    },
    /** Adds or replaces one. */
    async set(userId, name, value) {
      if (!CREDENTIAL_NAME.test(String(name || ''))) throw new CredentialError('bad_name', 'A name is capital letters, digits and underscores, starting with a letter.');
      const text = typeof value === 'string' ? value.trim() : '';
      if (!text || text.length > MAX_CREDENTIAL_CHARS) throw new CredentialError('bad_value', `A value is 1 to ${MAX_CREDENTIAL_CHARS} characters.`);
      const existing = await db.select(table, { filters: { user_id: `eq.${userId}` }, select: 'name', limit: MAX_CREDENTIALS_PER_USER + 1 });
      const names = (Array.isArray(existing) ? existing : []).map((row) => row.name);
      if (!names.includes(name) && names.length >= MAX_CREDENTIALS_PER_USER) throw new CredentialError('too_many', `At most ${MAX_CREDENTIALS_PER_USER} credentials.`);
      const { envelope, keyVersion } = vault.seal({ value: text }, { userId, ...aadOf(name) });
      await db.upsert(table, { user_id: userId, name, envelope, key_version: keyVersion, updated_at: now().toISOString() }, { onConflict: 'user_id,name' });
      return { name };
    },
    async remove(userId, name) {
      if (!CREDENTIAL_NAME.test(String(name || ''))) throw new CredentialError('bad_name', 'Not a credential name.');
      await db.remove(table, { user_id: `eq.${userId}`, name: `eq.${name}` });
    },
    /** The values of some credentials, { NAME: value }, for the ones the person has set. */
    async values(userId, names) {
      const wanted = [...new Set((Array.isArray(names) ? names : []).filter((name) => CREDENTIAL_NAME.test(String(name || ''))))];
      if (!wanted.length) return {};
      const rows = await db.select(table, { filters: { user_id: `eq.${userId}`, name: `in.(${wanted.join(',')})` }, select: 'name,envelope,key_version', limit: wanted.length });
      const values = {};
      for (const row of Array.isArray(rows) ? rows : []) {
        try {
          values[row.name] = open(row, userId);
        } catch {
          // Cannot be opened: the tool is told the credential is not set.
        }
      }
      return values;
    }
  };
}

// What a tool saves to log in, made from the credential: only the formats the catalog names.
const RENDERERS = {
  // rdt-cli keeps its Reddit login in ~/.config/rdt-cli/credential.json.
  'rdt-cookies': (value, { nowMs }) => JSON.stringify({ cookies: { reddit_session: value }, source: 'saved', username: null, modhash: null, saved_at: nowMs / 1000, last_verified_at: null })
};

/**
 * What a reply's commands are given for the tools in use. `tools`: the catalog entries; `values`: { NAME: value } from `values()`.
 * Returns { env: { NAME: value } (only what the tools declare), files: [{ path, content }], missing: { toolId: [names] }, secrets: [values] }.
 */
export function prepareToolCredentials(tools, values, { nowMs = Date.now() } = {}) {
  const env = {};
  const files = [];
  const missing = {};
  for (const tool of tools) {
    for (const credential of tool.credentials || []) {
      if (typeof values?.[credential.env] === 'string' && values[credential.env]) env[credential.env] = values[credential.env];
      else (missing[tool.id] ||= []).push(credential.env);
    }
    for (const file of cliCredentialFiles(tool)) {
      const value = values?.[file.from];
      if (typeof value === 'string' && value && RENDERERS[file.format]) files.push({ path: file.path, content: RENDERERS[file.format](value, { nowMs }) });
    }
  }
  return { env, files, missing, secrets: Object.values(env) };
}

/** Text with every value of `secrets` replaced by a mask (what a command printed must not give a credential to the model or the page). */
export function scrubSecrets(text, secrets) {
  let scrubbed = String(text ?? '');
  for (const secret of secrets || []) {
    if (typeof secret === 'string' && secret.length >= MIN_SCRUB_CHARS) scrubbed = scrubbed.split(secret).join(MASK);
  }
  return scrubbed;
}

/** The result of a command with the credentials taken out of what it printed (its text, its error). */
export function scrubResult(result, secrets) {
  if (!result || !secrets?.length) return result;
  const part = (value) => (value && typeof value === 'object' && typeof value.text === 'string' ? { ...value, text: scrubSecrets(value.text, secrets) } : (typeof value === 'string' ? scrubSecrets(value, secrets) : value));
  return { ...result, stdout: part(result.stdout), stderr: part(result.stderr), ...(result.error ? { error: scrubSecrets(result.error, secrets) } : {}) };
}
