// A reply of one model made on this device (single-model-response-lifecycle.js): with Python in the browser (Advanced mode), or as a stream of
// words (Standard), with the model searching by itself or loading skills when it can.

import { sandboxText } from '../sandbox/sandbox-texts.js';
import { toolOfEvent } from '../../ui/sandbox/sandbox-run-block.js';
import { lookupSkill, openSkillFiles } from '../skill/skill-bridge.js';
import { collectSandboxInputs, createSandboxFileParts, sandboxDocumentBlocks, sandboxDocumentNames, withoutDuplicatedFileBlocks, withoutEmptyDocumentBlocks } from '../../ui/sandbox/sandbox-files.js';

// Advanced mode (Python in the browser) is loaded only for replies that use it.
const loadSandboxReply = () => Promise.all([
  import('../sandbox/sandbox-reply.js'),
  import('../sandbox/python-sandbox.js')
]);

/**
 * `deps`: the lifecycle's { streamApiCall, buildSingleModelTranslatedRequestParts, getConfig, webResearch, now }. `context`: the reply's
 * { request, prep, reply, view, streamOptions } (reply.requestParts is the request as it stands; the run, files and sources it makes go
 * into `reply`). Resolves { runAdvanced(onChunk), runStandard(onChunk) }, each resolving the text of the answer.
 */
