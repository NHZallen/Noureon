// Which CLI tools the person has: added (cliEnabledIds), allowed for the model to use by itself (cliModelUseIds), and the version each
// had when it was added or last updated (cliVersions). These live in the settings, so they follow the account. Every function here
// changes the settings object it is given and returns what changed; the caller saves.

import { getCliTool, isCliReady, normalizeCliIds } from '../../../data/cli-catalog.js';
import { stampItem } from '../../../data/cli-settings-merge.js';

/** The ids of the tools that are added and still in the store. */
export const enabledCliIds = (config) => normalizeCliIds(config?.cliEnabledIds).filter((id) => isCliReady(getCliTool(id)));
export const enabledCliTools = (config) => enabledCliIds(config).map((id) => getCliTool(id));
export const isCliEnabled = (config, id) => enabledCliIds(config).includes(id);
export const canModelUseCli = (config, id) => isCliEnabled(config, id) && normalizeCliIds(config?.cliModelUseIds).includes(id);

export function addCli(config, id) {
  const tool = getCliTool(id);
  if (!isCliReady(tool) || isCliEnabled(config, id)) return false;
  config.cliEnabledIds = [...enabledCliIds(config), id];
  config.cliVersions = { ...(config.cliVersions || {}), [id]: tool.version };
  stampItem(config, 'cliStamps', id);
  return true;
}

export function removeCli(config, id) {
  if (!normalizeCliIds(config?.cliEnabledIds).includes(id)) return false;
  config.cliEnabledIds = normalizeCliIds(config.cliEnabledIds).filter((entry) => entry !== id);
  config.cliModelUseIds = normalizeCliIds(config.cliModelUseIds).filter((entry) => entry !== id);
  const versions = { ...(config.cliVersions || {}) };
  delete versions[id];
  config.cliVersions = versions;
  stampItem(config, 'cliStamps', id);
  stampItem(config, 'cliUseStamps', id);
  return true;
}

export function setCliModelUse(config, id, allowed) {
  if (!isCliEnabled(config, id)) return false;
  const others = normalizeCliIds(config.cliModelUseIds).filter((entry) => entry !== id);
  config.cliModelUseIds = allowed ? [...others, id] : others;
  stampItem(config, 'cliUseStamps', id);
  return true;
}

export const CLI_INDICATOR_PREFIX = 'cli-indicator-';
export const cliIndicatorId = (id) => `${CLI_INDICATOR_PREFIX}${id}`;

/** The tools chosen with "@" in a message: the chips in the text of its parts (displaySegments of the composer). */
export function cliIdsOfParts(parts) {
  const found = [];
  for (const part of Array.isArray(parts) ? parts : []) {
    for (const segment of Array.isArray(part?.displaySegments) ? part.displaySegments : []) {
      const indicator = String(segment?.indicatorId || '');
      if (segment?.type === 'mode' && indicator.startsWith(CLI_INDICATOR_PREFIX)) found.push(indicator.slice(CLI_INDICATOR_PREFIX.length));
    }
  }
  return [...new Set(found)].filter((id) => isCliReady(getCliTool(id)));
}

/**
 * The tools a reply is given: `chosen` (the ones picked with "@" in this message that are still added) and `ids` (those and the ones the person
 * lets the model use by itself). `all` ignores which tools are added (to tell that something was chosen).
 */
export function cliIdsForReply(config, parts, { all = false } = {}) {
  const picked = cliIdsOfParts(parts);
  const chosen = all ? picked : picked.filter((id) => isCliEnabled(config, id));
  const own = normalizeCliIds(config?.cliModelUseIds).filter((id) => isCliEnabled(config, id));
  return { chosen, ids: [...new Set([...chosen, ...own])] };
}

/**
 * Makes sure a text part of a message shows the tools chosen with "@" (`picked`: [{ indicatorId, label }]) as chips before its words.
 * Chips that are already in its display segments (typed inline in the box) are not added twice.
 */
export function withCliSegments(part, picked) {
  if (!part || typeof part.text !== 'string' || !Array.isArray(picked) || !picked.length) return part;
  const segments = Array.isArray(part.displaySegments) ? part.displaySegments : [{ type: 'text', text: part.text }];
  const have = new Set(segments.filter((segment) => segment?.type === 'mode').map((segment) => segment.indicatorId));
  const missing = picked.filter((entry) => !have.has(entry.indicatorId)).map((entry) => ({ type: 'mode', indicatorId: entry.indicatorId, label: entry.label }));
  if (!missing.length) return part;
  part.displaySegments = [...missing, ...segments];
  part.displayText = `${missing.map((entry) => entry.label).join(' ')} ${part.displayText ?? part.text}`.trim();
  return part;
}
