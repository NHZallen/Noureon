// The members of a council held on this page (docs/superpowers/specs/2026-10-19-council-tools-design.md, §2.1, §3): each searches the web and opens
// pages with the page's own search sources, loads the person's skills and looks into the files of the project the chat is in (read-only; a member that can see
// pictures can look at them too), as a reply made here does. The connectors and the CLI tools are the server's only (their logins are kept there), so a council
// held here has none of them.

import { getAvailableSkills, lookupSkill, readSkillFile } from '../skill/skill-bridge.js';
import { skillNamesOfParts } from '../../../data/skill-prompt.js';
import { combineLoaders } from '../../../data/combine-loaders.js';
import { projectOf } from '../projects/project-instructions.js';

/** `support` is createProviderRequestSupport(...); the result is what the council takes as `createMembers(conversation, parts)`. */
export function createPageCouncilMembers({ streamApiCall, support, getConfig, modelSupportsToolCalling, modelUsesNativeWebSearch, modelSupportsVision = () => false, retryDelayMs = 0, loadProjectAccess = () => import('../projects/project-files-access.js') }) {
  return async (conversation, parts) => {
    // The skills the members may load by themselves (not those asked for with "/": they are given whole).
    const available = await getAvailableSkills(skillNamesOfParts(parts)).catch(() => []);
    const { createSkillLoader } = available.length ? await import('../../../data/skill-tool.js') : {};
    // The members' loop is loaded when a council is first held.
    const { createCouncilMembers } = await import('./council-member-reply.js');
    // The files of the project the chat is in: the members are told their names, each one looks into them with its own tools (a member that cannot see pictures does not get view_project_file).
    const projectFiles = projectOf(conversation)?.sources?.length ? await (await loadProjectAccess()).createProjectFilesAccess({ conversation, toolsAllowed: true, canViewPictures: true }).catch(() => null) : null;
    const members = createCouncilMembers({
      streamApiCall,
      research: support.hasSearchKey() ? { searchWeb: support.searchWeb, openPage: support.fetchPageContents } : null,
      canCallTools: modelSupportsToolCalling,
      usesNativeSearch: modelUsesNativeWebSearch,
      loadersFor: (modelInfo) => combineLoaders(createSkillLoader ? createSkillLoader({ available, lookup: lookupSkill, readFile: readSkillFile }) : null, projectFiles ? projectFiles.make(getConfig().uiLanguage, null, { canView: Boolean(modelSupportsVision(modelInfo)) }) : null),
      fetchPacket: (query, signal) => support.fetchTavilySearchPacket(query, signal, { label: 'Council member web search packet', maxResults: 6 }),
      buildQuery: (_memberParts, modelInfo, signal) => support.buildSearchQuery(parts, { conversation, modelInfo, signal }),
      language: getConfig().uiLanguage,
      retryDelayMs
    });
    // What the members are told of the files (the lifecycle puts it in their instructions).
    members.projectFilesCatalog = projectFiles?.catalogText || '';
    return members;
  };
}
