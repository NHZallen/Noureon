// A member of a council answering with tools of its own (docs/superpowers/specs/2026-10-19-council-tools-design.md, §2.1): it searches the web and opens
// pages as a reply does, loads skills and reads the person's connectors, each member on its own and with the limits of a reply. Members only read: what
// changes things is the synthesizer's. The pages every member meets share one list of numbers, so [3] is the same page in every answer, in the synthesis
// and in the saved message. Shared by the page and the server (no DOM).

import { addNumberedSources } from '../../ui/citations/source-numbering.js';

export { createMemberSteps } from './council-member-steps.js';

const throwIfStopped = (signal) => {
  if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
};

const wait = (ms, signal) => new Promise((resolve, reject) => {
  if (!(ms > 0)) {
    resolve();
    return;
  }
  const timer = setTimeout(() => {
    signal?.removeEventListener?.('abort', onAbort);
    resolve();
  }, ms);
  function onAbort() {
    clearTimeout(timer);
    reject(new DOMException('Aborted', 'AbortError'));
  }
  signal?.addEventListener?.('abort', onAbort, { once: true });
});

/**
 * `streamApiCall(parts, onChunk, signal, forceWebSearch, options)` is one call of a model, without a second try (a member's rounds are tried again as a
 * whole). `research` is { searchWeb, openPage } (the reply's own), or null when there is no search source. `loadersFor(modelInfo)` gives (or resolves)
 * a member its loader of skills and connector reads (a new one for every answer), or null. `fetchPacket(query, signal)` searches once for a member that cannot call
 * tools, with `buildQuery(parts, modelInfo, signal)`. `sources` are the pages already numbered (a council taken up again).
 * Returns { answer, sources }: `answer(...)` resolves the member's text, `sources()` the pages met so far, numbered.
 */
export function createCouncilMembers({
  streamApiCall,
  research = null,
  canCallTools = () => false,
  usesNativeSearch = () => false,
  loadersFor = () => null,
  fetchPacket = null,
  buildQuery = null,
  language = 'zh-TW',
  retryDelayMs = 0,
  sources: known = [],
  loadRunners = async () => {
    const [{ runWebResearchReply }, { runSkillsReply }] = await Promise.all([import('../features/web-research-reply.js'), import('../reply/skills-reply.js')]);
    return { runWebResearchReply, runSkillsReply };
  }
}) {
  let sources = addNumberedSources([], known);
  // The number of every page any member met (the research loops number pages here as they meet them).
  const numbering = new Map();
  for (const source of sources) if (!numbering.has(source.url)) numbering.set(source.url, { n: source.n, url: source.url, ...(source.title ? { title: source.title } : {}) });
  const addSources = (found) => {
    const list = (Array.isArray(found) ? found : []).filter((source) => source?.url);
    // Pages that came without a number (a provider's own search) get the next one, the same for every member.
    const numberedList = list.map((source) => {
      if (Number(source.n) > 0) return source;
      if (!numbering.has(source.url)) numbering.set(source.url, { n: numbering.size + 1, url: source.url, ...(source.title ? { title: source.title } : {}) });
      return { ...source, n: numbering.get(source.url).n };
    });
    sources = addNumberedSources(sources, numberedList);
  };

  const once = async ({ modelInfo, parts, requestOptions: given, signal, searchOn, onChunk, onStep }) => {
    const requestOptions = { modelInfo, ...given };
    // Gemini searches with Google by itself, and takes no other tool next to that search.
    if (searchOn && usesNativeSearch(modelInfo)) {
      return streamApiCall(parts, onChunk, signal, true, {
        ...requestOptions,
        onSources: (found) => {
          addSources(found);
          onStep({ kind: 'search', label: '' });
        }
      });
    }
    if (canCallTools(modelInfo)) {
      const loader = await loadersFor(modelInfo);
      const onEvent = (event) => {
        if (event?.type === 'searching') onStep({ kind: event.kind === 'page' ? 'page' : 'search', label: event.label });
        else if (event?.type === 'skill') onStep({ kind: 'skill', label: event.label });
        else if (event?.type === 'connector' && event.event !== 'ask' && event.event !== 'answer') onStep({ kind: 'connector', label: event.label });
      };
      if (searchOn && research) {
        const { runWebResearchReply } = await loadRunners();
        const result = await runWebResearchReply({ streamApiCall, requestParts: parts, onChunk, signal, requestOptions, searchWeb: research.searchWeb, openPage: research.openPage, language, onSources: addSources, skills: loader, numbering, onEvent });
        throwIfStopped(signal);
        return result.text;
      }
      if (loader) {
        const { runSkillsReply } = await loadRunners();
        const result = await runSkillsReply({ streamApiCall, requestParts: parts, onChunk, signal, requestOptions, loader, language, onEvent });
        throwIfStopped(signal);
        return result.text;
      }
    } else if (searchOn && fetchPacket && buildQuery) {
      // A model that calls no tools: one search of its own, put before its question.
      let packet = '';
      try {
        packet = await fetchPacket(await buildQuery(parts, modelInfo, signal), signal);
        onStep({ kind: 'search', label: '' });
      } catch (error) {
        throwIfStopped(signal);
      }
      if (packet) return streamApiCall([{ text: packet }, ...parts], onChunk, signal, false, requestOptions);
    }
    return streamApiCall(parts, onChunk, signal, false, requestOptions);
  };

  return {
    /**
     * One answer of a member (a first answer or one of the deliberation): `onChunk` is told the words as they come (for the progress), `onStep` each search,
     * page, skill or connector read ({ kind, label }), `onRetry` when it is tried again after a failure. Resolves the text.
     */
    async answer({ modelInfo, parts, requestOptions = {}, signal, searchOn = false, onChunk = () => {}, onStep = () => {}, onRetry = () => {} }) {
      try {
        return await once({ modelInfo, parts, requestOptions, signal, searchOn, onChunk, onStep });
      } catch (firstError) {
        if (firstError?.name === 'AbortError' || signal?.aborted || firstError?.timedOut) throw firstError;
        onRetry(firstError);
        await wait(retryDelayMs, signal);
        try {
          return await once({ modelInfo, parts, requestOptions, signal, searchOn, onChunk, onStep });
        } catch (secondError) {
          if (secondError?.name === 'AbortError' || signal?.aborted || secondError?.timedOut) throw secondError;
          const error = new Error(`${secondError?.message || 'API request failed'} (retried once; first attempt: ${firstError?.message || 'unknown error'})`);
          error.name = secondError?.name || 'Error';
          throw error;
        }
      }
    },
    addSources,
    sources: () => sources.map((source) => ({ ...source }))
  };
}
