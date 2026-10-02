import { insertGroundingMarkers } from '../../ui/citations/citation-model.js';
import { watchCitations } from '../../ui/citations/citation-pills.js';
import { extractLinkedUrls } from './linked-pages.js';
import { patchHTML } from '../../ui/dom/patch-html.js';
import { getRuntimeText } from '../../runtime/i18n/runtime-texts.js';
import { NOURAS_REQUEST_PURPOSE } from '../../runtime/nouras/nouras-policy.js';
import { resolveReplyMode } from '../../runtime/sandbox/file-mode.js';
import { browserSupportsSandbox } from '../../runtime/sandbox/sandbox-protocol.js';
import { sandboxText } from '../../runtime/sandbox/sandbox-texts.js';
import { mayNeedFileGuidance } from '../../ui/files/file-intent.js';
import { formatSandboxRunBlock } from '../../ui/sandbox/sandbox-run-block.js';
import { collectSandboxInputs, createSandboxFileParts, sandboxDocumentBlocks, sandboxDocumentNames, withoutDuplicatedFileBlocks, withoutEmptyDocumentBlocks } from '../../ui/sandbox/sandbox-files.js';
import { createSandboxLedger } from '../../ui/sandbox/sandbox-ledger.js';
import { createThinkingBlock } from '../../ui/thinking/thinking-block.js';

// Advanced mode (Python in the browser) is loaded only for replies that use it.
const loadSandboxReply = () => Promise.all([
  import('../../runtime/sandbox/sandbox-reply.js'),
  import('../../runtime/sandbox/python-sandbox.js')
]);

// A switch to Standard mode is worth saying only when the request looks like
// a task Advanced mode is for: files, data or attachments.
const looksLikeFileTask = (parts = []) => parts.some((part) => part?.inlineData)
  || mayNeedFileGuidance(parts.map((part) => part?.text || '').join('\n'));

