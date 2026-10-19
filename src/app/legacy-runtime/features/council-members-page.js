// The members of a council held on this page (docs/superpowers/specs/2026-10-19-council-tools-design.md, §2.1, §3): each searches the web and opens
// pages with the page's own search sources, and loads the person's skills, as a reply made here does. The connectors and the CLI tools are the
// server's only (their logins are kept there), so a council held here has none of them.

import { getAvailableSkills, lookupSkill, readSkillFile } from '../../runtime/skill/skill-bridge.js';
import { skillNamesOfParts } from '../../../data/skill-prompt.js';
import { createCouncilMembers } from './council-member-reply.js';

/** `support` is createProviderRequestSupport(...); the result is what the council takes as `createMembers(conversation, parts)`. */
export function createPageCouncilMembers({ streamApiCall, support, getConfig, modelSupportsToolCalling, modelUsesNativeWebSearch, retryDelayMs = 0 }) {
  return async (conversation, parts) => {
    // The skills the members may load by themselves (not those asked for with "/": they are given whole).
    const available = await getAvailableSkills(skillNamesOfParts(parts)).catch(() => []);
    const { createSkillLoader } = available.length ? await import('../../../data/skill-tool.js') : {};
    return createCouncilMembers({
      streamApiCall,
      research: support.hasSearchKey() ? { searchWeb: support.searchWeb, openPage: support.fetchPageContents } : null,
      canCallTools: modelSupportsToolCalling,
      usesNativeSearch: modelUsesNativeWebSearch,
      loadersFor: () => (createSkillLoader ? createSkillLoader({ available, lookup: lookupSkill, readFile: readSkillFile }) : null),
      fetchPacket: (query, signal) => support.fetchTavilySearchPacket(query, signal, { label: 'Council member web search packet', maxResults: 6 }),
      buildQuery: (_memberParts, modelInfo, signal) => support.buildSearchQuery(parts, { conversation, modelInfo, signal }),
      language: getConfig().uiLanguage,
      retryDelayMs
    });
  };
}
