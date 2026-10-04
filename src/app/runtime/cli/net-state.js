// The network rules of the CLI tools as the settings keep them (netMode, netRules; see data/cli-net.js). Every function here changes the
// settings object it is given and returns whether it changed; the caller saves.

import { NET_DEFAULT_ALLOW, NET_MAX_RULES, NET_RULES, normalizeNetHost, normalizeNetMode, normalizeNetRules } from '../../../data/cli-net.js';

export const getNetMode = (config) => normalizeNetMode(config?.netMode);

export function setNetMode(config, mode) {
  const next = normalizeNetMode(mode);
  if (getNetMode(config) === next && config.netMode === next) return false;
  config.netMode = next;
  return true;
}

/** What the person's rule for a site is: 'allow', 'ask' or 'deny' (a site with none: its default, which is allow for the sites tools are made of, else ask). */
export function netRuleFor(config, host) {
  const name = normalizeNetHost(host);
  const own = normalizeNetRules(config?.netRules)[name];
  if (own) return own;
  return NET_DEFAULT_ALLOW.includes(name) ? 'allow' : 'ask';
}

/**
 * Sets the rule for a site. A default site set back to 'allow' is no rule at all (the list stays small), and a site that is not a name is
 * refused. Returns whether the settings changed.
 */
export function setNetRule(config, host, rule) {
  const name = normalizeNetHost(host);
  if (!name || !NET_RULES.includes(rule)) return false;
  const rules = normalizeNetRules(config.netRules);
  if (NET_DEFAULT_ALLOW.includes(name) && rule === 'allow') {
    if (!(name in rules)) return false;
    delete rules[name];
  } else {
    if (rules[name] === rule) return false;
    if (!(name in rules) && Object.keys(rules).length >= NET_MAX_RULES) return false;
    rules[name] = rule;
  }
  config.netRules = rules;
  return true;
}

/** Takes a site out of the list altogether (a default site goes back to what it was at first). */
export function removeNetSite(config, host) {
  const name = normalizeNetHost(host);
  const rules = normalizeNetRules(config?.netRules);
  if (!name || !(name in rules)) return false;
  delete rules[name];
  config.netRules = rules;
  return true;
}

/**
 * What a person's answer to a question about a site leaves in the settings: 'always' and 'deny' are rules; 'once' leaves the site in the list
 * (to be asked about again, which the list shows) unless it already has a rule. Returns whether the settings changed.
 */
export function rememberNetAnswer(config, host, decision) {
  if (decision === 'always') return setNetRule(config, host, 'allow');
  if (decision === 'deny') return setNetRule(config, host, 'deny');
  if (decision === 'once' && !(normalizeNetHost(host) in normalizeNetRules(config?.netRules)) && !NET_DEFAULT_ALLOW.includes(normalizeNetHost(host))) return setNetRule(config, host, 'ask');
  return false;
}

/** What goes with a reply that has CLI tools: the person's own rules (the server adds the sites that are allowed at first). */
export const netPolicyForRun = (config) => ({ mode: getNetMode(config), rules: normalizeNetRules(config?.netRules) });
