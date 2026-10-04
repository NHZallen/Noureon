// The person's rules for the network of the CLI tools (命令工具): which sites a tool may reach. Kept in the settings (netMode, netRules) and
// handed to the sandbox's proxy when a reply with tools starts. The proxy and the server read this one file, so it may not use the browser
// (the server reaches it: scripts/server-shared-modules.json).

/** Sites that tools need to fetch what they are made of; allowed at first, and the person may change each (docs/superpowers/specs/2026-10-04-cli-store-design.md, §2.3). */
export const NET_DEFAULT_ALLOW = Object.freeze([
  'pypi.org',
  'files.pythonhosted.org',
  'registry.npmjs.org',
  'github.com',
  'raw.githubusercontent.com',
  'objects.githubusercontent.com'
]);

/** 'new': ask about a site that has no rule (the default); 'always': ask once per reply about every site, even an allowed one. */
export const NET_MODES = Object.freeze(['new', 'always']);
/** What a rule may say. 'ask' is a site that was used and has no lasting answer (it is asked about the next time). */
export const NET_RULES = Object.freeze(['allow', 'ask', 'deny']);
/** How many sites the list holds. */
export const NET_MAX_RULES = 500;

const HOST = /^(?=.{1,253}$)[a-z0-9_]([a-z0-9_-]{0,62}[a-z0-9_])?(\.[a-z0-9_]([a-z0-9_-]{0,62}[a-z0-9_])?)*$/;

/** A site as the rules keep it: lower case, no final dot, punycode. '' for what is not a site name (addresses of machines are not kept: they are never reachable or asked about by name). */
export function normalizeNetHost(value) {
  const host = String(value ?? '').trim().toLowerCase().replace(/\.$/, '');
  if (!host || /[\s/\\?#@:%*[\]]/.test(host)) return '';
  let ascii = host;
  try {
    ascii = new URL(`http://${host}`).hostname;
  } catch {
    return '';
  }
  // An address written out (1.2.3.4) is not a name.
  if (/^\d+(?:\.\d+){3}$/.test(ascii) || !HOST.test(ascii)) return '';
  return ascii;
}

export const normalizeNetMode = (value) => (NET_MODES.includes(value) ? value : 'new');

/** The rules of the settings: { host: 'allow' | 'ask' | 'deny' }, with only valid sites and words, at most NET_MAX_RULES. */
export function normalizeNetRules(value) {
  const kept = {};
  if (!value || typeof value !== 'object' || Array.isArray(value)) return kept;
  for (const [name, rule] of Object.entries(value)) {
    if (Object.keys(kept).length >= NET_MAX_RULES) break;
    const host = normalizeNetHost(name);
    if (host && NET_RULES.includes(rule)) kept[host] = rule;
  }
  return kept;
}

/**
 * What the proxy is given: the default sites allowed, then the person's rules over them ('ask' takes a site back out, so it is asked about).
 * Returns { mode, rules: { host: 'allow' | 'deny' } }.
 */
export function effectiveNetPolicy({ mode, rules } = {}) {
  const merged = Object.fromEntries(NET_DEFAULT_ALLOW.map((host) => [host, 'allow']));
  for (const [host, rule] of Object.entries(normalizeNetRules(rules))) {
    if (rule === 'ask') delete merged[host];
    else merged[host] = rule;
  }
  return { mode: normalizeNetMode(mode), rules: merged };
}

/** The sites the settings list: the defaults and the person's own, each with its rule, in a steady order. */
export function listNetSites(rules) {
  const own = normalizeNetRules(rules);
  const sites = NET_DEFAULT_ALLOW.map((host) => ({ host, rule: own[host] || 'allow', builtin: true }));
  for (const host of Object.keys(own).sort()) if (!NET_DEFAULT_ALLOW.includes(host)) sites.push({ host, rule: own[host], builtin: false });
  return sites;
}
