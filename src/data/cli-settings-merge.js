// The settings of the CLI tools (命令工具) are lists: the tools that were added, the tools the model may use by itself, the rules for sites.
// The settings travel to the cloud as one piece and the newer piece used to replace the older whole, so a device that had not yet heard of
// a change (a tool added on another device) wiped it out by saving anything. These lists are merged instead, item by item:
//   - every change of an item (added, removed, a rule set or taken away) leaves a time stamp for that item (cliStamps, cliUseStamps, netStamps);
//   - for each item the side with the later stamp wins, so a removal is kept and a later adding brings it back;
//   - items with no stamp on either side (made before stamps) are kept if either side has them.
// Pure functions: the sync (cloud-workspace-sync.js) merges what it is about to upload with what the cloud holds.

import { normalizeCliIds, normalizeCliVersions } from './cli-catalog.js';
import { normalizeNetHost, normalizeNetRules } from './cli-net.js';

/** How many stamps a list keeps (the oldest of the removed items go first). */
export const MAX_STAMPS = 600;
const STAMP_FIELDS = Object.freeze(['cliStamps', 'cliUseStamps', 'netStamps']);
/** The fields this merge owns: what the sync gives back after a merge. */
export const CLI_MERGED_FIELDS = Object.freeze(['cliEnabledIds', 'cliModelUseIds', 'cliVersions', 'netRules', ...STAMP_FIELDS]);

/** A stamp map as the settings keep it: { item: milliseconds }, only finite positive numbers, at most MAX_STAMPS (the latest). */
export function normalizeStamps(value, normalizeKey = (key) => String(key || '').trim()) {
  const found = {};
  if (!value || typeof value !== 'object' || Array.isArray(value)) return found;
  for (const [name, at] of Object.entries(value)) {
    const key = normalizeKey(name);
    const stamp = Number(at);
    if (key && Number.isFinite(stamp) && stamp > 0) found[key] = Math.max(found[key] || 0, Math.floor(stamp));
  }
  const entries = Object.entries(found);
  if (entries.length <= MAX_STAMPS) return found;
  return Object.fromEntries(entries.sort((a, b) => b[1] - a[1]).slice(0, MAX_STAMPS));
}

const idKey = (key) => (/^[a-z][a-z0-9-]{1,39}$/.test(String(key || '')) ? String(key) : '');

/** Leaves a stamp on an item of a setting: the caller changes the item and saves. `field`: 'cliStamps', 'cliUseStamps' or 'netStamps'. */
export function stampItem(config, field, key, now = Date.now()) {
  if (!config || !STAMP_FIELDS.includes(field) || !key) return;
  config[field] = normalizeStamps({ ...(config[field] || {}), [key]: now }, field === 'netStamps' ? normalizeNetHost : idKey);
}

const stampOf = (stamps, key) => Number(stamps?.[key]) || 0;

/** Merges a list of items: { ids, stamps }. Local order first. */
function mergeSet(localIds, localStamps, remoteIds, remoteStamps) {
  const local = new Set(localIds);
  const remote = new Set(remoteIds);
  const keys = [...new Set([...localIds, ...remoteIds, ...Object.keys(localStamps), ...Object.keys(remoteStamps)])];
  const ids = [];
  const stamps = {};
  for (const key of keys) {
    const l = stampOf(localStamps, key);
    const r = stampOf(remoteStamps, key);
    const present = l > r ? local.has(key) : (r > l ? remote.has(key) : (local.has(key) || remote.has(key)));
    if (present) ids.push(key);
    if (Math.max(l, r)) stamps[key] = Math.max(l, r);
  }
  return { ids, stamps };
}

/** The same for a map (item -> value): an item the winner does not have is gone. */
function mergeMap(localMap, localStamps, remoteMap, remoteStamps) {
  const keys = [...new Set([...Object.keys(localMap), ...Object.keys(remoteMap), ...Object.keys(localStamps), ...Object.keys(remoteStamps)])];
  const map = {};
  const stamps = {};
  for (const key of keys) {
    const l = stampOf(localStamps, key);
    const r = stampOf(remoteStamps, key);
    const value = l > r ? localMap[key] : (r > l ? remoteMap[key] : (localMap[key] ?? remoteMap[key]));
    if (value !== undefined) map[key] = value;
    if (Math.max(l, r)) stamps[key] = Math.max(l, r);
  }
  return { map, stamps };
}

/**
 * What the settings of the CLI tools are when this device's settings (`local`) meet the cloud's (`remote`): the fields of CLI_MERGED_FIELDS,
 * normalized. Either side may be missing or have none of these fields.
 */
export function mergeCliSettings(local, remote) {
  const l = local && typeof local === 'object' ? local : {};
  const r = remote && typeof remote === 'object' ? remote : {};
  const enabled = mergeSet(normalizeCliIds(l.cliEnabledIds), normalizeStamps(l.cliStamps, idKey), normalizeCliIds(r.cliEnabledIds), normalizeStamps(r.cliStamps, idKey));
  const use = mergeSet(normalizeCliIds(l.cliModelUseIds), normalizeStamps(l.cliUseStamps, idKey), normalizeCliIds(r.cliModelUseIds), normalizeStamps(r.cliUseStamps, idKey));
  const rules = mergeMap(normalizeNetRules(l.netRules), normalizeStamps(l.netStamps, normalizeNetHost), normalizeNetRules(r.netRules), normalizeStamps(r.netStamps, normalizeNetHost));
  const cliEnabledIds = normalizeCliIds(enabled.ids);
  return {
    cliEnabledIds,
    cliModelUseIds: normalizeCliIds(use.ids).filter((id) => cliEnabledIds.includes(id)),
    // The version a tool had when it was added: this device's own, else the cloud's.
    cliVersions: Object.fromEntries(Object.entries({ ...normalizeCliVersions(r.cliVersions), ...normalizeCliVersions(l.cliVersions) }).filter(([id]) => cliEnabledIds.includes(id))),
    netRules: rules.map,
    cliStamps: normalizeStamps(enabled.stamps, idKey),
    cliUseStamps: normalizeStamps(use.stamps, idKey),
    netStamps: normalizeStamps(rules.stamps, normalizeNetHost)
  };
}

const same = (a, b) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

/** Whether the merge gave this side something it did not have (a tool, a rule, a removal): the fields that differ from what `config` holds. */
export function changedCliFields(config, merged) {
  const own = mergeCliSettings(config, null);
  return CLI_MERGED_FIELDS.filter((field) => !same(own[field], merged[field]));
}