export function createLocalReply({ streamApiCall, buildSingleModelTranslatedRequestParts, getConfig, webResearch, now }, { request, prep, reply, view, streamOptions }) {
  const { modelInfo, conversation, userParts, signal, uiLanguage, webSearchEnabled } = request;
  const { researchByModel, invokedSkills, makeSkillLoader } = prep;

  const runAdvanced = async (onChunk) => {
    const [{ runSandboxReply }, { getPythonSandbox }] = await loadSandboxReply();
    const { requestParts } = reply;
    let advancedParts = requestParts;
    let advancedOptions = streamOptions;
    let searchMs = 0;
    const { needsSearchBriefing, runSearchBriefing, briefingPart } = await import('../sandbox/search-briefing.js');
    if (needsSearchBriefing({ modelInfo, webSearchEnabled, conversation })) {
      // A provider that cannot search and run Python in one request searches first; the Python round gets the briefing.
      const searchStartedAt = now();
      view.event({ type: 'searching', label: sandboxText(uiLanguage, 'sandboxSearching') });
      try {
        const briefing = await runSearchBriefing({ streamApiCall, requestParts, requestOptions: streamOptions, signal });
        reply.addSearchSources(briefing.sources);
        const part = briefingPart(briefing, modelInfo?.name);
        if (part) advancedParts = [part, ...requestParts];
      } catch (error) {
        // Stopping stops the reply; a search that failed leaves the reply to go on without it.
        if (signal?.aborted) throw error;
      }
      searchMs = now() - searchStartedAt;
      view.event({ type: 'sources', sources: reply.searchSources });
      advancedOptions = { ...streamOptions, webSearchEnabled: false, ignoreConversationWebSearch: true };
    } else if (reply.searchSources.length) {
      view.event({ type: 'sources', sources: reply.searchSources });
    }
    // Skills with scripts get their folder in the browser's Python too (/skills/<name>/, as on the server).
    const skillFolders = (await import('../skill/local-skill-folders.js')).createLocalSkillFolders({ lookup: lookupSkill, openFiles: openSkillFiles });
    await skillFolders.include(invokedSkills);
    const result = await runSandboxReply({
      streamApiCall,
      requestParts: advancedParts,
      onChunk,
      signal,
      requestOptions: advancedOptions,
      getSandbox: (options) => skillFolders.attach(getPythonSandbox({ ...options, language: getConfig().aiDefaultLanguage || uiLanguage })),
      language: uiLanguage,
      provider: modelInfo?.provider,
      inputFiles: collectSandboxInputs(conversation, userParts),
      designs: { deck: conversation?.deckDesign || 'auto', document: conversation?.documentDesign || 'auto' },
      research: researchByModel ? { searchWeb: webResearch.searchWeb, openPage: webResearch.openPage, onSources: reply.addSearchSources } : null,
      skills: makeSkillLoader(skillFolders.lookup),
      onStatus: () => {},
      onEvent: (event) => { view.noteOwnSearch(event); view.event(event); }
    });
    reply.sandboxRun = result.run;
    // The search before the run is part of the time the reply took.
    if (reply.sandboxRun && searchMs) reply.sandboxRun.elapsedMs = (reply.sandboxRun.elapsedMs || 0) + searchMs;
    // Word and PowerPoint files made freely get the app's fonts embedded.
    if (result.run?.steps?.length) {
      await import('../../ui/sandbox/office-fonts-browser.js')
        .then((module) => module.embedFontsInBrowser(result.run))
        .catch(() => {});
    }
    reply.sandboxParts = createSandboxFileParts(result.run);
    reply.sandboxDocuments = sandboxDocumentBlocks(result.run);
    // A block the model also wrote under the name of a file it made (with Python, or through the design system) is a second, empty card.
    return withoutEmptyDocumentBlocks(withoutDuplicatedFileBlocks(result.text, [...reply.sandboxParts.map((part) => part.sandboxFile.name), ...sandboxDocumentNames(result.run)]));
  };

  // A loop that gives the model tools (its own search, skills): the reply is the loop's when the model used it; a provider that refuses the
  // tools before anything happened answers without them (resolves null then).
  const tryToolLoop = async (load, onAnswer) => {
    let begun = false;
    try {
      const result = await load({
        streamApiCall,
        requestParts: reply.requestParts,
        onChunk: (chunk) => { begun = true; onAnswer(chunk); },
        signal,
        requestOptions: { ...streamOptions, onReasoning: view.showThinking },
        language: uiLanguage
      }, () => { begun = true; });
      return result.text;
    } catch (error) {
      if (signal?.aborted || begun) throw error;
      return null;
    }
  };

  // The skills loaded and the memory looked up or written stay with the saved reply (single-model-reply-finish.js).
  const noteTool = (event) => {
    const tool = toolOfEvent(event);
    if (tool) (reply.usedTools ||= []).push(tool);
  };

  const runStandard = async (onChunk) => {
    const onAnswer = (chunk) => {
      view.answering();
      onChunk(chunk);
    };
    if (researchByModel) {
      const text = await tryToolLoop(async (options, begin) => (await import('../features/web-research-reply.js')).runWebResearchReply({
        ...options,
        searchWeb: webResearch.searchWeb,
        openPage: webResearch.openPage,
        onSources: reply.addSearchSources,
        skills: makeSkillLoader(),
        onEvent: (event) => {
          if (event.type === 'searching' || event.type === 'skill' || event.type === 'connector' || event.type === 'memory') {
            begin();
            view.workResumed();
          }
          noteTool(event);
          view.noteOwnSearch(event);
          view.event(event);
        }
      }), onAnswer);
      if (text !== null) return text;
      // A provider that refuses the tools answers with the search done first, as the others do.
      reply.requestParts = await buildSingleModelTranslatedRequestParts(userParts, modelInfo, signal, () => {}, {
        webSearchEnabled, conversation, onSources: reply.addSearchSources
      });
    }
    // No search and no Python, but skills the model may load: a small loop that gives it the tool (a provider that refuses the tools answers without it).
    const skillLoader = makeSkillLoader();
    if (skillLoader) {
      const text = await tryToolLoop(async (options, begin) => (await import('./skills-reply.js')).runSkillsReply({
        ...options,
        loader: skillLoader,
        onEvent: (event) => {
          begin();
          view.workResumed();
          noteTool(event);
          view.event(event);
        }
      }), onAnswer);
      if (text !== null) return text;
    }
    return streamApiCall(reply.requestParts, onAnswer, signal, false, { ...streamOptions, onReasoning: view.showThinking });
  };

  return { runAdvanced, runStandard };
}