export function createSingleModelResponseLifecycle({
  now = () => Date.now(),
  getOutputMode,
  renderSingleModelProgress,
  startProgressTicker,
  stopProgressTicker,
  buildSingleModelTranslatedRequestParts,
  streamApiCall,
  streamMarkdownResponse,
  playbackStreamingMarkdownResponse,
  renderIncrementalResponse,
  getOpenCouncilDetailKeys,
  restoreOpenCouncilDetails,
  getConfig = () => ({}),
  // Without it (older callers, tests) replies never use Advanced mode.
  supportsToolCalling = null,
  // The model's own web searching ({ canUse(modelInfo), searchWeb, openPage }, see web-research-reply.js). Without it a search is
  // a packet in front of the request.
  webResearch = null,
  getWindow = () => globalThis.window,
  getDocument = () => globalThis.document
}) {
  let progressTimer = null;
  let latestProgress = null;

  const stop = () => {
    if (!progressTimer) return;
    stopProgressTicker(progressTimer);
    progressTimer = null;
  };

  const renderProgress = (targetElement, startedAt, stage, message, extra = {}) => {
    latestProgress = {
      ...latestProgress,
      stage,
      message,
      elapsedMs: now() - startedAt,
      ...extra
    };
    patchHTML(targetElement, renderSingleModelProgress(latestProgress));
    return latestProgress;
  };

  const startTicker = (targetElement, startedAt) => {
    progressTimer = startProgressTicker(() => {
      latestProgress = {
        ...latestProgress,
        elapsedMs: now() - startedAt
      };
      // Only the numbers change in place: see patch-html.js.
      patchHTML(targetElement, renderSingleModelProgress(latestProgress));
    });
  };

  const run = async ({
    targetElement,
    userParts,
    modelInfo,
    conversation,
    webSearchEnabled = false,
    onMemoryContextResolved = () => {},
    signal,
    uiLanguage
  }) => {
    stop();
    const startedAt = now();
    latestProgress = {
      stage: 'preparing',
      message: getRuntimeText(uiLanguage, 'preparingRequest'),
      modelName: modelInfo?.name || conversation.model,
      startedAt,
      elapsedMs: 0,
      receivedChars: 0
    };

    const replyMode = supportsToolCalling ? resolveReplyMode({
      conversation,
      config: getConfig(),
      modelInfo,
      supportsToolCalling,
      browserSupported: browserSupportsSandbox(getWindow())
    }) : { advanced: false, reason: null };
    // A model that calls tools searches the web by itself, in a Standard reply and next to Python in Advanced mode (the search
    // packet is for the others).
    const researchByModel = Boolean(webSearchEnabled && webResearch?.canUse(modelInfo));
    // A web address in the message is read for the models that cannot open one (provider-request-support.js decides which).
    const hasTranslationInputs = userParts.some((part) => part.inlineData) ||
      Boolean(webSearchEnabled && !researchByModel) ||
      extractLinkedUrls(userParts.map((part) => part.text || '').join('\n')).urls.length > 0;
    let requestParts = userParts;
    // The pages a web search found (kept with the reply, shown as "Searched N sites").
    let searchSources = [];
    // The provider's own web search (Gemini) reports the pages it used as the answer streams; rounds add to them. A page
    // that was found and then read is both, so each is kept once.
    const addSearchSources = (found) => {
      const known = new Set(searchSources.map((source) => `${Boolean(source.read)} ${source.url}`));
      const fresh = found.filter((source) => source?.url && !known.has(`${Boolean(source.read)} ${source.url}`));
      searchSources = [...searchSources, ...fresh];
      // A page that came without a number (Gemini's own search gives none) is numbered after the others, once per address.
      let highest = searchSources.reduce((most, source) => Math.max(most, Number(source.n) || 0), 0);
      const numbers = new Map(searchSources.filter((source) => Number(source.n) > 0).map((source) => [source.url, Number(source.n)]));
      searchSources = searchSources.map((source) => {
        if (Number(source.n) > 0) return source;
        if (!numbers.has(source.url)) numbers.set(source.url, (highest += 1));
        return { ...source, n: numbers.get(source.url) };
      });
    };
    // Where Gemini's answer cites its pages, kept until the answer is whole (the markers go into the text then).
    let groundingSupports = [];
    const withGroundingMarkers = (answer) => (groundingSupports.length
      ? insertGroundingMarkers(answer, groundingSupports, (url) => Number(searchSources.find((source) => source.url === url)?.n) || 0)
      : answer);
    if (hasTranslationInputs) {
      renderProgress(
        targetElement,
        startedAt,
        'preparing',
        'Checking model capabilities'
      );
      startTicker(targetElement, startedAt);
      requestParts = await buildSingleModelTranslatedRequestParts(
        userParts,
        modelInfo,
        signal,
        (stage, message) => renderProgress(targetElement, startedAt, stage, message),
        {
          webSearchEnabled: webSearchEnabled && !researchByModel,
          conversation,
          // The pages a search found, and then the pages that were read (marked `read`).
          onSources: (sources) => {
            addSearchSources(sources);
          }
        }
      );
    }

    let receivedChars = 0;
    let bufferedResponse = '';
    let lastProgressAt = 0;
    const updateStreamingProgress = (chunk) => {
      const text = String(chunk || '');
      bufferedResponse += text;
      receivedChars += text.length;
      const currentTime = now();
      if (currentTime - lastProgressAt > 700) {
        lastProgressAt = currentTime;
        renderProgress(
          targetElement,
          startedAt,
          'streaming',
          undefined,
          { receivedChars }
        );
      }
    };

    const streamOptions = { modelInfo, conversation, webSearchEnabled, onMemoryContextResolved, onSources: addSearchSources, onSupports: (supports) => { groundingSupports = supports; }, requestPurpose: NOURAS_REQUEST_PURPOSE.USER_VISIBLE_ANSWER };
    // The run record (or the reason for Standard mode) kept above the answer.
    let sandboxRun = !replyMode.advanced && replyMode.reason && looksLikeFileTask(userParts)
      ? { status: 'done', steps: [], fallback: replyMode.reason }
      : null;
    // Files the run made, kept as parts of the reply message.
    let sandboxParts = [];
    // Documents the code handed to the design system, as file blocks.
    let sandboxDocuments = '';
    // The step list in the message, above the answer: what the model and Python are doing now.
    let liveRun = null;
    const stepList = () => {
      if (!liveRun && targetElement.parentElement) {
        liveRun = createSandboxLedger({ document: getDocument(), host: targetElement.parentElement, before: targetElement, language: uiLanguage, summary: true, open: getConfig().processOpen === true });
      }
      return liveRun;
    };
    const showRunStatus = () => {};
    // The [n] an answer writes become small labels as it streams (and in the final view, from the saved sources).
    const stopCitations = watchCitations(targetElement, () => searchSources, { document: getDocument(), language: uiLanguage });
    // A reply without Python shows the model's thinking above the answer, as it streams,
    // and folds it when the answer starts.
    let thinkingBlock = null;
    // Every block made (more than one when words written before a search were taken for the answer, and work went on).
    const thinkingBlocks = [];
    let thought = { text: '', kind: 'raw', startedAt: null, endedAt: null };
    // Whether any of the answer has arrived (stopping before it leaves the thinking interrupted).
    let answered = false;
    let answerStarted = false;
    const showThinking = (chunk, kind) => {
      if (!chunk) return;
      thought.startedAt ??= now();
      thought = { ...thought, text: (thought.text + chunk).slice(0, 12_000), kind: kind || thought.kind };
      if (!thinkingBlock && targetElement.parentElement) {
        // The thinking is a step of the work: its row is under the "Working" line, above the other steps.
        const steps = stepList();
        thinkingBlock = steps?.body
          ? createThinkingBlock({ document: getDocument(), host: steps.body, before: steps.stepsElement, language: uiLanguage, now })
          : createThinkingBlock({ document: getDocument(), host: targetElement.parentElement, before: targetElement, language: uiLanguage, now });
        if (thinkingBlock) thinkingBlocks.push(thinkingBlock);
      }
      thinkingBlock?.add(chunk, kind);
      liveRun?.activity(sandboxText(uiLanguage, 'thinkingLive'));
    };
    // The answer has started: the thinking is over.
    const endThinking = () => {
      if (thought.startedAt !== null) thought.endedAt ??= now();
      thinkingBlock?.collapse();
      liveRun?.activity('');
    };
    // More work after words that were taken for the answer: the line runs again, and what the model thinks next is a block of its own.
    const workResumed = () => {
      if (!answerStarted) return;
      answerStarted = false;
      thinkingBlock = null;
    };
    const runApiStream = replyMode.advanced
      ? async (onChunk) => {
        const [{ runSandboxReply }, { getPythonSandbox }] = await loadSandboxReply();
        let advancedParts = requestParts;
        let advancedOptions = streamOptions;
        let searchMs = 0;
        const { needsSearchBriefing, runSearchBriefing, briefingPart } = await import('../../runtime/sandbox/search-briefing.js');
        if (needsSearchBriefing({ modelInfo, webSearchEnabled, conversation })) {
          // A provider that cannot search and run Python in one request searches first; the Python round gets the briefing.
          const searchStartedAt = now();
          stepList()?.event({ type: 'searching', label: sandboxText(uiLanguage, 'sandboxSearching') });
          try {
            const briefing = await runSearchBriefing({ streamApiCall, requestParts, requestOptions: streamOptions, signal });
            addSearchSources(briefing.sources);
            const part = briefingPart(briefing, modelInfo?.name);
            if (part) advancedParts = [part, ...requestParts];
          } catch (error) {
            // Stopping stops the reply; a search that failed leaves the reply to go on without it.
            if (signal?.aborted) throw error;
          }
          searchMs = now() - searchStartedAt;
          stepList()?.event({ type: 'sources', sources: searchSources });
          advancedOptions = { ...streamOptions, webSearchEnabled: false, ignoreConversationWebSearch: true };
        } else if (searchSources.length) {
          stepList()?.event({ type: 'sources', sources: searchSources });
        }
        const result = await runSandboxReply({
          streamApiCall,
          requestParts: advancedParts,
          onChunk,
          signal,
          requestOptions: advancedOptions,
          getSandbox: (options) => getPythonSandbox({ ...options, language: getConfig().aiDefaultLanguage || uiLanguage }),
          language: uiLanguage,
          provider: modelInfo?.provider,
          inputFiles: collectSandboxInputs(conversation, userParts),
          designs: { deck: conversation?.deckDesign || 'auto', document: conversation?.documentDesign || 'auto' },
          research: researchByModel ? { searchWeb: webResearch.searchWeb, openPage: webResearch.openPage, onSources: addSearchSources } : null,
          onStatus: showRunStatus,
          onEvent: (event) => stepList()?.event(event)
        });
        sandboxRun = result.run;
        // The search before the run is part of the time the reply took.
        if (sandboxRun && searchMs) sandboxRun.elapsedMs = (sandboxRun.elapsedMs || 0) + searchMs;
        // Word and PowerPoint files made freely get the app's fonts embedded.
        if (result.run?.steps?.length) {
          await import('../../ui/sandbox/office-fonts.js')
            .then((module) => module.embedFontsInRunOutputs(result.run))
            .catch(() => {});
        }
        sandboxParts = createSandboxFileParts(result.run);
        sandboxDocuments = sandboxDocumentBlocks(result.run);
        // A block the model also wrote under the name of a file it made (with Python, or through the design system) is a second, empty card.
        return withoutEmptyDocumentBlocks(withoutDuplicatedFileBlocks(result.text, [...sandboxParts.map((part) => part.sandboxFile.name), ...sandboxDocumentNames(result.run)]));
      }
      : async (onChunk) => {
        const onAnswer = (chunk) => {
          answered = true;
          endThinking();
          // The answer has begun: the "Working" line is over and says how long it took.
          if (!answerStarted) {
            answerStarted = true;
            liveRun?.event({ type: 'answering' });
          }
          onChunk(chunk);
        };
        if (researchByModel) {
          let started = false;
          try {
            const { runWebResearchReply } = await import('./web-research-reply.js');
            const result = await runWebResearchReply({
              streamApiCall,
              requestParts,
              onChunk: (chunk) => { started = true; onAnswer(chunk); },
              signal,
              requestOptions: { ...streamOptions, onReasoning: showThinking },
              searchWeb: webResearch.searchWeb,
              openPage: webResearch.openPage,
              language: uiLanguage,
              onSources: addSearchSources,
              onEvent: (event) => {
                if (event.type === 'searching') {
                  started = true;
                  workResumed();
                }
                stepList()?.event(event);
              }
            });
            return result.text;
          } catch (error) {
            // A provider that refuses the tools answers with the search done first, as the others do.
            if (signal?.aborted || started) throw error;
          }
          requestParts = await buildSingleModelTranslatedRequestParts(userParts, modelInfo, signal, () => {}, {
            webSearchEnabled, conversation, onSources: addSearchSources
          });
        }
        return streamApiCall(requestParts, onAnswer, signal, false, { ...streamOptions, onReasoning: showThinking });
      };

    let fullResponse;
    let responseRenderedInRealtime = false;
    try {
      if (getOutputMode() === 'realtime') {
        stop();
        const realtimeProgress = {
          ...latestProgress,
          stage: 'streaming',
          message: undefined,
          elapsedMs: now() - startedAt
        };
        latestProgress = realtimeProgress;
        patchHTML(targetElement, renderSingleModelProgress(realtimeProgress));
        startTicker(targetElement, startedAt);
        fullResponse = await streamMarkdownResponse(
          targetElement,
          runApiStream,
          signal,
          {
            placeholderHTML: renderSingleModelProgress(realtimeProgress),
            onFirstChunk: stop
          }
        );
        responseRenderedInRealtime = true;
      } else {
        if (!progressTimer) {
          renderProgress(
            targetElement,
            startedAt,
            'streaming',
            undefined
          );
          startTicker(targetElement, startedAt);
        }
        try {
          fullResponse = await runApiStream(updateStreamingProgress);
        } catch (error) {
          if (!signal?.aborted) throw error;
          fullResponse = bufferedResponse;
        }
      }
    } finally {
      stop();
      stopCitations();
      liveRun?.remove();
      // What was thought is kept with the reply (the run record), so it is still there after a reload.
      endThinking();
      thinkingBlocks.forEach((block) => block.remove());
      thinkingBlock?.remove();
      if (searchSources.length) sandboxRun = { status: 'done', steps: [], elapsedMs: now() - startedAt, ...(sandboxRun || {}), sources: searchSources };
      if (thought.text && !replyMode.advanced) {
        sandboxRun = { status: 'done', steps: [], ...(sandboxRun || {}), thought: thought.text, thoughtKind: thought.kind, thoughtMs: thought.endedAt - thought.startedAt, ...(signal?.aborted && !answered ? { thoughtInterrupted: true } : {}) };
      }
    }

    // Gemini says where its answer cites its pages only once it is whole: the markers go into the text now, and the final
    // view is drawn again so they show as labels.
    if (groundingSupports.length && fullResponse) {
      const marked = withGroundingMarkers(fullResponse);
      if (marked !== fullResponse) {
        fullResponse = marked;
        if (targetElement?.dataset) targetElement.dataset.streamRendered = 'false';
      }
    }

    // Stopped while thinking, with nothing else to show: the reply is the interrupted thinking.
    if (!String(fullResponse || '').trim() && !sandboxRun?.steps?.length && !sandboxRun?.thought) {
      if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
      throw new Error(getRuntimeText(uiLanguage, 'emptyResponse'));
    }
    if (sandboxRun) {
      fullResponse = `${formatSandboxRunBlock(sandboxRun)}${fullResponse || ''}${sandboxDocuments ? `

${sandboxDocuments}` : ''}`;
      // The final view is drawn again so the run row appears above the answer.
      if (targetElement?.dataset) targetElement.dataset.streamRendered = 'false';
    }

    return {
      fullResponse,
      responseRenderedInRealtime,
      extraParts: sandboxParts
    };
  };

  const completeView = async ({
    targetElement,
    fullResponse,
    signal,
    responseRenderedInRealtime
  }) => {
    if (responseRenderedInRealtime && targetElement.dataset.streamRendered === 'true') {
      restoreOpenCouncilDetails(targetElement, getOpenCouncilDetailKeys(targetElement));
      return;
    }
    if (responseRenderedInRealtime) {
      renderIncrementalResponse(targetElement, fullResponse, {
        final: true,
        preserveCouncilDetails: false
      });
      return;
    }
    if (signal?.aborted) {
      renderIncrementalResponse(targetElement, fullResponse, {
        final: true,
        preserveCouncilDetails: false
      });
      return;
    }
    await playbackStreamingMarkdownResponse(
      targetElement,
      fullResponse,
      signal,
      false
    );
  };

  return {
    completeView,
    getLatestProgress() {
      return latestProgress;
    },
    run,
    stop
  };
}
